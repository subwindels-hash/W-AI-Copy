import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AppBuilderService } from "../../appBuilder/appBuilder.service.js";
// Request contracts live in @windels/shared so the API and the web client
// validate against one definition instead of hand-copied ones.
import {
  AbProjectUpsertSchema,
  AbTaskUpsertSchema,
  AbBuildCreateSchema,
  AbDecideSchema,
} from "@windels/shared/appBuilder";

const orgOf = (req: any) => req.user!.organizationId!;
const userOf = (req: any): string | null => req.user?.id ?? null;

const IdParam = z.object({ id: z.string().min(1).max(64) });
const ProjectParam = z.object({ projectId: z.string().min(1).max(64) });

export function registerAppBuilderRoutes(router: Router) {
  router.use(authenticate);

  // ── Dashboard & agent catalog ─────────────────────────────────────
  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await AppBuilderService.rollup(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/agents", async (_req, res, next) => {
    try {
      res.json({ ok: true, data: AppBuilderService.agentCatalog(), meta: { requestId: _req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Projects ──────────────────────────────────────────────────────
  router.get("/projects", async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const targetType = typeof req.query.targetType === "string" ? req.query.targetType : undefined;
      const data = await AppBuilderService.listProjects(orgOf(req), { q, targetType });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/projects", validate({ body: AbProjectUpsertSchema }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.createProject(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/projects/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.getProject(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Project not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/projects/:id", validate({ params: IdParam, body: AbProjectUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.updateProject(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Project not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/projects/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await AppBuilderService.deleteProject(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Project not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Tasks ─────────────────────────────────────────────────────────
  router.get("/projects/:projectId/tasks", validate({ params: ProjectParam }), async (req, res, next) => {
    try {
      const completed = req.query.completed === "true" ? true : req.query.completed === "false" ? false : undefined;
      const data = await AppBuilderService.listTasks(orgOf(req), { projectId: req.params.projectId, completed });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/projects/:projectId/tasks", validate({ params: ProjectParam, body: AbTaskUpsertSchema }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.createTask(orgOf(req), req.params.projectId, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Project not found" } });
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/tasks/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.getTask(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Task not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/tasks/:id", validate({ params: IdParam, body: AbTaskUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.updateTask(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Task not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/tasks/:id/generate", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.generateTaskCode(orgOf(req), req.params.id, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Task not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/tasks/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await AppBuilderService.deleteTask(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Task not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Build runs ────────────────────────────────────────────────────
  router.get("/projects/:projectId/builds", validate({ params: ProjectParam }), async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? (req.query.status as any) : undefined;
      const data = await AppBuilderService.listRuns(orgOf(req), { projectId: req.params.projectId, status });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/projects/:projectId/builds", validate({ params: ProjectParam, body: AbBuildCreateSchema }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.createRun(orgOf(req), req.params.projectId, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Project not found" } });
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/builds/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.getRun(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Build not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/builds/:id/advance", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.advanceRun(orgOf(req), req.params.id, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Build not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/builds/:id/retry", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.retryRun(orgOf(req), req.params.id, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Build not found" } });
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Artifacts ─────────────────────────────────────────────────────
  router.get("/artifacts", async (req, res, next) => {
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      const published = req.query.published === "true" ? true : req.query.published === "false" ? false : undefined;
      const data = await AppBuilderService.listArtifacts(orgOf(req), { projectId, published });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/artifacts/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.getArtifact(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Artifact not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/artifacts/:id/request-release", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.requestRelease(orgOf(req), req.params.id, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Artifact not found" } });
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/artifacts/:id/release", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.releaseArtifact(orgOf(req), req.params.id, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Artifact not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Approvals (Human Decision Inbox) ──────────────────────────────
  router.get("/approvals", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const data = await AppBuilderService.listApprovals(orgOf(req), { status });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/approvals/:id/decide", validate({ params: IdParam, body: AbDecideSchema }), async (req, res, next) => {
    try {
      const data = await AppBuilderService.decideApproval(orgOf(req), req.params.id, req.body);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Approval not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
