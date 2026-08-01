import { Router } from "express";
import { randomBytes } from "node:crypto";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { CameraService } from "../../camera/camera.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

/**
 * ICE servers for WebRTC playback.
 *
 * TURN credentials are secrets and are handed to the browser, so they must come
 * from configuration — never from a literal in source. When TURN is not
 * configured we return STUN only rather than shipping a placeholder credential
 * that would fail (or, worse, work) in production.
 */
function iceServers() {
  const servers: Array<{ urls: string; username?: string; credential?: string }> = [
    { urls: process.env.WEBRTC_STUN_URL || "stun:stun.l.google.com:19302" },
  ];
  const turnUrl = process.env.WEBRTC_TURN_URL;
  const turnUser = process.env.WEBRTC_TURN_USERNAME;
  const turnCredential = process.env.WEBRTC_TURN_CREDENTIAL;
  if (turnUrl && turnUser && turnCredential) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCredential });
  }
  return servers;
}

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
          // Session tokens gate access to a live camera feed, so they are drawn
          // from the CSPRNG. Math.random() produced a guessable 8-char token.
          webrtcSessionToken: "session_" + randomBytes(24).toString("base64url"),
          iceServers: iceServers(),
          turnConfigured: Boolean(process.env.WEBRTC_TURN_URL),
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
