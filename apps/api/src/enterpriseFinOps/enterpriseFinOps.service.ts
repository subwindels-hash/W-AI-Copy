/**
 * Session 100 — Enterprise FinOps depth.
 *
 * This is deliberately separate from the historical Session 31 FinOps
 * dashboard. That service is a global foundation view; this module is the
 * org-scoped accounting layer: cost centers, budgets, actual cost entries,
 * an allocation ledger, and chargebacks computed from that ledger.
 *
 * Honesty rules:
 *   - Every stored key contains the organization segment and reads are
 *     fail-closed through readOwned.
 *   - Amounts are integer minor currency units; no floating-point money is
 *     persisted.
 *   - Chargebacks, utilization and unallocated totals are computed on every
 *     read from actual costs, allocations and budgets. No rollup is stored.
 *   - IDs use the CSPRNG; kernel events are best effort only.
 *
 * Keys: efo:center:*, efo:budget:*, efo:cost:*, efo:allocation:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  EfoAllocation,
  EfoAllocationCreateInput,
  EfoAllocationMethod,
  EfoBudget,
  EfoBudgetCreateInput,
  EfoBudgetUpsertInput,
  EfoChargeback,
  EfoChargebackQuery,
  EfoCostCenter,
  EfoCostCenterCreateInput,
  EfoCostCenterUpsertInput,
  EfoCostEntry,
  EfoCostEntryCreateInput,
  EfoRollup,
} from "@windels/shared/enterpriseFinOps";

export type EfoCostFilter = {
  provider?: EfoCostEntry["provider"];
  category?: EfoCostEntry["category"];
  costCenterId?: string;
  currency?: string;
};

export type EfoAllocationFilter = {
  costId?: string;
  costCenterId?: string;
};

type Entity = "center" | "budget" | "cost" | "allocation";

const K = {
  item: (entity: Entity, org: string, id: string) => `efo:${entity}:i:${org}:${id}`,
  index: (entity: Entity, org: string) => `efo:${entity}:idx:${org}`,
};

const serialize = (value: unknown) => JSON.stringify(value);
const parse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};

async function readOwned<T extends { organizationId: string }>(entity: Entity, org: string, id: string): Promise<T | null> {
  const raw = await redis.hget(K.item(entity, org, id), "_doc");
  const record = parse<T>(raw);
  return record && record.organizationId === org ? record : null;
}

async function writeItem(entity: Entity, org: string, record: { id: string; createdAt: string }): Promise<void> {
  await redis.hset(K.item(entity, org, record.id), "_doc", serialize(record));
  const score = Date.parse(record.createdAt);
  await redis.zadd(K.index(entity, org), Number.isFinite(score) ? score : Date.now(), record.id);
}

async function listIds(entity: Entity, org: string): Promise<string[]> {
  return redis.zrange(K.index(entity, org), 0, -1);
}

async function deleteItem(entity: Entity, org: string, id: string): Promise<boolean> {
  const existing = await readOwned<{ organizationId: string }>(entity, org, id);
  if (!existing) return false;
  await redis.del(K.item(entity, org, id));
  await redis.zrem(K.index(entity, org), id);
  return true;
}

const uid = (prefix: string) => `${prefix}${randomUUID().slice(0, 8)}`;

function currency(value: string | undefined | null): string {
  const normalized = String(value ?? "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("INVALID_CURRENCY");
  return normalized;
}

function validDate(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("INVALID_DATE");
  return parsed;
}

function validateWindow(start: string, end: string): void {
  if (validDate(end) <= validDate(start)) throw new Error("INVALID_PERIOD");
}

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

async function emitKernel(kind: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "enterprise-finops", payload });
  } catch {
    // Accounting writes must not fail because the optional event bus is down.
  }
}

function sortNewest<T extends { createdAt: string; id: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export const EnterpriseFinOpsService = {
  // ─── Cost centers ────────────────────────────────────────────────────
  async listCostCenters(org: string, filter?: { status?: EfoCostCenter["status"] }): Promise<EfoCostCenter[]> {
    const ids = await listIds("center", org);
    const rows: EfoCostCenter[] = [];
    for (const id of ids) {
      const row = await readOwned<EfoCostCenter>("center", org, id);
      if (row && (!filter?.status || row.status === filter.status)) rows.push(row);
    }
    return rows.sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id));
  },

  async getCostCenter(org: string, id: string): Promise<EfoCostCenter | null> {
    return readOwned<EfoCostCenter>("center", org, id);
  },

  async createCostCenter(org: string, input: EfoCostCenterCreateInput, userId: string | null): Promise<EfoCostCenter> {
    const code = input.code.trim().toUpperCase();
    const existing = await this.listCostCenters(org);
    if (existing.some((center) => center.code === code)) throw new Error("COST_CENTER_CODE_EXISTS");
    const now = new Date().toISOString();
    const row: EfoCostCenter = {
      id: uid("efc-"),
      organizationId: org,
      name: input.name,
      code,
      owner: input.owner,
      currency: currency(input.currency),
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("center", org, row);
    void emitKernel("efo.cost-center.created", { id: row.id, organizationId: org, code: row.code, createdBy: userId });
    return row;
  },

  async updateCostCenter(org: string, id: string, patch: Partial<EfoCostCenterUpsertInput>, userId: string | null): Promise<EfoCostCenter | null> {
    const current = await this.getCostCenter(org, id);
    if (!current) return null;
    const nextCode = patch.code === undefined ? current.code : patch.code.trim().toUpperCase();
    const all = await this.listCostCenters(org);
    if (all.some((center) => center.id !== id && center.code === nextCode)) throw new Error("COST_CENTER_CODE_EXISTS");
    const nextCurrency = patch.currency === undefined ? current.currency : currency(patch.currency);
    if (nextCurrency !== current.currency) {
      const [budgets, allocations] = await Promise.all([
        this.listBudgets(org, { costCenterId: id }),
        this.listAllocations(org, { costCenterId: id }),
      ]);
      if (budgets.length || allocations.length) throw new Error("CURRENCY_LOCKED");
    }
    const next: EfoCostCenter = {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      code: nextCode,
      ...(patch.owner !== undefined ? { owner: patch.owner } : {}),
      currency: nextCurrency,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: new Date().toISOString(),
    };
    await writeItem("center", org, next);
    void emitKernel("efo.cost-center.updated", { id, organizationId: org, status: next.status, updatedBy: userId });
    return next;
  },

  async deleteCostCenter(org: string, id: string): Promise<boolean> {
    const current = await this.getCostCenter(org, id);
    if (!current) return false;
    const [budgets, allocations] = await Promise.all([
      this.listBudgets(org, { costCenterId: id }),
      this.listAllocations(org, { costCenterId: id }),
    ]);
    if (budgets.length || allocations.length) throw new Error("COST_CENTER_IN_USE");
    const deleted = await deleteItem("center", org, id);
    if (deleted) void emitKernel("efo.cost-center.deleted", { id, organizationId: org });
    return deleted;
  },

  // ─── Budgets ─────────────────────────────────────────────────────────
  async listBudgets(org: string, filter?: { costCenterId?: string; status?: EfoBudget["status"] }): Promise<EfoBudget[]> {
    const ids = await listIds("budget", org);
    const rows: EfoBudget[] = [];
    for (const id of ids) {
      const row = await readOwned<EfoBudget>("budget", org, id);
      if (!row) continue;
      if (filter?.costCenterId && row.costCenterId !== filter.costCenterId) continue;
      if (filter?.status && row.status !== filter.status) continue;
      rows.push(row);
    }
    return sortNewest(rows);
  },

  async getBudget(org: string, id: string): Promise<EfoBudget | null> {
    return readOwned<EfoBudget>("budget", org, id);
  },

  async createBudget(org: string, input: EfoBudgetCreateInput, userId: string | null): Promise<EfoBudget> {
    const center = await this.getCostCenter(org, input.costCenterId);
    if (!center) throw new Error("COST_CENTER_NOT_FOUND");
    if (center.status === "archived") throw new Error("COST_CENTER_ARCHIVED");
    validateWindow(input.periodStart, input.periodEnd);
    const recordCurrency = currency(input.currency);
    if (recordCurrency !== center.currency) throw new Error("CURRENCY_MISMATCH");
    const now = new Date().toISOString();
    const row: EfoBudget = {
      id: uid("efb-"),
      organizationId: org,
      costCenterId: center.id,
      name: input.name,
      period: input.period ?? "monthly",
      periodStart: new Date(validDate(input.periodStart)).toISOString(),
      periodEnd: new Date(validDate(input.periodEnd)).toISOString(),
      amountMinor: input.amountMinor,
      currency: recordCurrency,
      status: input.status ?? "active",
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("budget", org, row);
    void emitKernel("efo.budget.created", { id: row.id, organizationId: org, costCenterId: row.costCenterId, createdBy: userId });
    return row;
  },

  async updateBudget(org: string, id: string, patch: Partial<EfoBudgetUpsertInput>, userId: string | null): Promise<EfoBudget | null> {
    const current = await this.getBudget(org, id);
    if (!current) return null;
    const centerId = patch.costCenterId ?? current.costCenterId;
    const center = await this.getCostCenter(org, centerId);
    if (!center) throw new Error("COST_CENTER_NOT_FOUND");
    const start = patch.periodStart ?? current.periodStart;
    const end = patch.periodEnd ?? current.periodEnd;
    validateWindow(start, end);
    const recordCurrency = currency(patch.currency ?? current.currency);
    if (recordCurrency !== center.currency) throw new Error("CURRENCY_MISMATCH");
    const next: EfoBudget = {
      ...current,
      ...(patch.costCenterId !== undefined ? { costCenterId: center.id } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.period !== undefined ? { period: patch.period } : {}),
      periodStart: new Date(validDate(start)).toISOString(),
      periodEnd: new Date(validDate(end)).toISOString(),
      ...(patch.amountMinor !== undefined ? { amountMinor: patch.amountMinor } : {}),
      currency: recordCurrency,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
      updatedAt: new Date().toISOString(),
    };
    await writeItem("budget", org, next);
    void emitKernel("efo.budget.updated", { id, organizationId: org, costCenterId: next.costCenterId, updatedBy: userId });
    return next;
  },

  async deleteBudget(org: string, id: string): Promise<boolean> {
    const deleted = await deleteItem("budget", org, id);
    if (deleted) void emitKernel("efo.budget.deleted", { id, organizationId: org });
    return deleted;
  },

  // ─── Actual cost ledger ──────────────────────────────────────────────
  async listCosts(org: string, filter?: EfoCostFilter): Promise<EfoCostEntry[]> {
    const ids = await listIds("cost", org);
    const rows: EfoCostEntry[] = [];
    const wantedCurrency = filter?.currency?.toUpperCase();
    for (const id of ids) {
      const row = await readOwned<EfoCostEntry>("cost", org, id);
      if (!row) continue;
      if (filter?.provider && row.provider !== filter.provider) continue;
      if (filter?.category && row.category !== filter.category) continue;
      if (filter?.costCenterId) {
        const allocations = await this.listAllocations(org, { costId: row.id, costCenterId: filter.costCenterId });
        if (!allocations.length) continue;
      }
      if (wantedCurrency && row.currency !== wantedCurrency) continue;
      rows.push(row);
    }
    return rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  },

  async getCost(org: string, id: string): Promise<EfoCostEntry | null> {
    return readOwned<EfoCostEntry>("cost", org, id);
  },

  async createCost(org: string, input: EfoCostEntryCreateInput, userId: string | null): Promise<EfoCostEntry> {
    const recordCurrency = currency(input.currency);
    const centerId = input.costCenterId ?? null;
    if (centerId) {
      const center = await this.getCostCenter(org, centerId);
      if (!center) throw new Error("COST_CENTER_NOT_FOUND");
      if (center.status === "archived") throw new Error("COST_CENTER_ARCHIVED");
      if (center.currency !== recordCurrency) throw new Error("CURRENCY_MISMATCH");
    }
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    validDate(occurredAt);
    const now = new Date().toISOString();
    const row: EfoCostEntry = {
      id: uid("efcost-"),
      organizationId: org,
      provider: input.provider,
      category: input.category,
      service: input.service,
      amountMinor: input.amountMinor,
      currency: recordCurrency,
      occurredAt: new Date(validDate(occurredAt)).toISOString(),
      source: input.source ?? "manual",
      description: input.description ?? null,
      tags: input.tags ?? {},
      createdAt: now,
    };
    await writeItem("cost", org, row);
    if (centerId) {
      await this.createAllocation(org, {
        costId: row.id,
        costCenterId: centerId,
        amountMinor: row.amountMinor,
        currency: row.currency,
        method: input.allocationMethod ?? "direct",
        driver: input.allocationDriver ?? null,
      }, userId);
    }
    void emitKernel("efo.cost.created", { id: row.id, organizationId: org, amountMinor: row.amountMinor, currency: row.currency, createdBy: userId });
    return row;
  },

  async deleteCost(org: string, id: string): Promise<boolean> {
    const cost = await this.getCost(org, id);
    if (!cost) return false;
    for (const allocation of await this.listAllocations(org, { costId: id })) {
      await deleteItem("allocation", org, allocation.id);
    }
    const deleted = await deleteItem("cost", org, id);
    if (deleted) void emitKernel("efo.cost.deleted", { id, organizationId: org });
    return deleted;
  },

  // ─── Allocation ledger ──────────────────────────────────────────────
  async listAllocations(org: string, filter?: EfoAllocationFilter): Promise<EfoAllocation[]> {
    const ids = await listIds("allocation", org);
    const rows: EfoAllocation[] = [];
    for (const id of ids) {
      const row = await readOwned<EfoAllocation>("allocation", org, id);
      if (!row) continue;
      if (filter?.costId && row.costId !== filter.costId) continue;
      if (filter?.costCenterId && row.costCenterId !== filter.costCenterId) continue;
      rows.push(row);
    }
    return sortNewest(rows);
  },

  async getAllocation(org: string, id: string): Promise<EfoAllocation | null> {
    return readOwned<EfoAllocation>("allocation", org, id);
  },

  async createAllocation(org: string, input: EfoAllocationCreateInput, userId: string | null): Promise<EfoAllocation> {
    const cost = await this.getCost(org, input.costId);
    if (!cost) throw new Error("COST_NOT_FOUND");
    const center = await this.getCostCenter(org, input.costCenterId);
    if (!center) throw new Error("COST_CENTER_NOT_FOUND");
    if (center.status === "archived") throw new Error("COST_CENTER_ARCHIVED");
    const recordCurrency = currency(input.currency ?? cost.currency);
    if (recordCurrency !== cost.currency || recordCurrency !== center.currency) throw new Error("CURRENCY_MISMATCH");
    const existing = await this.listAllocations(org, { costId: cost.id });
    const allocated = existing.reduce((sum, row) => sum + row.amountMinor, 0);
    if (allocated + input.amountMinor > cost.amountMinor) throw new Error("ALLOCATION_EXCEEDS_COST");
    const row: EfoAllocation = {
      id: uid("efa-"),
      organizationId: org,
      costId: cost.id,
      costCenterId: center.id,
      amountMinor: input.amountMinor,
      currency: recordCurrency,
      method: input.method ?? "direct",
      driver: input.driver ?? null,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };
    await writeItem("allocation", org, row);
    void emitKernel("efo.allocation.created", { id: row.id, organizationId: org, costId: row.costId, costCenterId: row.costCenterId, createdBy: userId });
    return row;
  },

  async deleteAllocation(org: string, id: string): Promise<boolean> {
    const deleted = await deleteItem("allocation", org, id);
    if (deleted) void emitKernel("efo.allocation.deleted", { id, organizationId: org });
    return deleted;
  },

  // ─── Computed chargebacks and rollup ─────────────────────────────────
  async chargebacks(org: string, filter?: EfoChargebackQuery): Promise<EfoChargeback[]> {
    if (filter?.from && filter?.to && validDate(filter.from) > validDate(filter.to)) throw new Error("INVALID_WINDOW");
    const [centers, budgets, costs, allocations] = await Promise.all([
      this.listCostCenters(org),
      this.listBudgets(org),
      this.listCosts(org),
      this.listAllocations(org),
    ]);
    const costById = new Map<string, EfoCostEntry>(costs.map((cost): [string, EfoCostEntry] => [cost.id, cost]));
    const includeCost = (cost: EfoCostEntry): boolean => {
      const at = validDate(cost.occurredAt);
      if (filter?.from && at < validDate(filter.from)) return false;
      if (filter?.to && at > validDate(filter.to)) return false;
      return true;
    };
    const budgetInWindow = (budget: EfoBudget): boolean => {
      if (!filter?.from && !filter?.to) return true;
      const from = filter.from ? validDate(filter.from) : Number.NEGATIVE_INFINITY;
      const to = filter.to ? validDate(filter.to) : Number.POSITIVE_INFINITY;
      return validDate(budget.periodEnd) >= from && validDate(budget.periodStart) <= to;
    };
    const byCenter = new Map<string, { actual: number; costIds: Set<string>; allocationCount: number; byMethod: Record<EfoAllocationMethod, number> }>();
    const emptyMethods = (): Record<EfoAllocationMethod, number> => ({ direct: 0, shared: 0, usage: 0, proportional: 0 });
    for (const allocation of allocations) {
      const cost = costById.get(allocation.costId);
      if (!cost || !includeCost(cost)) continue;
      if (filter?.costCenterId && allocation.costCenterId !== filter.costCenterId) continue;
      const current = byCenter.get(allocation.costCenterId) ?? { actual: 0, costIds: new Set<string>(), allocationCount: 0, byMethod: emptyMethods() };
      current.actual += allocation.amountMinor;
      current.costIds.add(cost.id);
      current.allocationCount += 1;
      current.byMethod[allocation.method] += allocation.amountMinor;
      byCenter.set(allocation.costCenterId, current);
    }
    const budgetByCenter = new Map<string, number>();
    for (const budget of budgets) {
      if (!budgetInWindow(budget)) continue;
      if (filter?.costCenterId && budget.costCenterId !== filter.costCenterId) continue;
      budgetByCenter.set(budget.costCenterId, (budgetByCenter.get(budget.costCenterId) ?? 0) + budget.amountMinor);
    }
    return centers
      .filter((center) => !filter?.costCenterId || center.id === filter.costCenterId)
      .map((center) => {
        const values = byCenter.get(center.id);
        const actualMinor = values?.actual ?? 0;
        const budgetMinor = budgetByCenter.get(center.id) ?? 0;
        const utilizationPct = budgetMinor > 0 ? roundPct((actualMinor / budgetMinor) * 100) : 0;
        const status: EfoChargeback["status"] = budgetMinor <= 0 ? "no_budget" : utilizationPct > 100 ? "over" : utilizationPct >= 80 ? "warning" : "on_track";
        return {
          costCenterId: center.id,
          name: center.name,
          code: center.code,
          currency: center.currency,
          budgetMinor,
          actualMinor,
          varianceMinor: budgetMinor - actualMinor,
          utilizationPct,
          status,
          costCount: values?.costIds.size ?? 0,
          allocationCount: values?.allocationCount ?? 0,
          byMethod: values?.byMethod ?? { direct: 0, shared: 0, usage: 0, proportional: 0 },
        } satisfies EfoChargeback;
      })
      .sort((a, b) => a.code.localeCompare(b.code) || a.costCenterId.localeCompare(b.costCenterId));
  },

  async rollup(org: string): Promise<EfoRollup> {
    const [centers, budgets, costs, allocations, chargebacks] = await Promise.all([
      this.listCostCenters(org),
      this.listBudgets(org),
      this.listCosts(org),
      this.listAllocations(org),
      this.chargebacks(org),
    ]);
    const totalsByCurrency: EfoRollup["totalsByCurrency"] = {};
    const ensureTotals = (code: string) => {
      if (!totalsByCurrency[code]) totalsByCurrency[code] = { costMinor: 0, allocatedMinor: 0, unallocatedMinor: 0, budgetMinor: 0 };
      return totalsByCurrency[code]!;
    };
    for (const cost of costs) ensureTotals(cost.currency).costMinor += cost.amountMinor;
    for (const allocation of allocations) ensureTotals(allocation.currency).allocatedMinor += allocation.amountMinor;
    for (const budget of budgets) {
      if (budget.status === "active") ensureTotals(budget.currency).budgetMinor += budget.amountMinor;
    }
    for (const code of Object.keys(totalsByCurrency)) {
      const totals = totalsByCurrency[code]!;
      totals.unallocatedMinor = totals.costMinor - totals.allocatedMinor;
    }
    const stamps = [...centers, ...budgets, ...costs, ...allocations]
      .map((row) => ("updatedAt" in row ? row.updatedAt : row.createdAt))
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
    return {
      counts: {
        costCenters: centers.length,
        activeCostCenters: centers.filter((center) => center.status === "active").length,
        budgets: budgets.length,
        activeBudgets: budgets.filter((budget) => budget.status === "active").length,
        costs: costs.length,
        allocations: allocations.length,
      },
      totalsByCurrency,
      chargebacks,
      recentCosts: costs.slice(0, 8),
      lastUpdatedAt: stamps,
    };
  },

  // ─── Opt-in demo data ─────────────────────────────────────────────────
  async ensureDemoSeed(logger?: { info?: (...args: any[]) => void }): Promise<boolean> {
    const demoOrg = "org-demo-efo";
    if ((await this.listCostCenters(demoOrg)).length > 0) return false;
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const at = (day: number) => new Date(start.getTime() + (day - 1) * 86_400_000 + 3_600_000).toISOString();
    const period = { period: "monthly" as const, periodStart: start.toISOString(), periodEnd: end.toISOString(), currency: "USD" };

    const product = await this.createCostCenter(demoOrg, { name: "Product Engineering", code: "PROD", owner: "engineering", currency: "USD" }, "demo");
    const data = await this.createCostCenter(demoOrg, { name: "Data Platform", code: "DATA", owner: "data-platform", currency: "USD" }, "demo");
    const shared = await this.createCostCenter(demoOrg, { name: "Shared Services", code: "SHARED", owner: "platform", currency: "USD" }, "demo");
    await this.createBudget(demoOrg, { ...period, costCenterId: product.id, name: "Product monthly budget", amountMinor: 120_000_00 }, "demo");
    await this.createBudget(demoOrg, { ...period, costCenterId: data.id, name: "Data monthly budget", amountMinor: 90_000_00 }, "demo");
    await this.createBudget(demoOrg, { ...period, costCenterId: shared.id, name: "Shared monthly budget", amountMinor: 75_000_00 }, "demo");

    await this.createCost(demoOrg, { provider: "aws", category: "compute", service: "EKS product", amountMinor: 34_500_00, currency: "USD", occurredAt: at(3), source: "provider_import", costCenterId: product.id, allocationMethod: "direct", allocationDriver: "provider cost export" }, "demo");
    await this.createCost(demoOrg, { provider: "gcp", category: "ml", service: "Vertex feature jobs", amountMinor: 22_100_00, currency: "USD", occurredAt: at(5), source: "provider_import", costCenterId: data.id, allocationMethod: "usage", allocationDriver: "job-hours" }, "demo");
    const sharedCost = await this.createCost(demoOrg, { provider: "windels", category: "network", service: "Shared Kubernetes ingress", amountMinor: 18_000_00, currency: "USD", occurredAt: at(7), source: "metered", description: "Shared ingress allocation", tags: { environment: "production" } }, "demo");
    await this.createAllocation(demoOrg, { costId: sharedCost.id, costCenterId: product.id, amountMinor: 9_000_00, currency: "USD", method: "proportional", driver: "50% request share" }, "demo");
    await this.createAllocation(demoOrg, { costId: sharedCost.id, costCenterId: data.id, amountMinor: 9_000_00, currency: "USD", method: "proportional", driver: "50% request share" }, "demo");
    logger?.info?.("[enterprise-finops] demo seed complete (org-demo-efo): 3 cost centers, 3 budgets, 3 costs, 4 allocations");
    return true;
  },
};
