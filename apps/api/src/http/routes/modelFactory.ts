/**
 * Session 46 — Enterprise AI Model Factory routes.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ModelFactoryService } from "../../modelFactory/modelFactory.service.js";

const create = z.object({
  name: z.string(),
  builder: z.enum(["slm","llm","vision","speech","audio","multimodal","domain"]),
  size: z.string(), quant: z.string(), vramMb: z.number().int().positive(),
  baseModelId: z.string().optional(), stage: z.enum(["research","benchmarking","validation","approval","canary","deployed","monitoring","retired"]).optional(),
});
const advance = z.object({ to: z.enum(["research","benchmarking","validation","approval","canary","deployed","monitoring","retired"]) });
const bench = z.object({ benchmark: z.string().min(1).max(120), score: z.number().min(0).max(100), pass: z.boolean() });
const finetune = z.object({ dataset: z.string(), method: z.enum(["supervised","rlhf","dpo","lora","qlora"]) });

export function registerModelFactoryRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.dashboard() }); } catch (e) { next(e); }
  });
  router.get("/models", async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.listModels(req.query.stage as any) }); } catch (e) { next(e); }
  });
  router.post("/models", validate({ body: create }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.createModel(req.body) }); } catch (e) { next(e); }
  });
  router.post("/models/:id/advance", validate({ body: advance }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.advanceStage(req.params.id, req.body.to) }); } catch (e) { next(e); }
  });
  router.post("/models/:id/benchmark", validate({ body: bench }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.runBenchmark(req.params.id, req.body.benchmark, { score: req.body.score, pass: req.body.pass }) }); } catch (e) { next(e); }
  });
  router.post("/models/:id/safety", validate({ body: z.object({ passed: z.boolean() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.approveSafety(req.params.id, req.body.passed) }); } catch (e) { next(e); }
  });
  router.post("/models/:id/governance-approve", async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.approveGovernance(req.params.id) }); } catch (e) { next(e); }
  });
  router.get("/fine-tunes", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.listFineTunes() }); } catch (e) { next(e); }
  });
  router.post("/fine-tunes", validate({ body: finetune }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.startFineTune(req.body.modelId ?? req.params.modelId, req.body.dataset, req.body.method) }); } catch (e) { next(e); }
  });
}
