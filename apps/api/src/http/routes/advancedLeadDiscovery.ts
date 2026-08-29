/** Additive advanced routes for the existing `/lead-discovery` module. */
import { Router } from "express";
import { authenticate, requireAdmin, requireSuperAdmin } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import {
  AdvancedLeadIdParamSchema,
  AdvancedLeadListQuerySchema,
  LeadAdvancedSearchSchema,
  LeadAgentInterpretSchema,
  LeadAgentRecommendationRequestSchema,
  LeadDiscoveryPolicySchema,
  LeadJobIdParamSchema,
  LeadOutreachHandoffSchema,
  LeadTagUpdateSchema,
  LeadVerificationRequestSchema,
} from "@windels/shared/leadDiscoveryAdvanced";
import { AdvancedLeadDiscoveryService } from "../../leadDiscovery/advancedLeadDiscovery.service.js";
import { AppError } from "../../utils/result.js";

const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });
const orgOf = (req: any): string => {
  const org = req.user?.organizationId;
  if (!org) throw AppError.forbidden("Lead discovery is organization-scoped and this session carries no organization.");
  return org;
};
const actorOf = (req: any): string | null => req.user?.id ?? null;

export function registerAdvancedLeadDiscoveryRoutes(router: Router) {
  // Per-handler authentication leaves the legacy Session 85 router untouched.
  router.post("/advanced/search", authenticate, rateLimit("leadDiscovery", (req) => req.user?.id ?? req.ip ?? "unknown"), validate({ body: LeadAdvancedSearchSchema }), async (req, res, next) => {
    try {
      const job = await AdvancedLeadDiscoveryService.createSearch(orgOf(req), actorOf(req), req.body);
      res.status(202).json({ ok: true, data: { job, pollAfterMs: 750 }, meta: meta(req) });
    } catch (error) { next(error); }
  });

  router.get("/advanced/jobs", authenticate, async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit ?? 25) || 25, 1), 100);
      res.json({ ok: true, data: await AdvancedLeadDiscoveryService.jobHistory(orgOf(req), limit), meta: meta(req) });
    } catch (error) { next(error); }
  });
  router.get("/advanced/jobs/:id", authenticate, validate({ params: LeadJobIdParamSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvancedLeadDiscoveryService.job(orgOf(req), req.params.id), meta: meta(req) }); }
    catch (error) { next(error); }
  });
  router.get("/advanced/jobs/:id/results", authenticate, validate({ params: LeadJobIdParamSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvancedLeadDiscoveryService.resultLeads(orgOf(req), req.params.id), meta: meta(req) }); }
    catch (error) { next(error); }
  });

  router.get("/advanced/leads", authenticate, validate({ query: AdvancedLeadListQuerySchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvancedLeadDiscoveryService.list(orgOf(req), req.query), meta: meta(req) }); }
    catch (error) { next(error); }
  });
  router.get("/advanced/leads/:id", authenticate, validate({ params: AdvancedLeadIdParamSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvancedLeadDiscoveryService.get(orgOf(req), req.params.id), meta: meta(req) }); }
    catch (error) { next(error); }
  });
  router.patch("/advanced/leads/:id/tags", authenticate, validate({ params: AdvancedLeadIdParamSchema, body: LeadTagUpdateSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvancedLeadDiscoveryService.setTags(orgOf(req), req.params.id, req.body, actorOf(req)), meta: meta(req) }); }
    catch (error) { next(error); }
  });
  router.post("/advanced/leads/:id/verify", authenticate, rateLimit("leadDiscovery", (req) => req.user?.id ?? req.ip ?? "unknown"), validate({ params: AdvancedLeadIdParamSchema, body: LeadVerificationRequestSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvancedLeadDiscoveryService.verifyEmail(orgOf(req), req.params.id, actorOf(req)), meta: meta(req) }); }
    catch (error) { next(error); }
  });
  router.delete("/advanced/leads/:id", authenticate, requireAdmin, validate({ params: AdvancedLeadIdParamSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvancedLeadDiscoveryService.remove(orgOf(req), req.params.id, actorOf(req)), meta: meta(req) }); }
    catch (error) { next(error); }
  });

  router.post("/advanced/outreach/handoff", authenticate, validate({ body: LeadOutreachHandoffSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvancedLeadDiscoveryService.prepareOutreach(orgOf(req), req.body.leadIds, actorOf(req)), meta: meta(req) }); }
    catch (error) { next(error); }
  });
  router.post("/advanced/agent/interpret", authenticate, rateLimit("leadDiscovery", (req) => req.user?.id ?? req.ip ?? "unknown"), validate({ body: LeadAgentInterpretSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvancedLeadDiscoveryService.interpret(orgOf(req), req.body.request, actorOf(req)), meta: meta(req) }); }
    catch (error) { next(error); }
  });
  router.post("/advanced/agent/recommendations", authenticate, rateLimit("leadDiscovery", (req) => req.user?.id ?? req.ip ?? "unknown"), validate({ body: LeadAgentRecommendationRequestSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvancedLeadDiscoveryService.recommendations(orgOf(req), (req.body as { leadIds: string[] }).leadIds, actorOf(req)), meta: meta(req) }); }
    catch (error) { next(error); }
  });

  // Advanced export obeys the compliance policy and includes the structured
  // normalized result shape. Legacy export remains intact for compatibility.
  router.post("/advanced/export", authenticate, validate({ body: LeadOutreachHandoffSchema }), async (req, res, next) => {
    try {
      const policy = await AdvancedLeadDiscoveryService.policy();
      if (!policy.exportEnabled) throw AppError.forbidden("Lead export is disabled by Super Admin compliance policy.");
      const org = orgOf(req);
      const leadIds = (req.body as { leadIds: string[] }).leadIds;
      const rows = [];
      for (const id of [...new Set(leadIds)]) rows.push(await AdvancedLeadDiscoveryService.get(org, id));
      await AdvancedLeadDiscoveryService.recordExport(org, actorOf(req), rows.length);
      res.json({ ok: true, data: { exportedAt: new Date().toISOString(), leads: rows, note: "Exported provider-backed fields are a snapshot. Verification and source traceability are included; no consent to contact is implied." }, meta: meta(req) });
    } catch (error) { next(error); }
  });

  router.get("/advanced/admin/status", authenticate, requireSuperAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvancedLeadDiscoveryService.adminStatus(), meta: meta(req) }); }
    catch (error) { next(error); }
  });
  router.patch("/advanced/admin/policy", authenticate, requireSuperAdmin, validate({ body: LeadDiscoveryPolicySchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvancedLeadDiscoveryService.updatePolicy(req.body, req.user!.id), meta: meta(req) }); }
    catch (error) { next(error); }
  });
}
