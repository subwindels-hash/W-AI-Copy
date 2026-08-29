import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { EtlService } from "../../etl/etl.service.js";
// Request contracts live in @windels/shared so the API and the web client
// validate against one definition instead of three hand-copied ones.
import {
  CreateEtlPipelineSchema,
  TriggerEtlRunSchema,
  EtlPipelineIdSchema,
  EtlRunIdSchema,
} from "@windels/shared/etl";

const pipelineId = EtlPipelineIdSchema;

const createPipelineSchema = { body: CreateEtlPipelineSchema };

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
  router.post("/etl/pipelines/:id/run", validate({ params: pipelineId, body: TriggerEtlRunSchema.optional() }), async (req, res, next) => {
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

  router.get("/etl/pipelines/:id/runs/:runId", validate({ params: EtlRunIdSchema }), async (req, res, next) => {
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
