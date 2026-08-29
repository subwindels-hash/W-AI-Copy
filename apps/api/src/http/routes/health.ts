/**
 * Health + Prometheus metrics routes (Session 17 — DevOps & Production).
 *
 *  GET /health          → liveness (status ok/degraded, db+cache ping, 200/503)
 *  GET /health/deep     → readiness (db+cache+uptime+memory+version, longer timeout)
 *  GET /metrics         → Prometheus 0.0.4 text exposition format (no auth — restrict by network)
 */
import type { Router } from "express";
import { prisma } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { Metrics, MetricsPrometheus } from "../../observability/metrics.js";

async function checkDb(): Promise<{ status: "ok" | "error"; latencyMs?: number; error?: string }> {
  const t0 = performance.now();
  try { await prisma.$queryRaw`SELECT 1`; return { status: "ok", latencyMs: Math.round(performance.now() - t0) }; }
  catch (e: any) { return { status: "error", error: e.message }; }
}
async function checkCache(): Promise<{ status: "ok" | "error"; latencyMs?: number; error?: string }> {
  const t0 = performance.now();
  try { if (redis.status !== "ready") await redis.connect(); await redis.ping(); return { status: "ok", latencyMs: Math.round(performance.now() - t0) }; }
  catch (e: any) { return { status: "error", error: e.message }; }
}

export function registerHealthRoutes(router: Router) {
  // Background dependency health probe every 15s to keep gauges fresh for /metrics scrapes.
  let lastDb: Awaited<ReturnType<typeof checkDb>> = { status: "error" };
  let lastCache: Awaited<ReturnType<typeof checkCache>> = { status: "error" };
  async function probe() {
    [lastDb, lastCache] = await Promise.all([checkDb(), checkCache()]);
    Metrics.gauge("windels_db_up", lastDb.status === "ok" ? 1 : 0);
    Metrics.gauge("windels_redis_up", lastCache.status === "ok" ? 1 : 0);
    if (lastDb.latencyMs != null) Metrics.timing("windels_db_ping_ms", lastDb.latencyMs);
    if (lastCache.latencyMs != null) Metrics.timing("windels_redis_ping_ms", lastCache.latencyMs);
  }
  probe();
  setInterval(probe, 15_000).unref?.();

  router.get("/health", async (_req, res) => {
    const [db, cache] = await Promise.all([checkDb(), checkCache()]);
    lastDb = db; lastCache = cache;
    const status = db.status === "ok" && cache.status === "ok" ? "ok" : "degraded";
    res.status(status === "ok" ? 200 : 503).json({
      ok: true,
      data: {
        service: "windels-api",
        status,
        version: process.env.npm_package_version ?? "0.1.0",
        timestamp: new Date().toISOString(),
        checks: { db: db.status === "ok" ? "ok" : db.error, cache: cache.status === "ok" ? "ok" : cache.error },
      },
    });
  });

  router.get("/health/deep", async (_req, res) => {
    const [db, cache] = await Promise.all([checkDb(), checkCache()]);
    lastDb = db; lastCache = cache;
    const mem = process.memoryUsage();
    const status = db.status === "ok" && cache.status === "ok" ? "ok" : "degraded";
    res.status(status === "ok" ? 200 : 503).json({
      ok: true,
      data: {
        service: "windels-api",
        status,
        version: process.env.npm_package_version ?? "0.1.0",
        commit: process.env.GIT_COMMIT ?? null,
        environment: process.env.NODE_ENV ?? "development",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        pid: process.pid,
        nodeVersion: process.version,
        memory: {
          rssBytes: mem.rss,
          heapUsedBytes: mem.heapUsed,
          heapTotalBytes: mem.heapTotal,
          externalBytes: mem.external,
        },
        checks: {
          db: { ...db },
          cache: { ...cache },
        },
      },
    });
  });

  // Prometheus / OpenMetrics exposition. Not auth-gated — expose on an internal network only.
  router.get("/metrics", (_req, res) => {
    try {
      const body = MetricsPrometheus();
      res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
      res.send(body);
    } catch (e: any) {
      res.status(500).send(`# error collecting metrics: ${e.message}\n`);
    }
  });
}
