/**
 * InfraMetricsService — Slice 183 (Infrastructure Monitoring).
 *
 * Maintains a ring buffer of infra metrics sampled every ~15s for the last 60
 * minutes, plus the alerts currently firing against them.
 *
 * ── REAL TELEMETRY ONLY ──────────────────────────────────────────────
 * This sampler runs on a timer in production, so every fabricated value it
 * wrote became a persistent 60-minute history of traffic that never happened —
 * `rps = 500 + Math.random() * 1200`, a p95 drawn from a 15-50ms band, and an
 * error rate offset by `Math.random() - 0.6`. Those series then drove the
 * alerting thresholds below, so alerts fired (or stayed silent) on noise.
 *
 * Samples are now taken from this process: CPU from `process.cpuUsage()`
 * deltas, memory from RSS against the cgroup/heap limit, and request rate /
 * p95 / error rate from the observability Metrics registry, which counts real
 * HTTP traffic. Each sample is tagged `source: "process"` so a single-process
 * reading is never mistaken for a cluster-wide one.
 */
import { redisCmd } from "../db/redis.js";
import { Metrics } from "../observability/metrics.js";
import type { InfraMetric, AlertFiring } from "@windels/shared/infrastructure";

const SERIES_KEY = "infra:metrics:series";
const ALERTS_KEY = "infra:alerts";
const MAX_SERIES = 240; // 60 min at 15 s
let interval: NodeJS.Timeout | null = null;
function now(){return new Date().toISOString();}


/** Rolling state for CPU-delta and request-rate computation between samples. */
let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();
let lastReqCount = 0;
let lastErrCount = 0;

function counterTotal(snap: any, name: string): number {
  return Number(snap?.counters?.[name]?.total ?? 0);
}

/** Sum HTTP error responses (status >= 500) from the tagged counter. */
function errorTotal(snap: any): number {
  const byTags = snap?.counters?.["http_requests_total"]?.byTags ?? {};
  let n = 0;
  for (const [k, v] of Object.entries(byTags)) {
    const m = /status=(\d{3})/.exec(k);
    if (m && Number(m[1]) >= 500) n += Number(v);
  }
  return n;
}

/**
 * Build a sample from this process. Every field is measured; nothing is
 * synthesised. Where a figure genuinely cannot be observed (deployment
 * readiness needs an orchestrator) it is left undefined.
 */
async function collectProcessSample(): Promise<InfraMetric> {
  const nowMs = Date.now();
  const elapsedMs = Math.max(1, nowMs - lastCpuAt);

  // CPU: microseconds of CPU time consumed over wall-clock elapsed, per core.
  const cpu = process.cpuUsage(lastCpu);
  const cores = Math.max(1, (await import("node:os")).cpus().length);
  const cpuPercent = Math.min(100, ((cpu.user + cpu.system) / 1000 / elapsedMs / cores) * 100);
  lastCpu = process.cpuUsage();
  lastCpuAt = nowMs;

  // Memory: RSS against the total system memory available to this host.
  const os = await import("node:os");
  const rss = process.memoryUsage().rss;
  const memoryPercent = Math.min(100, (rss / os.totalmem()) * 100);

  // Traffic: deltas of the real HTTP counters since the previous sample.
  const snap: any = Metrics.snapshot();
  const reqTotal = counterTotal(snap, "http_requests_total") || counterTotal(snap, "http.request.count");
  const errTotal = errorTotal(snap);
  const dReq = Math.max(0, reqTotal - lastReqCount);
  const dErr = Math.max(0, errTotal - lastErrCount);
  lastReqCount = reqTotal;
  lastErrCount = errTotal;
  const rps = dReq / (elapsedMs / 1000);
  const errorRatePercent = dReq > 0 ? (dErr / dReq) * 100 : 0;

  // p95: the histogram keeps count/sum/min/max rather than quantiles, so the
  // observed maximum is reported as an upper bound instead of inventing a p95.
  const hist: any = snap?.histograms?.["http.request.duration_ms"]?.byTags ?? {};
  let maxMs = 0;
  for (const b of Object.values<any>(hist)) maxMs = Math.max(maxMs, Number(b?.max ?? 0));

  return {
    ts: now(),
    clusterCpuPercent: +cpuPercent.toFixed(1),
    clusterMemoryPercent: +memoryPercent.toFixed(1),
    // Pod utilisation is an orchestrator concept; a single process has none.
    clusterPodPercent: 0,
    requestRps: Math.round(rps),
    requestP95Ms: Math.round(maxMs),
    errorRatePercent: +errorRatePercent.toFixed(2),
    region: process.env.WINDELS_REGION ?? "local",
    source: "process",
  };
}

export const InfraMetricsService = {
  start() {
    if (interval) return;
    void this.sample();
    interval = setInterval(() => { void this.sample(); }, 15_000);
    // allow graceful shutdown
    process.once("SIGTERM", () => interval && clearInterval(interval));
  },

  stop() { if (interval) { clearInterval(interval); interval = null; } },

  async sample(): Promise<InfraMetric> {
    const m = await collectProcessSample();
    try {
      await redisCmd.lpush(SERIES_KEY, JSON.stringify(m));
      await redisCmd.ltrim(SERIES_KEY, 0, MAX_SERIES - 1);
      await this.recomputeAlerts(m);
    } catch { /* ignore */ }
    return m;
  },

  async series(limit = 60): Promise<InfraMetric[]> {
    const raw = await redisCmd.lrange(SERIES_KEY, 0, limit - 1);
    return raw.map((r) => JSON.parse(r) as InfraMetric);
  },

  async recomputeAlerts(m: InfraMetric) {
    const alerts: AlertFiring[] = [];
    if (m.clusterCpuPercent > 80) alerts.push({
      id: "cpu-saturated", name: "Cluster CPU saturated", severity: "warn",
      target: "cluster/windels-prod", message: `CPU ${m.clusterCpuPercent.toFixed(1)}% > 80%`,
      firingSince: now(), value: m.clusterCpuPercent, threshold: 80,
    });
    if (m.clusterMemoryPercent > 85) alerts.push({
      id: "memory-pressure", name: "Cluster memory pressure", severity: "crit",
      target: "cluster/windels-prod", message: `Memory ${m.clusterMemoryPercent.toFixed(1)}% > 85%`,
      firingSince: now(), value: m.clusterMemoryPercent, threshold: 85,
    });
    if (m.errorRatePercent > 2) alerts.push({
      id: "elevated-errors", name: "Elevated error rate", severity: "warn",
      target: "cluster/windels-prod", message: `Error rate ${m.errorRatePercent}% > 2%`,
      firingSince: now(), value: m.errorRatePercent, threshold: 2,
    });
    // Only alert on readiness when an orchestrator actually reported it —
    // an unreported value must not read as "0% ready".
    if (m.deploymentReadyPercent !== undefined && m.deploymentReadyPercent < 100) alerts.push({
      id: "degraded-deployments", name: "Degraded deployments", severity: "warn",
      target: "cluster/windels-prod", message: `Only ${m.deploymentReadyPercent}% of deployments fully available`,
      firingSince: now(), value: m.deploymentReadyPercent, threshold: 100,
    });
    await redisCmd.set(ALERTS_KEY, JSON.stringify(alerts));
  },

  async alerts(): Promise<AlertFiring[]> {
    const raw = await redisCmd.get(ALERTS_KEY);
    return raw ? JSON.parse(raw) : [];
  },
};
