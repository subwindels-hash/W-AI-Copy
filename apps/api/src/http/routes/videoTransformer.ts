/**
 * WINDELS AI VIDEO TRANSFORMER — HTTP API (§47).
 *
 * Authenticated. Generation is async: POST returns 202 + a job; clients
 * poll /jobs/:id or subscribe to /jobs/:id/events (SSE). The webhook/HTTP
 * request never performs the AI work.
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { multipartSingle } from "../middleware/multipart.js";
import { VtxService, subscribeJob } from "../../videoTransformer/transform.service.js";

const org = (req: any, res: any) => {
  if (!req.user?.organizationId) { res.status(403).json({ ok: false, error: { code: "FORBIDDEN" } }); return null; }
  return req.user.organizationId;
};

const Transform = z.object({
  sourceAssetId: z.string().min(1),
  prompt: z.string().min(1).max(4000),
  projectId: z.string().optional(),
  resolution: z.enum(["480p", "720p", "1080p", "4k"]).default("1080p"),
  preview: z.boolean().default(false),
  previewSeconds: z.number().int().min(3).max(30).optional(),
  references: z.array(z.string()).default([]),
});

export function registerVideoTransformerRoutes(router: Router) {
  const r = Router();
  r.use(authenticate);

  r.get("/dashboard", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; res.json({ ok: true, data: await VtxService.dashboard(o) }); } catch (e) { next(e); }
  });

  r.get("/models", (_req, res) => res.json({ ok: true, data: [] })); // populated below
  r.get("/providers", async (_req, res, next) => {
    try { const { vtxGateway } = await import("../../videoTransformer/providerGateway.js"); res.json({ ok: true, data: vtxGateway.listModels() }); } catch (e) { next(e); }
  });

  // ── Upload source ──
  r.post("/upload", multipartSingle("file"), async (req, res, next) => {
    try {
      const o = org(req, res); if (!o) return;
      const file = (req as any).file;
      if (!file) return res.status(400).json({ ok: false, error: { code: "FILE_REQUIRED" } });
      const out = await VtxService.upload(o, req.user!.id, { buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname }, file.originalname);
      res.status(201).json({ ok: true, data: out });
    } catch (e: any) {
      if (e.status) return res.status(e.status).json({ ok: false, error: { code: e.code ?? "UPLOAD_FAILED", message: e.message } });
      next(e);
    }
  });

  r.get("/sources/:id/understanding", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; res.json({ ok: true, data: await VtxService.getUnderstanding(req.params.id) }); } catch (e) { next(e); }
  });
  r.post("/sources/:id/analyze", validate({ body: z.object({ prompt: z.string().default("") }) }), async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; res.json({ ok: true, data: await VtxService.analyze(o, req.params.id, req.body.prompt) }); } catch (e) { next(e); }
  });

  // ── Parse / estimate / transform ──
  r.post("/parse", validate({ body: z.object({ prompt: z.string().min(1) }) }), (req, res) => res.json({ ok: true, data: VtxService.parse(req.body.prompt) }));
  r.post("/estimate", validate({ body: z.object({ prompt: z.string(), durationSec: z.number().default(10), resolution: z.string().default("1080p"), preview: z.boolean().default(false) }) }), (req, res) => {
    const plan = VtxService.parse(req.body.prompt);
    res.json({ ok: true, data: VtxService.estimate(plan, req.body.durationSec, req.body.resolution, req.body.preview) });
  });

  r.post("/transform", validate({ body: Transform }), async (req, res, next) => {
    try {
      const o = org(req, res); if (!o) return;
      const job = await VtxService.transform(o, req.user!.id, req.body);
      res.status(202).json({ ok: true, data: job });
    } catch (e: any) {
      if (e.status) return res.status(e.status).json({ ok: false, error: { code: e.code, message: e.message } });
      next(e);
    }
  });

  r.get("/jobs", async (req, res, next) => { try { const o = org(req, res); if (!o) return; res.json({ ok: true, data: await VtxService.listJobs(o) }); } catch (e) { next(e); } });
  r.get("/jobs/:id", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; const j = await VtxService.getJob(o, req.params.id); if (!j) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } }); res.json({ ok: true, data: j }); } catch (e) { next(e); }
  });
  r.post("/jobs/:id/cancel", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; const j = await VtxService.cancelJob(o, req.params.id); res.json({ ok: true, data: j }); } catch (e) { next(e); }
  });
  r.get("/jobs/:id/events", async (req, res) => {
    const o = org(req, res); if (!o) return;
    const j = await VtxService.getJob(o, req.params.id);
    if (!j) return res.status(404).end();
    res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache"); res.setHeader("Connection", "keep-alive"); res.flushHeaders?.();
    res.write(`event: snapshot\ndata: ${JSON.stringify({ stage: j.stage, percent: j.percent, message: j.message })}\n\n`);
    const unsub = subscribeJob(j.id, (p) => { try { res.write(`data: ${JSON.stringify(p)}\n\n`); } catch { /* gone */ } });
    const hb = setInterval(() => { try { res.write(": hb\n\n"); } catch { /* gone */ } }, 15000);
    req.on("close", () => { clearInterval(hb); unsub(); });
  });

  // ── Projects ──
  r.get("/projects", async (req, res, next) => { try { const o = org(req, res); if (!o) return; res.json({ ok: true, data: await VtxService.listProjects(o) }); } catch (e) { next(e); } });
  r.get("/projects/:id", async (req, res, next) => {
    try { const o = org(req, res); if (!o) return; const p = await VtxService.getProject(o, req.params.id); if (!p) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } }); res.json({ ok: true, data: p }); } catch (e) { next(e); }
  });

  router.use("/", r);
}
