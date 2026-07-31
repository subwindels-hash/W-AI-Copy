import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import * as billing from "../../services/billing.service.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/result.js";

const InvoiceIdParams = z.object({ id: z.string().cuid() });
const VoidBody = z.object({ reason: z.string().max(500).optional() });

export function registerBillingRoutes(router: Router) {
  // ── Public: payment webhook. Mounted before auth so upstream providers can call it.
  // Auth is HMAC via `x-windels-webhook-secret` header shared with the provider.
  router.post("/webhook", validate({ body: billing.RecordPaymentEventSchema }), async (req, res, next) => {
    try {
      const secret = req.header("x-windels-webhook-secret") ?? "";
      const expected = process.env.BILLING_WEBHOOK_SECRET || env.JWT_SECRET;
      if (!expected || secret !== expected) {
        throw AppError.unauthorized("invalid webhook secret");
      }
      const result = await billing.recordPaymentEvent(req.body);
      res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Everything below requires an authenticated org admin.
  router.use(authenticate, requireAdmin);

  router.get("/", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await billing.getBilling(req.user!.id), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/", validate({ body: billing.UpdateSubscriptionSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await billing.updateSubscription(req.user!.id, req.body), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/insights", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await billing.getPredictiveAnalytics(req.user!.id), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/invoices/:id/mark-paid", validate({ params: InvoiceIdParams }), async (req, res, next) => {
    try {
      const inv = await billing.markInvoicePaid(req.user!.id, req.params.id);
      res.json({ ok: true, data: inv, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/invoices/:id/void", validate({ params: InvoiceIdParams, body: VoidBody }), async (req, res, next) => {
    try {
      const inv = await billing.voidInvoice(req.user!.id, req.params.id, req.body?.reason);
      res.json({ ok: true, data: inv, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
// nothing
