import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { EtlService } from "../../etl/etl.service.js";

const pipelineId = z.object({ id: z.string().min(1).max(64) });

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
  const oid = (req: any) => req.user!.organizationId!;

  router.get("/etl/pipelines", async (req, res, next) => {
    try {
      const data = await EtlService.listPipelines(oid(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/etl/pipelines", validate(createPipelineSchema), async (req, res, next) => {
    try {
      const data = await EtlService.createPipeline(oid(req), req.user!.id, req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Run accepts an optional inline payload (content) for upload sources.
  router.post("/etl/pipelines/:id/run", validate({ params: pipelineId, body: z.object({ content: z.string().max(5_000_000).optional() }).optional() }), async (req, res, next) => {
    try {
      const data = await EtlService.triggerRun(oid(req), req.params.id, req.body ?? undefined);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/etl/pipelines/:id/runs", validate({ params: pipelineId }), async (req, res, next) => {
    try {
      const data = await EtlService.listRuns(req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/etl/pipelines/:id/runs/:runId", validate({ params: pipelineId.extend({ runId: z.string().min(1).max(64) }) }), async (req, res, next) => {
    try {
      const data = await EtlService.getRun(req.params.id, req.params.runId);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Run not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/etl/pipelines/:id/dlq", validate({ params: pipelineId }), async (req, res, next) => {
    try {
      const data = await EtlService.listDlq(oid(req), req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/etl/pipelines/:id", validate({ params: pipelineId }), async (req, res, next) => {
    try {
      await EtlService.deletePipeline(oid(req), req.params.id);
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
