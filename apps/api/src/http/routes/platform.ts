import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { Metrics } from "../../observability/metrics.js";
import { snapshotRing } from "../../observability/logger.js";
import { recentTraces, getTrace, getSpanById } from "../../observability/tracer.js";
import * as aiObs from "../../observability/aiObservability.js";
import * as regions from "../../services/regions.service.js";
import * as cdn from "../../services/cdn.service.js";
import { Permission } from "@prisma/client";
import * as perm from "../../services/permissions.service.js";
import { AppError } from "../../utils/result.js";
import { registerInfrastructureRoutes } from "./infrastructure.js";

export function registerPlatformRoutes(router: Router) {
  router.use(authenticate);
  // Require admin (ORG_ADMIN) for platform endpoints.
  router.use(async (req, res, next) => {
    try {
      if (!(await perm.hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        throw AppError.forbidden("Admins only");
      }
      next();
    } catch (e) { next(e); }
  });

  // ─── Metrics ──────────────────────────────────────────
  router.get("/metrics", (_req, res) => {
    res.json({ ok: true, data: Metrics.snapshot() });
  });

  // ─── Logs ─────────────────────────────────────────────
  router.get("/logs", validate({ query: z.object({ level: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(), limit: z.coerce.number().min(1).max(500).optional(), search: z.string().optional() }) }), (req, res) => {
    const entries = snapshotRing({
      level: req.query.level as any,
      limit: Number(req.query.limit ?? 200),
      search: req.query.search as string | undefined,
    });
    res.json({ ok: true, data: entries });
  });

  // ─── Traces ───────────────────────────────────────────
  router.get("/traces", validate({ query: z.object({ limit: z.coerce.number().min(1).max(200).optional() }) }), (req, res) => {
    res.json({ ok: true, data: recentTraces(Number(req.query.limit ?? 50)) });
  });
  router.get("/traces/:traceId", (req, res) => {
    const spans = getTrace(req.params.traceId);
    if (!spans.length) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "trace not found" } });
    res.json({ ok: true, data: spans });
  });
  router.get("/spans/:spanId", (req, res) => {
    const s = getSpanById(req.params.spanId);
    if (!s) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "span not found" } });
    res.json({ ok: true, data: s });
  });

  // ─── AI Observability ────────────────────────────────
  router.get("/ai-observability", validate({ query: z.object({ minutes: z.coerce.number().min(5).max(60 * 24 * 7).optional() }) }), async (req, res, next) => {
    try {
      const minutes = Number(req.query.minutes ?? 60);
      res.json({ ok: true, data: await aiObs.getAiObservability(req.user!.id, minutes) });
    } catch (e) { next(e); }
  });

  // ─── Regions ─────────────────────────────────────────
  router.get("/regions", async (_req, res, next) => {
    try { res.json({ ok: true, data: await regions.listRegions() }); } catch (e) { next(e); }
  });
  router.get("/dr", async (_req, res, next) => {
    try { res.json({ ok: true, data: await regions.getDisasterRecoveryReport() }); } catch (e) { next(e); }
  });
  router.post("/failover", validate({ body: z.object({ toRegion: z.string().min(1), reason: z.string().min(1).max(500) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await regions.triggerFailover(req.body.toRegion, req.body.reason, req.user!.id) }); }
    catch (e) { next(e); }
  });
  router.delete("/failover", async (req, res, next) => {
    try { res.json({ ok: true, data: await regions.clearFailover(req.user!.id) }); }
    catch (e) { next(e); }
  });

  // ─── CDN ──────────────────────────────────────────────
  router.get("/cdn", (_req, res) => res.json({ ok: true, data: cdn.getCdnConfig() }));
  router.put("/cdn/rules", validate({ body: z.object({ rules: z.array(z.object({
    pathPattern: z.string(), ttlSeconds: z.number().int().min(0).max(31536000),
    staleWhileRevalidate: z.number().int().min(0).max(86400).default(0),
    cacheKeyIncludes: z.array(z.string()).default([]), enabled: z.boolean(),
  })) }) }), (req, res) => {
    res.json({ ok: true, data: cdn.updateCdnRules(req.body.rules) });
  });
  router.post("/cdn/purge", validate({ body: z.object({ paths: z.array(z.string()).min(1).max(500) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await cdn.purgeCache(req.body.paths) }); }
    catch (e) { next(e); }
  });
  router.post("/cdn/sign-url", validate({ body: z.object({ url: z.string(), ttlSeconds: z.number().int().min(60).max(7 * 86400).optional() }) }), (req, res) => {
    res.json({ ok: true, data: { signedUrl: cdn.signUrl(req.body.url, req.body.ttlSeconds) } });
  });

  // ─── Observability overview ──────────────────────────
  router.get("/overview", async (_req, res, next) => {
    try {
      const [regs, dr, metrics, traces, logs] = await Promise.all([
        regions.listRegions(),
        regions.getDisasterRecoveryReport(),
        Promise.resolve(Metrics.snapshot()),
        Promise.resolve(recentTraces(10)),
        Promise.resolve(snapshotRing({ level: "warn", limit: 20 })),
      ]);
      res.json({ ok: true, data: { regions: regs, dr, metrics: { counters: metrics.counters, gauges: metrics.gauges, histograms: metrics.histograms }, recentTraces: traces, recentWarns: logs } });
    } catch (e) { next(e); }
  });

  // ── Session 21 — Enterprise Infrastructure (K8s/IaC/Releases/BG/Canary/Regions/Optimization) ──
  registerInfrastructureRoutes(router);
}
