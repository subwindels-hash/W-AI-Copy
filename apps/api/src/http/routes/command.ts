/**
 * Session 70 / 111 — Global Command Center routes.
 *
 * `/dashboard/rollup` keeps its Session 70 shape (executive counters plus the
 * `directives` array) and additionally carries the Session 111 `operations`
 * rollup. Everything else is the completed operations register: incidents with
 * a human timeline, operator-reported regions, executive briefings, strategic
 * initiatives and the original directives.
 *
 * All reads are organization-scoped and fail closed; every mutation requires
 * an administrator and is attributed to the authenticated user.
 */
import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  CmdBriefingCreateSchema,
  CmdBriefingQuerySchema,
  CmdDirectiveCreateSchema,
  CmdDirectiveQuerySchema,
  CmdDirectiveStatusSchema,
  CmdIdSchema,
  CmdIncidentAcknowledgeSchema,
  CmdIncidentCreateSchema,
  CmdIncidentNoteSchema,
  CmdIncidentQuerySchema,
  CmdIncidentResolveSchema,
  CmdIncidentUpdateSchema,
  CmdInitiativeCreateSchema,
  CmdInitiativeQuerySchema,
  CmdInitiativeUpdateSchema,
  CmdRegionCreateSchema,
  CmdRegionQuerySchema,
  CmdRegionStatusReportSchema,
  CmdRegionUpdateSchema,
} from "@windels/shared/command";
import { CommandService } from "../../command/command.service.js";
import { CommandOperationsService } from "../../command/operations.service.js";
import { AppError } from "../../utils/result.js";

const orgOf = (req: any): string => {
  const org = (req.user as any)?.organizationId ?? null;
  if (!org) throw AppError.forbidden("The command register is organization-scoped and this session carries no organization.");
  return org;
};
const userOf = (req: any): string => {
  const uid = (req.user as any)?.id ?? null;
  if (!uid) throw AppError.forbidden("The command register is user-scoped and this session carries no user.");
  return uid;
};
const notFound = (res: any, message: string, requestId?: string) =>
  res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message }, meta: { requestId } });

export function registerCommandRoutes(router: Router) {
  router.use(authenticate);

  // ── Rollups ──────────────────────────────────────────────────────────────

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const [rollup, directives, operations] = await Promise.all([
        CommandService.dashboard(oid),
        CommandOperationsService.listDirectives(oid, { limit: 50 }),
        CommandOperationsService.operations(oid),
      ]);
      res.json({ ok: true, data: { ...rollup, directives, operations }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/operations", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await CommandOperationsService.operations(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Incidents ────────────────────────────────────────────────────────────

  router.get("/incidents", validate({ query: CmdIncidentQuerySchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await CommandOperationsService.listIncidents(orgOf(req), req.query as any), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/incidents", requireAdmin, validate({ body: CmdIncidentCreateSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.declareIncident(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/incidents/:id", validate({ params: CmdIdSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.getIncident(orgOf(req), req.params.id);
      if (!data) return notFound(res, "Incident not found", req.requestId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/incidents/:id", requireAdmin, validate({ params: CmdIdSchema, body: CmdIncidentUpdateSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.updateIncident(orgOf(req), req.params.id, req.body);
      if (!data) return notFound(res, "Incident not found", req.requestId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/incidents/:id", requireAdmin, validate({ params: CmdIdSchema }), async (req, res, next) => {
    try {
      const deleted = await CommandOperationsService.deleteIncident(orgOf(req), req.params.id);
      if (!deleted) return notFound(res, "Incident not found", req.requestId);
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/incidents/:id/updates", requireAdmin, validate({ params: CmdIdSchema, body: CmdIncidentNoteSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.addIncidentUpdate(orgOf(req), req.params.id, req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/incidents/:id/acknowledge", requireAdmin, validate({ params: CmdIdSchema, body: CmdIncidentAcknowledgeSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.acknowledgeIncident(orgOf(req), req.params.id, userOf(req), req.body);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/incidents/:id/resolve", requireAdmin, validate({ params: CmdIdSchema, body: CmdIncidentResolveSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.resolveIncident(orgOf(req), req.params.id, userOf(req), req.body);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Regions ──────────────────────────────────────────────────────────────

  router.get("/regions", validate({ query: CmdRegionQuerySchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await CommandOperationsService.listRegions(orgOf(req), req.query as any), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/regions", requireAdmin, validate({ body: CmdRegionCreateSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.createRegion(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/regions/:id", validate({ params: CmdIdSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.getRegion(orgOf(req), req.params.id);
      if (!data) return notFound(res, "Region not found", req.requestId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/regions/:id", requireAdmin, validate({ params: CmdIdSchema, body: CmdRegionUpdateSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.updateRegion(orgOf(req), req.params.id, req.body);
      if (!data) return notFound(res, "Region not found", req.requestId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/regions/:id", requireAdmin, validate({ params: CmdIdSchema }), async (req, res, next) => {
    try {
      const deleted = await CommandOperationsService.deleteRegion(orgOf(req), req.params.id);
      if (!deleted) return notFound(res, "Region not found", req.requestId);
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/regions/:id/status", requireAdmin, validate({ params: CmdIdSchema, body: CmdRegionStatusReportSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.reportRegionStatus(orgOf(req), req.params.id, req.body, userOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Executive briefings ──────────────────────────────────────────────────

  router.get("/briefings", validate({ query: CmdBriefingQuerySchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await CommandOperationsService.listBriefings(orgOf(req), req.query as any), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/briefings", requireAdmin, validate({ body: CmdBriefingCreateSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.createBriefing(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/briefings/:id", validate({ params: CmdIdSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.getBriefing(orgOf(req), req.params.id);
      if (!data) return notFound(res, "Briefing not found", req.requestId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/briefings/:id", requireAdmin, validate({ params: CmdIdSchema }), async (req, res, next) => {
    try {
      const deleted = await CommandOperationsService.deleteBriefing(orgOf(req), req.params.id);
      if (!deleted) return notFound(res, "Briefing not found", req.requestId);
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Strategic initiatives ────────────────────────────────────────────────

  router.get("/initiatives", validate({ query: CmdInitiativeQuerySchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await CommandOperationsService.listInitiatives(orgOf(req), req.query as any), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/initiatives", requireAdmin, validate({ body: CmdInitiativeCreateSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.createInitiative(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/initiatives/:id", validate({ params: CmdIdSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.getInitiative(orgOf(req), req.params.id);
      if (!data) return notFound(res, "Initiative not found", req.requestId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/initiatives/:id", requireAdmin, validate({ params: CmdIdSchema, body: CmdInitiativeUpdateSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.updateInitiative(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return notFound(res, "Initiative not found", req.requestId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/initiatives/:id", requireAdmin, validate({ params: CmdIdSchema }), async (req, res, next) => {
    try {
      const deleted = await CommandOperationsService.deleteInitiative(orgOf(req), req.params.id);
      if (!deleted) return notFound(res, "Initiative not found", req.requestId);
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Directives (Session 70 surface, kept compatible) ─────────────────────

  router.get("/directives", validate({ query: CmdDirectiveQuerySchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await CommandOperationsService.listDirectives(orgOf(req), req.query as any), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/directives", requireAdmin, validate({ body: CmdDirectiveCreateSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.issueDirective(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/directives/:id", validate({ params: CmdIdSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.getDirective(orgOf(req), req.params.id);
      if (!data) return notFound(res, "Directive not found", req.requestId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/directives/:id/status", requireAdmin, validate({ params: CmdIdSchema, body: CmdDirectiveStatusSchema }), async (req, res, next) => {
    try {
      const data = await CommandOperationsService.setDirectiveStatus(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
