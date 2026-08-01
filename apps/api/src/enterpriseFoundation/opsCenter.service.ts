/**
 * OpsCenterService — Slices 283+284:
 * Global Operations Center + Executive Operations Dashboard.
 * Aggregates status from other foundation services.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { Metrics } from "../observability/metrics.js";
import type { GlobalStatus, ExecKpi } from "@windels/shared";

const KPI = "ef:kpis";
const KPI_ID = (id: string) => `ef:kpi:${id}`;

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

/** Total of a counter across every tag combination. */
function counterTotal(snap: any, name: string): number {
  return Number(snap?.counters?.[name]?.total ?? 0);
}

/** HTTP responses with a 5xx status, summed from the tagged counter. */
function errorTotal(snap: any): number {
  const byTags = snap?.counters?.["http_requests_total"]?.byTags ?? {};
  let n = 0;
  for (const [k, v] of Object.entries(byTags)) {
    const m = /status=(\d{3})/.exec(k);
    if (m && Number(m[1]) >= 500) n += Number(v);
  }
  return n;
}

export const OpsCenterService = {
  /**
   * Global operations status.
   *
   * ── MEASURED ONLY ────────────────────────────────────────────────────
   * This method used to `return` a literal: 48 services with 45 healthy,
   * five named regions with per-region latency and traffic split, 12,480 rps,
   * a 0.32% error rate, 218 ms p95, 24,891 active users and $18,420 of spend
   * today against a $554,000 monthly run rate.
   *
   * It touched neither Redis nor the metrics registry, so it was not a seed and
   * the WINDELS_DEMO_DATA gate never applied to it — `GET /enterprise/global-status`
   * served those numbers on a default install, and `/dashboard/rollup` spread
   * them into the executive rollup as `globalRps`, `globalP95Ms`,
   * `globalErrorRate` and `activeUsers`. An operator reading either endpoint saw
   * a healthy, busy, multi-region platform that did not exist. Worse, the shape
   * was static: an actual outage would not have moved a single figure.
   *
   * Everything below is either measured from this process's own telemetry (the
   * same registry that backs infraMetrics) or counted from records the platform
   * actually holds. Region topology needs a source that can see other regions;
   * this process cannot, so it reports none rather than inventing five. Cost
   * needs a billing export. Both are omitted rather than guessed.
   */
  async globalStatus(): Promise<GlobalStatus> {
    const snap = Metrics.snapshot();
    const reqs = counterTotal(snap, "http_requests_total");
    const errs = errorTotal(snap);

    // Request rate over this process's uptime. Honest for a single process and
    // labelled as such by `regions: []` — there is no cluster view here.
    const uptimeSec = Math.max(1, process.uptime());
    const trafficRps = +(reqs / uptimeSec).toFixed(2);
    const errorRatePct = reqs > 0 ? +((errs / reqs) * 100).toFixed(2) : 0;

    // The metrics registry keeps count/sum/min/max per histogram bucket but no
    // quantiles, so a true p95 is not derivable here. Reporting the mean while
    // the field is named `p95Ms` would understate tail latency, which is the
    // one thing a p95 exists to reveal — so it stays 0 until a histogram with
    // real buckets backs it.
    const p95Ms = 0;

    // Incidents come from the resilience register rather than a constant.
    let activeIncidents = 0;
    try {
      const { ResilienceService } = await import("./resilience.service.js");
      const open = await ResilienceService.listIncidents({ status: "open" });
      activeIncidents = open.length;
    } catch { /* register unavailable — report none rather than inventing one */ }

    // Firing alerts come from the infra sampler's real thresholds.
    let openAlerts = 0;
    try {
      const { InfraMetricsService } = await import("../platform/infraMetrics.service.js");
      openAlerts = (await InfraMetricsService.alerts()).length;
    } catch { /* sampler not running */ }

    return {
      // Service health needs a registry that probes each service. Until one
      // reports, claiming "45 of 48 healthy" is a fabricated all-clear.
      servicesTotal: 0,
      servicesHealthy: 0,
      servicesDegraded: 0,
      servicesDown: 0,
      activeIncidents,
      openAlerts,
      openAnomalies: 0,
      // A single process cannot observe other regions. Five invented regions
      // with plausible latencies read exactly like a real global footprint.
      regions: [],
      trafficRps,
      errorRatePct,
      p95Ms,
      // Active users and AI request volume need session/usage tracking to be
      // wired through; unmeasured, they report 0 rather than 24,891.
      activeUsers: 0,
      aiRequestsPerMin: 0,
      // Spend requires a billing export. $18,420/day and a $554,000 run rate
      // were pure invention.
      costToday: 0,
      monthlyRunRate: 0,
    };
  },
  async listKpis(): Promise<ExecKpi[]> {
    const ids = await redis.smembers(KPI);
    const out: ExecKpi[] = [];
    for (const id of ids) {
      const raw = await redis.get(KPI_ID(id));
      if (raw) out.push(JSON.parse(raw) as ExecKpi);
    }
    return out.sort((a,b)=>a.label.localeCompare(b.label));
  },
  async setKpi(k: Omit<ExecKpi,"id"|"updatedAt">): Promise<ExecKpi> {
    const id = randomUUID();
    const rec: ExecKpi = { id, updatedAt: iso(), ...k };
    await redis.set(KPI_ID(id), SER(rec));
    await redis.sadd(KPI, id);
    return rec;
  },
  async seed(): Promise<void> {
    const existing = await redis.smembers(KPI);
    if (existing.length) return;
    const seeds: Array<Omit<ExecKpi,"id"|"updatedAt">> = [
      { label:"ARR", value: 48_200_000, unit:"$", trend:14.2, target:60_000_000, tone:"positive" },
      { label:"Monthly Active Users", value: 184_200, trend:9.1, target:200_000, tone:"positive" },
      { label:"AI Requests / day", value: 69_400_000, trend:22.4, tone:"positive" },
      { label:"SLA Uptime (30d)", value: 99.97, unit:"%", trend:0.02, target:99.95, tone:"positive" },
      { label:"P95 Latency", value: 218, unit:"ms", trend:-8.3, target:250, tone:"positive" },
      { label:"Mean Time To Recover", value: 38, unit:"min", trend:-12.4, tone:"positive" },
      { label:"Cost / AI Request", value: 0.0027, unit:"$", trend:-4.1, tone:"positive" },
      { label:"Compliance Score", value: 94, unit:"%", trend:1.2, target:95, tone:"positive" },
      { label:"Net Revenue Retention", value: 121, unit:"%", trend:2.0, target:120, tone:"positive" },
      { label:"Gross Margin", value: 72, unit:"%", trend:0.4, target:75, tone:"neutral" },
      { label:"Critical Vulnerabilities", value: 3, trend:-25, target:0, tone:"negative" },
      { label:"Employee NPS", value: 68, trend:4, target:70, tone:"positive" },
    ];
    for (const s of seeds) await this.setKpi(s);
  },
};
