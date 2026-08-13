/**
 * AI Video Studio (Cinematic) — HTTP API.
 *
 * Mounted at /api/v1/cinematic behind authenticate. Async generation returns
 * 202 with a job; clients poll /jobs/:id or subscribe to /jobs/:id/events
 * (SSE) for real progress. Reuses existing auth/RBAC/validation.
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { CinematicService, subscribeJob } from "../../cinematic/cinematic.service.js";

const org = (req: any, res: any) => {
  if (!req.user?.organizationId) { res.status(403).json({ ok: false, error: { code: "FORBIDDEN" } }); return null; }
  return req.user.organizationId;
};

const ReferenceSchema = z.object({
  role: z.enum(["character", "face", "body", "clothing", "location", "product", "object", "vehicle", "style", "lighting", "architecture", "background", "camera"]),
  assetId: z.string(), url: z.string(), label: z.string().optional(),
  strength: z.enum(["low", "medium", "high", "maximum"]).default("medium"),
});
const CameraSchema = z.object({
  type: z.string().default("dolly_in"), angle: z.string().optional(), lensMm: z.number().optional(),
  focalLength: z.number().optional(), speed: z.enum(["slow", "normal", "fast"]).optional(),
  shake: z.number().min(0).max(1).optional(), depthOfField: z.boolean().optional(), focus: z.string().optional(),
}).partial();

const CreateProject = z.object({
  prompt: z.string().min(1).max(8000),
  title: z.string().max(160).optional(),
  mode: z.enum(["text_to_video", "image_to_video", "video_to_video", "multi_reference", "script_to_video", "storyboard", "product", "advertisement", "social", "restyle"]).optional(),
  style: z.enum(["photorealistic", "cinematic", "anime", "documentary", "commercial", "fashion", "scifi", "fantasy", "historical", "horror", "music_video", "corporate", "product"]).optional(),
  aspectRatio: z.string().default("16:9"), resolution: z.string().default("1080p"),
  fps: z.number().int().min(12).max(60).default(24),
  durationSec: z.number().min(3).max(120).default(10),
  quality: z.enum(["draft", "standard", "high", "ultra"]).default("standard"),
  audioEnabled: z.boolean().default(true), dialogueEnabled: z.boolean().default(false),
  musicEnabled: z.boolean().default(true), sfxEnabled: z.boolean().default(true), lipSync: z.boolean().default(false),
  negativePrompt: z.string().optional(), seed: z.number().int().optional(),
  references: z.array(ReferenceSchema).default([]), characterIds: z.array(z.string()).default([]),
});

export function registerCinematicRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; res.json({ ok: true, data: await CinematicService.dashboard(o) }); } catch (e) { next(e); }
  });
  router.get("/models", (_req, res) => res.json({ ok: true, data: CinematicService.listModels() }));
  router.get("/activity", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; res.json({ ok: true, data: await CinematicService.listActivity(o) }); } catch (e) { next(e); }
  });

  // ── Projects ──
  router.post("/projects", validate({ body: CreateProject }), async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; res.status(201).json({ ok: true, data: await CinematicService.createProject(o, req.user!.id, req.body) }); } catch (e) { next(e); }
  });
  router.get("/projects", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; res.json({ ok: true, data: await CinematicService.listProjects(o) }); } catch (e) { next(e); }
  });
  router.get("/projects/:id", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; const p = await CinematicService.getProject(o, req.params.id); if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } }); res.json({ ok: true, data: p }); } catch (e) { next(e); }
  });
  router.patch("/projects/:id", validate({ body: CreateProject.partial() }), async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; const p = await CinematicService.updateProject(o, req.params.id, req.body); if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } }); res.json({ ok: true, data: p }); } catch (e) { next(e); }
  });
  router.delete("/projects/:id", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; const ok = await CinematicService.deleteProject(o, req.params.id); if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } }); res.json({ ok: true }); } catch (e) { next(e); }
  });
  router.post("/projects/:id/estimate", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; const p = await CinematicService.getProject(o, req.params.id); if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } }); res.json({ ok: true, data: CinematicService.estimate(p) }); } catch (e) { next(e); }
  });

  // ── Generation (async) ──
  router.post("/projects/:id/generate", validate({ body: z.object({ preview: z.boolean().default(false), shotId: z.string().optional() }).default({}) }), async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; const job = await CinematicService.generate(o, req.params.id, req.body); res.status(202).json({ ok: true, data: job }); } catch (e) { next(e); }
  });
  router.post("/projects/:id/shots/:shotId/regenerate", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; const job = await CinematicService.regenerateShot(o, req.params.id, req.params.shotId); res.status(202).json({ ok: true, data: job }); } catch (e) { next(e); }
  });

  // ── Jobs ──
  router.get("/jobs", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; res.json({ ok: true, data: await CinematicService.listJobs(o, (req.query as any).projectId) }); } catch (e) { next(e); }
  });
  router.get("/jobs/:id", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; const j = await CinematicService.getJob(o, req.params.id); if (!j) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } }); res.json({ ok: true, data: j }); } catch (e) { next(e); }
  });
  router.post("/jobs/:id/cancel", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; const j = await CinematicService.cancelJob(o, req.params.id); if (!j) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } }); res.json({ ok: true, data: j }); } catch (e) { next(e); }
  });
  router.get("/jobs/:id/events", async (req, res, next) => {
    try {
      const o = org(req, res); if (!o) return;
      const job = await CinematicService.getJob(o, req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache, no-transform"); res.setHeader("Connection", "keep-alive"); res.flushHeaders?.();
      res.write(`event: snapshot\ndata: ${JSON.stringify({ stage: job.stage, percent: job.percent, message: job.message })}\n\n`);
      const unsub = subscribeJob(job.id, (p) => { try { res.write(`data: ${JSON.stringify(p)}\n\n`); } catch { /* gone */ } });
      const hb = setInterval(() => { try { res.write(": hb\n\n"); } catch { /* gone */ } }, 15000);
      req.on("close", () => { clearInterval(hb); unsub(); });
    } catch (e) { next(e); }
  });

  // ── Characters ──
  const Char = z.object({
    name: z.string().min(1), description: z.string().optional(), ageRange: z.string().optional(),
    voiceId: z.string().optional(), style: z.string().optional(), clothing: z.string().optional(),
    attributes: z.record(z.string()).default({}),
    references: z.array(ReferenceSchema).default([]),
  });
  router.post("/characters", validate({ body: Char }), async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; res.status(201).json({ ok: true, data: await CinematicService.createCharacter(o, req.user!.id, req.body) }); } catch (e) { next(e); }
  });
  router.get("/characters", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; res.json({ ok: true, data: await CinematicService.listCharacters(o) }); } catch (e) { next(e); }
  });
  router.get("/characters/:id", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; const c = await CinematicService.getCharacter(o, req.params.id); if (!c) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } }); res.json({ ok: true, data: c }); } catch (e) { next(e); }
  });
  router.delete("/characters/:id", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; res.json({ ok: true, data: { deleted: await CinematicService.deleteCharacter(o, req.params.id) } }); } catch (e) { next(e); }
  });
  void CameraSchema;
}
