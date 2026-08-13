/**
 * Public WhatsApp webhook — Phase 1 §5 and pipeline steps 1-4.
 *
 * Mounted WITHOUT `authenticate`: Meta cannot present a WINDELS JWT. Access
 * control is therefore the verify token (GET) and the HMAC app-secret
 * signature over the raw body (POST), plus the shared `webhookIngest` limiter.
 *
 * The handler does the minimum needed to accept an event safely and returns
 * 200 fast; all real work is queued (see whatsappWorker.ts).
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../../db/client.js";
import { logger } from "../../observability/logger.js";
import { rateLimit } from "../../http/middleware/rateLimit.js";
import { WhatsAppChannelService, resolveConfig } from "./whatsappChannel.service.js";
import { verifyWebhookSignature, verifyTokenMatches } from "./whatsappClient.js";
import { parseWebhookPayload, isWhatsAppEnvelope, hashPayload } from "./whatsappPayload.js";
import { WhatsAppQueue } from "./whatsappQueue.js";
import { emitKernelEvent } from "./whatsappKernel.js";

/** Meta retries anything that is not a 2xx, so failures we cannot fix return 200. */
const ACK = { ok: true };

function firstPhoneNumberId(body: any): string | null {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const id = change?.value?.metadata?.phone_number_id;
      if (typeof id === "string" && id.length > 0) return id;
    }
  }
  return null;
}

/**
 * The entry id is the WhatsApp Business Account id. It is the only tenant
 * identifier present on account-level notifications.
 */
function firstBusinessAccountId(body: any): string | null {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    if (typeof entry?.id === "string" && entry.id.length > 0) return entry.id;
  }
  return null;
}

export function registerWhatsAppWebhookRoutes(router: Router): void {
  /**
   * GET — Meta's subscription handshake.
   * Echoes hub.challenge only when hub.verify_token matches the configured
   * secret in constant time.
   */
  router.get("/", rateLimit("webhookIngest"), async (req: Request, res: Response) => {
    const mode = String(req.query["hub.mode"] ?? "");
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode !== "subscribe" || typeof token !== "string" || typeof challenge !== "string") {
      return res.status(400).send("Bad Request");
    }

    // The verify token may live on any channel row (or the env fallback), so
    // check every configured channel until one matches.
    let matched: { id: string } | null = null;
    try {
      const channels = await prisma.whatsAppChannel.findMany({ where: { enabled: true } });
      for (const row of channels) {
        const cfg = resolveConfig(row);
        if (verifyTokenMatches(token, cfg.verifyToken)) {
          matched = { id: row.id };
          break;
        }
      }
      // Env-only deployment: no channel row exists yet, but the operator has
      // set WHATSAPP_VERIFY_TOKEN and is completing the handshake first.
      if (!matched && channels.length === 0) {
        const envToken = process.env.WHATSAPP_VERIFY_TOKEN;
        if (verifyTokenMatches(token, envToken)) {
          logger.info("whatsapp webhook verified against env verify token");
          return res.status(200).send(challenge);
        }
      }
    } catch (e: any) {
      logger.error("whatsapp webhook verification lookup failed", { err: e?.message });
      return res.status(500).send("Internal Error");
    }

    if (!matched) {
      logger.warn("whatsapp webhook verification rejected: token mismatch");
      return res.status(403).send("Forbidden");
    }

    await WhatsAppChannelService.markWebhookVerified(matched.id).catch(() => { /* non-fatal */ });
    logger.info("whatsapp webhook verified", { channelId: matched.id });
    return res.status(200).send(challenge);
  });

  /**
   * POST — event delivery.
   *
   * Order matters: shape check → channel lookup → signature verification →
   * idempotency → enqueue → ACK. Nothing is persisted before the signature is
   * proven, so an unsigned caller cannot write to our database.
   */
  router.post("/", rateLimit("webhookIngest"), async (req: Request, res: Response) => {
    const body = req.body;

    // ── Step 2: validate the payload shape ─────────────────────────────
    if (!isWhatsAppEnvelope(body)) {
      logger.warn("whatsapp webhook rejected: not a WhatsApp envelope");
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Unrecognised payload" } });
    }

    // ── Step 4 (early): identify the channel from the envelope ─────────
    // Message and status events are addressed by phone number id. WABA-level
    // notifications (account_update, template status, quality signals) carry
    // no phone number id at all, so fall back to the business account id in
    // the entry — otherwise those events would be dropped unexamined.
    const phoneNumberId = firstPhoneNumberId(body);
    const businessAccountId = firstBusinessAccountId(body);

    let channel: any = null;
    if (phoneNumberId) {
      channel = await WhatsAppChannelService.findByPhoneNumberId(phoneNumberId).catch(() => null);
    } else if (businessAccountId) {
      channel = await WhatsAppChannelService.findByBusinessAccountId(businessAccountId).catch(() => null);
    }

    if (!channel) {
      // Unknown tenant — this ACK necessarily precedes signature verification.
      //
      // The app secret is per-channel, so with no channel resolved there is no
      // key to verify against; the only way to check a signature here would be
      // a global fallback secret, which would be wrong in a multi-tenant
      // deployment. The exposure is bounded because this branch is inert: it
      // reads nothing sensitive, writes no row, enqueues no job and starts no
      // AI work. An unsigned caller can therefore reach a channel lookup and
      // nothing else.
      //
      // The 200 (rather than 4xx) is deliberate: Meta retries non-2xx and
      // eventually disables the subscription, so a stray payload for a
      // deregistered number must not jeopardise a live tenant's webhook.
      logger.warn("whatsapp webhook for unregistered sender", { phoneNumberId, businessAccountId });
      return res.status(200).json(ACK);
    }

    const cfg = resolveConfig(channel);

    // ── Step 3: verify the signature over the RAW bytes ────────────────
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const signature = req.header("x-hub-signature-256") ?? undefined;
    const verdict = verifyWebhookSignature(rawBody, signature, cfg.appSecret);

    if (!verdict.valid) {
      // A missing app secret is a configuration gap, not an attack — but the
      // event is still refused. We never trust unverified webhook data.
      logger.warn("whatsapp webhook signature rejected", {
        channelId: channel.id, reason: verdict.reason,
      });
      await WhatsAppChannelService.recordError(
        channel.id,
        cfg.appSecret
          ? `Webhook signature rejected: ${verdict.reason}`
          : "Webhook received but WHATSAPP_APP_SECRET is not configured — signature cannot be verified.",
      ).catch(() => { /* non-fatal */ });
      await emitKernelEvent("whatsapp.webhook.signature_rejected", {
        channelId: channel.id, organizationId: channel.organizationId, reason: verdict.reason,
      });
      return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid signature" } });
    }

    // The event is authentic from here on.
    await WhatsAppChannelService.recordWebhookSeen(channel.id).catch(() => { /* non-fatal */ });

    if (!channel.enabled) {
      logger.info("whatsapp webhook ignored: channel disabled", { channelId: channel.id });
      return res.status(200).json(ACK);
    }

    const payloadHash = hashPayload(rawBody ?? JSON.stringify(body));
    const events = parseWebhookPayload(body);
    if (events.length === 0) {
      return res.status(200).json(ACK);
    }

    let queued = 0;
    let duplicates = 0;

    for (const event of events) {
      const eventId = event.kind === "message" ? event.messageId : event.eventId;
      try {
        // ── Idempotency: the unique eventId is the duplicate guard ─────
        const row = await prisma.whatsAppWebhookEvent.create({
          data: {
            organizationId: channel.organizationId,
            channelId: channel.id,
            eventId,
            eventType: event.kind,
            // Only the hash is stored — never the sensitive payload itself.
            payloadHash,
            processingStatus: "RECEIVED",
          },
        });

        await WhatsAppQueue.enqueue({ eventRowId: row.id, eventId, event });
        queued++;
      } catch (e: any) {
        if (e?.code === "P2002") {
          duplicates++;
          continue; // Meta redelivered something we already accepted.
        }
        // A storage or Redis failure must not turn into a 500: Meta would
        // retry the whole batch and we would re-process the siblings.
        logger.error("whatsapp webhook could not queue event", {
          channelId: channel.id, kind: event.kind, err: e?.message,
        });
      }
    }

    if (duplicates > 0) {
      logger.info("whatsapp webhook duplicates skipped", { channelId: channel.id, duplicates });
    }

    // ── Step 1 complete: fast ACK. All work happens in the worker. ─────
    return res.status(200).json({ ok: true, queued, duplicates });
  });
}
