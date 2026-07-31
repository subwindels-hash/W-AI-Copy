import { Router } from "express";
import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import { validate } from "../middleware/validate.js";
import { multipartSingle } from "../middleware/multipart.js";
import { resolveUserContext } from "../../services/workspace.service.js";
import { MediaFactoryService } from "../../mediaFactory/mediaFactory.service.js";
import { MediaPipelineService } from "../../mediaFactory/pipeline.service.js";
import { PublishingService } from "../../mediaFactory/publishing.service.js";
import { isPubPlatform } from "../../mediaFactory/publishing/platforms.js";
import { getWebhookConfig, verifySignature, resolveCallbackOrgId, toCallbackUpdate } from "../../mediaFactory/publishing/webhooks.js";
import { publishEngine } from "../../mediaFactory/publishing/publishJobs.js";
import type { PubPlatformCallbackUpdate } from "@windels/shared";

const genBody = z.object({ type: z.enum(["image","audio","music","video","character","cartoon","lesson","quiz","marketing","podcast"]), channel: z.enum(["web","mobile","social","podcast","audiobook","training","marketing","presentation","navigation","meeting"]), prompt: z.string().min(1).max(5000) });
const renderBody = z.object({
  title: z.string().min(1).max(200),
  script: z.string().min(10).max(10000),
  aspect: z.enum(["16:9","9:16","1:1"]).optional(),
  durationSec: z.coerce.number().int().min(3).max(120).optional(),
});

const MEDIA_CACHE_DIR = path.resolve(process.cwd(), "media-cache");

const scopeParam = z.enum(["user", "org"]).optional();

/**
 * PUBLIC inbound platform webhook callbacks — mounted on `/media-factory/
 * publishing/webhooks` OUTSIDE the authenticated media-factory router (see
 * server.ts). Signatures are verified with the org's per-platform HMAC secret.
 */
export function registerMediaFactoryWebhookRoutes(router: Router) {
  const cbSchema = z.object({
    postId: z.string().min(1).max(120).optional(),
    videoId: z.string().min(1).max(120).optional(),
    status: z.enum(["processing", "processed", "available", "uploaded", "failed", "rejected"]),
    reason: z.string().max(500).optional(),
    availableAt: z.string().max(40).optional(),
  }).refine((b) => b.postId || b.videoId, { message: "postId or videoId is required" });

  router.post("/:platform/callback", async (req, res, next) => {
    try {
      const platform = String(req.params.platform ?? "");
      if (!isPubPlatform(platform)) return res.status(400).json({ ok: false, error: { code: "BAD_PLATFORM" } });
      const oid = resolveCallbackOrgId(req.query as Record<string, unknown>, req.headers as Record<string, unknown>);
      if (!oid) return res.status(400).json({ ok: false, error: { code: "ORG_REQUIRED", message: "Webhook URL must include ?oid=<organizationId>." } });

      const cfg = await getWebhookConfig(oid, platform);
      if (!cfg || !cfg.enabled) return res.status(404).json({ ok: false, error: { code: "NO_WEBHOOK", message: "No webhook configured for this organization/platform. Register one first." } });

      const raw = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
      if (!verifySignature(cfg.secret, raw, req.headers as Record<string, unknown>)) {
        return res.status(401).json({ ok: false, error: { code: "BAD_SIGNATURE", message: "Webhook signature verification failed." } });
      }

      const parsed = cbSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ ok: false, error: { code: "BAD_PAYLOAD", message: parsed.error.message } });
      const update: PubPlatformCallbackUpdate = toCallbackUpdate(parsed.data);

      const ref = update.postId ?? update.videoId!;
      const job = await publishEngine.findJobByPlatformRef(oid, platform, ref);
      if (!job) return res.json({ ok: true, data: { matched: false } }); // platform notified for an unknown post — accept quietly

      const updated = await PublishingService.applyPlatformWebhook(oid, job.id, update);
      res.json({ ok: true, data: { matched: true, jobId: job.id, status: updated.status, platformStatus: updated.platformStatus } });
    } catch (e) { next(e); }
  });
}

export function registerMediaFactoryRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => { try { res.json({ ok:true, data: await MediaFactoryService.dashboard() }); } catch(e){next(e);} });
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
  router.get("/publishing/org-connections", async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.json({ ok:true, data: await PublishingService.orgConnections(ctx.organizationId) });
    } catch(e){next(e);}
  });
  router.post("/publishing/:platform/connect/start", validate({ params: platformParam, body: z.object({ scope: scopeParam }) }), async (req, res, next) => {
    try {
      res.json({ ok:true, data: await PublishingService.startOAuth(req.user!.id, req.params.platform as any, { scope: req.body?.scope }) });
    } catch(e){next(e);}
  });
  // OAuth providers redirect to the web app; the web app forwards {code,state}.
  router.post("/publishing/oauth/callback", validate({ body: z.object({ code: z.string().min(1), state: z.string().min(1) }) }), async (req, res, next) => {
    try {
      res.json({ ok:true, data: await PublishingService.completeOAuth(req.body, req.user!.id) });
    } catch(e){next(e);}
  });
  router.delete("/publishing/:platform/connect", validate({ params: platformParam, query: z.object({ scope: scopeParam }) }), async (req, res, next) => {
    try {
      await PublishingService.disconnect(req.user!.id, req.params.platform as any, (req.query.scope ?? "user") as "user" | "org");
      res.json({ ok:true });
    } catch(e){next(e);}
  });
  router.get("/publishing/:platform/status", validate({ params: platformParam, query: z.object({ scope: scopeParam }) }), async (req, res, next) => {
    try {
      res.json({ ok:true, data: await PublishingService.status(req.user!.id, req.params.platform as any, (req.query.scope ?? "user") as "user" | "org") });
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
    tokenScope: z.enum(["user", "org"]).optional(),
  });
  router.post("/publishing/:platform/publish", validate({ params: platformParam, body: publishBody }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      const { tokenScope, ...input } = req.body;
      const out = await PublishingService.createPublishJob(ctx.organizationId, req.user!.id, req.params.platform as any, input, { tokenScope });
      res.status(out.deduplicated ? 200 : 202).json({ ok:true, data: out });
    } catch(e){next(e);}
  });

  // ── Browser-side direct upload (completion pass) ────────────────
  const UPLOAD_CAP_BYTES = (Math.min(Number(process.env.PUBLISH_UPLOAD_MAX_MB ?? 512) || 512, 2048)) * 1024 * 1024;
  router.post("/publishing/upload", multipartSingle("file", { maxBytes: UPLOAD_CAP_BYTES }), async (req, res, next) => {
    try {
      const file = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string; size: number } | null;
      if (!file) return res.status(400).json({ ok: false, error: { code: "MEDIA_REQUIRED", message: "Multipart field 'file' is required." } });
      const ctx = await resolveUserContext(req.user!.id);
      const rec = await PublishingService.saveUpload(ctx.organizationId, req.user!.id, {
        buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname, size: file.size,
      });
      res.status(201).json({ ok: true, data: rec });
    } catch(e){next(e);}
  });
  const uploadFileParam = z.object({ file: z.string().min(3).max(120) });
  router.get("/publishing/uploads", validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }) }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.json({ ok: true, data: await PublishingService.listUploads(ctx.organizationId, Number(req.query.limit) || 100) });
    } catch(e){next(e);}
  });
  router.delete("/publishing/uploads/:file", validate({ params: uploadFileParam }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      await PublishingService.deleteUpload(ctx.organizationId, req.params.file);
      res.json({ ok: true });
    } catch(e){next(e);}
  });

  // ── Webhook status sync (completion pass) ───────────────────────
  router.post("/publishing/webhooks/:platform/register", validate({ params: platformParam }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.status(201).json({ ok: true, data: await PublishingService.registerWebhook(ctx.organizationId, req.params.platform as any) });
    } catch(e){next(e);}
  });
  router.get("/publishing/webhooks", async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.json({ ok: true, data: await PublishingService.listWebhooks(ctx.organizationId) });
    } catch(e){next(e);}
  });
  router.delete("/publishing/webhooks/:platform", validate({ params: platformParam }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      await PublishingService.deleteWebhook(ctx.organizationId, req.params.platform as any);
      res.json({ ok: true });
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
}
