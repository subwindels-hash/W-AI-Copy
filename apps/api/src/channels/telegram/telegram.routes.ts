/**
 * Authenticated Telegram management API (§25, §19, §4).
 *
 * Channel setup/disconnect, webhook rotation, account linking tokens, stats
 * and settings — all behind the existing authenticate middleware + RBAC.
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../http/middleware/auth.js";
import { validate } from "../../http/middleware/validate.js";
import { TelegramChannelService } from "./telegramChannel.service.js";
import { TelegramIdentityService } from "./telegramIdentity.service.js";
import { auditService } from "../../audit/audit.service.js";

export function registerTelegramRoutes(router: Router): void {
  const r = Router();
  r.use(authenticate);

  r.get("/channels", async (req, res, next) => {
    try {
      const list = await TelegramChannelService.list(req.user!.organizationId);
      // Strip encrypted blobs before returning.
      res.json({ ok: true, data: list.map(({ botTokenEnc, webhookSecretEnc, ...c }) => ({ ...c, configured: Boolean(botTokenEnc) })) });
    } catch (e) { next(e); }
  });

  const Setup = z.object({
    name: z.string().min(1).max(80).optional(),
    botToken: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/, "Invalid Telegram bot token"),
    webhookBaseUrl: z.string().url(),
    settings: z.object({
      welcomeMessage: z.string().max(500).optional(),
      mediaEnabled: z.boolean().optional(),
      voiceEnabled: z.boolean().optional(),
      imageVision: z.boolean().optional(),
      maxFileMb: z.number().int().min(1).max(50).optional(),
      responseMode: z.enum(["ai", "off", "human"]).optional(),
      maintenanceMode: z.boolean().optional(),
    }).partial().optional(),
  });
  r.post("/channels", validate({ body: Setup }), async (req, res, next) => {
    try {
      const channel = await TelegramChannelService.setup({ organizationId: req.user!.organizationId, ...req.body });
      await auditService.log({ organizationId: req.user!.organizationId, userId: req.user!.id, action: "system.config_change", resourceType: "organization", resourceId: channel.id });
      const { botTokenEnc, webhookSecretEnc, ...safe } = channel;
      res.status(201).json({ ok: true, data: { ...safe, configured: true } });
    } catch (e) { next(e); }
  });

  r.delete("/channels/:id", async (req, res, next) => {
    try {
      const c = await TelegramChannelService.get(req.params.id);
      if (!c || c.organizationId !== req.user!.organizationId) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      await TelegramChannelService.disconnect(c.id);
      await auditService.log({ organizationId: req.user!.organizationId, userId: req.user!.id, action: "system.config_change", resourceType: "organization", resourceId: c.id });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.post("/channels/:id/enabled", validate({ body: z.object({ enabled: z.boolean() }) }), async (req, res, next) => {
    try {
      const c = await TelegramChannelService.get(req.params.id);
      if (!c || c.organizationId !== req.user!.organizationId) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      await TelegramChannelService.setEnabled(c.id, req.body.enabled);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.patch("/channels/:id/settings", validate({ body: z.object({}).passthrough() }), async (req, res, next) => {
    try {
      const c = await TelegramChannelService.get(req.params.id);
      if (!c || c.organizationId !== req.user!.organizationId) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      const updated = await TelegramChannelService.updateSettings(c.id, req.body);
      res.json({ ok: true, data: updated });
    } catch (e) { next(e); }
  });

  r.post("/channels/:id/rotate-webhook", validate({ body: z.object({ webhookBaseUrl: z.string().url() }) }), async (req, res, next) => {
    try {
      const updated = await TelegramChannelService.rotateWebhookSecret(req.params.id, req.body.webhookBaseUrl);
      if (!updated) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.get("/stats", async (req, res, next) => {
    try { res.json({ ok: true, data: await TelegramChannelService.stats(req.user!.organizationId) }); } catch (e) { next(e); }
  });

  // ── Account linking (§4) ──
  r.post("/link-token", validate({ body: z.object({ channelId: z.string().optional() }) }), async (req, res, next) => {
    try {
      const issued = await TelegramIdentityService.issueLinkingToken({ userId: req.user!.id, organizationId: req.user!.organizationId, channelId: req.body.channelId });
      await auditService.log({ organizationId: req.user!.organizationId, userId: req.user!.id, action: "data.create", resourceType: "user", resourceId: req.user!.id });
      res.status(201).json({ ok: true, data: issued });
    } catch (e) { next(e); }
  });

  r.get("/connections", async (req, res, next) => {
    try {
      const { prisma } = await import("../../db/client.js");
      const connections = await prisma.telegramConnection.findMany({ where: { organizationId: req.user!.organizationId, linkedUserId: req.user!.id }, orderBy: { lastActivityAt: "desc" } });
      res.json({ ok: true, data: connections });
    } catch (e) { next(e); }
  });

  r.delete("/connections/:id", async (req, res, next) => {
    try {
      const ok = await TelegramIdentityService.unlink({ userId: req.user!.id, connectionId: req.params.id });
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.use("/telegram", r);
}
