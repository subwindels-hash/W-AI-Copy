/**
 * InfraMetricsService — Slice 183 (Infrastructure Monitoring).
 *
 * Maintains a ring buffer of cluster-wide infra metrics (CPU/memory/pod
 * utilisation, RPS, p95 latency, error rate, deployment ready %) sampled
 * every ~15s for the last 60 minutes; plus a list of currently firing
 * infra alerts derived from thresholds.
 */
import { redisCmd } from "../db/redis.js";
import { ClusterService } from "./cluster.service.js";
import type { InfraMetric, AlertFiring } from "@windels/shared/infrastructure";

const SERIES_KEY = "infra:metrics:series";
const ALERTS_KEY = "infra:alerts";
const MAX_SERIES = 240; // 60 min at 15 s
let interval: NodeJS.Timeout | null = null;
function now(){return new Date().toISOString();}

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
    await ClusterService.seed();
    const c = await ClusterService.probe();
    // Simulate traffic metrics
    const rps = 1100 + c.cpuPercent * 5;
    const p95 = 32 + (c.memoryPercent > 80 ? 40 : 0);
    const errRate = Math.max(0, (c.cpuPercent > 85 ? 2 : 0.1));
    const readyPct = 100;
    const m: InfraMetric = {
      ts: now(), clusterCpuPercent: c.cpuPercent, clusterMemoryPercent: c.memoryPercent,
      clusterPodPercent: c.podPercent, requestRps: Math.round(rps), requestP95Ms: Math.round(p95),
      errorRatePercent: +errRate.toFixed(2), deploymentReadyPercent: readyPct, region: c.region,
    };
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
    if (m.deploymentReadyPercent < 100) alerts.push({
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
