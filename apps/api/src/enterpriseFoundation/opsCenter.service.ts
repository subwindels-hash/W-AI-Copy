/**
 * OpsCenterService — Slices 283+284:
 * Global Operations Center + Executive Operations Dashboard.
 * Aggregates status from other foundation services.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { GlobalStatus, ExecKpi } from "@windels/shared";

const KPI = "ef:kpis";
const KPI_ID = (id: string) => `ef:kpi:${id}`;

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

export const OpsCenterService = {
  async globalStatus(): Promise<GlobalStatus> {
    return {
      servicesTotal: 48,
      servicesHealthy: 45,
      servicesDegraded: 2,
      servicesDown: 1,
      activeIncidents: 1,
      openAlerts: 7,
      openAnomalies: 2,
      regions: [
        { region: "na-east", status: "healthy", latencyMs: 42, trafficPct: 42 },
        { region: "na-west", status: "healthy", latencyMs: 48, trafficPct: 18 },
        { region: "eu-west", status: "degraded", latencyMs: 92, trafficPct: 24 },
        { region: "ap-south", status: "healthy", latencyMs: 110, trafficPct: 11 },
        { region: "sa-east", status: "healthy", latencyMs: 130, trafficPct: 5 },
      ],
      trafficRps: 12480,
      errorRatePct: 0.32,
      p95Ms: 218,
      activeUsers: 24891,
      aiRequestsPerMin: 48210,
      costToday: 18420,
      monthlyRunRate: 554000,
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
