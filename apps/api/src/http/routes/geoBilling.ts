/**
 * Global Currency, Payment Orchestration & Geo-Aware Billing Routes — Session 129
 *
 * Exposes endpoints for:
 *   - Automatic Geo-Billing Context (`GET /context`)
 *   - Country Payment Profiles (`GET /profiles`, `GET /profiles/:country`, `PUT /profiles/:country`)
 *   - Smart Payment Routing & Failover (`POST /route-payment`)
 *   - Regional Tax & Compliance Engine (`POST /tax-calculate`)
 *   - Unified Webhook Gateway Normalizer (`POST /webhook/normalize`)
 *   - AI Billing Employee Insights (`GET /ai-insights`)
 *   - Dynamic Localized Checkout Initiator (`POST /checkout/initiate`)
 */
import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { GeoBillingService } from "../../geoBilling/geoBilling.service.js";
import {
  PaymentRoutingRequestSchema,
  TaxCalculationRequestSchema,
  GeoCheckoutRequestSchema,
  CountryPaymentProfileSchema,
} from "@windels/shared";

export function registerGeoBillingRoutes(router: Router) {
  const geoBilling = Router();

  // 1. Resolve Automatic Geo-Billing Context
  geoBilling.get("/context", async (req, res, next) => {
    try {
      const user = req.user;
      const countryCode = (req.query.country as string | undefined) || req.headers["x-windels-country"] as string | undefined;
      const ip = (req.headers["x-forwarded-for"] as string | undefined) || req.socket.remoteAddress;
      const acceptLanguage = req.headers["accept-language"];

      const context = await GeoBillingService.resolveContext({
        userId: user?.id,
        countryCode,
        ip,
        acceptLanguage,
      });

      res.json({ ok: true, data: context, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  // 2. List All Configurable Country Payment Profiles
  geoBilling.get("/profiles", async (req, res, next) => {
    try {
      const profiles = await GeoBillingService.listProfiles();
      res.json({ ok: true, data: profiles, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  // 3. Retrieve Single Country Payment Profile
  geoBilling.get("/profiles/:country", async (req, res, next) => {
    try {
      const profile = await GeoBillingService.getProfile(req.params.country);
      res.json({ ok: true, data: profile, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  // 4. Update Country Payment Profile (Super Admin / Admin Tool)
  geoBilling.put(
    "/profiles/:country",
    authenticate,
    requireAdmin,
    validate({ body: CountryPaymentProfileSchema.partial() }),
    async (req, res, next) => {
      try {
        const user = req.user!;
        const updated = await GeoBillingService.updateProfile(
          req.params.country,
          req.body,
          user.id
        );
        res.json({ ok: true, data: updated, meta: { requestId: req.requestId } });
      } catch (e) {
        next(e);
      }
    }
  );

  // 5. Intelligent Payment Routing & Failover Calculation
  geoBilling.post("/route-payment", validate({ body: PaymentRoutingRequestSchema }), async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      const orgId = user.organizationId ?? "org-geo-default";

      const plan = await GeoBillingService.routePayment(orgId, req.body);
      res.json({ ok: true, data: plan, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  // 6. Calculate Regional Taxes and Net/Gross Totals
  geoBilling.post("/tax-calculate", validate({ body: TaxCalculationRequestSchema }), async (req, res, next) => {
    try {
      const taxResult = await GeoBillingService.calculateTax(req.body);
      res.json({ ok: true, data: taxResult, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  // 7. Unified Webhook Gateway Normalizer
  geoBilling.post("/webhook/normalize", async (req, res, next) => {
    try {
      const source = (req.query.source as string) || req.body?.source || "custom";
      const verified = Boolean(req.body?.verified ?? true);
      const payload = (req.body?.payload || req.body) as Record<string, unknown>;

      const normalized = await GeoBillingService.normalizeWebhookEvent(
        source,
        payload,
        verified,
        req.user?.organizationId
      );

      res.status(201).json({ ok: true, data: normalized, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  // 8. AI Billing Employee Context & Regional Insights
  geoBilling.get("/ai-insights", async (req, res, next) => {
    try {
      const country = (req.query.country as string) || "NG";
      const amount = Number(req.query.amount || 100);

      const insights = await GeoBillingService.getAIInsights(country, amount);
      res.json({ ok: true, data: insights, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  // 9. Dynamic Localized Checkout Initiator
  geoBilling.post("/checkout/initiate", validate({ body: GeoCheckoutRequestSchema }), async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      const orgId = user.organizationId ?? "org-geo-default";

      const checkout = await GeoBillingService.initiateGeoCheckout(orgId, {
        ...req.body,
        customerEmail: req.body.customerEmail || user.email,
      });

      res.status(201).json({ ok: true, data: checkout, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  router.use("/geo-billing", geoBilling);
}
