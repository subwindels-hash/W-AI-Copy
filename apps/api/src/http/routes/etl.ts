import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { EtlService } from "../../etl/etl.service.js";

const createPipelineSchema = {
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    sourceFormat: z.enum(["CSV", "JSON", "XML", "SQL"]),
    sourceConfig: z.record(z.any()),
    mappingSchema: z.array(
      z.object({
        sourceColumn: z.string().min(1),
        targetColumn: z.string().min(1),
        type: z.string(),
        transformRule: z.string().optional(),
      })
    ),
    cronSchedule: z.string().optional(),
  }),
};

export function registerEtlRoutes(router: Router) {
  router.use(authenticate);

  router.get("/etl/pipelines", async (req, res, next) => {
    try {
      const data = await EtlService.listPipelines(req.user!.organizationId!);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/etl/pipelines", validate(createPipelineSchema), async (req, res, next) => {
    try {
      const data = await EtlService.createPipeline(req.user!.organizationId!, req.user!.id, req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/etl/pipelines/:id/run", async (req, res, next) => {
    try {
      const data = await EtlService.triggerRun(req.user!.organizationId!, req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/etl/pipelines/:id/runs", async (req, res, next) => {
    try {
      const data = await EtlService.listRuns(req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
