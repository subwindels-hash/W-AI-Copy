/** Session 60 — Enterprise AI Training & Fine-Tuning routes */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { TrainingService } from "../../training/training.service.js";
import { DATASET_FORMATS, TUNING_STRATEGIES } from "@windels/shared";

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
}
