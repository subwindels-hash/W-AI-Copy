/**
 * Session 21 additions to Platform routes — Infrastructure.
 *
 * Mounted at /api/v1/platform/infra* (and sub-paths) in server.ts after
 * importing this file. We extend the existing platformRouter so we don't
 * duplicate imports; registerPlatformRoutes is augmented here.
 *
 * Exposes:
 *  GET    /platform/infra/overview          Aggregate dashboard
 *  GET    /platform/infra/cluster           Cluster status
 *  GET    /platform/infra/nodes             Node list with usage
 *  GET    /platform/infra/workloads         Workloads (deployments/statefulsets/etc)
 *  GET    /platform/infra/pods              Pod list (filter ns/workload)
 *  GET    /platform/infra/metrics/series    Recent infra metrics
 *  GET    /platform/infra/alerts            Firing alerts
 *
 *  GET    /platform/iac/stacks
 *  POST   /platform/iac/stacks/:id/run      { kind: plan|apply }
 *  POST   /platform/iac/stacks/:id/drift    { drifted: boolean }
 *  GET    /platform/iac/runs                Recent runs
 *
 *  GET    /platform/releases                List releases
 *  POST   /platform/releases/deploy
 *  GET    /platform/releases/bg/:env/:svc
 *  POST   /platform/releases/bg/:env/:svc/stage
 *  POST   /platform/releases/bg/:env/:svc/swap
 *  GET    /platform/releases/canary/:env/:svc
 *  POST   /platform/releases/canary/:env/:svc/start
 *  POST   /platform/releases/canary/:env/:svc/weight
 *
 *  GET    /platform/regions
 *  GET    /platform/regions/:id
 *  POST   /platform/regions/:id
 *  POST   /platform/regions/refresh
 *  POST   /platform/regions/failover
 *  GET    /platform/regions/failover
 *
 *  GET    /platform/optimization/recommendations
 *  POST   /platform/optimization/generate
 *  POST   /platform/optimization/:id/:status
 *  GET    /platform/optimization/cost
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ClusterService } from "../../platform/cluster.service.js";
import { IaCService } from "../../platform/iac.service.js";
import { ReleaseService } from "../../platform/release.service.js";
import { RegionService } from "../../platform/region.service.js";
import { InfraMetricsService } from "../../platform/infraMetrics.service.js";
import { OptimizationService } from "../../platform/optimization.service.js";

const StratEnum = z.enum(["rolling","blue-green","canary","recreate"]);
const EnvEnum = z.enum(["dev","staging","prod","eu","ap"]);
const SvcEnum = z.enum(["api","web","desktop-updater","all"]);

export function registerInfrastructureRoutes(router: Router) {
  // NOTE: the parent platformRouter already has authenticate applied.

  // ── Slice 177/183: Cluster & metrics ──────────────────────────────
  router.get("/infra/overview", async (_req, res, next) => {
    try {
      await ClusterService.probe();
      await RegionService.refreshHealth();
      const [cluster, nodes, workloads, alerts, regions, recsSavings, cost, releases] = await Promise.all([
        ClusterService.getCluster(), ClusterService.listNodes(), ClusterService.listWorkloads(),
        InfraMetricsService.alerts(), RegionService.list(),
        OptimizationService.savings(), OptimizationService.getCost(),
        ReleaseService.list({ status: "deployed" }),
      ]);
      const ready = workloads.filter((w) => w.availableReplicas >= w.desiredReplicas).length;
      res.json({
        ok: true,
        data: {
          clusters: [cluster], primaryRegion: "na-east-1",
          regionsOnline: regions.filter((r) => r.status === "online").length, regionsTotal: regions.length,
          deployments: workloads.length, deploymentsReady: ready,
          activeReleases: releases.length, openEscalations: alerts.filter((a) => a.severity === "crit").length,
          openRecommendations: recsSavings.open,
          estimatedMonthlySavingsUsd: recsSavings.totalUsd,
          totalMonthlyCostUsd: cost.totalUsd, updatedAt: new Date().toISOString(),
        },
      });
    } catch (e) { next(e); }
  });

  router.get("/infra/cluster", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ClusterService.probe() }); } catch (e) { next(e); }
  });
  router.get("/infra/nodes", async (_req, res, next) => {
    try { res.json({ ok: true, data: { nodes: await ClusterService.listNodes() } }); } catch (e) { next(e); }
  });
  router.get("/infra/workloads", async (_req, res, next) => {
    try { res.json({ ok: true, data: { workloads: await ClusterService.listWorkloads() } }); } catch (e) { next(e); }
  });
  router.get("/infra/pods", async (req, res, next) => {
    try {
      res.json({ ok: true, data: { pods: await ClusterService.listPods({ namespace: req.query.ns as string, workload: req.query.workload as string }) } });
    } catch (e) { next(e); }
  });
  router.get("/infra/metrics/series", async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 60), 240);
      res.json({ ok: true, data: { points: await InfraMetricsService.series(limit) } });
    } catch (e) { next(e); }
  });
  router.get("/infra/alerts", async (_req, res, next) => {
    try { res.json({ ok: true, data: { alerts: await InfraMetricsService.alerts() } }); } catch (e) { next(e); }
  });

  // ── Slice 178: IaC ───────────────────────────────────────────────
  router.get("/iac/stacks", async (_req, res, next) => {
    try { res.json({ ok: true, data: { stacks: await IaCService.list() } }); } catch (e) { next(e); }
  });
  router.post("/iac/stacks/:id/run", validate({ body: z.object({ kind: z.enum(["plan","apply"]), triggeredBy: z.string().default("web") }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await IaCService.run(req.params.id, req.body.kind, req.body.triggeredBy) }); }
    catch (e) { next(e); }
  });
  router.post("/iac/stacks/:id/drift", validate({ body: z.object({ drifted: z.boolean() }) }), async (req, res, next) => {
    try {
      const s = await IaCService.markDrift(req.params.id, req.body.drifted);
      if (!s) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  // Intake for a run executed by the real IaC tool. `run` only queues; without
  // this the run would sit queued rather than reporting a fabricated diff.
  router.post("/iac/runs/:runId/result", validate({ body: z.object({
    status: z.enum(["succeeded","failed","cancelled"]),
    summary: z.object({
      add: z.number().int().min(0),
      change: z.number().int().min(0),
      destroy: z.number().int().min(0),
    }).optional(),
    resources: z.number().int().min(0).optional(),
    driftDetected: z.boolean().optional(),
  }) }), async (req, res, next) => {
    try {
      const r = await IaCService.recordRun(req.params.runId, req.body);
      if (!r) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Run not found" } });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.get("/iac/runs", async (req, res, next) => {
    try { res.json({ ok: true, data: { runs: await IaCService.listRuns(req.query.stackId as string) } }); } catch (e) { next(e); }
  });

  // ── Slices 179/180/181: Releases + Blue/Green + Canary ───────────
  router.get("/releases", async (req, res, next) => {
    try {
      res.json({ ok: true, data: { releases: await ReleaseService.list({
        environment: req.query.env as any, service: req.query.svc as any, status: req.query.status as any,
      }) } });
    } catch (e) { next(e); }
  });
  router.post("/releases/deploy", validate({ body: z.object({
    environment: EnvEnum, service: SvcEnum, version: z.string().min(3),
    strategy: StratEnum.default("rolling"), author: z.string().default("web"),
    commitSha: z.string().optional(), changelog: z.string().optional(),
  }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await ReleaseService.deploy(req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/releases/bg/:env/:svc", async (req, res, next) => {
    try { res.json({ ok: true, data: await ReleaseService.bgGet(req.params.env, req.params.svc) }); } catch (e) { next(e); }
  });
  router.post("/releases/bg/:env/:svc/stage", validate({ body: z.object({ version: z.string().min(3) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ReleaseService.bgStage(req.params.env, req.params.svc, req.body.version) }); }
    catch (e) { next(e); }
  });
  router.post("/releases/bg/:env/:svc/swap", async (req, res, next) => {
    try { res.json({ ok: true, data: await ReleaseService.bgSwap(req.params.env, req.params.svc) }); }
    catch (e) { next(e); }
  });
  router.get("/releases/canary/:env/:svc", async (req, res, next) => {
    try { res.json({ ok: true, data: await ReleaseService.canaryGet(req.params.env, req.params.svc) }); } catch (e) { next(e); }
  });
  router.post("/releases/canary/:env/:svc/start", validate({ body: z.object({ version: z.string().min(3) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ReleaseService.canaryStart(req.params.env, req.params.svc, req.body.version) }); }
    catch (e) { next(e); }
  });
  router.post("/releases/canary/:env/:svc/weight", validate({ body: z.object({ weight: z.number().min(0).max(100) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ReleaseService.canarySetWeight(req.params.env, req.params.svc, req.body.weight) }); }
    catch (e) { next(e); }
  });

  // ── Slice 182: Multi-Region (infrastructure-managed cluster regions, separate from the Session-15 edge regions at /platform/regions) ──
  router.get("/regions-mgmt", async (_req, res, next) => {
    try { await RegionService.refreshHealth(); res.json({ ok: true, data: { regions: await RegionService.list() } }); }
    catch (e) { next(e); }
  });
  router.get("/regions-mgmt/:id", async (req, res, next) => {
    try {
      const r = await RegionService.get(req.params.id);
      if (!r) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.post("/regions-mgmt/refresh", async (_req, res, next) => {
    try { await RegionService.refreshHealth(); res.json({ ok: true, data: { refreshed: true } }); } catch (e) { next(e); }
  });
  router.post("/regions-mgmt/failover", validate({ body: z.object({
    fromRegion: z.string(), toRegion: z.string(), reason: z.string().min(1), triggeredBy: z.string().default("web"),
  }) }), async (req, res, next) => {
    try {
      const fo = await RegionService.failover(req.body.fromRegion, req.body.toRegion, req.body.reason, req.body.triggeredBy);
      res.status(201).json({ ok: true, data: fo });
    } catch (e) { next(e); }
  });
  router.get("/regions-mgmt/failover", async (_req, res, next) => {
    try { res.json({ ok: true, data: await RegionService.getActiveFailover() }); } catch (e) { next(e); }
  });

  // ── Slice 184: Optimization ──────────────────────────────────────
  router.get("/optimization/recommendations", async (req, res, next) => {
    try {
      res.json({ ok: true, data: { recommendations: await OptimizationService.list({
        status: req.query.status as any, severity: req.query.severity as any, kind: req.query.kind as any,
      }) } });
    } catch (e) { next(e); }
  });
  router.post("/optimization/generate", async (_req, res, next) => {
    try { res.json({ ok: true, data: { added: await OptimizationService.generate() } }); } catch (e) { next(e); }
  });
  router.post("/optimization/:id/:status", async (req, res, next) => {
    try {
      const r = await OptimizationService.setStatus(req.params.id, req.params.status as any);
      if (!r) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.get("/optimization/cost", async (_req, res, next) => {
    try { res.json({ ok: true, data: await OptimizationService.getCost() }); } catch (e) { next(e); }
  });
}
