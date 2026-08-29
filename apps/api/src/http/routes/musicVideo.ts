// WINDELS AI OS — Music Video Generator routes (integrated into Media Studio).
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { CreateMusicVideoSchema, MvJobIdSchema } from "@windels/shared/musicVideo";
import { MusicVideoService, MV_CACHE_DIR, MV_PUBLIC_PREFIX, MV_AGENT_KEYS } from "../../musicVideo/musicVideo.service.js";

const jobParam = MvJobIdSchema;
const uploadParam = z.object({ kind: z.enum(["image", "audio"]) });

export function registerMusicVideoRoutes(router: Router) {
  router.use(authenticate);
  const oid = (req: any) => req.user!.organizationId!;
  const uid = (req: any) => req.user!.id!;

  router.get("/music-video/jobs", async (req, res, next) => {
    try { res.json({ ok: true, data: await MusicVideoService.list(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/music-video/jobs", validate({ body: CreateMusicVideoSchema }), async (req, res, next) => {
    try {
      const job = await MusicVideoService.create(oid(req), uid(req), req.body);
      // Run inline for a snappy first-result (analysis + storyboard are fast).
      const done = await MusicVideoService.runOne(oid(req), job.id);
      res.status(201).json({ ok: true, data: done, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/music-video/jobs/:id", validate({ params: jobParam }), async (req, res, next) => {
    try {
      const rec = await MusicVideoService.get(oid(req), req.params.id);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Job not found" } });
      res.json({ ok: true, data: rec, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/music-video/jobs/:id/run", validate({ params: jobParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MusicVideoService.runOne(oid(req), req.params.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/music-video/jobs/:id/cancel", validate({ params: jobParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MusicVideoService.cancel(oid(req), req.params.id, uid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.delete("/music-video/jobs/:id", validate({ params: jobParam }), async (req, res, next) => {
    try { await MusicVideoService.remove(oid(req), req.params.id); res.json({ ok: true, meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Upload an image or audio file (raw body bytes, or multipart "file" field).
  router.post("/music-video/upload/:kind", validate({ params: uploadParam }), (req, res, next) => {
    const kind = req.params.kind as "image" | "audio";
    const buf = (req as any).file?.buffer ?? (Buffer.isBuffer(req.body) ? req.body : (req.body as any)?.file ? Buffer.from((req.body as any).file) : undefined);
    const originalname = (req as any).file?.originalname ?? (req.body as any)?.filename ?? `${kind}-upload`;
    const mimetype = (req as any).file?.mimetype ?? (req.body as any)?.mimetype ?? "application/octet-stream";
    if (!buf) return res.status(400).json({ ok: false, error: { code: "EMPTY_FILE", message: "No file bytes received" } });
    MusicVideoService.saveUpload(oid(req), kind, buf, originalname, mimetype)
      .then((data) => res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } }))
      .catch(next);
  });

  // AI music-video agents (chat-routable workforce)
  router.get("/music-video/agents", async (req, res, next) => {
    try { res.json({ ok: true, data: await MusicVideoService.listAgents(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  const mvAgentKey = z.object({ key: z.enum(MV_AGENT_KEYS as unknown as [string, ...string[]]) });
  router.post("/music-video/agents/:key/heartbeat", validate({ params: mvAgentKey }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MusicVideoService.heartbeatAgent(oid(req), (req.params as any).key), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/music-video/agents/:key/run", validate({ params: mvAgentKey, body: z.record(z.any()).optional() }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MusicVideoService.runAgent(oid(req), (req.params as any).key, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Serve rendered video (any export format) + thumbnail (path-safe).
  router.get("/music-video/:file", async (req, res, next) => {
    try {
      const safe = path.basename(req.params.file);
      const full = path.join(MV_CACHE_DIR, safe);
      if (!full.startsWith(MV_CACHE_DIR)) return res.status(400).end();
      const st = await fs.stat(full).catch(() => null);
      if (!st || !st.isFile()) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "File not found" } });
      const isThumb = safe.endsWith(".jpg");
      res.setHeader("Content-Type", isThumb ? "image/jpeg" : "video/mp4");
      res.setHeader("Content-Length", String(st.size));
      res.sendFile(full);
    } catch (e) { next(e); }
  });
}
