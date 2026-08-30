/**
 * WINDELS AI Video Transformation Studio — HTTP API (§30).
 *
 * Mounted at /api/v1/video-transform behind authenticate. Every operation is
 * org-scoped and uses the existing Zod validation. Generation is asynchronous:
 * POSTs return 202 with a job; clients poll /jobs/:id or subscribe to
 * /jobs/:id/events (SSE) for real-time progress (§32).
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { multipartSingle } from "../middleware/multipart.js";
import { VtService, subscribeJob } from "../../videoTransform/transform.service.js";
import { NODE_DEFS, isImplemented, topoSort, validateWorkflow } from "../../videoTransform/nodes.js";

const orgOr403 = (req: any, res: any): string | null => {
  if (!req.user?.organizationId) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return req.user.organizationId;
};

const JobInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("exact_frame"),
    sourceAssetId: z.string().min(1),
    frameNumber: z.number().int().min(0).default(0),
  }),
  z.object({
    kind: z.literal("image_generate"),
    prompt: z.string().min(1),
    referenceAssetIds: z.array(z.string()).default([]),
    modelId: z.string().optional(),
    resolution: z.string().optional(),
    quality: z.enum(["standard", "high", "ultra"]).default("high"),
    aspectRatio: z.string().default("16:9"),
    quantity: z.number().int().min(1).max(8).default(1),
    referenceStrength: z.number().min(0).max(1).optional(),
    matchImages: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal("video_matte"),
    sourceAssetId: z.string().min(1),
    settings: z.object({
      expandPx: z.number().optional(), contractPx: z.number().optional(),
      featherPx: z.number().optional(), edgeSoftness: z.number().optional(),
      hairRefinement: z.boolean().optional(), spillRemoval: z.boolean().optional(),
      edgeCleanup: z.boolean().optional(), temporalSmoothing: z.number().optional(),
      backgroundCleanup: z.boolean().optional(),
    }).partial().optional(),
  }),
  z.object({
    kind: z.literal("switch_x"),
    sourceAssetId: z.string().min(1),
    alphaAssetId: z.string().optional(),
    prompt: z.string().min(1),
    referenceAssetId: z.string().optional(),
    preserveSubject: z.enum(["maximum", "high", "balanced", "creative"]).default("high"),
    transformMode: z.enum(["background_only", "subject_and_background", "full_scene", "environment_replacement", "cinematic_restyle"]).default("environment_replacement"),
    resolution: z.enum(["480p", "720p", "1080p", "1440p", "4k"]).default("1080p"),
    previewSeconds: z.number().int().min(1).max(60).optional(),
  }),
  z.object({
    kind: z.literal("workflow"),
    workflowId: z.string().min(1),
    inputs: z.record(z.string()).optional(),
  }),
]);

export function registerVideoTransformRoutes(router: Router) {
  router.use(authenticate);

  // ── Catalogue & providers ──
  // S210: flag nodes the palette offers but the executor cannot run, so the
  // editor can disable them instead of letting a user build an inert graph.
  router.get("/nodes", (_req, res) => res.json({
    ok: true,
    data: NODE_DEFS.map((d) => ({ ...d, implemented: isImplemented(d.kind) })),
  }));
  router.get("/providers", (req, res, next) => {
    try {
      const kind = (req.query.kind as string) || undefined;
      res.json({ ok: true, data: VtService.listProviders(kind) });
    } catch (e) { next(e); }
  });
  router.get("/dashboard", async (req, res, next) => {
    try { const oid = orgOr403(req, res); if (!oid) return; res.json({ ok: true, data: await VtService.dashboard(oid) }); } catch (e) { next(e); }
  });
  router.get("/activity", async (req, res, next) => {
    try { const oid = orgOr403(req, res); if (!oid) return; res.json({ ok: true, data: await VtService.listActivity(oid) }); } catch (e) { next(e); }
  });

  // ── Source upload ──
  router.post("/sources", multipartSingle("file", { maxBytes: 500 * 1024 * 1024 }), async (req, res, next) => {
    try {
      const oid = orgOr403(req, res); if (!oid) return;
      const file = (req as any).file;
      if (!file) return res.status(400).json({ ok: false, error: { code: "FILE_REQUIRED" } });
      const data = await VtService.uploadSource(oid, req.user!.id, file);
      res.status(201).json({ ok: true, data });
    } catch (e) { next(e); }
  });

  // ── Jobs ──
  router.post("/jobs", validate({ body: z.object({ input: JobInputSchema, workflowId: z.string().optional() }) }), async (req, res, next) => {
    try {
      const oid = orgOr403(req, res); if (!oid) return;
      const job = await VtService.createJob(oid, req.user!.id, req.body.input, req.body.workflowId);
      res.status(202).json({ ok: true, data: job });
    } catch (e) { next(e); }
  });
  router.get("/jobs", async (req, res, next) => {
    try {
      const oid = orgOr403(req, res); if (!oid) return;
      const limit = Math.min(200, Number((req.query as any).limit ?? 100));
      res.json({ ok: true, data: await VtService.listJobs(oid, limit) });
    } catch (e) { next(e); }
  });
  router.get("/jobs/:id", async (req, res, next) => {
    try {
      const oid = orgOr403(req, res); if (!oid) return;
      const job = await VtService.getJob(oid, req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: job });
    } catch (e) { next(e); }
  });
  router.post("/jobs/:id/cancel", async (req, res, next) => {
    try {
      const oid = orgOr403(req, res); if (!oid) return;
      const job = await VtService.cancelJob(oid, req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: job });
    } catch (e) { next(e); }
  });

  // ── Estimate (human-in-the-loop, §43) ──
  router.post("/estimate", validate({ body: z.object({ input: JobInputSchema }) }), (req, res) => {
    res.json({ ok: true, data: VtService.estimate(req.body.input) });
  });

  // ── SSE progress (§32) ──
  router.get("/jobs/:id/events", async (req, res, next) => {
    try {
      const oid = orgOr403(req, res); if (!oid) return;
      const job = await VtService.getJob(oid, req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      res.write(`event: snapshot\ndata: ${JSON.stringify({ stage: job.stage, percent: job.percent, message: job.message })}\n\n`);
      const unsub = subscribeJob(job.id, (p) => {
        try { res.write(`data: ${JSON.stringify(p)}\n\n`); } catch { /* client gone */ }
      });
      const heartbeat = setInterval(() => { try { res.write(": hb\n\n"); } catch { /* gone */ } }, 15000);
      req.on("close", () => { clearInterval(heartbeat); unsub(); });
    } catch (e) { next(e); }
  });

  // ── Workflows ──
  const WfNodeSchema = z.object({
    id: z.string(), kind: z.string(), x: z.number(), y: z.number(),
    collapsed: z.boolean().optional(), settings: z.record(z.any()).default({}),
  });
  const WfConnSchema = z.object({
    id: z.string(), sourceNode: z.string(), sourcePort: z.string(),
    targetNode: z.string(), targetPort: z.string(), type: z.string(),
  });
  const CreateWf = z.object({
    name: z.string().min(1).max(160), description: z.string().optional(),
    nodes: z.array(WfNodeSchema).default([]), connections: z.array(WfConnSchema).default([]),
    isTemplate: z.boolean().optional(),
  });
  router.post("/workflows", validate({ body: CreateWf }), async (req, res, next) => {
    try {
      const oid = orgOr403(req, res); if (!oid) return;
      const wf = await VtService.createWorkflow(oid, req.user!.id, req.body);
      res.status(201).json({ ok: true, data: wf });
    } catch (e) { next(e); }
  });
  router.get("/workflows", async (req, res, next) => {
    try { const oid = orgOr403(req, res); if (!oid) return; res.json({ ok: true, data: await VtService.listWorkflows(oid) }); } catch (e) { next(e); }
  });
  router.get("/workflows/:id", async (req, res, next) => {
    try {
      const oid = orgOr403(req, res); if (!oid) return;
      const wf = await VtService.getWorkflow(oid, req.params.id);
      if (!wf) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: wf });
    } catch (e) { next(e); }
  });
  router.delete("/workflows/:id", async (req, res, next) => {
    try {
      const oid = orgOr403(req, res); if (!oid) return;
      const ok = await VtService.deleteWorkflow(oid, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  router.post("/workflows/:id/nodes", validate({ body: WfNodeSchema.omit({ id: true }) }), async (req, res, next) => {
    try {
      const oid = orgOr403(req, res); if (!oid) return;
      const wf = await VtService.addNode(oid, req.params.id, req.body);
      if (!wf) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: wf });
    } catch (e) { next(e); }
  });
  router.post("/workflows/:id/connect", validate({ body: WfConnSchema.omit({ id: true, type: true }) }), async (req, res, next) => {
    try {
      const oid = orgOr403(req, res); if (!oid) return;
      const wf = await VtService.connectNodes(oid, req.params.id, req.body);
      if (!wf) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: wf });
    } catch (e) { next(e); }
  });
  /**
   * S210: report whether a graph can actually run, so the editor can mark bad
   * nodes before the user hits Run.
   */
  router.get("/workflows/:id/validate", async (req, res, next) => {
    try {
      const oid = orgOr403(req, res); if (!oid) return;
      const wf = await VtService.getWorkflow(oid, req.params.id);
      if (!wf) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      let problems = validateWorkflow(wf);
      try { topoSort(wf); } catch (e) { problems = [...problems, (e as Error).message]; }
      res.json({ ok: true, data: { valid: problems.length === 0, problems } });
    } catch (e) { next(e); }
  });
  router.post("/workflows/:id/run", validate({ body: z.object({ inputs: z.record(z.string()).optional() }).default({}) }), async (req, res, next) => {
    try {
      const oid = orgOr403(req, res); if (!oid) return;
      const wf = await VtService.getWorkflow(oid, req.params.id);
      if (!wf) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      // Validate before enqueueing: a 202 followed by an async failure reads
      // to the user as "it ran". Reject an unrunnable graph synchronously.
      try { topoSort(wf); }
      catch (e) { return res.status(400).json({ ok: false, error: { code: "WORKFLOW_INVALID", message: (e as Error).message, problems: [(e as Error).message] } }); }
      const problems = validateWorkflow(wf);
      if (problems.length) {
        return res.status(400).json({ ok: false, error: { code: "WORKFLOW_INVALID", message: `workflow cannot run: ${problems.length} problem(s)`, problems } });
      }
      const job = await VtService.createJob(oid, req.user!.id, { kind: "workflow", workflowId: wf.id, inputs: req.body.inputs }, wf.id);
      res.status(202).json({ ok: true, data: job });
    } catch (e) { next(e); }
  });
}
