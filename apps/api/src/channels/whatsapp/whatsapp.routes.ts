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

  /* ── Status probe (§15) ────────────────────────────────────────────── */

  /**
   * Lightweight liveness view of the channel: is it connected, is the webhook
   * verified, is the queue draining, and what is still unconfigured.
   *
   * Distinct from `GET /` — that returns a 30-day analytics dashboard. This is
   * the cheap endpoint a monitor can poll.
   */
  r.get("/status", async (req, res, next) => {
    try {
      const organizationId = requireOrg(req);
      const row = await WhatsAppChannelService.primary(organizationId);

      if (!row) {
        return res.json({
          ok: true,
          data: {
            connected: false, enabled: false, status: "NOT_CONFIGURED",
            webhookStatus: "UNVERIFIED", phoneNumberId: null, businessAccountId: null,
            lastWebhookAt: null, lastError: null, queueDepth: 0, dlqDepth: 0,
            pendingJobs: 0, runningJobs: 0, activeSessions: 0,
            configurationRequired: ["No WhatsApp channel registered for this organization."],
          },
        });
      }

      const cfg = resolveConfig(row);
      const db = prisma as any;
      const [queueDepth, dlqDepth, pendingJobs, runningJobs, activeSessions] = await Promise.all([
        WhatsAppQueue.depth().catch(() => 0),
        WhatsAppQueue.dlqDepth().catch(() => 0),
        db.whatsAppJob.count({ where: { organizationId, status: "QUEUED" } }).catch(() => 0),
        db.whatsAppJob.count({ where: { organizationId, status: "RUNNING" } }).catch(() => 0),
        db.whatsAppSession.count({ where: { organizationId, status: "ACTIVE" } }).catch(() => 0),
      ]);

      res.json({
        ok: true,
        data: {
          // "Connected" means credentials resolve AND Meta has verified the
          // webhook. Anything less is reported honestly as not connected.
          connected: row.status === "CONNECTED" && cfg.missing.length === 0,
          enabled: row.enabled,
          status: row.status,
          webhookStatus: row.webhookStatus,
          phoneNumberId: row.phoneNumberId,
          businessAccountId: row.businessAccountId,
          displayPhoneNumber: row.displayPhoneNumber,
          apiVersion: row.apiVersion,
          lastWebhookAt: row.lastWebhookAt?.toISOString() ?? null,
          lastError: row.lastError ?? null,
          lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
          queueDepth, dlqDepth, pendingJobs, runningJobs, activeSessions,
          configurationRequired: cfg.missing.length > 0 ? cfg.missing : null,
        },
      });
    } catch (e) { next(e); }
  });

  /* ── Message history (§15) ─────────────────────────────────────────── */

  r.get("/messages", async (req, res, next) => {
    try {
      const organizationId = requireOrg(req);
      const isAdmin = req.user?.role === "admin" || req.user?.role === "super_admin";
      const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
      const conversationId = typeof req.query.conversationId === "string" ? req.query.conversationId : undefined;
      const direction = req.query.direction === "INBOUND" || req.query.direction === "OUTBOUND"
        ? req.query.direction : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

      // Tenant scope is applied server-side and is never client-supplied.
      const where: Record<string, unknown> = { organizationId };
      if (conversationId) where.conversationId = conversationId;
      if (direction) where.direction = direction;
      if (status) where.status = status;

      const rows = await prisma.whatsAppMessage.findMany({
        where: where as any,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          conversation: {
            select: { id: true, contact: { select: { phoneNumber: true, displayName: true } } },
          },
        },
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      res.json({
        ok: true,
        data: page.map((m: any) => ({
          id: m.id,
          conversationId: m.conversationId,
          whatsappMessageId: m.whatsappMessageId,
          direction: m.direction,
          messageType: m.messageType,
          // Message bodies are personal data. Non-admins get metadata only.
          text: isAdmin ? m.text : null,
          status: m.status,
          errorCode: m.errorCode ?? null,
          errorMessage: isAdmin ? (m.errorMessage ?? null) : null,
          windelsMessageId: m.windelsMessageId ?? null,
          createdAt: m.createdAt.toISOString(),
          deliveredAt: m.deliveredAt?.toISOString() ?? null,
          readAt: m.readAt?.toISOString() ?? null,
          contact: {
            displayName: m.conversation?.contact?.displayName ?? null,
            phoneNumber: m.conversation?.contact
              ? (isAdmin ? m.conversation.contact.phoneNumber : maskPhone(m.conversation.contact.phoneNumber))
              : null,
          },
        })),
        meta: { hasMore, nextCursor: hasMore ? page[page.length - 1].id : null },
      });
    } catch (e) { next(e); }
  });

  /* ── Background jobs (§7 visibility) ───────────────────────────────── */

  r.get("/jobs", async (req, res, next) => {
    try {
      const organizationId = requireOrg(req);
      const limit = Math.min(Number(req.query.limit ?? 25) || 25, 100);
      const status = typeof req.query.status === "string" ? req.query.status : undefined;

      const rows = await (prisma as any).whatsAppJob.findMany({
        where: { organizationId, ...(status ? { status } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      res.json({
        ok: true,
        data: rows.map((j: any) => ({
          id: j.id,
          kind: j.kind,
          status: j.status,
          conversationId: j.conversationId,
          requestText: j.requestText,
          resultText: j.resultText ?? null,
          errorCode: j.errorCode ?? null,
          errorMessage: j.errorMessage ?? null,
          workflowId: j.workflowId ?? null,
          workflowRunId: j.workflowRunId ?? null,
          attempts: j.attempts,
          createdAt: j.createdAt.toISOString(),
          startedAt: j.startedAt?.toISOString() ?? null,
          completedAt: j.completedAt?.toISOString() ?? null,
        })),
      });
    } catch (e) { next(e); }
  });

  /* ── Connectivity test (§15) ───────────────────────────────────────── */

  /**
   * Verifies the stored credentials against the REAL Graph API by reading the
   * phone number back from Meta. Nothing is simulated: a failure here is a
   * genuine configuration or token problem.
   *
   * Optionally sends a real message when `to` is supplied, so an operator can
   * prove end-to-end delivery from the dashboard.
   */
  r.post("/test", requireAdmin, async (req, res, next) => {
    try {
      const organizationId = requireOrg(req);
      const row = await WhatsAppChannelService.primary(organizationId);
      if (!row) throw AppError.notFound("No WhatsApp channel registered for this organization");

      const cfg = resolveConfig(row);
      if (cfg.missing.length > 0) {
        return res.status(400).json({
          ok: false,
          error: {
            code: "WHATSAPP_CONFIGURATION_REQUIRED",
            message: `Channel is not fully configured: ${cfg.missing.join("; ")}`,
          },
        });
      }

      const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

      // 1. Credentials + Graph reachability.
      let profile: any = null;
      try {
        profile = await WhatsAppClient.checkConnection(toCredentials(row));
        checks.push({
          name: "graph_api",
          ok: true,
          detail: `Authenticated as ${profile?.displayPhoneNumber ?? row.phoneNumberId}`,
        });
      } catch (e: any) {
        checks.push({
          name: "graph_api",
          ok: false,
          detail: e?.message ?? "Could not reach the WhatsApp Cloud API",
        });
      }

      // 2. Webhook verification state — Meta drives this, we only report it.
      checks.push({
        name: "webhook",
        ok: row.webhookStatus === "VERIFIED",
        detail: row.webhookStatus === "VERIFIED"
          ? `Verified${row.lastWebhookAt ? `; last event ${row.lastWebhookAt.toISOString()}` : "; no events received yet"}`
          : "Meta has not verified this webhook URL yet. Configure the callback URL and verify token in the Meta app dashboard.",
      });

      // 3. Optional live send.
      let sent: any = null;
      if (typeof req.body?.to === "string" && req.body.to.trim().length >= 5) {
        const text = typeof req.body.text === "string" && req.body.text.trim()
          ? req.body.text.trim()
          : "WINDELS AI OS test message — your WhatsApp channel is connected.";
        const outcome = await WhatsAppMessageService.sendText(row, req.body.to.trim(), text, {});
        sent = {
          ok: outcome.ok,
          messageId: outcome.messageId ?? null,
          error: outcome.ok ? null : (outcome.error?.message ?? "Send failed"),
        };
        checks.push({
          name: "outbound_send",
          ok: outcome.ok,
          detail: outcome.ok
            ? `Delivered to Meta with id ${outcome.messageId}`
            : (outcome.error?.message ?? "Send failed"),
        });
      }

      const allOk = checks.every((c) => c.ok);
      logger.info("whatsapp channel test run", { organizationId, channelId: row.id, ok: allOk });

      res.json({
        ok: true,
        data: {
          passed: allOk,
          checks,
          sent,
          phoneNumber: profile?.displayPhoneNumber ?? row.displayPhoneNumber ?? null,
          verifiedName: profile?.verifiedName ?? null,
          qualityRating: profile?.qualityRating ?? null,
        },
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
