/**
 * Session 69 / 110 — Cognitive Evolution & World Model routes.
 *
 * `/dashboard/rollup` keeps its Session 69 shape (platform observability
 * counts + the observation list) and additionally carries the Session 110
 * world-model rollup. Everything else is the completed evidence register:
 * entities, observations and human-resolved hypotheses.
 *
 * All reads are organization-scoped and fail closed; every mutation requires
 * an administrator.
 */
import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  CogEntityCreateSchema,
  CogEntityIdSchema,
  CogEntityQuerySchema,
  CogEntityUpdateSchema,
  CogHypothesisCreateSchema,
  CogHypothesisIdSchema,
  CogHypothesisQuerySchema,
  CogHypothesisResolveSchema,
  CogObservationCreateSchema,
  CogObservationIdSchema,
  CogObservationQuerySchema,
  CogInnovationCreateSchema,
  CogInnovationStatusSchema,
  CogInnovationIdParamSchema,
  CogSelfEvolutionComponentSchema,
  CogSelfEvolutionAutoFixSchema,
  CogFederationPartnerCreateSchema,
  CogFederationPartnerUpdateSchema,
  CogFederationPartnerIdParamSchema,
} from "@windels/shared/cognitive";
import { CognitiveService } from "../../cognitive/cognitive.service.js";
import { CognitiveWorldModelService } from "../../cognitive/worldModel.service.js";
import { InnovationPipelineService } from "../../cognitive/innovationPipeline.service.js";
import { SelfEvolutionService } from "../../cognitive/selfEvolution.service.js";
import { FederationService } from "../../cognitive/federation.service.js";

import { AppError } from "../../utils/result.js";
const orgOf = (req: any): string => {
  const org = (req.user as any)?.organizationId ?? null;
  if (!org) throw AppError.forbidden("The cognitive register is organization-scoped and this session carries no organization.");
  return org;
};
const userOf = (req: any): string => req.user!.id;
const notFound = (res: any, message: string, requestId?: string) =>
  res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message }, meta: { requestId } });

export function registerCognitiveRoutes(router: Router) {
  router.use(authenticate);

  // ── Rollups ──────────────────────────────────────────────────────────────

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const [rollup, observations, worldModel] = await Promise.all([
        CognitiveService.dashboard(oid),
        CognitiveWorldModelService.listObservations(oid, { limit: 50 }),
        CognitiveWorldModelService.worldModel(oid),
      ]);
      res.json({ ok: true, data: { ...rollup, observations, worldModel }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/world-model", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await CognitiveWorldModelService.worldModel(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Entities ─────────────────────────────────────────────────────────────

  router.get("/entities", validate({ query: CogEntityQuerySchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await CognitiveWorldModelService.listEntities(orgOf(req), req.query as any), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/entities", requireAdmin, validate({ body: CogEntityCreateSchema }), async (req, res, next) => {
    try {
      const data = await CognitiveWorldModelService.createEntity(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/entities/:id", validate({ params: CogEntityIdSchema }), async (req, res, next) => {
    try {
      const data = await CognitiveWorldModelService.getEntity(orgOf(req), req.params.id);
      if (!data) return notFound(res, "Entity not found", req.requestId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/entities/:id", requireAdmin, validate({ params: CogEntityIdSchema, body: CogEntityUpdateSchema }), async (req, res, next) => {
    try {
      const data = await CognitiveWorldModelService.updateEntity(orgOf(req), req.params.id, req.body);
      if (!data) return notFound(res, "Entity not found", req.requestId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/entities/:id", requireAdmin, validate({ params: CogEntityIdSchema }), async (req, res, next) => {
    try {
      const deleted = await CognitiveWorldModelService.deleteEntity(orgOf(req), req.params.id);
      if (!deleted) return notFound(res, "Entity not found", req.requestId);
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Observations ─────────────────────────────────────────────────────────

  router.get("/observations", validate({ query: CogObservationQuerySchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await CognitiveWorldModelService.listObservations(orgOf(req), req.query as any), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/observations", requireAdmin, validate({ body: CogObservationCreateSchema }), async (req, res, next) => {
    try {
      const data = await CognitiveWorldModelService.recordObservation(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/observations/:id", validate({ params: CogObservationIdSchema }), async (req, res, next) => {
    try {
      const data = await CognitiveWorldModelService.getObservation(orgOf(req), req.params.id);
      if (!data) return notFound(res, "Observation not found", req.requestId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/observations/:id", requireAdmin, validate({ params: CogObservationIdSchema }), async (req, res, next) => {
    try {
      const deleted = await CognitiveWorldModelService.deleteObservation(orgOf(req), req.params.id);
      if (!deleted) return notFound(res, "Observation not found", req.requestId);
      // Session 69 clients expect a bare 204 here.
      res.status(204).end();
    } catch (e) { next(e); }
  });

  // ── Hypotheses ───────────────────────────────────────────────────────────

  router.get("/hypotheses", validate({ query: CogHypothesisQuerySchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await CognitiveWorldModelService.listHypotheses(orgOf(req), req.query as any), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/hypotheses", requireAdmin, validate({ body: CogHypothesisCreateSchema }), async (req, res, next) => {
    try {
      const data = await CognitiveWorldModelService.createHypothesis(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/hypotheses/:id", validate({ params: CogHypothesisIdSchema }), async (req, res, next) => {
    try {
      const data = await CognitiveWorldModelService.getHypothesis(orgOf(req), req.params.id);
      if (!data) return notFound(res, "Hypothesis not found", req.requestId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/hypotheses/:id/resolve", requireAdmin, validate({ params: CogHypothesisIdSchema, body: CogHypothesisResolveSchema }), async (req, res, next) => {
    try {
      const data = await CognitiveWorldModelService.resolveHypothesis(orgOf(req), req.params.id, userOf(req), req.body);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/hypotheses/:id", requireAdmin, validate({ params: CogHypothesisIdSchema }), async (req, res, next) => {
    try {
      const deleted = await CognitiveWorldModelService.deleteHypothesis(orgOf(req), req.params.id);
      if (!deleted) return notFound(res, "Hypothesis not found", req.requestId);
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Innovation pipeline (org-scoped) ───────────────────────────────────────
  router.get("/innovations", async (req, res, next) => { try { res.json({ ok: true, data: await InnovationPipelineService.list(orgOf(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/innovations", requireAdmin, validate({ body: CogInnovationCreateSchema }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await InnovationPipelineService.create(orgOf(req), req.body, userOf(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/innovations/:innovationId/status", requireAdmin, validate({ params: CogInnovationIdParamSchema, body: CogInnovationStatusSchema }), async (req, res, next) => { try { res.json({ ok: true, data: await InnovationPipelineService.setStatus(orgOf(req), req.params.innovationId, req.body.status), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.delete("/innovations/:innovationId", requireAdmin, validate({ params: CogInnovationIdParamSchema }), async (req, res, next) => { try { const ok = await InnovationPipelineService.delete(orgOf(req), req.params.innovationId); if (!ok) return notFound(res, "Innovation proposal not found", req.requestId); res.json({ ok: true, data: { deleted: true }, meta: { requestId: req.requestId } }); } catch (e) { next(e); } });

  // ── Self-evolution register (org-scoped) ───────────────────────────────────
  router.get("/self-evolution", async (req, res, next) => { try { res.json({ ok: true, data: await SelfEvolutionService.listComponents(orgOf(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.put("/self-evolution/components", requireAdmin, validate({ body: CogSelfEvolutionComponentSchema }), async (req, res, next) => { try { res.json({ ok: true, data: await SelfEvolutionService.upsertComponent(orgOf(req), req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/self-evolution/auto-fix", requireAdmin, validate({ body: CogSelfEvolutionAutoFixSchema }), async (req, res, next) => { try { res.json({ ok: true, data: await SelfEvolutionService.recordAutoFix(orgOf(req), req.body.component), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });

  // ── Federation register (org-scoped) ───────────────────────────────────────
  router.get("/federation", async (req, res, next) => { try { res.json({ ok: true, data: await FederationService.list(orgOf(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/federation", requireAdmin, validate({ body: CogFederationPartnerCreateSchema }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await FederationService.create(orgOf(req), req.body, userOf(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.patch("/federation/:partnerId", requireAdmin, validate({ params: CogFederationPartnerIdParamSchema, body: CogFederationPartnerUpdateSchema }), async (req, res, next) => { try { res.json({ ok: true, data: await FederationService.update(orgOf(req), req.params.partnerId, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.delete("/federation/:partnerId", requireAdmin, validate({ params: CogFederationPartnerIdParamSchema }), async (req, res, next) => { try { const ok = await FederationService.delete(orgOf(req), req.params.partnerId); if (!ok) return notFound(res, "Federation partner not found", req.requestId); res.json({ ok: true, data: { deleted: true }, meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
}
