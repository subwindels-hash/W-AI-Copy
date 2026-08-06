import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import * as billing from "../../services/billing.service.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/result.js";
import { BillingInvoiceIdSchema, BillingPaymentEventSchema, BillingSubscriptionUpdateSchema, BillingVoidSchema } from "@windels/shared/billing";

export function registerBillingRoutes(router: Router) {
  // Public payment webhook. Upstream providers authenticate with the shared
  // secret; the event schema is shared with the authenticated admin surface.
  router.post("/webhook", validate({ body: BillingPaymentEventSchema }), async (req, res, next) => {
    try {
      const secret = req.header("x-windels-webhook-secret") ?? "";
      const expected = process.env.BILLING_WEBHOOK_SECRET || env.JWT_SECRET;
      if (!expected || secret !== expected) throw AppError.unauthorized("invalid webhook secret");
      const result = await billing.recordPaymentEvent(req.body);
      res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.use(authenticate, requireAdmin);

  router.get("/", async (req, res, next) => {
    try { res.json({ ok: true, data: await billing.getBilling(req.user!.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.patch("/", validate({ body: BillingSubscriptionUpdateSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await billing.updateSubscription(req.user!.id, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.get("/insights", async (req, res, next) => {
    try { res.json({ ok: true, data: await billing.getPredictiveAnalytics(req.user!.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/invoices/:id/mark-paid", validate({ params: BillingInvoiceIdSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await billing.markInvoicePaid(req.user!.id, req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/invoices/:id/void", validate({ params: BillingInvoiceIdSchema, body: BillingVoidSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await billing.voidInvoice(req.user!.id, req.params.id, req.body?.reason), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
}
