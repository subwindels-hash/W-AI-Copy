import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import * as billing from "../../services/billing.service.js";

export function registerBillingRoutes(router: Router) {
  // Subscription and invoice data are organization-administration functions.
  router.use(authenticate, requireAdmin);

  router.get("/", async (req, res, next) => {
    try { res.json({ ok: true, data: await billing.getBilling(req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.patch("/", validate({ body: billing.UpdateSubscriptionSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await billing.updateSubscription(req.user!.id, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/insights", async (req, res, next) => {
    try { res.json({ ok: true, data: await billing.getPredictiveAnalytics(req.user!.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
}
