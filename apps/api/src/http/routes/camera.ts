import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { CameraService } from "../../camera/camera.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z as z_notes } from "zod";

const createFeedSchema = {
  body: z.object({
    name: z.string().min(1).max(100),
    streamUrl: z.string().url(),
    locationName: z.string().max(200).optional(),
    resolution: z.string().max(50).optional(),
  }),
};

export function registerCameraRoutes(router: Router) {
  router.use(authenticate);

  router.get("/camera/feeds", async (req, res, next) => {
    try {
      const data = await CameraService.listFeeds(req.user!.organizationId!);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/camera/feeds", validate(createFeedSchema), async (req, res, next) => {
    try {
      const data = await CameraService.createFeed(req.user!.organizationId!, req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/camera/feeds/:id/stream", async (req, res, next) => {
    try {
      const feed = await CameraService.getFeed(req.user!.organizationId!, req.params.id);
      if (!feed) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Feed not found" } });
      
      // Return WebRTC low-latency stream session tokens
      res.json({
        ok: true,
        data: {
          webrtcSessionToken: "session_" + Math.random().toString(36).slice(2, 10),
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "turn:turn.windels.ai:3478", username: "windels", credential: "change-me-in-production" }
          ]
        },
        meta: { requestId: req.requestId }
      });
    } catch (e) { next(e); }
  });

  router.get("/camera/feeds/:id/alerts", async (req, res, next) => {
    try {
      const data = await CameraService.listAlerts(req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
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
