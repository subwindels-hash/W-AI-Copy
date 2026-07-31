/** Session 50 — Enterprise AI Benchmark Center routes */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import BenchmarksService from "../../benchmarks/benchmarks.service.js";
import { z } from "zod";

const run = z.object({
  area: z.enum(["ai_models","ai_employees","ai_workflows","voice_models","vision_models","translation_quality","coding_performance","response_accuracy","latency","resource_consumption","cost_efficiency","safety_metrics","reliability","user_satisfaction"]),
  targetId: z.string().optional(), targetName: z.string().min(1).max(200).optional(), notes: z.string().max(1000).optional(),
  metrics: z.array(z.object({ key: z.string().min(1).max(80), label: z.string().min(1).max(120), value: z.number(), unit: z.string().max(32), higherIsBetter: z.boolean(), baseline: z.number().optional(), target: z.number().optional() })).min(1).max(50),
  overallScore: z.number().min(0).max(100), passed: z.boolean(), evaluator: z.string().min(1).max(200), evidence: z.string().min(1).max(2000),
});
const sched = z.object({
  area: z.enum(["ai_models","ai_employees","ai_workflows","voice_models","vision_models","translation_quality","coding_performance","response_accuracy","latency","resource_consumption","cost_efficiency","safety_metrics","reliability","user_satisfaction"]),
  targetId: z.string().optional(),
  cron: z.string().regex(/^[\d\-\*\/,\?\sA-Za-z]+$/).default("0 0 * * *"),
  enabled: z.boolean().default(true),
});

export function registerBenchmarksRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok: true, data: await BenchmarksService.dashboard(req.user!.organizationId!) }); } catch (e) { next(e); } });
  router.get("/runs", async (req, res, next) => { try { res.json({ ok: true, data: await BenchmarksService.listRuns(req.user!.organizationId!) }); } catch (e) { next(e); } });
  router.post("/run", validate({ body: run }), async (req, res, next) => { try { res.json({ ok: true, data: await BenchmarksService.runBenchmark({ ...req.body, organizationId: req.user!.organizationId! }) }); } catch (e) { next(e); } });
  router.post("/schedule", validate({ body: sched }), async (req, res, next) => { try { res.json({ ok: true, data: await BenchmarksService.schedule({ ...req.body, organizationId: req.user!.organizationId! }) }); } catch (e) { next(e); } });
}
