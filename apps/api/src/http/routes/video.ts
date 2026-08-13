/**
 * WINDELS AI Video Generation & Production Engine — HTTP API (§16).
 *
 * Mounted at /api/v1/video behind `authenticate`. Every write is tenant-scoped
 * to req.user.organizationId and uses the existing auth/RBAC/logging/security
 * standards. The API is asynchronous: generate/render return 202 with jobs;
 * clients poll /jobs/:id or /projects/:id for progress.
 *
 * Endpoints:
 *   GET    /capabilities
 *   GET    /dashboard
 *   GET    /providers
 *   POST   /projects
 *   GET    /projects
 *   GET    /projects/:id
 *   PATCH  /projects/:id
 *   DELETE /projects/:id
 *   POST   /projects/:id/plan
 *   POST   /projects/:id/generate
 *   POST   /projects/:id/render
 *   POST   /projects/:id/produce          (plan + generate + render)
 *   POST   /projects/:id/modify
 *   POST   /projects/:id/versions
 *   POST   /projects/:id/marketplace/:productId
 *   POST   /projects/:id/publish
 *   GET    /jobs
 *   GET    /jobs/:id
 *   POST   /jobs/:id/cancel
 *   GET    /projects/:id/assets/:assetId
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { VideoService } from "../../videoEngine/video.service.js";

const aspect = z.enum(["16:9", "9:16", "1:1", "4:5", "21:9"]);
const resolution = z.enum(["480p", "720p", "1080p", "4k"]);
const quality = z.enum(["draft", "standard", "high", "max"]);

const ProductRefSchema = z.object({
  source: z.enum(["marketplace", "crm", "manual"]).default("manual"),
  sourceId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  images: z.array(z.string()).default([]),
  price: z.string().optional(),
  brand: z.string().optional(),
  features: z.array(z.string()).default([]),
  category: z.string().optional(),
  vendorName: z.string().optional(),
});

const CreateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  prompt: z.string().min(1).max(8000),
  creationType: z.enum([
    "advertisement", "product", "social", "short_form", "educational", "explainer",
    "business_presentation", "marketing", "cinematic", "story", "promotional", "ugc",
    "music_video", "talking_avatar", "image_animation", "video_transform",
    "image_to_video", "video_to_video",
  ]).optional(),
  aspectRatio: aspect.optional(),
  resolution: resolution.optional(),
  quality: quality.optional(),
  targetDurationSec: z.number().int().min(3).max(600).optional(),
  marketplaceProductId: z.string().optional(),
  products: z.array(ProductRefSchema).optional(),
  contentPolicy: z.record(z.any()).optional(),
  discloseAi: z.boolean().optional(),
});

const UpdateSchema = CreateSchema.partial();

const GenerateSchema = z.object({
  sceneIndex: z.number().int().min(0).optional(),
  op: z.enum(["text-to-video", "image-to-video", "video-to-video", "talking-avatar", "text-to-image"]).optional(),
  voiceGender: z.enum(["male", "female", "neutral"]).optional(),
  voiceId: z.string().optional(),
});

const RenderSchema = z.object({ versionId: z.string().optional() });

const VersionSchema = z.object({
  aspectRatio: aspect.optional(),
  platform: z.string().optional(),
});

const ModifySchema = z.object({
  action: z.enum([
    "shorten", "lengthen", "change_background", "set_tone", "set_voice_gender",
    "change_music", "zoom_product", "reformat", "regenerate_scene", "add_captions",
    "set_aspect", "custom",
  ]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  instruction: z.string().optional(),
});

const PublishSchema = z.object({
  versionId: z.string(),
  platforms: z.array(z.enum(["youtube", "tiktok", "instagram", "facebook", "whatsapp", "linkedin", "x"])).min(1),
  title: z.string().optional(),
  description: z.string().optional(),
});

const IdParams = z.object({ id: z.string().min(3).max(80) });
const JobParams = z.object({ id: z.string().min(3).max(80) });
const AssetParams = z.object({ id: z.string(), assetId: z.string() });
const MarketplaceParams = z.object({ id: z.string(), productId: z.string() });

function orgOr403(req: any, res: any): string | null {
  const orgId = req.user?.organizationId;
  if (!orgId) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return orgId;
}

export function registerVideoRoutes(router: Router) {
  router.use(authenticate);

  router.get("/capabilities", async (_req, res, next) => {
    try { res.json({ ok: true, data: VideoService.capabilities() }); } catch (e) { next(e); }
  });

  router.get("/providers", async (_req, res, next) => {
    try { res.json({ ok: true, data: VideoService.capabilities().providers }); } catch (e) { next(e); }
  });

  router.get("/dashboard", async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      res.json({ ok: true, data: await VideoService.dashboard(orgId) });
    } catch (e) { next(e); }
  });

  // ── Projects ─────────────────────────────────────────────────────
  router.post("/projects", validate({ body: CreateSchema }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const project = await VideoService.createProject(orgId, req.user!.id, req.body);
      res.status(201).json({ ok: true, data: project });
    } catch (e) { next(e); }
  });

  router.get("/projects", async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const limit = Math.min(200, Number((req.query as any).limit ?? 100));
      res.json({ ok: true, data: await VideoService.listProjects(orgId, limit) });
    } catch (e) { next(e); }
  });

  router.get("/projects/:id", validate({ params: IdParams }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const p = await VideoService.getProject(orgId, req.params.id);
      if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "project not found" } });
      res.json({ ok: true, data: p });
    } catch (e) { next(e); }
  });

  router.patch("/projects/:id", validate({ params: IdParams, body: UpdateSchema }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const p = await VideoService.updateProject(orgId, req.params.id, req.body);
      if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "project not found" } });
      res.json({ ok: true, data: p });
    } catch (e) { next(e); }
  });

  router.delete("/projects/:id", validate({ params: IdParams }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const ok = await VideoService.deleteProject(orgId, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "project not found" } });
      res.json({ ok: true, data: { deleted: true } });
    } catch (e) { next(e); }
  });

  router.post("/projects/:id/plan", validate({ params: IdParams }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const p = await VideoService.plan(orgId, req.params.id);
      if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "project not found" } });
      res.json({ ok: true, data: p });
    } catch (e) { next(e); }
  });

  router.post("/projects/:id/generate", validate({ params: IdParams, body: GenerateSchema }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const out = await VideoService.generate(orgId, req.params.id, req.body);
      if (!out) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "project not found" } });
      res.status(202).json({ ok: true, data: out });
    } catch (e) { next(e); }
  });

  router.post("/projects/:id/render", validate({ params: IdParams, body: RenderSchema }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const out = await VideoService.render(orgId, req.params.id, req.body.versionId);
      if (!out) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "project not found" } });
      res.status(202).json({ ok: true, data: out });
    } catch (e) { next(e); }
  });

  router.post("/projects/:id/produce", validate({ params: IdParams, body: GenerateSchema }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const p = await VideoService.produce(orgId, req.params.id, req.body);
      if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "project not found" } });
      res.status(202).json({ ok: true, data: p });
    } catch (e) { next(e); }
  });

  router.post("/projects/:id/modify", validate({ params: IdParams, body: ModifySchema }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const p = await VideoService.modify(orgId, req.params.id, req.body);
      if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "project not found" } });
      res.json({ ok: true, data: p });
    } catch (e) { next(e); }
  });

  router.post("/projects/:id/versions", validate({ params: IdParams, body: VersionSchema }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const p = await VideoService.createVersion(orgId, req.params.id, req.body.aspectRatio, req.body.platform);
      if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "project not found" } });
      res.status(201).json({ ok: true, data: p.versions[p.versions.length - 1] });
    } catch (e) { next(e); }
  });

  router.post("/projects/:id/marketplace/:productId", validate({ params: MarketplaceParams }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const p = await VideoService.attachMarketplaceProduct(orgId, req.params.id, req.params.productId);
      if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "project not found" } });
      res.json({ ok: true, data: p });
    } catch (e) { next(e); }
  });

  router.post("/projects/:id/publish", validate({ params: IdParams, body: PublishSchema }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const out = await VideoService.publish(orgId, req.params.id, req.body);
      res.status(202).json({ ok: true, data: out });
    } catch (e) { next(e); }
  });

  router.get("/projects/:id/assets/:assetId", validate({ params: AssetParams }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const asset = await VideoService.getAsset(orgId, req.params.id, req.params.assetId);
      if (!asset) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "asset not found" } });
      res.json({ ok: true, data: asset });
    } catch (e) { next(e); }
  });

  // ── Jobs ─────────────────────────────────────────────────────────
  router.get("/jobs", async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const projectId = (req.query as any).projectId as string | undefined;
      res.json({ ok: true, data: await VideoService.listJobs(orgId, projectId) });
    } catch (e) { next(e); }
  });

  router.get("/jobs/:id", validate({ params: JobParams }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const job = await VideoService.getJob(orgId, req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "job not found" } });
      res.json({ ok: true, data: job });
    } catch (e) { next(e); }
  });

  router.post("/jobs/:id/cancel", validate({ params: JobParams }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res); if (!orgId) return;
      const job = await VideoService.cancelJob(orgId, req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "job not found" } });
      res.json({ ok: true, data: job });
    } catch (e) { next(e); }
  });
}
