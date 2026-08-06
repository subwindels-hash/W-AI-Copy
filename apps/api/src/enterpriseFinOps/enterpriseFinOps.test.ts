/**
 * Session 100 — Enterprise FinOps depth service tests.
 *
 * The suite uses a fake Redis map but exercises the real org-scoped service:
 * cost-center and budget CRUD, integer-money cost entries, allocation caps,
 * computed chargebacks, deterministic rollups, seed idempotency, and
 * cross-tenant fail-closed reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | number>();
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
    async hset(key: string, field: string, value: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(field, value);
      return 1;
    }
    async hget(key: string, field: string) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return null;
      const value = map.get(field);
      return value === undefined ? null : String(value);
    }
    async zadd(key: string, score: number, member: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(member, String(score));
      return 1;
    }
    async zrange(key: string, start: number, stop: number) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return [];
      const entries = [...map.entries()].sort((a, b) => Number(a[1]) - Number(b[1]) || a[0].localeCompare(b[0]));
      return entries.slice(start, stop === -1 ? undefined : stop + 1).map(([member]) => member);
    }
    async zrem(key: string, member: string) {
      const map = this.store.get(key);
      return map instanceof Map && map.delete(member) ? 1 : 0;
    }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({ redisCmd: fake }));
vi.mock("../kernel/kernel.service.js", () => ({ KernelService: { dispatch: vi.fn(async () => ({})) } }));

import { EnterpriseFinOpsService as Efo } from "./enterpriseFinOps.service.js";
import {
  EfoAllocationCreateSchema,
  EfoBudgetUpsertSchema,
  EfoCostCenterUpsertSchema,
  EfoCostEntryUpsertSchema,
} from "@windels/shared/enterpriseFinOps";

const A = "org-efo-a";
const B = "org-efo-b";
const START = "2026-01-01T00:00:00.000Z";
const END = "2026-02-01T00:00:00.000Z";

beforeEach(() => fake.store.clear());

async function center(org = A, code = "ENG", currency = "USD") {
  return Efo.createCostCenter(org, { name: `${code} center`, code, owner: "owner", currency }, "u1");
}

async function budget(costCenterId: string, amountMinor = 10_000) {
  return Efo.createBudget(A, {
    costCenterId, name: "January budget", period: "monthly", periodStart: START, periodEnd: END,
    amountMinor, currency: "USD",
  }, "u1");
}

describe("EFO — cost centers and budgets", () => {
  it("creates, lists, updates and archives an org-scoped cost center", async () => {
    const created = await center();
    expect(created.id).toMatch(/^efc-/);
    expect(created.code).toBe("ENG");
    expect((await Efo.listCostCenters(A))).toHaveLength(1);

    const updated = await Efo.updateCostCenter(A, created.id, { name: "Engineering", status: "archived" }, "u2");
    expect(updated).toMatchObject({ name: "Engineering", status: "archived" });
    expect((await Efo.listCostCenters(A, { status: "active" }))).toHaveLength(0);
    expect((await Efo.listCostCenters(A, { status: "archived" }))).toHaveLength(1);
  });

  it("rejects duplicate codes and preserves currency once a center has accounting data", async () => {
    const first = await center();
    await expect(center(A, "eng")).rejects.toThrow("COST_CENTER_CODE_EXISTS");
    await budget(first.id);
    await expect(Efo.updateCostCenter(A, first.id, { currency: "EUR" }, "u1")).rejects.toThrow("CURRENCY_LOCKED");
  });

  it("creates budgets only for live centers with matching currency and valid periods", async () => {
    const c = await center();
    const b = await budget(c.id, 25_000);
    expect(b.id).toMatch(/^efb-/);
    expect(b.amountMinor).toBe(25_000);
    expect(b.periodStart).toBe(START);
    await expect(Efo.createBudget(A, { costCenterId: "missing", name: "x", period: "monthly", periodStart: START, periodEnd: END, amountMinor: 1, currency: "USD" }, null))
      .rejects.toThrow("COST_CENTER_NOT_FOUND");
    await expect(Efo.createBudget(A, { costCenterId: c.id, name: "bad", period: "monthly", periodStart: END, periodEnd: START, amountMinor: 1, currency: "USD" }, null))
      .rejects.toThrow("INVALID_PERIOD");
    await expect(Efo.createBudget(A, { costCenterId: c.id, name: "eur", period: "monthly", periodStart: START, periodEnd: END, amountMinor: 1, currency: "EUR" }, null))
      .rejects.toThrow("CURRENCY_MISMATCH");
  });
});

describe("EFO — actual cost and allocation ledgers", () => {
  it("records integer minor-unit costs and creates an honest direct allocation", async () => {
    const c = await center();
    const cost = await Efo.createCost(A, {
      provider: "aws", category: "compute", service: "EKS", amountMinor: 2_500, currency: "USD",
      occurredAt: "2026-01-05T00:00:00.000Z", source: "provider_import", costCenterId: c.id,
    }, "u1");
    expect(cost.id).toMatch(/^efcost-/);
    expect(cost.amountMinor).toBe(2_500);
    const allocations = await Efo.listAllocations(A, { costId: cost.id });
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toMatchObject({ amountMinor: 2_500, method: "direct", costCenterId: c.id });
  });

  it("supports shared allocations but never allocates more than the real cost", async () => {
    const c1 = await center(A, "ENG");
    const c2 = await center(A, "DATA");
    const cost = await Efo.createCost(A, {
      provider: "windels", category: "network", service: "Ingress", amountMinor: 1_000, currency: "USD",
      occurredAt: "2026-01-06T00:00:00.000Z", source: "metered",
    }, "u1");
    const a1 = await Efo.createAllocation(A, { costId: cost.id, costCenterId: c1.id, amountMinor: 600, currency: "USD", method: "proportional", driver: "60% requests" }, "u1");
    const a2 = await Efo.createAllocation(A, { costId: cost.id, costCenterId: c2.id, amountMinor: 400, currency: "USD", method: "proportional", driver: "40% requests" }, "u1");
    expect(a1.amountMinor + a2.amountMinor).toBe(1_000);
    await expect(Efo.createAllocation(A, { costId: cost.id, costCenterId: c1.id, amountMinor: 1, currency: "USD", method: "shared" }, "u1"))
      .rejects.toThrow("ALLOCATION_EXCEEDS_COST");
  });

  it("rejects cross-currency and cross-tenant allocation references", async () => {
    const c = await center();
    const cost = await Efo.createCost(A, { provider: "gcp", category: "ml", service: "Jobs", amountMinor: 500, currency: "USD", source: "manual" }, null);
    await expect(Efo.createAllocation(A, { costId: cost.id, costCenterId: c.id, amountMinor: 500, currency: "EUR", method: "direct" }, null))
      .rejects.toThrow("CURRENCY_MISMATCH");
    expect(await Efo.getCost(B, cost.id)).toBeNull();
    await expect(Efo.createAllocation(B, { costId: cost.id, costCenterId: c.id, amountMinor: 500, currency: "USD", method: "direct" }, null))
      .rejects.toThrow("COST_NOT_FOUND");
  });
});

describe("EFO — computed chargebacks and rollup", () => {
  it("computes budget utilization, variance and allocation-method totals from real rows", async () => {
    const c = await center();
    await budget(c.id, 10_000);
    await Efo.createCost(A, { provider: "aws", category: "compute", service: "Compute", amountMinor: 2_500, currency: "USD", occurredAt: "2026-01-04T00:00:00.000Z", costCenterId: c.id, allocationMethod: "direct" }, null);
    const shared = await Efo.createCost(A, { provider: "windels", category: "network", service: "Shared", amountMinor: 2_000, currency: "USD", occurredAt: "2026-01-05T00:00:00.000Z" }, null);
    await Efo.createAllocation(A, { costId: shared.id, costCenterId: c.id, amountMinor: 1_000, currency: "USD", method: "shared", driver: "50/50" }, null);
    await Efo.createCost(A, { provider: "aws", category: "storage", service: "Unallocated", amountMinor: 500, currency: "USD", occurredAt: "2026-01-06T00:00:00.000Z" }, null);

    const rows = await Efo.chargebacks(A);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ budgetMinor: 10_000, actualMinor: 3_500, varianceMinor: 6_500, utilizationPct: 35, status: "on_track", costCount: 2, allocationCount: 2 });
    expect(rows[0]!.byMethod).toEqual({ direct: 2_500, shared: 1_000, usage: 0, proportional: 0 });

    const rollup = await Efo.rollup(A);
    expect(rollup.counts).toEqual({ costCenters: 1, activeCostCenters: 1, budgets: 1, activeBudgets: 1, costs: 3, allocations: 2 });
    expect(rollup.totalsByCurrency.USD).toEqual({ costMinor: 5_000, allocatedMinor: 3_500, unallocatedMinor: 1_500, budgetMinor: 10_000 });
  });

  it("filters chargebacks by an honest occurredAt window", async () => {
    const c = await center();
    await budget(c.id, 10_000);
    await Efo.createCost(A, { provider: "aws", category: "compute", service: "January", amountMinor: 2_000, currency: "USD", occurredAt: "2026-01-10T00:00:00.000Z", costCenterId: c.id }, null);
    await Efo.createCost(A, { provider: "aws", category: "compute", service: "February", amountMinor: 4_000, currency: "USD", occurredAt: "2026-02-10T00:00:00.000Z", costCenterId: c.id }, null);
    const rows = await Efo.chargebacks(A, { from: START, to: END });
    expect(rows[0]!.actualMinor).toBe(2_000);
    expect(rows[0]!.costCount).toBe(1);
  });

  it("returns deterministic numeric rollups and an honest empty org", async () => {
    const empty = await Efo.rollup(B);
    expect(empty.counts.costCenters).toBe(0);
    expect(empty.totalsByCurrency).toEqual({});
    expect(empty.chargebacks).toEqual([]);
    expect(empty.lastUpdatedAt).toBeNull();

    const c = await center();
    await budget(c.id);
    await Efo.createCost(A, { provider: "azure", category: "database", service: "DB", amountMinor: 100, currency: "USD", costCenterId: c.id }, null);
    const one = await Efo.rollup(A);
    const two = await Efo.rollup(A);
    expect(two.counts).toEqual(one.counts);
    expect(two.totalsByCurrency).toEqual(one.totalsByCurrency);
    expect(two.chargebacks.map((r) => ({ ...r, byMethod: { ...r.byMethod } }))).toEqual(one.chargebacks.map((r) => ({ ...r, byMethod: { ...r.byMethod } })));
  });
});

describe("EFO — tenant isolation, deletion and demo policy", () => {
  it("org B cannot read org A centers, budgets, costs, allocations or chargebacks", async () => {
    const c = await center(A);
    const b = await budget(c.id);
    const cost = await Efo.createCost(A, { provider: "aws", category: "compute", service: "API", amountMinor: 100, currency: "USD", costCenterId: c.id }, null);
    const allocations = await Efo.listAllocations(A, { costId: cost.id });
    expect(await Efo.listCostCenters(B)).toHaveLength(0);
    expect(await Efo.getCostCenter(B, c.id)).toBeNull();
    expect(await Efo.getBudget(B, b.id)).toBeNull();
    expect(await Efo.getCost(B, cost.id)).toBeNull();
    expect(await Efo.getAllocation(B, allocations[0]!.id)).toBeNull();
    expect((await Efo.rollup(B)).counts).toEqual({ costCenters: 0, activeCostCenters: 0, budgets: 0, activeBudgets: 0, costs: 0, allocations: 0 });
    expect(await Efo.chargebacks(B)).toEqual([]);
    expect(await Efo.deleteBudget(B, b.id)).toBe(false);
    expect(await Efo.deleteCost(B, cost.id)).toBe(false);
  });

  it("cascades allocations when deleting a cost and blocks deletion of an in-use center", async () => {
    const c = await center();
    const cost = await Efo.createCost(A, { provider: "aws", category: "compute", service: "API", amountMinor: 100, currency: "USD", costCenterId: c.id }, null);
    await expect(Efo.deleteCostCenter(A, c.id)).rejects.toThrow("COST_CENTER_IN_USE");
    expect(await Efo.deleteCost(A, cost.id)).toBe(true);
    expect(await Efo.listAllocations(A)).toHaveLength(0);
    expect(await Efo.deleteCostCenter(A, c.id)).toBe(true);
  });

  it("seeds the gated demo organization once", async () => {
    expect(await Efo.ensureDemoSeed()).toBe(true);
    const first = await Efo.rollup("org-demo-efo");
    expect(first.counts).toMatchObject({ costCenters: 3, budgets: 3, costs: 3, allocations: 4 });
    expect(first.totalsByCurrency.USD.unallocatedMinor).toBe(0);
    expect(await Efo.ensureDemoSeed()).toBe(false);
    expect((await Efo.rollup("org-demo-efo")).counts).toEqual(first.counts);
  });
});

describe("EFO — shared Zod contracts", () => {
  it("accepts valid contracts and rejects invalid accounting inputs", () => {
    expect(EfoCostCenterUpsertSchema.safeParse({ name: "Engineering", code: "ENG", owner: "team", currency: "usd" }).success).toBe(true);
    expect(EfoCostCenterUpsertSchema.safeParse({ name: "", code: "ENG", owner: "team" }).success).toBe(false);
    expect(EfoBudgetUpsertSchema.safeParse({ costCenterId: "c", name: "B", period: "monthly", periodStart: START, periodEnd: END, amountMinor: 100, currency: "USD" }).success).toBe(true);
    expect(EfoCostEntryUpsertSchema.safeParse({ provider: "aws", category: "compute", service: "EKS", amountMinor: 1.5 }).success).toBe(false);
    expect(EfoAllocationCreateSchema.safeParse({ costId: "c", costCenterId: "cc", amountMinor: 1, method: "bad" }).success).toBe(false);
  });
});
