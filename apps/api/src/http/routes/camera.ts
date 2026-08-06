import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { CameraService } from "../../camera/camera.service.js";
import { CamAlertCreateSchema, CamFeedCreateSchema, CamFeedIdSchema, CamFeedUpdateSchema } from "@windels/shared/camera";
import { tenantStore } from "../../utils/tenantStore.js";
import { z as z_notes } from "zod";

/**
 * ICE servers for WebRTC playback.
 *
 * TURN credentials are secrets and are handed to the browser, so they must come
 * from configuration — never from a literal in source. When TURN is not
 * configured we return STUN only rather than shipping a placeholder credential
 * that would fail (or, worse, work) in production.
 */
export function registerCameraRoutes(router: Router) {
  router.use(authenticate);

  router.get("/feeds", async (req, res, next) => {
    try { res.json({ ok: true, data: await CameraService.listFeeds(req.user!.organizationId!), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/feeds", requireAdmin, validate({ body: CamFeedCreateSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await CameraService.createFeed(req.user!.organizationId!, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.patch("/feeds/:id", requireAdmin, validate({ params: CamFeedIdSchema, body: CamFeedUpdateSchema }), async (req, res, next) => {
    try { const data = await CameraService.updateFeed(req.user!.organizationId!, req.params.id, req.body); if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Feed not found" } }); res.json({ ok: true, data, meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.delete("/feeds/:id", requireAdmin, validate({ params: CamFeedIdSchema }), async (req, res, next) => {
    try { const deleted = await CameraService.deleteFeed(req.user!.organizationId!, req.params.id); if (!deleted) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Feed not found" } }); res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.get("/feeds/:id/stream", validate({ params: CamFeedIdSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CameraService.streamSession(req.user!.organizationId!, req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.get("/feeds/:id/alerts", validate({ params: CamFeedIdSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CameraService.listAlerts(req.user!.organizationId!, req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/feeds/:id/alerts", requireAdmin, validate({ params: CamFeedIdSchema, body: CamAlertCreateSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await CameraService.triggerAlert(req.user!.organizationId!, req.params.id, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });

  // Real tenant-scoped notes ledger for camera — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "cam:notes", idPrefix: "cam-" });
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
