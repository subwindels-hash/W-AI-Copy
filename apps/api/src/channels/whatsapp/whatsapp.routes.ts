/**
 * Authenticated WhatsApp channel routes (Phase 1 §12, §13, §15, §8).
 *
 * Every handler is org-scoped from the caller's JWT — a channel id from the
 * request body is never trusted on its own. Admin-only operations additionally
 * require the ADMIN role via the existing IAM middleware.
 *
 *   GET    /channels/whatsapp                 — dashboard (status, stats, config gaps)
 *   GET    /channels/whatsapp/channels        — list channels for the org
 *   POST   /channels/whatsapp/channels        — admin: register a channel
 *   PATCH  /channels/whatsapp/channels/:id    — admin: update channel/credentials
 *   PATCH  /channels/whatsapp/channels/:id/settings — admin: channel settings
 *   POST   /channels/whatsapp/channels/:id/reconnect  — admin: live connectivity probe
 *   POST   /channels/whatsapp/channels/:id/disconnect — admin: soft disconnect
 *   POST   /channels/whatsapp/send            — admin: send a message
 *   GET    /channels/whatsapp/conversations   — recent conversations
 *   POST   /channels/whatsapp/link/start      — begin identity verification
 *   POST   /channels/whatsapp/link/confirm    — complete identity verification
 *   DELETE /channels/whatsapp/link/:contactId — remove one's own link
 */
import { Router } from "express";
import type { Request } from "express";
import {
  CreateWhatsAppChannelSchema,
  UpdateWhatsAppChannelSchema,
  WhatsAppSettingsSchema,
  SendWhatsAppMessageSchema,
  StartWhatsAppLinkSchema,
  ConfirmWhatsAppLinkSchema,
} from "@windels/shared";
import { authenticate, requireAdmin } from "../../http/middleware/auth.js";
import { validate } from "../../http/middleware/validate.js";
import { AppError } from "../../utils/result.js";
import { prisma } from "../../db/client.js";
import { WhatsAppChannelService, resolveConfig, toChannelDTO, toCredentials } from "./whatsappChannel.service.js";
import { WhatsAppMessageService } from "./whatsappMessage.service.js";
import { WhatsAppIdentityService } from "./whatsappIdentity.service.js";
import { WhatsAppClient } from "./whatsappClient.js";
import { WhatsAppQueue } from "./whatsappQueue.js";
import { currentUsage } from "./whatsappRateLimit.js";
import { logger } from "../../observability/logger.js";

/** Extracts the caller's org, refusing the request when they have none. */
function requireOrg(req: Request): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw AppError.forbidden("No organization context on this account");
  return orgId;
}

/** Phone numbers are personal data: non-admins only ever see a masked form. */
function maskPhone(phone: string): string {
  if (phone.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

export function registerWhatsAppRoutes(router: Router): void {
  const r = Router();
  r.use(authenticate);

  /* ── Dashboard ─────────────────────────────────────────────────────── */

  r.get("/", async (req, res, next) => {
    try {
      const organizationId = requireOrg(req);
      const row = await WhatsAppChannelService.primary(organizationId);

      if (!row) {
        return res.json({
          ok: true,
          data: {
            channel: null,
            stats: {
              messagesReceived: 0, messagesSent: 0, messagesFailed: 0,
              activeConversations: 0, connectedUsers: 0, contacts: 0,
              aiResponses: 0, mediaMessages: 0, queueDepth: 0, lastWebhookAt: null,
            },
            recentErrors: [],
            configurationRequired: [
              "No WhatsApp channel registered. Create one with your Meta phone number id and business account id.",
            ],
          },
        });
      }

      const cfg = resolveConfig(row);
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

      const [received, sent, failed, activeConversations, contacts, connectedUsers, mediaMessages, queueDepth, dlqDepth, usage] =
        await Promise.all([
          prisma.whatsAppMessage.count({ where: { organizationId, direction: "INBOUND", createdAt: { gte: since } } }),
          prisma.whatsAppMessage.count({ where: { organizationId, direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED", "READ"] as any }, createdAt: { gte: since } } }),
          prisma.whatsAppMessage.count({ where: { organizationId, status: "FAILED", createdAt: { gte: since } } }),
          prisma.whatsAppConversation.count({ where: { organizationId, status: "OPEN" } }),
          prisma.whatsAppContact.count({ where: { organizationId } }),
          prisma.whatsAppContact.count({ where: { organizationId, linkedWindelsUserId: { not: null } } }),
          prisma.whatsAppMessage.count({ where: { organizationId, messageType: { in: ["IMAGE", "AUDIO", "VIDEO", "DOCUMENT", "STICKER"] as any }, createdAt: { gte: since } } }),
          WhatsAppQueue.depth(),
          WhatsAppQueue.dlqDepth(),
          currentUsage(organizationId),
        ]);

      // AI responses = outbound messages that carry a WINDELS message id.
      const aiResponses = await prisma.whatsAppMessage.count({
        where: { organizationId, direction: "OUTBOUND", windelsMessageId: { not: null }, createdAt: { gte: since } },
      });

      const recentFailures = await prisma.whatsAppMessage.findMany({
        where: { organizationId, status: "FAILED" },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { updatedAt: true, errorCode: true, errorMessage: true },
      });

      res.json({
        ok: true,
        data: {
          channel: toChannelDTO(row),
          stats: {
            messagesReceived: received,
            messagesSent: sent,
            messagesFailed: failed,
            activeConversations,
            connectedUsers,
            contacts,
            aiResponses,
            mediaMessages,
            queueDepth,
            dlqDepth,
            orgHourlyUsage: usage.orgHourly,
            lastWebhookAt: row.lastWebhookAt?.toISOString() ?? null,
          },
          recentErrors: [
            ...(row.lastError ? [{ at: row.lastErrorAt?.toISOString() ?? new Date().toISOString(), code: "CHANNEL", message: row.lastError }] : []),
            ...recentFailures.map((f) => ({
              at: f.updatedAt.toISOString(),
              code: f.errorCode,
              message: f.errorMessage ?? "Message delivery failed",
            })),
          ],
          // Honest reporting: never claim "connected" when config is missing.
          configurationRequired: cfg.missing.length > 0 ? cfg.missing : null,
        },
      });
    } catch (e) { next(e); }
  });

  /* ── Channels ──────────────────────────────────────────────────────── */

  r.get("/channels", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await WhatsAppChannelService.list(requireOrg(req)) });
    } catch (e) { next(e); }
  });

  r.post("/channels", requireAdmin, validate({ body: CreateWhatsAppChannelSchema }), async (req, res, next) => {
    try {
      const organizationId = requireOrg(req);
      // phoneNumberId is globally unique: it is the inbound routing key, so a
      // number can only belong to one tenant.
      const clash = await prisma.whatsAppChannel.findFirst({
        where: { phoneNumberId: req.body.phoneNumberId, deletedAt: null },
        select: { organizationId: true },
      });
      if (clash) {
        throw new AppError("CONFLICT", "That WhatsApp phone number id is already registered");
      }
      const created = await WhatsAppChannelService.create(organizationId, req.body);
      logger.info("whatsapp channel registered", { organizationId, channelId: created.id });
      res.status(201).json({ ok: true, data: created });
    } catch (e) { next(e); }
  });

  r.patch("/channels/:id", requireAdmin, validate({ body: UpdateWhatsAppChannelSchema }), async (req, res, next) => {
    try {
      const updated = await WhatsAppChannelService.update(requireOrg(req), req.params.id, req.body);
      if (!updated) throw AppError.notFound("WhatsApp channel not found");
      res.json({ ok: true, data: updated });
    } catch (e) { next(e); }
  });

  r.patch("/channels/:id/settings", requireAdmin, validate({ body: WhatsAppSettingsSchema }), async (req, res, next) => {
    try {
      const organizationId = requireOrg(req);
      // Allowed agents must belong to the same org — no cross-tenant agents.
      if (Array.isArray(req.body.allowedAgentIds) && req.body.allowedAgentIds.length > 0) {
        const owned = await prisma.agent.count({
          where: { id: { in: req.body.allowedAgentIds }, organizationId },
        });
        if (owned !== req.body.allowedAgentIds.length) {
          throw AppError.forbidden("One or more agents do not belong to this organization");
        }
      }
      const updated = await WhatsAppChannelService.updateSettings(organizationId, req.params.id, req.body);
      if (!updated) throw AppError.notFound("WhatsApp channel not found");
      res.json({ ok: true, data: updated });
    } catch (e) { next(e); }
  });

  /**
   * Live connectivity probe against the Graph API. This performs a REAL call —
   * it reports the actual state, never an assumed one.
   */
  r.post("/channels/:id/reconnect", requireAdmin, async (req, res, next) => {
    try {
      const organizationId = requireOrg(req);
      const row = await WhatsAppChannelService.getScoped(organizationId, req.params.id);
      if (!row) throw AppError.notFound("WhatsApp channel not found");

      const cfg = resolveConfig(row);
      const creds = toCredentials(cfg);
      if (!creds) {
        await WhatsAppChannelService.recordError(row.id, `Configuration required: ${cfg.missing.join(", ")}`);
        return res.status(400).json({
          ok: false,
          error: { code: "WHATSAPP_CONFIGURATION_REQUIRED", message: `Missing configuration: ${cfg.missing.join(", ")}` },
        });
      }

      let probe: Awaited<ReturnType<typeof WhatsAppClient.checkConnection>>;
      try {
        probe = await WhatsAppClient.checkConnection(creds);
      } catch (err: any) {
        const message = err?.message ?? "Could not reach the WhatsApp Cloud API";
        await WhatsAppChannelService.recordError(row.id, message);
        return res.status(502).json({
          ok: false,
          error: { code: err?.code ?? "WHATSAPP_CONNECTION_FAILED", message },
        });
      }

      await WhatsAppChannelService.recordConnected(row.id, probe.displayPhoneNumber ?? null);
      const refreshed = await WhatsAppChannelService.getScoped(organizationId, row.id);
      res.json({ ok: true, data: refreshed ? toChannelDTO(refreshed) : null });
    } catch (e) { next(e); }
  });

  r.post("/channels/:id/disconnect", requireAdmin, async (req, res, next) => {
    try {
      const updated = await WhatsAppChannelService.disconnect(requireOrg(req), req.params.id);
      if (!updated) throw AppError.notFound("WhatsApp channel not found");
      logger.info("whatsapp channel disconnected", { channelId: req.params.id });
      res.json({ ok: true, data: updated });
    } catch (e) { next(e); }
  });

  /* ── Outbound send (§15) ───────────────────────────────────────────── */

  r.post("/send", requireAdmin, validate({ body: SendWhatsAppMessageSchema }), async (req, res, next) => {
    try {
      const organizationId = requireOrg(req);
      const row = await WhatsAppChannelService.primary(organizationId);
      if (!row) throw AppError.notFound("No WhatsApp channel is configured for this organization");
      if (!row.enabled) throw new AppError("SERVICE_UNAVAILABLE", "The WhatsApp channel is disabled");

      const { to, type, text, mediaUrl, mediaId, caption, filename } = req.body;

      if (type === "text" && !text) {
        throw AppError.badRequest("text is required when type is \"text\"");
      }

      const outcome = type === "text"
        ? await WhatsAppMessageService.sendText(row, to, text as string)
        : await WhatsAppMessageService.sendMedia(row, to, type, {
            id: mediaId, link: mediaUrl, caption, filename,
          });

      if (!outcome.ok) {
        return res.status(502).json({
          ok: false,
          error: { code: outcome.error?.code ?? "WHATSAPP_SEND_FAILED", message: outcome.error?.message ?? "Send failed" },
        });
      }
      res.json({ ok: true, data: { messageId: outcome.messageId, recordId: outcome.recordId } });
    } catch (e) { next(e); }
  });

  /* ── Conversations ─────────────────────────────────────────────────── */

  r.get("/conversations", async (req, res, next) => {
    try {
      const organizationId = requireOrg(req);
      const isAdmin = req.user?.role === "admin" || req.user?.role === "super_admin";
      const rows = await prisma.whatsAppConversation.findMany({
        where: { organizationId },
        orderBy: { lastMessageAt: "desc" },
        take: Math.min(Number(req.query.limit ?? 50) || 50, 200),
        include: {
          contact: { select: { id: true, phoneNumber: true, displayName: true, linkedWindelsUserId: true } },
          _count: { select: { messages: true } },
        },
      });

      res.json({
        ok: true,
        data: rows.map((c) => ({
          id: c.id,
          status: c.status,
          lastMessageAt: c.lastMessageAt.toISOString(),
          messageCount: c._count.messages,
          windelsConversationId: c.windelsConversationId,
          contact: {
            id: c.contact.id,
            displayName: c.contact.displayName,
            phoneNumber: isAdmin ? c.contact.phoneNumber : maskPhone(c.contact.phoneNumber),
            linked: Boolean(c.contact.linkedWindelsUserId),
          },
        })),
      });
    } catch (e) { next(e); }
  });

  /* ── Identity linking (§8) ─────────────────────────────────────────── */

  r.post("/link/start", validate({ body: StartWhatsAppLinkSchema }), async (req, res, next) => {
    try {
      const organizationId = requireOrg(req);
      const userId = req.user!.id;
      const result = await WhatsAppIdentityService.startLink({
        userId, organizationId, phoneNumber: req.body.phoneNumber,
      });
      if (!result.ok) {
        return res.status(400).json({ ok: false, error: { code: "WHATSAPP_LINK_FAILED", message: result.error } });
      }
      res.json({ ok: true, data: { expiresInSeconds: result.expiresInSeconds } });
    } catch (e) { next(e); }
  });

  r.post("/link/confirm", validate({ body: ConfirmWhatsAppLinkSchema }), async (req, res, next) => {
    try {
      const organizationId = requireOrg(req);
      const userId = req.user!.id;
      const result = await WhatsAppIdentityService.confirmLink({
        userId, organizationId, phoneNumber: req.body.phoneNumber, code: req.body.code,
      });
      if (!result.ok) {
        return res.status(400).json({ ok: false, error: { code: "WHATSAPP_LINK_FAILED", message: result.error } });
      }
      res.json({ ok: true, data: { contactId: result.contactId, linked: true } });
    } catch (e) { next(e); }
  });

  r.delete("/link/:contactId", async (req, res, next) => {
    try {
      const organizationId = requireOrg(req);
      const removed = await WhatsAppIdentityService.unlink({
        userId: req.user!.id, organizationId, contactId: req.params.contactId,
      });
      if (!removed) throw AppError.notFound("No link found for this account");
      res.json({ ok: true, data: { linked: false } });
    } catch (e) { next(e); }
  });

  router.use("/channels/whatsapp", r);
}
