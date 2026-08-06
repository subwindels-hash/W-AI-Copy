/**
 * Public REST API Gateway (api-key authenticated, stable surface).
 *
 * The six Session 120 predecessors keep their exact paths, request bodies,
 * status codes and response shapes:
 *
 *   GET  /                     identity (any valid key)
 *   GET  /workflows            list (READ)
 *   POST /workflows/:id/run    trigger (WRITE|ADMIN) → 201
 *   GET  /agents               list (READ)
 *   POST /talk/channels/:id/messages  send (WRITE|ADMIN) → 201
 *   GET  /talk/channels        list (READ)
 *
 * Session 120 adds (additive):
 *   GET /workflows/:id         single workflow (READ)
 *   GET /usage                 per-key call ledger report (READ)
 *   ?limit=1..200              optional cap on the three list endpoints
 *
 * Session 120 fixes:
 *   - `POST /workflows/:id/run` previously passed only the key creator's
 *     user id into `runWorkflow`, which resolved the workflow through the
 *     creator's *membership* organization — a key issued to org A whose
 *     creator also belonged to org B could trigger org B's workflows. The
 *     run is now pinned to the API key's organization (`apiOrganization.id`),
 *     the same tenant the rest of the gateway already scopes to.
 *
 * Every read/write here is scoped through the verified key's organization;
 * there is no cross-tenant path in this module.
 */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { apiKeyAuth, requireScope } from "../middleware/apiKeyAuth.js";
import { prisma } from "../../db/client.js";
import { runWorkflow } from "../../services/workflow.service.js";
import { dispatchEvent } from "../../services/webhook.service.js";
import { publicApiUsage } from "../../publicApi/publicApiUsage.service.js";
import {
  PubListQuerySchema,
  PubRunWorkflowBodySchema,
  PubTalkChannelIdSchema,
  PubTalkMessageBodySchema,
  PubUsageQuerySchema,
  PubWorkflowIdSchema,
} from "@windels/shared/publicApi";
import type {
  PubAgentSummary,
  PubGatewayIdentity,
  PubTalkChannelSummary,
  PubTalkMessageSent,
  PubWorkflowDetail,
  PubWorkflowSummary,
} from "@windels/shared/publicApi";

export function registerPublicApiRoutes(router: Router) {
  router.use(apiKeyAuth);

  // Health + identity
  router.get("/", (_req, res) => {
    const data: PubGatewayIdentity = {
      service: "windels-api-gateway",
      version: "v1",
      organization: (_req as any).apiOrganization.name,
    };
    res.json({ ok: true, data });
  });

  // List workflows
  router.get("/workflows", requireScope("READ"), validate({ query: PubListQuerySchema }), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const limit = (req.query as any).limit;
      const items: PubWorkflowSummary[] = await prisma.workflow.findMany({
        where: { organizationId: orgId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, description: true, status: true, runsCount: true, updatedAt: true },
      });
      res.json({ ok: true, data: limit ? items.slice(0, Number(limit)) : items });
    } catch (e) { next(e); }
  });

  // Single workflow (Session 120 — additive)
  router.get("/workflows/:id", requireScope("READ"), validate({ params: PubWorkflowIdSchema }), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const w = await prisma.workflow.findFirst({
        where: { id: req.params.id, organizationId: orgId, deletedAt: null },
      });
      if (!w) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Workflow not found" } });
      const triggers = Array.isArray((w as any).triggers) ? ((w as any).triggers as any[]).map((t: any) => String(t?.type ?? "unknown")) : [];
      const data: PubWorkflowDetail = {
        id: w.id,
        name: w.name,
        description: (w as any).description ?? null,
        status: w.status,
        runsCount: (w as any).runsCount ?? 0,
        updatedAt: w.updatedAt.toISOString(),
        createdAt: w.createdAt.toISOString(),
        triggers,
        nodes: (w as any).nodes ?? [],
        edges: (w as any).edges ?? [],
      };
      res.json({ ok: true, data });
    } catch (e) { next(e); }
  });

  // Trigger a workflow run — pinned to the API key's organization (S120 fix)
  router.post("/workflows/:id/run", requireScope("WRITE", "ADMIN"), validate({ params: PubWorkflowIdSchema, body: PubRunWorkflowBodySchema }), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const result = await runWorkflow((req as any).apiUser.id, req.params.id, {
        input: req.body?.input ?? {},
        triggerType: "api",
        triggerData: req.body ?? {},
      }, orgId);
      res.status(201).json({ ok: true, data: result });
    } catch (e) { next(e); }
  });

  // Per-key usage report (Session 120 — additive)
  router.get("/usage", requireScope("READ"), validate({ query: PubUsageQuerySchema }), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const days = Number((req.query as any).days ?? 7);
      const data = await publicApiUsage(orgId, days);
      res.json({ ok: true, data });
    } catch (e) { next(e); }
  });

  // List agents
  router.get("/agents", requireScope("READ"), validate({ query: PubListQuerySchema }), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const limit = (req.query as any).limit;
      const agents: PubAgentSummary[] = await prisma.agent.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true, emoji: true, color: true, status: true, isBuiltIn: true },
      });
      res.json({ ok: true, data: limit ? agents.slice(0, Number(limit)) : agents });
    } catch (e) { next(e); }
  });

  // Send a Talk message
  router.post("/talk/channels/:id/messages", requireScope("WRITE", "ADMIN"), validate({ params: PubTalkChannelIdSchema, body: PubTalkMessageBodySchema }), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const userId = (req as any).apiUser.id;
      const ch = await prisma.talkChannel.findFirst({ where: { id: req.params.id, organizationId: orgId } });
      if (!ch) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Channel not found" } });
      const content = String(req.body?.content ?? "");
      if (!content) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "content required" } });
      const msg = await prisma.talkMessage.create({
        data: { channelId: ch.id, content, userId, type: "TEXT" },
      });
      await prisma.talkChannel.update({ where: { id: ch.id }, data: { lastMessageAt: new Date() } });
      dispatchEvent(orgId, "message.created", { channelId: ch.id, messageId: msg.id, contentPreview: content.slice(0, 100) }).catch(() => {});
      // The wire shape is unchanged from Session 120's predecessor: the raw
      // TalkMessage row.
      res.status(201).json({ ok: true, data: msg });
    } catch (e) { next(e); }
  });

  // List Talk channels
  router.get("/talk/channels", requireScope("READ"), validate({ query: PubListQuerySchema }), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const limit = (req.query as any).limit;
      const items: PubTalkChannelSummary[] = await prisma.talkChannel.findMany({
        where: { organizationId: orgId },
        orderBy: { lastMessageAt: "desc" },
        select: { id: true, name: true, type: true, lastMessageAt: true },
      });
      res.json({ ok: true, data: limit ? items.slice(0, Number(limit)) : items });
    } catch (e) { next(e); }
  });
}
