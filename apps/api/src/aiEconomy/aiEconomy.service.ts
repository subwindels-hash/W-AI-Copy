/**
 * Session 71 / 103 — Enterprise AI Economy Platform.
 *
 * Session 103 turns the original thin rollup into a real org-scoped ledger:
 * usage observations, GPU allocations and compute-capacity offers are stored as
 * individual records under fail-closed keys. The dashboard is a deterministic
 * projection of those records. Revenue and marketplace volume remain zero
 * until a real billing/marketplace ledger is connected.
 *
 * Keys: eco:meta:i:<org>:<id>, eco:usage:i:<org>:<id>,
 * eco:allocation:i:<org>:<id>, eco:offer:i:<org>:<id>
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import type {
  AiEconomyAllocationInput,
  AiEconomyOfferInput,
  AiEconomyUsageInput,
  AiUsageEntry,
  ComputeOffer,
  EconomyDashboard,
  GpuAllocation,
} from "@windels/shared/aiEconomy";

type Entity = "meta" | "usage" | "allocation" | "offer";
type UsageRecord = AiUsageEntry & { organizationId: string };
type AllocationRecord = GpuAllocation & { organizationId: string };
type OfferRecord = ComputeOffer & { organizationId: string; createdAt: string };
type OfferUpdate = Partial<AiEconomyOfferInput>;

const K = {
  item: (entity: Entity, org: string, id: string) => `eco:${entity}:i:${org}:${id}`,
  index: (entity: Entity, org: string) => `eco:${entity}:idx:${org}`,
  legacyUsage: (org: string) => `eco:${org}:usage`,
  legacyAllocations: (org: string) => `eco:${org}:allocations`,
};

const parse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};
const uid = (prefix: string) => `${prefix}-${randomUUID()}`;

async function readOwned<T extends { organizationId: string }>(entity: Entity, org: string, id: string): Promise<T | null> {
  const row = parse<T>(await redis.hget(K.item(entity, org, id), "_doc"));
  return row && row.organizationId === org ? row : null;
}

async function writeItem(entity: Entity, org: string, record: { id: string; organizationId: string; createdAt?: string; recordedAt?: string; startedAt?: string; updatedAt?: string }): Promise<void> {
  await redis.hset(K.item(entity, org, record.id), "_doc", JSON.stringify(record));
  const stamp = record.updatedAt ?? record.recordedAt ?? record.startedAt ?? record.createdAt ?? new Date().toISOString();
  await redis.zadd(K.index(entity, org), Date.parse(stamp) || Date.now(), record.id);
}

async function listIds(entity: Entity, org: string): Promise<string[]> {
  return redis.zrange(K.index(entity, org), 0, -1);
}

async function deleteItem(entity: Entity, org: string, id: string): Promise<boolean> {
  const found = await readOwned<{ organizationId: string }>(entity, org, id);
  if (!found) return false;
  await redis.del(K.item(entity, org, id));
  await redis.zrem(K.index(entity, org), id);
  return true;
}

async function migrateLegacy(org: string): Promise<void> {
  // Older releases used one JSON array per organization. Migrate only when the
  // new index is empty, then remove the old blob so reads have one source of
  // truth. The legacy keys were already organization-qualified.
  if ((await listIds("usage", org)).length === 0) {
    const legacy = parse<Array<Partial<UsageRecord>>>(await redis.get(K.legacyUsage(org)));
    if (legacy?.length) {
      for (const row of legacy) {
        const recordedAt = row.recordedAt ?? new Date().toISOString();
        await writeItem("usage", org, {
          id: row.id ?? uid("usage"), organizationId: org,
          resource: row.resource ?? "tokens", quantity: row.quantity ?? 0,
          unit: row.unit ?? "unit", costCents: row.costCents ?? 0,
          department: row.department ?? "unassigned", recordedAt,
        } as UsageRecord);
      }
      await redis.del(K.legacyUsage(org));
    }
  }
  if ((await listIds("allocation", org)).length === 0) {
    const legacy = parse<Array<Partial<AllocationRecord>>>(await redis.get(K.legacyAllocations(org)));
    if (legacy?.length) {
      for (const row of legacy) {
        await writeItem("allocation", org, {
          id: row.id ?? uid("alloc"), organizationId: org,
          cluster: row.cluster ?? "unassigned", gpuType: row.gpuType ?? "unknown",
          assignedTo: row.assignedTo ?? "unassigned", job: row.job ?? "unknown",
          utilizationPct: row.utilizationPct ?? 0, vramUsedGb: row.vramUsedGb ?? 0,
          costPerHour: row.costPerHour ?? 0, startedAt: row.startedAt ?? new Date().toISOString(),
        } as AllocationRecord);
      }
      await redis.del(K.legacyAllocations(org));
    }
  }
}

async function ensureOrg(org: string, logger?: Logger): Promise<void> {
  const metaKey = K.item("meta", org, "ledger");
  if (!(await redis.exists(metaKey))) {
    const now = new Date().toISOString();
    await writeItem("meta", org, { id: "ledger", organizationId: org, createdAt: now });
    logger?.info?.({ msg: "[aiEconomy] ledger initialized", organizationId: org });
  }
  await migrateLegacy(org);
}

function serializeOffer(record: OfferRecord): ComputeOffer {
  const { organizationId: _organizationId, createdAt: _createdAt, ...offer } = record;
  return offer;
}

export const AiEconomyService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels"): Promise<void> {
    await ensureOrg(oid, logger);
  },

  async recordUsage(oid: string, input: AiEconomyUsageInput): Promise<AiUsageEntry> {
    await ensureOrg(oid);
    const item: UsageRecord = { ...input, id: uid("usage"), organizationId: oid, recordedAt: new Date().toISOString() };
    await writeItem("usage", oid, item);
    return item;
  },

  async listUsage(oid: string, limit = 100): Promise<AiUsageEntry[]> {
    await ensureOrg(oid);
    const ids = await listIds("usage", oid);
    const rows: UsageRecord[] = [];
    for (const id of ids) {
      const row = await readOwned<UsageRecord>("usage", oid, id);
      if (row) rows.push(row);
    }
    return rows.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.id.localeCompare(a.id)).slice(0, limit);
  },

  async deleteUsage(oid: string, id: string): Promise<boolean> {
    await ensureOrg(oid);
    return deleteItem("usage", oid, id);
  },

  async createAllocation(oid: string, input: AiEconomyAllocationInput): Promise<GpuAllocation> {
    await ensureOrg(oid);
    const item: AllocationRecord = { ...input, id: uid("alloc"), organizationId: oid, startedAt: new Date().toISOString() };
    await writeItem("allocation", oid, item);
    return item;
  },

  async listAllocations(oid: string, limit = 100): Promise<GpuAllocation[]> {
    await ensureOrg(oid);
    const ids = await listIds("allocation", oid);
    const rows: AllocationRecord[] = [];
    for (const id of ids) {
      const row = await readOwned<AllocationRecord>("allocation", oid, id);
      if (row) rows.push(row);
    }
    return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id)).slice(0, limit);
  },

  async deleteAllocation(oid: string, id: string): Promise<boolean> {
    await ensureOrg(oid);
    return deleteItem("allocation", oid, id);
  },

  async createOffer(oid: string, input: AiEconomyOfferInput): Promise<ComputeOffer> {
    await ensureOrg(oid);
    const now = new Date().toISOString();
    const item: OfferRecord = {
      ...input,
      available: input.available ?? true,
      utilizationPct: input.utilizationPct ?? 0,
      id: uid("offer"), organizationId: oid, updatedAt: now, createdAt: now,
    };
    await writeItem("offer", oid, item);
    return serializeOffer(item);
  },

  async listOffers(oid: string): Promise<ComputeOffer[]> {
    await ensureOrg(oid);
    const ids = await listIds("offer", oid);
    const rows: OfferRecord[] = [];
    for (const id of ids) {
      const row = await readOwned<OfferRecord>("offer", oid, id);
      if (row) rows.push(row);
    }
    return rows.sort((a, b) => a.gpuType.localeCompare(b.gpuType) || a.id.localeCompare(b.id)).map(serializeOffer);
  },

  async updateOffer(oid: string, id: string, patch: OfferUpdate): Promise<ComputeOffer | null> {
    await ensureOrg(oid);
    const current = await readOwned<OfferRecord>("offer", oid, id);
    if (!current) return null;
    const next: OfferRecord = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await writeItem("offer", oid, next);
    return serializeOffer(next);
  },

  async deleteOffer(oid: string, id: string): Promise<boolean> {
    await ensureOrg(oid);
    return deleteItem("offer", oid, id);
  },

  async dashboard(oid: string): Promise<EconomyDashboard> {
    await ensureOrg(oid);
    const [usage, allocations, offers] = await Promise.all([
      this.listUsage(oid, 10_000), this.listAllocations(oid, 1_000), this.listOffers(oid),
    ]);
    const since = Date.now() - 30 * 86_400_000;
    const recent = usage.filter((row) => Date.parse(row.recordedAt) >= since);
    const totalCostUsd = recent.reduce((sum, row) => sum + row.costCents, 0) / 100;
    const credits = recent.reduce((sum, row) => sum + row.quantity, 0);
    const departments = new Map<string, { spend: number; credits: number }>();
    for (const row of recent) {
      const current = departments.get(row.department) ?? { spend: 0, credits: 0 };
      current.spend += row.costCents / 100;
      current.credits += row.quantity;
      departments.set(row.department, current);
    }
    const tokenUsage = recent.filter((row) => row.resource === "tokens").reduce((sum, row) => sum + row.quantity, 0);
    const forecast = recent.length ? [{
      month: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 7),
      costUsd: Math.round(totalCostUsd * 100) / 100,
      usageTokens: tokenUsage,
    }] : [];
    return {
      creditsInCirculation: credits,
      creditsSpent30d: credits,
      creditsEarned30d: 0,
      computeRevenue30d: 0,
      computeCost30d: Math.round(totalCostUsd * 100) / 100,
      marginPct: 0,
      gpuUtilizationPct: allocations.length ? Math.round(allocations.reduce((sum, row) => sum + row.utilizationPct, 0) / allocations.length) : 0,
      gpusAvailable: offers.filter((offer) => offer.available).length,
      gpusTotal: offers.length,
      activeAllocations: allocations.filter((row) => row.utilizationPct > 0).length,
      forecasts: forecast,
      forecastKind: recent.length ? "observed_run_rate" : "no_observation",
      topDepartments: [...departments.entries()]
        .map(([department, value]) => ({ department, spend: Math.round(value.spend * 100) / 100, credits: value.credits }))
        .sort((a, b) => b.spend - a.spend || a.department.localeCompare(b.department)),
      offers,
      allocations,
      usage: recent.map((row) => ({
        id: row.id, resource: row.resource, allocated: row.quantity, used: row.quantity,
        unit: row.unit, costPerUnit: row.quantity ? row.costCents / 100 / row.quantity : 0,
        department: row.department, recordedAt: row.recordedAt,
      })),
      // No marketplace transaction ledger exists yet; do not infer volume from usage.
      marketplaceVolume30d: 0,
    };
  },
};
