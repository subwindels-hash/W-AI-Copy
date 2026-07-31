import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { apiKeyAuth, requireScope } from "../middleware/apiKeyAuth.js";
import { prisma } from "../../db/client.js";
import { runWorkflow } from "../../services/workflow.service.js";
import { dispatchEvent } from "../../services/webhook.service.js";

/**
 * Public REST API Gateway (api key authenticated).
 * Minimal stable surface for MVP; expands over later sessions.
 */
export function registerPublicApiRoutes(router: Router) {
  router.use(apiKeyAuth);

  // Health + identity
  router.get("/", (_req, res) => {
    res.json({
      ok: true,
      data: {
        service: "windels-api-gateway",
        version: "v1",
        organization: (_req as any).apiOrganization.name,
      },
    });
  });

  // List workflows
  router.get("/workflows", requireScope("READ"), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const items = await prisma.workflow.findMany({
        where: { organizationId: orgId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, description: true, status: true, runsCount: true, updatedAt: true },
      });
      res.json({ ok: true, data: items });
    } catch (e) { next(e); }
  });

  // Trigger a workflow run
  router.post("/workflows/:id/run", requireScope("WRITE", "ADMIN"), validate({ params: z.object({ id: z.string().cuid() }), body: z.object({ input: z.record(z.unknown()).default({}) }) }), async (req, res, next) => {
    try {
      const userId = (req as any).apiUser.id;
      const result = await runWorkflow(userId, req.params.id, { input: req.body?.input ?? {}, triggerType: "api", triggerData: req.body ?? {} });
      res.status(201).json({ ok: true, data: result });
    } catch (e) { next(e); }
  });

  // List agents
  router.get("/agents", requireScope("READ"), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const agents = await prisma.agent.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true, emoji: true, color: true, status: true, isBuiltIn: true },
      });
      res.json({ ok: true, data: agents });
    } catch (e) { next(e); }
  });

  // Send a Talk message
  router.post("/talk/channels/:id/messages", requireScope("WRITE", "ADMIN"), validate({ params: z.object({ id: z.string().cuid() }), body: z.object({ content: z.string().trim().min(1).max(20_000) }) }), async (req, res, next) => {
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
      res.status(201).json({ ok: true, data: msg });
    } catch (e) { next(e); }
  });

  // List Talk channels
  router.get("/talk/channels", requireScope("READ"), async (req, res, next) => {
    try {
      const orgId = (req as any).apiOrganization.id;
      const items = await prisma.talkChannel.findMany({
        where: { organizationId: orgId },
        orderBy: { lastMessageAt: "desc" },
        select: { id: true, name: true, type: true, lastMessageAt: true },
      });
      res.json({ ok: true, data: items });
    } catch (e) { next(e); }
  });
}
