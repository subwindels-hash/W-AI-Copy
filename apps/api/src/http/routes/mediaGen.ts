/**
 * Session 42 — Universal Media Generation routes.
 *
 * Tenant-scoped, real Redis-backed job queue. All routes require
 * authentication + an active organization membership.
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { MediaGenService } from "../../mediaGen/mediaGen.service.js";

const SubmitSchema = z.object({
  modality: z.enum(["image", "audio", "video"]),
  op: z.string().min(2).max(60),
  prompt: z.string().min(1).max(4000),
  childTargeted: z.boolean().optional(),
});
const JobIdParams = z.object({ id: z.string().min(3).max(64) });
const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

function orgOr403(req: any, res: any): string | null {
  const orgId = req.user?.organizationId;
  if (!orgId) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return orgId;
}

export function registerMediaGenRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res);
      if (!orgId) return;
      res.json({ ok: true, data: await MediaGenService.dashboard(orgId), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/capabilities", async (req, res, next) => {
    try {
      const mod = req.query.modality as "image" | "audio" | "video" | undefined;
      res.json({ ok: true, data: await MediaGenService.capabilities(mod), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/generate", validate({ body: SubmitSchema }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res);
      if (!orgId) return;
      const job = await MediaGenService.submit(orgId, req.user!.id, req.body);
      // Trigger a worker tick so pending jobs get picked up right away.
      MediaGenService.runWorkerTick(orgId).catch(() => { /* best effort */ });
      res.status(202).json({ ok: true, data: job, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/jobs", validate({ query: ListQuery }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res);
      if (!orgId) return;
      const limit = Number((req.query as any).limit ?? 50);
      res.json({ ok: true, data: await MediaGenService.listJobs(orgId, limit), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/jobs/:id", validate({ params: JobIdParams }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res);
      if (!orgId) return;
      const job = await MediaGenService.getJob(orgId, req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "job not found" } });
      res.json({ ok: true, data: job, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/jobs/:id/cancel", validate({ params: JobIdParams }), async (req, res, next) => {
    try {
      const orgId = orgOr403(req, res);
      if (!orgId) return;
      const job = await MediaGenService.cancel(orgId, req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "job not found" } });
      res.json({ ok: true, data: job, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
