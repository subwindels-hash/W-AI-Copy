import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { env } from "../../config/env.js";
import type { ApiEnvelope } from "@windels/shared/api";

function checkWebhookSecret(header: string | undefined): boolean {
  if (!header) return false;
  const expected = env.WEBHOOK_SECRET || env.JWT_SECRET || "";
  return header === expected || header === `sha256=${expected}`;
}

export function registerWebhookRoutes(router: Router) {
  const webhook = Router();
  webhook.post("/billing/webhook", validate({ body: z.object({ eventId: z.string(), eventType: z.string(), payload: z.record(z.unknown()).optional() }) }), async (req, res, next) => {
    try {
      const secret = req.headers["x-windels-webhook-secret"] as string | undefined;
      if (!checkWebhookSecret(secret)) return res.status(401).json({ ok: false, error: "Invalid webhook secret" });
      const envResponse: ApiEnvelope<{ idempotent: boolean; applied: boolean }> = { ok: true, data: { idempotent: false, applied: true }, meta: { requestId: req.requestId ?? "" } };
      res.json(envResponse);
    } catch (e) { next(e); }
  });
  router.use("/webhook", webhook);
}
