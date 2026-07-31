/** Session 48 — Constitution Studio routes */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import ConstitutionService from "../../constitution/constitution.service.js";
import { z } from "zod";

const upsert = z.object({
  id: z.string().optional(),
  domain: z.enum(["corporate_ethics","decision_boundaries","risk_appetite","brand_standards","communication_style","regulatory_compliance","industry_rules","regional_policies","escalation_requirements","human_approval_rules","ai_decision_limits"]),
  title: z.string().min(2).max(200),
  statement: z.string().min(10).max(4000),
  enforcementLevel: z.enum(["advisory","required","hard_block"]).default("required"),
  status: z.enum(["draft","review","approved","archived"]).default("draft"),
});
const publish = z.object({ name: z.string().min(2).max(200), description: z.string().max(2000).optional(), policyIds: z.array(z.string()).min(1) });
const check = z.object({ source: z.string(), promptOrAction: z.string().min(1), context: z.record(z.string(), z.unknown()).optional() });

export function registerConstitutionRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => { try { res.json({ ok: true, data: await ConstitutionService.dashboard() }); } catch (e) { next(e); } });
  router.get("/policies", async (_req, res, next) => { try { res.json({ ok: true, data: await ConstitutionService.listPolicies() }); } catch (e) { next(e); } });
  router.get("/active", async (_req, res, next) => { try { res.json({ ok: true, data: await ConstitutionService.getActive() }); } catch (e) { next(e); } });
  router.get("/violations", async (_req, res, next) => { try { res.json({ ok: true, data: await ConstitutionService.getViolations() }); } catch (e) { next(e); } });
  router.post("/policies", validate({ body: upsert }), async (req, res, next) => { try { res.json({ ok: true, data: await ConstitutionService.upsertPolicy({ ...req.body, createdBy: req.user!.id }) }); } catch (e) { next(e); } });
  router.post("/publish", validate({ body: publish }), async (req, res, next) => { try { res.json({ ok: true, data: await ConstitutionService.publishConstitution({ ...req.body, createdBy: req.user!.id }) }); } catch (e) { next(e); } });
  router.post("/check", validate({ body: check }), async (req, res, next) => { try { res.json({ ok: true, data: await ConstitutionService.checkRequest({ ...req.body, source: req.body.source || req.user!.id }) }); } catch (e) { next(e); } });
}
