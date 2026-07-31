/**
 * MetricsService - Slice 211: Engineering Metrics / SLO tracking.
 */
import { redisCmd as redis } from "../db/redis.js";
import type { MetricTimeseries, MetricTimeseriesPoint, ServiceMetric } from "@windels/shared";

const LIST_KEY = "eng:services";
const DETAIL = (id: string) => `eng:svc:${id}`;

const SER = <T>(v: T) => JSON.stringify(v);

function synth(base: number, jitterPct = 0.2) {
  return Math.max(0, Math.round(base));
}

export const MetricsService = {
  async list(): Promise<ServiceMetric[]> {
    const ids = await redis.smembers(LIST_KEY);
    const out: ServiceMetric[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (raw) out.push(JSON.parse(raw) as ServiceMetric);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
  async get(id: string): Promise<ServiceMetric | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as ServiceMetric) : null;
  },
  async upsert(m: ServiceMetric): Promise<ServiceMetric> {
    await redis.sadd(LIST_KEY, m.serviceId);
    await redis.set(DETAIL(m.serviceId), SER(m));
    return m;
  },
  async timeseries(serviceId: string, metric: MetricTimeseries["metric"], points = 60): Promise<MetricTimeseries> {
    const svc = await this.get(serviceId);
    const out: MetricTimeseriesPoint[] = [];
    const now = Date.now();
    let base = 0;
    switch (metric) {
      case "latency_p95": base = svc?.p95LatencyMs ?? 80; break;
      case "error_rate": base = svc?.errorRatePct ?? 0.5; break;
      case "rps": base = svc?.rps ?? 100; break;
      case "availability": base = svc?.availabilityPct ?? 99.9; break;
      case "saturation": base = svc?.saturationPct ?? 45; break;
    }
    for (let i = points - 1; i >= 0; i--) {
      const noise = 0;
      let v = base + noise;
      if (metric === "availability") v = Math.min(100, Math.max(95, v));
      if (metric === "error_rate") v = Math.max(0, v);
      if (metric === "saturation") v = Math.max(0, Math.min(100, v));
      out.push({ t: new Date(now - i * 60_000).toISOString(), value: Math.round(v * 100) / 100 });
    }
    return { serviceId, metric, points: out };
  },
  async refreshSynthetic(id: string) {
    const m = await this.get(id);
    if (!m) return null;
    m.p50LatencyMs = synth(m.p50LatencyMs);
    m.p95LatencyMs = Math.round(m.p50LatencyMs * 2.2);
    m.p99LatencyMs = Math.round(m.p50LatencyMs * 3.5);
    m.rps = synth(m.rps, 0.25);
    m.errorRatePct = Math.max(0, m.errorRatePct);
    m.saturationPct = Math.max(0, Math.min(100, m.saturationPct));
    const budgetBurn = (m.p95LatencyMs > m.sloLatencyMs ? 0.5 : 0) + m.errorRatePct * 0.5;
    m.errorBudgetRemainingPct = Math.max(0, Math.round((m.errorBudgetRemainingPct - budgetBurn) * 10) / 10);
    await this.upsert(m);
    return m;
  },
};
