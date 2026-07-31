/** Session 52 — AI Licensing & Monetization routes */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import LicensingService from "../../licensing/licensing.service.js";
import { z } from "zod";

const register = z.object({
  type: z.enum(["ai_model","ai_employee","ai_agent","ai_skill","ai_workflow","voice_pack","prompt_library","knowledge_pack","industry_template","connector","plugin","digital_human"]),
  externalAssetId: z.string().min(1).max(128),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  billingModel: z.enum(["subscription","usage","revenue_share","enterprise_license","royalty"]),
  priceCents: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("USD"),
  revenueSharePct: z.number().min(0).max(100).optional(),
  royaltyPct: z.number().min(0).max(100).optional(),
  termsUrl: z.string().url().optional(),
});
const grant = z.object({ assetId: z.string(), licenseeOrgId: z.string(), expiresAt: z.string().optional() });
const usage = z.object({ grantId: z.string(), usageCents: z.number().int().min(0).default(1) });

export function registerLicensingRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => { try { res.json({ ok: true, data: await LicensingService.dashboard() }); } catch (e) { next(e); } });
  router.get("/assets", async (_req, res, next) => { try { res.json({ ok: true, data: await LicensingService.listAssets() }); } catch (e) { next(e); } });
  router.get("/grants", async (_req, res, next) => { try { res.json({ ok: true, data: await LicensingService.listGrants() }); } catch (e) { next(e); } });
  router.post("/assets", validate({ body: register }), async (req, res, next) => { try { res.json({ ok: true, data: await LicensingService.register({ ...req.body, ownerId: req.user!.id }) }); } catch (e) { next(e); } });
  router.post("/grants", validate({ body: grant }), async (req, res, next) => { try { res.json({ ok: true, data: await LicensingService.grant(req.body) }); } catch (e) { next(e); } });
  router.post("/usage", validate({ body: usage }), async (req, res, next) => { try { res.json({ ok: true, data: await LicensingService.recordUsage(req.body) }); } catch (e) { next(e); } });
}
