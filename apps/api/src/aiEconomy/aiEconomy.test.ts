/**
 * Session 103 — AI Economy ledger tests.
 *
 * Proves the previously thin GPU/economy module is backed by real org-scoped
 * records: usage, allocations, capacity offers, deterministic rollups,
 * legacy migration, deletion and shared contracts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisCommand: (_command: string, fn: () => unknown) => fn(),
}));

const { AiEconomyService: Eco } = await import("./aiEconomy.service.js");
const { AiEconomyAllocationSchema, AiEconomyOfferSchema, AiEconomyUsageSchema } = await import("@windels/shared/aiEconomy");

const A = "org-economy-a";
const B = "org-economy-b";

function reset() {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
}
function usage(overrides: Partial<Parameters<typeof Eco.recordUsage>[1]> = {}) {
  return { resource: "gpu" as const, quantity: 4, unit: "hours", costCents: 1200, department: "research", ...overrides };
}
function allocation(overrides: Partial<Parameters<typeof Eco.createAllocation>[1]> = {}) {
  return { cluster: "cluster-a", gpuType: "A100", assignedTo: "team-research", job: "train-v1", utilizationPct: 75, vramUsedGb: 24, costPerHour: 3.25, ...overrides };
}
function offer(overrides: Partial<Parameters<typeof Eco.createOffer>[1]> = {}) {
  return { provider: "internal" as const, gpuType: "A100", vramGb: 80, pricePerHour: 3.25, region: "us-east", available: true, utilizationPct: 25, ...overrides };
}

beforeEach(reset);

describe("AI Economy — real org-scoped ledgers", () => {
  it("records usage as an individual CSPRNG-keyed org record", async () => {
    const row = await Eco.recordUsage(A, usage());
    expect(row.id).toMatch(/^usage-/);
    expect(row.costCents).toBe(1200);
    expect((await Eco.listUsage(A))).toHaveLength(1);
    expect([...kv.hashes.keys()].some((key) => key.startsWith(`eco:usage:i:${A}:`))).toBe(true);
  });

  it("keeps usage isolated between organizations", async () => {
    const row = await Eco.recordUsage(A, usage());
    await Eco.recordUsage(B, usage({ department: "product" }));
    expect(await Eco.listUsage(A)).toEqual([row]);
    expect(await Eco.listUsage(B)).toHaveLength(1);
    expect(await Eco.deleteUsage(B, row.id)).toBe(false);
  });

  it("records GPU allocations and capacity offers as real rows", async () => {
    const a = await Eco.createAllocation(A, allocation());
    const o = await Eco.createOffer(A, offer());
    expect(a.id).toMatch(/^alloc-/);
    expect(o.id).toMatch(/^offer-/);
    expect((await Eco.listAllocations(A))[0]).toMatchObject({ cluster: "cluster-a", utilizationPct: 75 });
    expect((await Eco.listOffers(A))[0]).toMatchObject({ gpuType: "A100", available: true });
  });

  it("updates and deletes an offer without affecting another tenant", async () => {
    const o = await Eco.createOffer(A, offer());
    expect((await Eco.updateOffer(A, o.id, { available: false, utilizationPct: 100 }))?.available).toBe(false);
    expect(await Eco.updateOffer(B, o.id, { available: true })).toBeNull();
    expect(await Eco.deleteOffer(B, o.id)).toBe(false);
    expect(await Eco.deleteOffer(A, o.id)).toBe(true);
    expect(await Eco.listOffers(A)).toHaveLength(0);
  });
});

describe("AI Economy — honest dashboard projection", () => {
  it("returns empty, non-fabricated economics for a fresh org", async () => {
    const d = await Eco.dashboard(A);
    expect(d.creditsInCirculation).toBe(0);
    expect(d.computeCost30d).toBe(0);
    expect(d.computeRevenue30d).toBe(0);
    expect(d.marginPct).toBe(0);
    expect(d.offers).toEqual([]);
    expect(d.allocations).toEqual([]);
    expect(d.forecasts).toEqual([]);
    expect(d.forecastKind).toBe("no_observation");
    expect(d.marketplaceVolume30d).toBe(0);
  });

  it("computes spend, credits, departments, capacity and observed run-rate from rows", async () => {
    await Eco.recordUsage(A, usage({ quantity: 4, costCents: 1200, department: "research" }));
    await Eco.recordUsage(A, usage({ resource: "tokens", quantity: 1000, unit: "tokens", costCents: 300, department: "product" }));
    await Eco.createAllocation(A, allocation());
    await Eco.createOffer(A, offer({ available: true }));
    await Eco.createOffer(A, offer({ gpuType: "L4", available: false, utilizationPct: 100 }));
    const d = await Eco.dashboard(A);
    expect(d.creditsInCirculation).toBe(1004);
    expect(d.computeCost30d).toBe(15);
    expect(d.gpuUtilizationPct).toBe(75);
    expect(d.gpusAvailable).toBe(1);
    expect(d.gpusTotal).toBe(2);
    expect(d.activeAllocations).toBe(1);
    expect(d.topDepartments[0]).toMatchObject({ department: "research", spend: 12, credits: 4 });
    expect(d.forecasts[0]).toMatchObject({ costUsd: 15, usageTokens: 1000 });
    expect(d.forecastKind).toBe("observed_run_rate");
  });

  it("produces stable numeric values across repeated reads", async () => {
    await Eco.recordUsage(A, usage());
    await Eco.createOffer(A, offer());
    const first = await Eco.dashboard(A);
    const second = await Eco.dashboard(A);
    expect(second.creditsInCirculation).toBe(first.creditsInCirculation);
    expect(second.computeCost30d).toBe(first.computeCost30d);
    expect(second.topDepartments).toEqual(first.topDepartments);
    expect(second.forecasts.map(({ costUsd, usageTokens }) => ({ costUsd, usageTokens }))).toEqual(first.forecasts.map(({ costUsd, usageTokens }) => ({ costUsd, usageTokens })));
  });

  it("does not turn usage into fabricated revenue or marketplace volume", async () => {
    await Eco.recordUsage(A, usage({ costCents: 99999 }));
    const d = await Eco.dashboard(A);
    expect(d.computeRevenue30d).toBe(0);
    expect(d.marketplaceVolume30d).toBe(0);
    expect(d.marginPct).toBe(0);
  });
});

describe("AI Economy — migration, deletion and contracts", () => {
  it("migrates legacy organization blobs into scoped records once", async () => {
    await kv.set(`eco:${A}:usage`, JSON.stringify([{ id: "legacy-usage", resource: "gpu", quantity: 2, unit: "hours", costCents: 500, department: "legacy", recordedAt: new Date().toISOString() }]));
    await kv.set(`eco:${A}:allocations`, JSON.stringify([{ id: "legacy-allocation", cluster: "old", gpuType: "T4", assignedTo: "team", job: "job", utilizationPct: 10, vramUsedGb: 8, costPerHour: 1, startedAt: new Date().toISOString() }]));
    expect((await Eco.listUsage(A))[0]?.id).toBe("legacy-usage");
    expect((await Eco.listAllocations(A))[0]?.id).toBe("legacy-allocation");
    expect(await kv.get(`eco:${A}:usage`)).toBeNull();
    expect(await kv.get(`eco:${A}:allocations`)).toBeNull();
    expect([...kv.hashes.keys()].some((key) => key.startsWith(`eco:usage:i:${A}:`))).toBe(true);
  });

  it("deletes usage and allocation records only in the owning organization", async () => {
    const u = await Eco.recordUsage(A, usage());
    const a = await Eco.createAllocation(A, allocation());
    expect(await Eco.deleteUsage(B, u.id)).toBe(false);
    expect(await Eco.deleteAllocation(B, a.id)).toBe(false);
    expect(await Eco.deleteUsage(A, u.id)).toBe(true);
    expect(await Eco.deleteAllocation(A, a.id)).toBe(true);
  });

  it("keeps the initialization marker idempotent", async () => {
    await Eco.ensureBootstrapped(undefined, A);
    const first = [...kv.hashes.entries()].find(([key]) => key === `eco:meta:i:${A}:ledger`)?.[1];
    await Eco.ensureBootstrapped(undefined, A);
    const second = [...kv.hashes.entries()].find(([key]) => key === `eco:meta:i:${A}:ledger`)?.[1];
    expect(first).toEqual(second);
  });

  it("validates usage, allocation and offer contracts", () => {
    expect(AiEconomyUsageSchema.safeParse({ resource: "gpu", quantity: 1, unit: "h", costCents: 10, department: "research" }).success).toBe(true);
    expect(AiEconomyUsageSchema.safeParse({ resource: "invalid", quantity: 1, unit: "h", costCents: 10, department: "research" }).success).toBe(false);
    expect(AiEconomyAllocationSchema.safeParse(allocation()).success).toBe(true);
    expect(AiEconomyAllocationSchema.safeParse({ ...allocation(), utilizationPct: 101 }).success).toBe(false);
    expect(AiEconomyOfferSchema.safeParse(offer()).success).toBe(true);
    expect(AiEconomyOfferSchema.safeParse({ ...offer(), vramGb: 0 }).success).toBe(false);
  });
});
