/**
 * Session 43 — Hybrid AI Execution routes.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { HybridExecService } from "../../hybridExec/hybridExec.service.js";

const route = z.object({ modality: z.string(), requiredVramMb: z.number().int().positive(), safetyCritical: z.boolean().optional(), costOptimize: z.boolean().optional() });
const reg = z.object({ name: z.string(), modality: z.enum(["text","image","audio","video","speech","multimodal","embedding"]), size: z.string(), quant: z.string(), vramMb: z.number().int().positive(), provider: z.enum(["self-hosted","connected-enterprise"]) });
const canary = z.object({ pct: z.number().min(0).max(100) });

export function registerHybridExecRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await HybridExecService.dashboard() }); } catch (e) { next(e); }
  });
  router.get("/models", async (req, res, next) => {
    try { res.json({ ok: true, data: await HybridExecService.models(req.query.status as any) }); } catch (e) { next(e); }
  });
  router.post("/models", validate({ body: reg }), async (req, res, next) => {
    try { res.json({ ok: true, data: await HybridExecService.registerModel(req.body) }); } catch (e) { next(e); }
  });
  router.post("/models/:id/canary", validate({ body: canary }), async (req, res, next) => {
    try { res.json({ ok: true, data: await HybridExecService.promoteCanary(req.params.id, req.body.pct) }); } catch (e) { next(e); }
  });
  router.post("/models/:id/rollback", async (req, res, next) => {
    try { res.json({ ok: true, data: await HybridExecService.rollback(req.params.id) }); } catch (e) { next(e); }
  });
  router.get("/nodes", async (_req, res, next) => {
    try { res.json({ ok: true, data: await HybridExecService.listNodes() }); } catch (e) { next(e); }
  });
  router.post("/route", validate({ body: route }), async (req, res, next) => {
    try { res.json({ ok: true, data: await HybridExecService.routeRequest(req.body) }); } catch (e) { next(e); }
  });
}
