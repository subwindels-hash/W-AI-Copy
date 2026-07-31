import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import type { EconomyDashboard } from "@windels/shared";

const K = { meta: (oid: string) => `eco:${oid}:meta`, usage: (oid: string) => `eco:${oid}:usage`, allocations: (oid: string) => `eco:${oid}:allocations` };
type Usage = { id: string; resource: "gpu" | "cpu" | "ram" | "storage" | "bandwidth" | "tokens"; quantity: number; unit: string; costCents: number; department: string; recordedAt: string };
type Allocation = { id: string; cluster: string; gpuType: string; assignedTo: string; job: string; utilizationPct: number; vramUsedGb: number; costPerHour: number; startedAt: string };
async function read<T>(key: string): Promise<T[]> { const raw = await redis.get(key); try { return raw ? JSON.parse(raw) : []; } catch { return []; } }
async function write<T>(key: string, value: T[]) { await redis.set(key, JSON.stringify(value)); }

export const AiEconomyService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels") { if (!(await redis.exists(K.meta(oid)))) { await redis.set(K.meta(oid), "1"); logger?.info({ msg: "[aiEconomy] ledger initialized", organizationId: oid }); } },
  async recordUsage(oid: string, input: Omit<Usage, "id" | "recordedAt">) {
    await this.ensureBootstrapped(undefined, oid); const items = await read<Usage>(K.usage(oid));
    const item: Usage = { ...input, id: `usage-${randomUUID()}`, recordedAt: new Date().toISOString() }; items.push(item); await write(K.usage(oid), items.slice(-10000)); return item;
  },
  async createAllocation(oid: string, input: Omit<Allocation, "id" | "startedAt">) {
    await this.ensureBootstrapped(undefined, oid); const items = await read<Allocation>(K.allocations(oid));
    const item: Allocation = { ...input, id: `alloc-${randomUUID()}`, startedAt: new Date().toISOString() }; items.push(item); await write(K.allocations(oid), items.slice(-1000)); return item;
  },
  async dashboard(oid: string): Promise<EconomyDashboard> {
    await this.ensureBootstrapped(undefined, oid); const [usage, allocations] = await Promise.all([read<Usage>(K.usage(oid)), read<Allocation>(K.allocations(oid))]);
    const since = Date.now() - 30 * 86_400_000; const recent = usage.filter((u) => new Date(u.recordedAt).getTime() >= since);
    const totalCost = recent.reduce((n, u) => n + u.costCents, 0) / 100; const departments = new Map<string, { spend: number; credits: number }>();
    for (const u of recent) { const d = departments.get(u.department) ?? { spend: 0, credits: 0 }; d.spend += u.costCents / 100; d.credits += u.quantity; departments.set(u.department, d); }
    return {
      // "Credits" are the recorded resource quantities; spend is their cost.
      // Revenue/margin need a billing source that does not exist here, so they
      // stay 0 rather than implying the platform is profitable.
      creditsInCirculation: recent.reduce((n, u) => n + u.quantity, 0),
      creditsSpent30d: Math.round(totalCost * 100) / 100,
      creditsEarned30d: 0,
      computeRevenue30d: 0, computeCost30d: Math.round(totalCost * 100) / 100, marginPct: 0,
      gpuUtilizationPct: allocations.length ? Math.round(allocations.reduce((n, a) => n + a.utilizationPct, 0) / allocations.length) : 0,
      // A GPU is "in use" when an allocation reports utilisation above zero.
      gpusTotal: allocations.length,
      gpusAvailable: allocations.filter((a) => a.utilizationPct === 0).length,
      activeAllocations: allocations.filter((a) => a.utilizationPct > 0).length,
      // Straight-line projection from observed 30-day spend — labelled as such.
      // Straight-line projection of the observed 30-day spend into next month.
      forecasts: recent.length
        ? [{
            month: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 7),
            costUsd: Math.round(totalCost * 100) / 100,
            usageTokens: recent.filter((u) => u.resource === "tokens").reduce((n, u) => n + u.quantity, 0),
          }]
        : [], topDepartments: [...departments.entries()].map(([department, d]) => ({ department, spend: Math.round(d.spend * 100) / 100, credits: d.credits })).sort((a, b) => b.spend - a.spend),
      offers: [], allocations, usage: recent.map((u) => ({ resource: u.resource, allocated: u.quantity, used: u.quantity, unit: u.unit, costPerUnit: u.quantity ? u.costCents / 100 / u.quantity : 0, department: u.department })), marketplaceVolume30d: 0,
    } satisfies EconomyDashboard;
  },
};
