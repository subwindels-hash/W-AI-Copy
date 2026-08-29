/**
 * Session 52 — AI Licensing & Monetization routes.
 *
 * S164 — every handler here previously called the service with no arguments,
 * so all six fell through to `oid = "org-windels"`. For a module that records
 * revenue this was not merely a read leak: `POST /usage` credited another
 * tenant's `revenue30d` and `pending` payout balance, and an asset a tenant
 * registered was filed under — and owned by — org-windels.
 */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import LicensingService from "../../licensing/licensing.service.js";
import { LICENSABLE_ASSET_TYPES, BILLING_MODELS } from "@windels/shared";
import { z } from "zod";

const register = z.object({
  type: z.enum(LICENSABLE_ASSET_TYPES),
  externalAssetId: z.string().min(1).max(128),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  billingModel: z.enum(BILLING_MODELS),
  priceCents: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("USD"),
  revenueSharePct: z.number().min(0).max(100).optional(),
  royaltyPct: z.number().min(0).max(100).optional(),
  termsUrl: z.string().url().optional(),
});
const grant = z.object({ assetId: z.string(), licenseeOrgId: z.string(), expiresAt: z.string().optional() });
const usage = z.object({ grantId: z.string(), usageCents: z.number().int().min(0).default(1) });
const settle = z.object({ royaltyIds: z.array(z.string()).optional() });
const cancel = z.object({ grantId: z.string() });

/**
 * S164 — licensed assets, grants and payout balances are per-organization
 * financial records. There is no sensible fallback when the caller has no
 * organization context.
 */
function orgOf(req: any, res: any): string | null {
  const oid = req.user?.organizationId;
  if (!oid) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return oid;
}

export function registerLicensingRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await LicensingService.dashboard(oid) });
    } catch (e) { next(e); }
  });

  router.get("/assets", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await LicensingService.listAssets(oid) });
    } catch (e) { next(e); }
  });

  router.get("/grants", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await LicensingService.listGrants(oid) });
    } catch (e) { next(e); }
  });

  // S164 — the royalty ledger was written on every usage event and read by
  // nothing. The record of what is owed to whom is now retrievable.
  router.get("/royalties", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await LicensingService.listRoyalties(oid) });
    } catch (e) { next(e); }
  });

  router.post("/assets", validate({ body: register }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await LicensingService.register({ ...req.body, organizationId: oid, ownerId: req.user!.id }) });
    } catch (e) { next(e); }
  });

  router.post("/grants", validate({ body: grant }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await LicensingService.grant({ ...req.body, organizationId: oid }) });
    } catch (e) { next(e); }
  });

  router.post("/grants/cancel", validate({ body: cancel }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await LicensingService.cancelGrant({ ...req.body, organizationId: oid }) });
    } catch (e) { next(e); }
  });

  router.post("/usage", validate({ body: usage }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await LicensingService.recordUsage({ ...req.body, organizationId: oid }) });
    } catch (e) { next(e); }
  });

  // S164 — settles the ledger only; no payment processor is wired.
  router.post("/payouts/settle", validate({ body: settle }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await LicensingService.settlePayouts({ ...req.body, organizationId: oid }) });
    } catch (e) { next(e); }
  });
}
