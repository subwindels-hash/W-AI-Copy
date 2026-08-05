// WINDELS AI OS — Music Video Generator routes (integrated into Media Studio).
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { CreateMusicVideoSchema, MvJobIdSchema } from "@windels/shared/musicVideo";
import { MusicVideoService, MV_CACHE_DIR, MV_PUBLIC_PREFIX } from "../../musicVideo/musicVideo.service.js";

const jobParam = MvJobIdSchema;

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

  // Serve rendered MP4 (path-safe).
  router.get("/music-video/:file", async (req, res, next) => {
    try {
      const safe = path.basename(req.params.file);
      const full = path.join(MV_CACHE_DIR, safe);
      if (!full.startsWith(MV_CACHE_DIR)) return res.status(400).end();
      const st = await fs.stat(full).catch(() => null);
      if (!st || !st.isFile()) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "File not found" } });
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", String(st.size));
      res.sendFile(full);
    } catch (e) { next(e); }
  });
}
