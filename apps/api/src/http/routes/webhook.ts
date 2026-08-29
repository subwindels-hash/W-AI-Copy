/**
 * Inbound Webhook Receiver Routes (Module — Session 126 Completion)
 *
 * Provides incoming webhook receivers for payment providers (`/billing/webhook`)
 * and general multi-source inbound webhooks (`/inbound/:source`), HMAC signature
 * verification, org-scoped inbox query (`GET /inbound`), replay, and correction.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { env } from "../../config/env.js";
import type { ApiEnvelope } from "@windels/shared/api";
import { WebhookReceiverService, safeCompare } from "../../webhook/webhookReceiver.service.js";
import { InboundWebhookQuerySchema } from "@windels/shared";

function checkWebhookSecret(header: string | undefined): boolean {
  if (!header) return false;
  const expected = env.WEBHOOK_SECRET || "";
  // In test environments or when WEBHOOK_SECRET is explicitly set, use timing safe equal
  if (expected) {
    return safeCompare(header, expected) || safeCompare(header, `sha256=${expected}`);
  }
  // Backwards compatibility fallback if WEBHOOK_SECRET is unset in legacy dev environments
  const fallback = env.JWT_SECRET || "";
  return fallback ? (safeCompare(header, fallback) || safeCompare(header, `sha256=${fallback}`)) : false;
}

export function registerWebhookRoutes(router: Router) {
  const webhook = Router();

  // 1. Existing payment webhook receiver — untouched path, headers, body, status, return shape
  webhook.post(
    "/billing/webhook",
    validate({ body: z.object({ eventId: z.string(), eventType: z.string(), payload: z.record(z.unknown()).optional() }) }),
    async (req, res, next) => {
      try {
        const secret = req.headers["x-windels-webhook-secret"] as string | undefined;
        if (!checkWebhookSecret(secret)) {
          return res.status(401).json({ ok: false, error: "Invalid webhook secret" });
        }

        // Session 126 additive: log incoming billing webhook to inbox & emit EventBus
        const orgId = req.user?.organizationId ?? "org-system-billing";
        await WebhookReceiverService.receiveWebhook(
          orgId,
          "billing",
          req.body as Record<string, unknown>,
          true,
          req.body.eventType
        );

        const envResponse: ApiEnvelope<{ idempotent: boolean; applied: boolean }> = {
          ok: true,
          data: { idempotent: false, applied: true },
          meta: { requestId: req.requestId ?? "", tookMs: Date.now() - (req.startedAt ?? Date.now()) },
        };
        res.json(envResponse);
      } catch (e) {
        next(e);
      }
    }
  );

  // 2. Session 126 additive: multi-source inbound webhook receiver (/inbound/:source)
  webhook.post("/inbound/:source", async (req, res, next) => {
    try {
      const source = req.params.source || "custom";
      const signatureHeader = (req.headers["x-hub-signature-256"] ||
        req.headers["stripe-signature"] ||
        req.headers["x-windels-webhook-secret"] ||
        req.headers["authorization"]) as string | undefined;

      const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const verified = WebhookReceiverService.verifySignature(source, signatureHeader, rawBody);

      if (!verified && env.NODE_ENV === "production") {
        return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid webhook signature" } });
      }

      const orgId = req.user?.organizationId ?? req.headers["x-windels-organization-id"] as string ?? "org-inbound-default";
      const payload = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : { raw: rawBody };

      const entry = await WebhookReceiverService.receiveWebhook(
        orgId,
        source,
        payload,
        verified
      );

      res.status(201).json({
        ok: true,
        data: entry,
        meta: { requestId: req.requestId ?? "" },
      });
    } catch (err) {
      next(err);
    }
  });

  // 3. Session 126 additive: list inbound webhook inbox entries for caller's organization
  webhook.get("/inbound", validate({ query: InboundWebhookQuerySchema }), async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      if (!user.organizationId) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Organization scope required" } });

      const items = await WebhookReceiverService.listInboundWebhooks(user.organizationId, req.query as any);
      res.json({ ok: true, data: items, meta: { requestId: req.requestId } });
    } catch (err) {
      next(err);
    }
  });

  // 4. Session 126 additive: get full payload details for a specific inbox entry
  webhook.get("/inbound/:id", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      if (!user.organizationId) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Organization scope required" } });

      const entry = await WebhookReceiverService.getInboundWebhook(user.organizationId, req.params.id);
      if (!entry) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Inbox entry not found in organization" } });
      }

      res.json({ ok: true, data: entry, meta: { requestId: req.requestId } });
    } catch (err) {
      next(err);
    }
  });

  // 5. Session 126 additive: replay an inbound webhook (re-dispatch to EventBus)
  webhook.post("/inbound/:id/replay", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      if (!user.organizationId) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Organization scope required" } });

      const result = await WebhookReceiverService.replayWebhook(user.organizationId, req.params.id);
      if (!result) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Inbox entry not found in organization" } });
      }

      res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
    } catch (err) {
      next(err);
    }
  });

  // 6. Session 126 additive: delete an inbox entry (admin correction path)
  webhook.delete("/inbound/:id", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      if (!user.organizationId) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Organization scope required" } });

      const removed = await WebhookReceiverService.deleteWebhookEntry(user.organizationId, req.params.id);
      if (!removed) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Inbox entry not found in organization" } });
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.use("/webhook", webhook);
}
