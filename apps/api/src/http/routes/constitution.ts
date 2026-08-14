/**
 * Session 48 — Constitution Studio routes.
 *
 * S163 — every handler here previously called the service with no arguments,
 * so all seven fell through to the service's `oid = "org-windels"` default.
 * The service was correctly org-scoped throughout; the routes simply never
 * passed the caller's organization, so every tenant read, edited and published
 * org-windels' constitution. The caller's organization is now required.
 */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import ConstitutionService from "../../constitution/constitution.service.js";
import { CONSTITUTION_DOMAINS, CONSTITUTION_POLICY_STATUSES, constitutionRuleSchema } from "@windels/shared";
import { z } from "zod";

const upsert = z.object({
  id: z.string().optional(),
  domain: z.enum(CONSTITUTION_DOMAINS),
  title: z.string().min(2).max(200),
  statement: z.string().min(10).max(4000),
  enforcementLevel: z.enum(["advisory", "required", "hard_block"]).default("required"),
  status: z.enum(CONSTITUTION_POLICY_STATUSES).default("draft"),
  rule: constitutionRuleSchema.optional(),
});
const publish = z.object({ name: z.string().min(2).max(200), description: z.string().max(2000).optional(), policyIds: z.array(z.string()).min(1) });
const check = z.object({ source: z.string(), promptOrAction: z.string().min(1), context: z.record(z.string(), z.unknown()).optional() });

/**
 * S163 — a constitution is per-organization governance; there is no sensible
 * fallback when the caller has no organization context. Refuse rather than
 * silently operating on someone else's policies.
 */
function orgOf(req: any, res: any): string | null {
  const oid = req.user?.organizationId;
  if (!oid) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return oid;
}

export function registerConstitutionRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await ConstitutionService.dashboard(oid) });
    } catch (e) { next(e); }
  });

  router.get("/policies", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await ConstitutionService.listPolicies(oid) });
    } catch (e) { next(e); }
  });

  router.get("/active", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await ConstitutionService.getActive(oid) });
    } catch (e) { next(e); }
  });

  router.get("/violations", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await ConstitutionService.getViolations(oid) });
    } catch (e) { next(e); }
  });

  router.post("/policies", validate({ body: upsert }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await ConstitutionService.upsertPolicy({ ...req.body, organizationId: oid, createdBy: req.user!.id }) });
    } catch (e) { next(e); }
  });

  router.post("/publish", validate({ body: publish }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await ConstitutionService.publishConstitution({ ...req.body, organizationId: oid, createdBy: req.user!.id }) });
    } catch (e) { next(e); }
  });

  router.post("/check", validate({ body: check }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await ConstitutionService.checkRequest({ ...req.body, organizationId: oid, source: req.body.source || req.user!.id }) });
    } catch (e) { next(e); }
  });
}
