import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { SustainabilityDashboard } from "@windels/shared";
const K = { meta: (oid: string) => `esg:${oid}:meta`, records: (oid: string) => `esg:${oid}:records` };
type Record = { id: string; category: "scope1" | "scope2" | "scope3" | "compute"; activity: string; quantity: number; unit: string; emissionFactorKg: number; tCO2e: number; occurredAt: string; source: string; recordedAt: string };
async function list(oid: string): Promise<Record[]> { const raw = await redis.get(K.records(oid)); try { return raw ? JSON.parse(raw) : []; } catch { return []; } }
export const SustainabilityService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels") { if (!(await redis.exists(K.meta(oid)))) { await redis.set(K.meta(oid), "1"); logger?.info?.("[sustainability] measurement ledger initialized"); } },
  async record(oid: string, input: Omit<Record, "id" | "tCO2e" | "recordedAt">) { await this.ensureBootstrapped(undefined, oid); const records = await list(oid); const record: Record = { ...input, id: `esg-${randomUUID()}`, tCO2e: +(input.quantity * input.emissionFactorKg / 1000).toFixed(6), recordedAt: new Date().toISOString() }; records.push(record); await redis.set(K.records(oid), JSON.stringify(records.slice(-10000))); return record; },
  async dashboard(oid = "org-windels"): Promise<SustainabilityDashboard> { await this.ensureBootstrapped(undefined, oid); const records = await list(oid); const total = +records.reduce((n, r) => n + r.tCO2e, 0).toFixed(6); const emissionsBySource = records.map((r) => ({ id: r.id, category: r.category, source: r.activity, tCO2e: r.tCO2e, changePct: 0 })); return { scores: { environmental: 0, social: 0, governance: 0, overall: 0, trend: "flat" }, emissionsTotalTCO2e: total, emissionsYtdChangePct: 0, energyRenewablePct: 0, waterMl: 0, wasteRecycledPct: 0, offsetsPurchasedT: 0, netZeroTargetYear: 0, emissionsBySource, energySeries: [], resources: [], suppliers: [], greenAi: [], reportingFrameworks: [] } as SustainabilityDashboard; },
};
