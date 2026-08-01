/**
 * Session 64 — Sustainability & ESG measurement ledger.
 *
 * A record-only emissions ledger: activities are recorded with an explicit,
 * disclosed emission factor, and every reported figure is arithmetic over
 * those records. The module previously fabricated ESG scores, supplier ratings
 * and offset purchases; those were removed, which left the dashboard almost
 * entirely zeroed even though the recorded ledger supports real rollups.
 *
 * This restores the rollups that the data genuinely supports — per-scope
 * totals, a 12-month energy series, year-on-year change, and compute intensity
 * — while continuing to report 0 for anything that requires attestation nobody
 * has provided (ESG scores, supplier audits, offsets, net-zero targets).
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { SustainabilityDashboard, EmissionsSource, EnergyMetric } from "@windels/shared";

const K = {
  meta: (oid: string) => `esg:${oid}:meta`,
  records: (oid: string) => `esg:${oid}:records`,
};

/** `compute` is tracked separately from the GHG scopes and rolls up into scope2. */
type Category = "scope1" | "scope2" | "scope3" | "compute";

type EsgRecord = {
  id: string;
  category: Category;
  activity: string;
  quantity: number;
  unit: string;
  /** kg CO2e per unit — disclosed by the caller, never inferred. */
  emissionFactorKg: number;
  tCO2e: number;
  occurredAt: string;
  source: string;
  /** Optional energy reading so the series reflects real consumption. */
  kwh?: number;
  recordedAt: string;
};

async function list(oid: string): Promise<EsgRecord[]> {
  const raw = await redis.get(K.records(oid));
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

const round = (n: number, dp = 6) => Math.round(n * 10 ** dp) / 10 ** dp;
/** compute is reported under scope2 (purchased electricity). */
const toScope = (c: Category): EmissionsSource["category"] => (c === "compute" ? "scope2" : c);

export const SustainabilityService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels") {
    if (!(await redis.exists(K.meta(oid)))) {
      await redis.set(K.meta(oid), "1");
      logger?.info?.("[sustainability] measurement ledger initialized");
    }
  },

  async record(oid: string, input: Omit<EsgRecord, "id" | "tCO2e" | "recordedAt">) {
    await this.ensureBootstrapped(undefined, oid);
    const records = await list(oid);
    const record: EsgRecord = {
      ...input,
      id: `esg-${randomUUID()}`,
      // tCO2e = quantity x factor(kg) / 1000. The factor is always disclosed.
      tCO2e: round(input.quantity * input.emissionFactorKg / 1000),
      recordedAt: new Date().toISOString(),
    };
    records.push(record);
    await redis.set(K.records(oid), JSON.stringify(records.slice(-10_000)));
    return record;
  },

  async listRecords(oid: string, limit = 200): Promise<EsgRecord[]> {
    return (await list(oid)).slice(-limit).reverse();
  },

  async dashboard(oid = "org-windels"): Promise<SustainabilityDashboard> {
    await this.ensureBootstrapped(undefined, oid);
    const records = await list(oid);

    const now = new Date();
    const thisYear = now.getUTCFullYear();
    const inYear = (r: EsgRecord, y: number) => new Date(r.occurredAt).getUTCFullYear() === y;

    const total = round(records.reduce((n, r) => n + r.tCO2e, 0));
    const ytd = records.filter((r) => inYear(r, thisYear)).reduce((n, r) => n + r.tCO2e, 0);
    const lastYear = records.filter((r) => inYear(r, thisYear - 1)).reduce((n, r) => n + r.tCO2e, 0);
    const emissionsYtdChangePct = lastYear ? Math.round(((ytd - lastYear) / lastYear) * 1000) / 10 : 0;

    // Group by scope + activity so the same activity does not appear N times.
    const grouped = new Map<string, { category: EmissionsSource["category"]; source: string; tCO2e: number; prior: number }>();
    for (const r of records) {
      const key = `${toScope(r.category)}::${r.activity}`;
      const g = grouped.get(key) ?? { category: toScope(r.category), source: r.activity, tCO2e: 0, prior: 0 };
      g.tCO2e += r.tCO2e;
      if (inYear(r, thisYear - 1)) g.prior += r.tCO2e;
      grouped.set(key, g);
    }
    const emissionsBySource: EmissionsSource[] = [...grouped.entries()]
      .map(([id, g]) => ({
        id,
        category: g.category,
        source: g.source,
        tCO2e: round(g.tCO2e, 3),
        // Change against the same activity last year; 0 without a baseline.
        changePct: g.prior ? Math.round(((g.tCO2e - g.prior) / g.prior) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.tCO2e - a.tCO2e);

    // 12-month energy series from records that reported a kWh reading.
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push(d.toISOString().slice(0, 7));
    }
    const kwhByMonth = new Map<string, number>(months.map((m) => [m, 0]));
    for (const r of records) {
      if (!r.kwh) continue;
      const m = r.occurredAt.slice(0, 7);
      if (kwhByMonth.has(m)) kwhByMonth.set(m, kwhByMonth.get(m)! + r.kwh);
    }
    const energySeries: EnergyMetric[] = months.map((period) => ({
      period,
      kwh: Math.round(kwhByMonth.get(period) ?? 0),
      // Renewable share and cost require a utility feed we do not have.
      renewablePct: 0,
      costUsd: 0,
    }));

    const computeTCO2e = round(
      records.filter((r) => r.category === "compute").reduce((n, r) => n + r.tCO2e, 0), 3,
    );

    return {
      // ESG scoring is an external attestation, not a measurement we can take.
      scores: { environmental: 0, social: 0, governance: 0, overall: 0, trend: "flat" },
      emissionsTotalTCO2e: total,
      emissionsYtdChangePct,
      energyRenewablePct: 0,
      waterMl: 0,
      wasteRecycledPct: 0,
      offsetsPurchasedT: 0,
      netZeroTargetYear: 0,
      emissionsBySource,
      energySeries,
      resources: [],
      suppliers: [],
      // Only the fields we actually measure are populated; GPU-hours and an
      // optimisation percentage are not recorded, so they report 0.
      greenAi: computeTCO2e
        ? [{
            workload: "recorded compute",
            gpuHours: 0,
            kwh: Math.round([...kwhByMonth.values()].reduce((a, b) => a + b, 0)),
            co2eKg: Math.round(computeTCO2e * 1000),
            optimizedPct: 0,
          }]
        : [],
      reportingFrameworks: [],
    } satisfies SustainabilityDashboard;
  },
};
