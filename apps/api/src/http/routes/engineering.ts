/**
 * Engineering observability routes (Session 26: Engineering Metrics, Slices 211–215).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { MetricsService } from "../../engineering/metrics.service.js";
import { DeploymentService } from "../../engineering/deployments.service.js";
import { TechDebtService } from "../../engineering/techDebt.service.js";
import { PipelineService } from "../../engineering/pipeline.service.js";
import { ProductivityService } from "../../engineering/productivity.service.js";

const deployBody = z.object({
  service: z.string().min(2).max(60),
  version: z.string().min(2).max(40),
  environment: z.enum(["dev","staging","canary","production"]).optional(),
  status: z.enum(["success","failed","rolled_back","in_progress"]).optional(),
  triggeredBy: z.string().max(60).optional(),
  durationMs: z.number().int().min(1000).max(10_000_000).optional(),
});
const debtBody = z.object({
  title: z.string().min(3).max(200),
  category: z.enum(["code","tests","docs","security","performance","architecture","dependency"]).optional(),
  severity: z.enum(["critical","high","medium","low"]).optional(),
  area: z.string().max(60).optional(),
  owner: z.string().max(80).optional(),
  estimatedEffortHours: z.number().int().min(1).max(500).optional(),
  churnScore: z.number().int().min(0).max(100).optional(),
});
const debtStatusBody = z.object({ status: z.enum(["open","in_progress","resolved","accepted"]) });

export function registerEngineeringRoutes(router: Router) {
  // ─── Metrics (211) ────────────────────────────────────
  router.get("/metrics/services", async (_req, res, next) => {
    try { res.json({ ok: true, data: await MetricsService.list() }); } catch (e) { next(e); }
  });
  router.get("/metrics/services/:id", async (req, res, next) => {
    try {
      const s = await MetricsService.get(req.params.id);
      if (!s) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  router.get("/metrics/services/:id/timeseries", async (req, res, next) => {
    try {
      const metric = (req.query.metric as string) || "latency_p95";
      const points = Math.min(Number(req.query.points ?? 60), 240);
      const ts = await MetricsService.timeseries(
        req.params.id,
        metric as any,
        points,
      );
      res.json({ ok: true, data: ts });
    } catch (e) { next(e); }
  });

  // ─── Deployments (212) ────────────────────────────────
  router.get("/deployments", async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      res.json({ ok: true, data: await DeploymentService.list(limit) });
    } catch (e) { next(e); }
  });
  router.post("/deployments", validate({ body: deployBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await DeploymentService.record(req.body) }); } catch (e) { next(e); }
  });
  router.get("/deployments/analytics", async (_req, res, next) => {
    try { res.json({ ok: true, data: await DeploymentService.analytics() }); } catch (e) { next(e); }
  });

  // ─── Tech Debt (213) ──────────────────────────────────
  router.get("/tech-debt", async (_req, res, next) => {
    try { res.json({ ok: true, data: await TechDebtService.list() }); } catch (e) { next(e); }
  });
  router.post("/tech-debt", validate({ body: debtBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await TechDebtService.create(req.body) }); } catch (e) { next(e); }
  });
  router.get("/tech-debt/summary", async (_req, res, next) => {
    try { res.json({ ok: true, data: await TechDebtService.summary() }); } catch (e) { next(e); }
  });
  router.post("/tech-debt/:id/status", validate({ body: debtStatusBody }), async (req, res, next) => {
    try {
      const d = await TechDebtService.setStatus(req.params.id, req.body.status);
      if (!d) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: d });
    } catch (e) { next(e); }
  });

  // ─── Pipeline (214) ───────────────────────────────────
  router.get("/pipelines", async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      res.json({ ok: true, data: await PipelineService.list(limit) });
    } catch (e) { next(e); }
  });
  // Records a real CI run. This used to accept an empty body and mint a
  // fabricated build (random pipeline, 78% pass roll, random author) that then
  // fed the CI analytics — so the endpoint is now validated.
  router.post("/pipelines/record", validate({ body: z.object({
    pipeline: z.string().min(1).max(120),
    status: z.enum(["passed","failed","canceled","running"]),
    durationMs: z.number().int().min(0),
    branch: z.string().max(200).optional(),
    commitSha: z.string().max(64).optional(),
    author: z.string().max(120).optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    flaky: z.boolean().optional(),
    stages: z.array(z.object({
      name: z.string().min(1).max(80),
      durationMs: z.number().int().min(0),
      status: z.enum(["passed","failed","canceled","running"]),
    })).max(50).optional(),
  }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await PipelineService.record(req.body) }); } catch (e) { next(e); }
  });
  router.get("/pipelines/analytics", async (_req, res, next) => {
    try { res.json({ ok: true, data: await PipelineService.analytics() }); } catch (e) { next(e); }
  });

  // ─── Productivity (215) ───────────────────────────────
  router.get("/productivity/developers", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ProductivityService.list() }); } catch (e) { next(e); }
  });
  router.get("/productivity/summary", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ProductivityService.summary() }); } catch (e) { next(e); }
  });

  // ─── Aggregate dashboard ──────────────────────────────
  router.get("/dashboard", async (_req, res, next) => {
    try {
      const [services, deployments, debt, pipelines, productivity] = await Promise.all([
        MetricsService.list(),
        DeploymentService.analytics(),
        TechDebtService.summary(),
        PipelineService.analytics(),
        ProductivityService.summary(),
      ]);
      res.json({
        ok: true,
        data: { services, deployments, debt, pipelines, productivity },
      });
    } catch (e) { next(e); }
  });
}
