import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { SoftwareFactoryService } from "../../softwareFactory/softwareFactory.service.js";
import { SfStudioPlanUpsertSchema } from "@windels/shared/softwareFactory";

const orgOf = (req: any) => req.user!.organizationId!;
const userOf = (req: any): string | null => req.user?.id ?? null;

const IdParam = z.object({ id: z.string().min(1).max(64) });
const ProjectParam = z.object({ projectId: z.string().min(1).max(64) });
const RunParam = z.object({ runId: z.string().min(1).max(64) });

export function registerSoftwareFactoryRoutes(router: Router) {
  router.use(authenticate);

  // ── Studios (static catalog) ──────────────────────────────────────
  router.get("/studios", async (_req, res, next) => {
    try {
      res.json({ ok: true, data: SoftwareFactoryService.studios(), meta: { requestId: _req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Studio plans ──────────────────────────────────────────────────
  router.get("/studios/plans", async (req, res, next) => {
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      const studio = typeof req.query.studio === "string" ? (req.query.studio as any) : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const data = await SoftwareFactoryService.listPlans(orgOf(req), { projectId, studio, status });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/studios/plans", validate({ body: SfStudioPlanUpsertSchema }), async (req, res, next) => {
    try {
      const data = await SoftwareFactoryService.createPlan(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/studios/plans/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await SoftwareFactoryService.getPlan(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Studio plan not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/studios/plans/:id", validate({ params: IdParam, body: SfStudioPlanUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await SoftwareFactoryService.updatePlan(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Studio plan not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/studios/plans/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await SoftwareFactoryService.deletePlan(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Studio plan not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Project studio coverage ───────────────────────────────────────
  router.get("/projects/:projectId/studios", validate({ params: ProjectParam }), async (req, res, next) => {
    try {
      const data = await SoftwareFactoryService.studioCoverage(orgOf(req), req.params.projectId);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Project not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Build farm compile targets (derived per run) ──────────────────
  router.get("/builds/:runId/targets", validate({ params: RunParam }), async (req, res, next) => {
    try {
      const data = await SoftwareFactoryService.compileTargets(orgOf(req), req.params.runId);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Build not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
