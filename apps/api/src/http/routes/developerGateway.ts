/**
 * Developer API Gateway endpoints (api-key authenticated, org-scoped).
 *
 * Extends the Session 120 public REST gateway (`/api/rest/v1`) with the
 * developer-facing capabilities: agent execution, workflow execution/monitor/
 * cancel, knowledge search, trading-intelligence analysis, and media/voice
 * generation. Every endpoint reuses the existing WINDELS AI OS service layer —
 * there is no duplicate orchestration or mock surface.
 *
 * Every request is recorded to the persistent ApiUsageRecord ledger for
 * billing, audit and the Developer Dashboard.
 */
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { validate } from "../middleware/validate.js";
import { apiKeyAuth, requireScope } from "../middleware/apiKeyAuth.js";
import { prisma } from "../../db/client.js";
import { aiRegistry } from "../../services/ai/registry.js";
import { runWorkflow } from "../../services/workflow.service.js";
import { analyzeInstrument } from "../../tradingIntel/analysis.js";
import { MediaGenService } from "../../mediaGen/mediaGen.service.js";
import {
  ApiAgentExecuteSchema,
  ApiTradingAnalysisQuerySchema,
  ApiWorkflowExecuteSchema,
} from "@windels/shared/developerPlatform";
import { PubWorkflowIdSchema } from "@windels/shared/publicApi";
import { z } from "zod";

const WorkflowRunCancel = z.object({ id: z.string().cuid(), runId: z.string().cuid() });

function meta(req: any) { return { requestId: req.requestId ?? "", tookMs: Date.now() - (req.startedAt ?? Date.now()) }; }

/** Enrich the middleware's persistent usage row for this request. */
function enrich(req: any, data: Record<string, unknown>) {
  (req.res as any).locals = { ...((req.res as any).locals ?? {}), apiUsage: { ...((req.res as any).locals?.apiUsage ?? {}), ...data } };
}

export function registerDeveloperGatewayRoutes(router: Router) {
  router.use(apiKeyAuth);

  /* ── AI (completion) ────────────────────────────────────────────────── */
  router.post("/ai/complete", requireScope("ai:execute", "ai:read"), validate({
    body: z.object({
      model: z.string().min(1).max(120).optional(),
      messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1).max(20000) })).min(1).max(200),
      system: z.string().max(10000).optional(),
      temperature: z.number().min(0).max(2).optional(),
    }),
  }), async (req, res, next) => {
    const started = Date.now();
    try {
      const orgId = (req as any).apiOrganization.id;
      const body = req.body as any;
      const messages = body.messages ?? [];
      if (body.system) messages.unshift({ role: "system", content: body.system });
      const result = await aiRegistry.complete(
        { model: body.model ?? "windels-assistant", messages, temperature: body.temperature },
        { userId: (req as any).apiUser?.id, organizationId: orgId, channel: "api", feature: "developer-api" },
      );
      enrich(req, {
        endpoint: "ai.complete", channel: "ai", durationMs: result.durationMs,
        tokensIn: result.usage?.tokensIn ?? 0, tokensOut: result.usage?.tokensOut ?? 0,
        aiCostMicros: result.usage?.costMicros ?? 0, permission: "ai:execute",
      });
      res.json({ ok: true, data: { content: result.content, usage: result.usage, model: result.model, provider: result.provider }, meta: meta(req) });
    } catch (e) {
      enrich(req, { endpoint: "ai.complete", channel: "ai", permission: "ai:execute" });
      next(e);
    }
  });

  /* ── Agents ─────────────────────────────────────────────────────────── */
  router.get("/agents", requireScope("agents:read"), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const agents = await prisma.agent.findMany({
        where: { organizationId: orgId, isBuiltIn: false },
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true, emoji: true, color: true, status: true, description: true, department: true },
      });
      enrich(req, { endpoint: "agents.list", channel: "agents", permission: "agents:read" });
      res.json({ ok: true, data: agents, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/agents/:id/execute", requireScope("agents:execute", "ai:execute"), validate({ params: z.object({ id: z.string().cuid() }), body: ApiAgentExecuteSchema }), async (req, res, next) => {
    const started = Date.now();
    try {
      const orgId = (req as any).apiOrganization.id;
      const agent = await prisma.agent.findFirst({ where: { id: req.params.id, organizationId: orgId } });
      if (!agent) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Agent not found" } });
      const input = req.body as any;
      const userText = typeof input.input === "string" ? input.input : (input.message ?? (input.input?.message ?? ""));
      const messages: any[] = [];
      if (agent.systemPrompt) messages.push({ role: "system", content: agent.systemPrompt });
      if (input.systemPrompt) messages.push({ role: "system", content: input.systemPrompt });
      messages.push({ role: "user", content: String(userText).slice(0, 20000) });
      const result = await aiRegistry.complete(
        { model: input.modelId ?? agent.modelId ?? "windels-assistant", messages, temperature: agent.temperature ?? 0.7 },
        { userId: (req as any).apiUser?.id, organizationId: orgId, agentId: agent.id, channel: "api", feature: "developer-agent-execute" },
      );
      const executionId = `exec_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
      enrich(req, {
        endpoint: "agents.execute", channel: "agents", durationMs: result.durationMs,
        tokensIn: result.usage?.tokensIn ?? 0, tokensOut: result.usage?.tokensOut ?? 0,
        aiCostMicros: result.usage?.costMicros ?? 0, permission: "agents:execute",
      });
      res.json({
        ok: true,
        data: {
          executionId, agentId: agent.id, agentName: agent.name, status: "completed",
          content: result.content, modelId: result.model, durationMs: result.durationMs,
          tokensIn: result.usage?.tokensIn ?? 0, tokensOut: result.usage?.tokensOut ?? 0,
          costMicros: result.usage?.costMicros ?? 0, createdAt: new Date().toISOString(),
        },
        meta: meta(req),
      });
    } catch (e) {
      enrich(req, { endpoint: "agents.execute", channel: "agents", permission: "agents:execute" });
      next(e);
    }
  });

  /* ── Workflows ──────────────────────────────────────────────────────── */
  router.post("/workflows/:id/execute", requireScope("workflows:execute", "workflows:read"), validate({ params: PubWorkflowIdSchema, body: ApiWorkflowExecuteSchema }), async (req, res, next) => {
    const started = Date.now();
    try {
      const orgId = (req as any).apiOrganization.id;
      const body = req.body as any;
      const result = await runWorkflow((req as any).apiUser.id, req.params.id, {
        input: body.input ?? body.inputs ?? {},
        triggerType: "api",
        triggerData: { via: "developer-gateway" },
      }, orgId);
      enrich(req, { endpoint: "workflows.execute", channel: "workflows", durationMs: Date.now() - started, permission: "workflows:execute" });
      res.status(201).json({ ok: true, data: result, meta: meta(req) });
    } catch (e) {
      enrich(req, { endpoint: "workflows.execute", channel: "workflows", permission: "workflows:execute" });
      next(e);
    }
  });

  router.get("/workflows/:id/runs", requireScope("workflows:read"), validate({ params: PubWorkflowIdSchema }), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const w = await prisma.workflow.findFirst({ where: { id: req.params.id, organizationId: orgId } });
      if (!w) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Workflow not found" } });
      const runs = await prisma.workflowRun.findMany({ where: { workflowId: w.id }, orderBy: { createdAt: "desc" }, take: 50 });
      enrich(req, { endpoint: "workflows.runs", channel: "workflows", permission: "workflows:read" });
      res.json({ ok: true, data: runs, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/workflows/:id/runs/:runId/cancel", requireScope("workflows:execute"), validate({ params: WorkflowRunCancel }), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const run = await prisma.workflowRun.findFirst({
        where: { id: req.params.runId, workflowId: req.params.id },
        include: { workflow: true },
      });
      if (!run || run.workflow.organizationId !== orgId) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Workflow run not found" } });
      }
      if (run.status === "SUCCEEDED" || run.status === "FAILED") {
        return res.status(409).json({ ok: false, error: { code: "CONFLICT", message: `Workflow run already ${run.status.toLowerCase()}` } });
      }
      const updated = await prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "CANCELLED", endedAt: new Date() },
      });
      enrich(req, { endpoint: "workflows.cancel", channel: "workflows", permission: "workflows:execute" });
      res.json({ ok: true, data: { id: updated.id, status: updated.status }, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Knowledge ──────────────────────────────────────────────────────── */
  router.get("/knowledge/search", requireScope("knowledge:read", "search:read"), validate({
    query: z.object({ q: z.string().min(1).max(200), limit: z.coerce.number().int().min(1).max(100).optional() }),
  }), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const q = (req.query as any).q as string;
      const limit = Number((req.query as any).limit ?? 25);
      const rows = await prisma.agentKnowledge.findMany({
        where: { agent: { organizationId: orgId }, content: { contains: q, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, title: true, content: true, type: true, source: true, createdAt: true },
      });
      enrich(req, { endpoint: "knowledge.search", channel: "knowledge", permission: "knowledge:read" });
      res.json({ ok: true, data: rows, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Trading intelligence ───────────────────────────────────────────── */
  router.get("/trading/analysis", requireScope("trading:read" as any, "agents:read"), validate({ query: ApiTradingAnalysisQuerySchema }), async (req, res, next) => {
    try {
      const q = req.query as any;
      const marketClass = q.exchange ? "crypto" : "stock";
      const report = await analyzeInstrument({
        symbol: q.symbol,
        marketClass: marketClass as any,
        timeframe: (q.timeframe ?? "1d") as any,
        limit: 200,
        allowSynthetic: true,
      });
      enrich(req, { endpoint: "trading.analysis", channel: "trading", permission: "trading:read" });
      res.json({ ok: true, data: report, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Media / voice generation ───────────────────────────────────────── */
  router.post("/media/generate", requireScope("media:generate", "documents:generate"), validate({
    body: z.object({
      modality: z.enum(["image", "audio", "video"]),
      op: z.string().min(1).max(60),
      prompt: z.string().min(1).max(4000),
      childTargeted: z.boolean().optional(),
    }),
  }), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const userId = (req as any).apiUser?.id;
      const job = await MediaGenService.submit(orgId, userId, req.body);
      enrich(req, { endpoint: "media.generate", channel: "media", permission: "media:generate" });
      res.status(201).json({ ok: true, data: job, meta: meta(req) });
    } catch (e) {
      next(e);
    }
  });
}
