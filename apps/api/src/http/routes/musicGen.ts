// WINDELS AI OS — Music Generation routes.
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { GenerateMusicSchema, RenameTrackSchema, FavoriteTrackSchema, TagTrackSchema, TrackIdSchema } from "@windels/shared/musicGen";
import { MusicService } from "../../musicGen/musicGen.service.js";
import { MUSIC_CACHE_DIR, MUSIC_PUBLIC_PREFIX } from "../../musicGen/musicEngine.js";

const trackParam = TrackIdSchema;

export function registerMusicGenRoutes(router: Router) {
  router.use(authenticate);
  const oid = (req: any) => req.user!.organizationId!;
  const uid = (req: any) => req.user!.id!;

  router.get("/music/capabilities", async (_req, res, next) => {
    try { res.json({ ok: true, data: MusicService.capabilities(), meta: { requestId: _req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/music/tracks", async (req, res, next) => {
    try { res.json({ ok: true, data: await MusicService.list(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/music/tracks", validate({ body: GenerateMusicSchema }), async (req, res, next) => {
    try {
      const rec = await MusicService.generate(oid(req), uid(req), req.body);
      // Render immediately for a snappy UX (small tracks are fast).
      const done = await MusicService.renderOne(oid(req), rec.id);
      res.status(201).json({ ok: true, data: done, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/music/tracks/:id", validate({ params: trackParam }), async (req, res, next) => {
    try {
      const rec = await MusicService.get(oid(req), req.params.id);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Track not found" } });
      res.json({ ok: true, data: rec, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/music/tracks/:id/render", validate({ params: trackParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MusicService.renderOne(oid(req), req.params.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Library management
  router.patch("/music/tracks/:id", validate({ params: trackParam, body: RenameTrackSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MusicService.rename(oid(req), req.params.id, req.body.title), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/music/tracks/:id/favorite", validate({ params: trackParam, body: FavoriteTrackSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MusicService.setFavorite(oid(req), req.params.id, req.body.favorite), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/music/tracks/:id/tags", validate({ params: trackParam, body: TagTrackSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MusicService.setTags(oid(req), req.params.id, req.body.tags), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/music/tracks/:id/play", validate({ params: trackParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MusicService.recordPlay(oid(req), req.params.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.delete("/music/tracks/:id", validate({ params: trackParam }), async (req, res, next) => {
    try { await MusicService.remove(oid(req), req.params.id); res.json({ ok: true, meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/music/tracks/:id/regenerate", validate({ params: trackParam }), async (req, res, next) => {
    try {
      const rec = await MusicService.regenerate(oid(req), uid(req), req.params.id);
      const done = await MusicService.renderOne(oid(req), rec.id);
      res.status(201).json({ ok: true, data: done, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Serve the rendered WAV (path-safe basename, like the media-factory render route).
  router.get(`/music/:file`, async (req, res, next) => {
    try {
      const safe = path.basename(req.params.file);
      const full = path.join(MUSIC_CACHE_DIR, safe);
      if (!full.startsWith(MUSIC_CACHE_DIR)) return res.status(400).end();
      const st = await fs.stat(full).catch(() => null);
      if (!st || !st.isFile()) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Track file not found" } });
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Length", String(st.size));
      res.sendFile(full);
    } catch (e) { next(e); }
  });
}
