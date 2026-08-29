/** Session 53 — Enterprise Deployment Platform routes */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import DeploymentService from "../../deployment/deployment.service.js";
import { z } from "zod";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

const report = z.object({ version: z.string().min(1).max(64) });

/**
 * S165 — deployment targets are per-organization records, and DELETE against a
 * shared namespace is a cross-tenant destructive operation. Only the notes
 * routes below resolved an org before this session; the six target routes all
 * fell through to the service's "org-windels" default.
 */
function orgOf(req: any, res: any): string | null {
  const oid = req.user?.organizationId;
  if (!oid) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return oid;
}

const create = z.object({
  name: z.string().min(2).max(120),
  environment: z.enum(["windows","linux","macos","docker","kubernetes","aws","azure","gcp","oracle","alibaba","private_cloud","on_prem","air_gapped","edge"]),
  region: z.string().max(32).optional(),
  endpoint: z.string().url().optional(),
  modules: z.array(z.string()).default([]),
});

export function registerDeploymentRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DeploymentService.dashboard(oid) });
    } catch (e) { next(e); }
  });

  router.get("/targets", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DeploymentService.list(oid) });
    } catch (e) { next(e); }
  });

  router.post("/targets", validate({ body: create }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DeploymentService.create({ ...req.body, organizationId: oid }) });
    } catch (e) { next(e); }
  });

  router.post("/targets/:id/validate", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DeploymentService.validate(req.params.id, oid) });
    } catch (e) { next(e); }
  });

  router.get("/targets/:id/validation", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DeploymentService.getLatestValidation(req.params.id, oid) });
    } catch (e) { next(e); }
  });

  // S165 — an environment reports the version it is actually running. Without
  // this, `outdatedTargets` was computed from the version assigned at creation
  // and was therefore always 0.
  router.post("/targets/:id/report", validate({ body: report }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DeploymentService.reportVersion({ targetId: req.params.id, version: req.body.version, organizationId: oid }) });
    } catch (e) { next(e); }
  });

  // S165 — de-registration, not teardown: no infrastructure is modified.
  router.delete("/targets/:id", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DeploymentService.deregister(req.params.id, oid) });
    } catch (e) { next(e); }
  });


  // Real tenant-scoped notes ledger for deployment — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "dep:notes", idPrefix: "dep-" });
  const _NoteSchema = z_notes.object({
    title: z_notes.string().min(2).max(200),
    body: z_notes.string().min(2).max(4000),
    tags: z_notes.array(z_notes.string().max(40)).max(20).default([]),
  });
  const _NoteId = z_notes.object({ id: z_notes.string().min(3).max(64) });

  router.get("/notes", async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const list = await _notes.list(oid, 200);
      res.json({ ok: true, data: list.map((n) => ({ id: n.id, createdAt: n.createdAt, createdBy: n.createdBy, ...n.data })), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/notes", validate({ body: _NoteSchema }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.create(oid, req.body, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/notes/:id", validate({ params: _NoteId, body: _NoteSchema.partial() }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.update(oid, req.params.id, req.body);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.delete("/notes/:id", validate({ params: _NoteId }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const ok = await _notes.delete(oid, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
}
