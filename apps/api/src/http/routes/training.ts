/** Session 60 — Enterprise AI Training & Fine-Tuning routes */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { TrainingService } from "../../training/training.service.js";
import { DATASET_FORMATS, TUNING_STRATEGIES } from "@windels/shared";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z as z_notes } from "zod";

const DatasetSchema = z.object({
  name: z.string().min(2),
  format: z.enum(DATASET_FORMATS),
  rows: z.number().int().nonnegative().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  syntheticPct: z.number().min(0).max(100).optional(),
  cleaned: z.boolean().optional(),
  ragbuilderIncluded: z.boolean().optional(),
});
const JobSchema = z.object({
  name: z.string().min(2),
  baseModel: z.string().min(2),
  datasetId: z.string().min(2),
  strategy: z.enum(TUNING_STRATEGIES),
  hyperparams: z.object({
    lr: z.number().positive(),
    epochs: z.number().int().positive(),
    batchSize: z.number().int().positive(),
    loraRank: z.number().int().positive().optional(),
  }),
});
const CanarySchema = z.object({ pct: z.number().int().min(1).max(50) });

export function registerTrainingRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok:true, data: await TrainingService.dashboard((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/datasets", async (req, res, next) => { try { res.json({ ok:true, data: await TrainingService.listDatasets((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/datasets", validate({ body: DatasetSchema }), async (req, res, next) => { try { res.json({ ok:true, data: await TrainingService.createDataset({ ...req.body, organizationId: (req.user as any).organizationId }) }); } catch (e) { next(e); } });
  router.get("/jobs", async (req, res, next) => { try { res.json({ ok:true, data: await TrainingService.listJobs((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/jobs", validate({ body: JobSchema }), async (req, res, next) => { try { res.json({ ok:true, data: await TrainingService.startJob({ ...req.body, createdBy: (req.user as any).id, organizationId: (req.user as any).organizationId }) }); } catch (e) { next(e); } });
  router.post("/jobs/:id/canary", validate({ body: CanarySchema }), async (req, res, next) => { try {
    const j = await TrainingService.promoteToCanary(req.params.id, req.body.pct, (req.user as any).organizationId);
    if (!j) return res.status(404).json({ok:false,error:{code:"NOT_FOUND",message:"job not found"}});
    res.json({ok:true,data:j});
  } catch (e) { next(e); } });
  router.post("/jobs/:id/rollback", async (req, res, next) => { try {
    const j = await TrainingService.rollback(req.params.id, (req.user as any).organizationId);
    if (!j) return res.status(404).json({ok:false,error:{code:"NOT_FOUND",message:"job not found"}});
    res.json({ok:true,data:j});
  } catch (e) { next(e); } });


  // Real tenant-scoped notes ledger for training — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "trn:notes", idPrefix: "trn-" });
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
