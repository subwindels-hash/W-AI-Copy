import { Router } from "express";
import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import { validate } from "../middleware/validate.js";
import { resolveUserContext } from "../../services/workspace.service.js";
import { MediaFactoryService } from "../../mediaFactory/mediaFactory.service.js";
import { MediaPipelineService } from "../../mediaFactory/pipeline.service.js";
import { PublishingService } from "../../mediaFactory/publishing.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { MediaMeteringService } from "../../mediaFactory/metering.service.js";
import { EstimateRenderSchema, EstimatePublishSchema } from "@windels/shared/mediaMetering";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";
import { multipartSingle } from "../middleware/multipart.js";
import { PUB_PLATFORM_IDS } from "../../mediaFactory/publishing/platforms.js";

const genBody = z.object({ type: z.enum(["image","audio","music","video","character","cartoon","lesson","quiz","marketing","podcast"]), channel: z.enum(["web","mobile","social","podcast","audiobook","training","marketing","presentation","navigation","meeting"]), prompt: z.string().min(1).max(5000) });
const renderBody = z.object({
  title: z.string().min(1).max(200),
  script: z.string().min(10).max(10000),
  aspect: z.enum(["16:9","9:16","1:1"]).optional(),
  durationSec: z.coerce.number().int().min(3).max(120).optional(),
});

const MEDIA_CACHE_DIR = path.resolve(process.cwd(), "media-cache");

export function registerMediaFactoryRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => { try { res.json({ ok:true, data: await MediaFactoryService.dashboard() }); } catch(e){next(e);} });

  // ── S77.B item 22: usage metering + pre-execution cost estimates ────────
  // Estimates are projections and say so (isEstimate: true); the summary
  // reports only measured usage recorded after work completed.
  router.post("/usage/estimate/render", validate({ body: EstimateRenderSchema }), (req, res) => {
    res.json({ ok: true, data: MediaMeteringService.estimateRender(req.body) });
  });
  router.post("/usage/estimate/publish", validate({ body: EstimatePublishSchema }), (req, res) => {
    res.json({ ok: true, data: MediaMeteringService.estimatePublish(req.body) });
  });
  router.get("/usage/summary", validate({ query: z.object({ windowDays: z.coerce.number().int().min(1).max(365).optional() }) }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.json({ ok: true, data: await MediaMeteringService.summary(ctx.organizationId, Number(req.query.windowDays ?? 30)) });
    } catch (e) { next(e); }
  });
  router.get("/usage/records", validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }) }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.json({ ok: true, data: await MediaMeteringService.listRecords(ctx.organizationId, Number(req.query.limit ?? 50)) });
    } catch (e) { next(e); }
  });
  router.post("/generate", validate({body:genBody}), async (req, res, next) => { try { res.json({ ok:true, data: await MediaFactoryService.generate(req.body.type, req.body.channel, req.body.prompt) }); } catch(e){next(e);} });
  router.get("/jobs", async (_req, res, next) => { try { res.json({ ok:true, data: await MediaFactoryService.listJobs() }); } catch(e){next(e);} });
  router.get("/characters", async (_req, res, next) => { try { res.json({ ok:true, data: await MediaFactoryService.listCharacters() }); } catch(e){next(e);} });
  router.get("/courses", async (_req, res, next) => { try { res.json({ ok:true, data: await MediaFactoryService.listCourses() }); } catch(e){next(e);} });

  // ── Real video pipeline ─────────────────────────────────────────
  router.get("/pipeline/status", async (_req, res) => {
    res.json({ ok: true, data: { ffmpeg: await MediaPipelineService.rendererAvailable() } });
  });
  router.post("/pipeline/render", validate({body:renderBody}), async (req, res, next) => {
    try { res.json({ ok: true, data: await MediaPipelineService.renderVideo(req.body) }); } catch(e){next(e);}
  });
  router.get("/pipeline/jobs", async (_req, res, next) => {
    try { res.json({ ok: true, data: await MediaPipelineService.listJobs(Number(_req.query.limit) || 50) }); } catch(e){next(e);}
  });
  router.get("/pipeline/jobs/:id", async (req, res, next) => {
    try {
      const j = await MediaPipelineService.getJob(req.params.id);
      if (!j) return res.status(404).json({ok:false,error:{code:"NOT_FOUND"}});
      res.json({ ok: true, data: j });
    } catch(e){next(e);}
  });
  // ── Publishing pipeline (Session 77B) ────────────────────────────
  const platformParam = z.object({ platform: z.enum(["youtube","tiktok","instagram","facebook","x","pinterest"]) });

  router.get("/publishing/platforms", async (req, res, next) => {
    try { res.json({ ok:true, data: await PublishingService.platformsForUser(req.user!.id) }); } catch(e){next(e);}
  });
  router.post("/publishing/:platform/connect/start", validate({ params: platformParam }), async (req, res, next) => {
    try {
      res.json({ ok:true, data: await PublishingService.startOAuth(req.user!.id, req.params.platform as any) });
    } catch(e){next(e);}
  });
  // OAuth providers redirect to the web app; the web app forwards {code,state}.
  router.post("/publishing/oauth/callback", validate({ body: z.object({ code: z.string().min(1), state: z.string().min(1) }) }), async (req, res, next) => {
    try {
      res.json({ ok:true, data: await PublishingService.completeOAuth(req.body, req.user!.id) });
    } catch(e){next(e);}
  });
  router.delete("/publishing/:platform/connect", validate({ params: platformParam }), async (req, res, next) => {
    try {
      await PublishingService.disconnect(req.user!.id, req.params.platform as any);
      res.json({ ok:true });
    } catch(e){next(e);}
  });
  router.get("/publishing/:platform/status", validate({ params: platformParam }), async (req, res, next) => {
    try {
      res.json({ ok:true, data: await PublishingService.status(req.user!.id, req.params.platform as any) });
    } catch(e){next(e);}
  });

  const publishBody = z.object({
    title: z.string().min(1).max(2200),
    description: z.string().max(5000).optional(),
    videoUrl: z.string().min(1).optional(),
    mediaUrl: z.string().min(1).optional(),
    mediaType: z.string().max(100).optional(),
    tags: z.array(z.string().max(64)).max(30).optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    idempotencyKey: z.string().max(80).optional(),
    privacyStatus: z.string().max(40).optional(),
    boardId: z.string().max(64).optional(),
    pageId: z.string().max(64).optional(),
    igUserId: z.string().max(64).optional(),
  });
  router.post("/publishing/:platform/publish", validate({ params: platformParam, body: publishBody }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      const out = await PublishingService.createPublishJob(ctx.organizationId, req.user!.id, req.params.platform as any, req.body);
      res.status(out.deduplicated ? 200 : 202).json({ ok:true, data: out });
    } catch(e){next(e);}
  });
  const jobsQuery = z.object({
    status: z.enum(["queued","scheduled","uploading","published","failed","cancelled"]).optional(),
    platform: platformParam.shape.platform.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  });
  router.get("/publishing/jobs", validate({ query: jobsQuery }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.json({ ok:true, data: await PublishingService.listJobs(ctx.organizationId, req.query as any) });
    } catch(e){next(e);}
  });
  const jobParam = z.object({ id: z.string().min(4).max(64) });
  router.get("/publishing/jobs/:id", validate({ params: jobParam }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.json({ ok:true, data: await PublishingService.getJob(ctx.organizationId, req.params.id) });
    } catch(e){next(e);}
  });
  router.post("/publishing/jobs/:id/retry", validate({ params: jobParam }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.json({ ok:true, data: await PublishingService.retryJob(ctx.organizationId, req.params.id, req.user!.id) });
    } catch(e){next(e);}
  });
  router.post("/publishing/jobs/:id/cancel", validate({ params: jobParam }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.json({ ok:true, data: await PublishingService.cancelJob(ctx.organizationId, req.params.id, req.user!.id) });
    } catch(e){next(e);}
  });
  router.get("/publishing/audit", validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }) }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.json({ ok:true, data: await PublishingService.listAudit(ctx.organizationId, Number(req.query.limit) || 100) });
    } catch(e){next(e);}
  });

  // ── Upload media (multipart, org-scoped, auth-required) ───────────
  // S77 completion: browser-side direct upload. 100 MB cap, validated by the
  // multipart middleware + storageName() MIME/extension allowlist.
  router.post("/publishing/upload", multipartSingle("file", { maxBytes: 100 * 1024 * 1024 }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      const file = (req as any).file;
      if (!file || !file.buffer?.length) return res.status(400).json({ ok:false, error:{ code:"EMPTY_FILE", message:"No file uploaded (field name: file)" } });
      const rec = await PublishingService.saveUpload(ctx.organizationId, req.user!.id, {
        buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname, size: file.size,
      });
      res.status(201).json({ ok:true, data: rec, meta: { requestId: req.requestId } });
    } catch(e){next(e);}
  });

  // ── View uploads (org-scoped only) ────────────────────────────────
  router.get("/publishing/uploads", validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }) }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.json({ ok:true, data: await PublishingService.listUploads(ctx.organizationId, Number(req.query.limit) || 50) });
    } catch(e){next(e);}
  });

  // ── Delete upload (removes file + record; guarded against active jobs) ──
  const uploadFileParam = z.object({ file: z.string().min(1).max(200) });
  router.delete("/publishing/uploads/:file", validate({ params: uploadFileParam }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      await PublishingService.deleteUpload(ctx.organizationId, req.params.file);
      res.json({ ok:true, meta: { requestId: req.requestId } });
    } catch(e){next(e);}
  });

  // ── Webhook registrations (org-scoped) ────────────────────────────
  router.get("/publishing/webhooks", async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.json({ ok:true, data: await PublishingService.listWebhooks(ctx.organizationId) });
    } catch(e){next(e);}
  });
  router.post("/publishing/webhooks/:platform/register", validate({ params: platformParam }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      const reg = await PublishingService.registerWebhook(ctx.organizationId, req.params.platform as any);
      res.status(201).json({ ok:true, data: reg, meta: { requestId: req.requestId } });
    } catch(e){next(e);}
  });
  router.delete("/publishing/webhooks/:platform", validate({ params: platformParam }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      await PublishingService.deleteWebhook(ctx.organizationId, req.params.platform as any);
      res.json({ ok:true, meta: { requestId: req.requestId } });
    } catch(e){next(e);}
  });

  router.get("/render/:file", async (req, res, next) => {
    try {
      const safe = path.basename(req.params.file);
      const full = path.join(MEDIA_CACHE_DIR, safe);
      // Guard against path traversal.
      if (!full.startsWith(MEDIA_CACHE_DIR)) return res.status(400).end();
      const st = await fs.stat(full).catch(() => null);
      if (!st || !st.isFile()) return res.status(404).json({ok:false,error:{code:"NOT_FOUND"}});
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", String(st.size));
      res.sendFile(full);
    } catch(e){next(e);}
  });


  // Real tenant-scoped notes ledger for mediaFactory — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "mf2:notes", idPrefix: "mf2-" });
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
