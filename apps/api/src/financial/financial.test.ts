/**
 * WINDELS AI OS — Financial Policy console (completion).
 *
 * These tests pin the honesty contract the module exists to enforce:
 *
 *   - a fresh organization reports an EMPTY decision ledger, not seeded rows
 *   - every ledger entry is a real audited event the operator produced
 *   - simulated provenance is never decision-safe (unless explicitly sandboxed)
 *   - a decision verdict comes from the shared safety gate, never from us
 *   - two organizations never share a ledger
 *
 * Redis is substituted with the repo's FakeKv, so no infrastructure is needed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../config/demoData.js", async (orig) => {
  const actual = await (orig() as Promise<typeof import("../config/demoData.js")>);
  return { ...actual, demoDataEnabled: () => false };
});

const { FinancialService } = await import("./financial.service.js");

const ORG_A = "org-fin-a";
const ORG_B = "org-fin-b";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

const realProvenance = {
  source: "billing/invoice-123",
  provider: "stripe",
  providerTransactionId: "pi_123",
  organizationId: ORG_A,
  observedAt: new Date().toISOString(),
  verifiedAt: new Date().toISOString(),
  currency: "USD",
  status: "REAL" as const,
};

const simulatedProvenance = {
  source: "demo/market-snapshot",
  provider: "simulated_fixture",
  organizationId: ORG_A,
  observedAt: new Date().toISOString(),
  verifiedAt: null,
  currency: "USD",
  status: "SIMULATED" as const,
  reason: "DEMO_FIXTURE",
};

describe("a fresh organization invents nothing", () => {
  it("reports an empty ledger and zero counters", async () => {
    await FinancialService.ensureBootstrapped(undefined, ORG_A);
    const d = await FinancialService.dashboard(ORG_A);
    expect(d.ledgerCount).toBe(0);
    expect(d.recentLedger).toEqual([]);
    expect(d.safeDecisions).toBe(0);
    expect(d.blockedDecisions).toBe(0);
    expect(d.providersSeen).toEqual([]);
    for (const s of ["REAL", "SIMULATED", "UNAVAILABLE", "UNVERIFIED", "STALE"]) {
      expect(d.countsByStatus[s as keyof typeof d.countsByStatus]).toBe(0);
    }
  });
});

describe("the decision ledger records real audited events", () => {
  it("records a REAL safe decision and rolls it up", async () => {
    const verdict = await FinancialService.decide(ORG_A, realProvenance);
    expect(verdict.safe).toBe(true);

    const d = await FinancialService.dashboard(ORG_A);
    expect(d.ledgerCount).toBe(1);
    expect(d.safeDecisions).toBe(1);
    expect(d.blockedDecisions).toBe(0);
    expect(d.countsByStatus.REAL).toBe(1);
    expect(d.providersSeen).toContain("stripe");
    expect(d.recentLedger[0].status).toBe("REAL");
    expect(d.recentLedger[0].safe).toBe(true);
  });

  it("deleteLedger removes a single entry", async () => {
    await FinancialService.decide(ORG_A, realProvenance);
    const d0 = await FinancialService.dashboard(ORG_A);
    const id = d0.recentLedger[0].id;

    expect(await FinancialService.deleteLedger(ORG_A, id)).toBe(true);
    expect((await FinancialService.dashboard(ORG_A)).ledgerCount).toBe(0);
    expect(await FinancialService.deleteLedger(ORG_A, id)).toBe(false);
  });
});

describe("simulated data is never decision-safe", () => {
  it("decide() blocks simulated provenance and records the block", async () => {
    const verdict = await FinancialService.decide(ORG_A, simulatedProvenance);
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toMatch(/SIMULATED/i);

    const d = await FinancialService.dashboard(ORG_A);
    expect(d.blockedDecisions).toBe(1);
    expect(d.countsByStatus.SIMULATED).toBe(1);
  });

  it("check() is non-throwing and honours allowSandbox", async () => {
    const blocked = await FinancialService.check(simulatedProvenance);
    expect(blocked.safe).toBe(false);
    expect(blocked.reason).toMatch(/SIMULATED/i);

    const sandboxed = await FinancialService.check(simulatedProvenance, { allowSandbox: true });
    expect(sandboxed.safe).toBe(true);
  });

  it("a REAL provenance with a stale observedAt fails the freshness gate", async () => {
    const stale = {
      ...realProvenance,
      observedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    const verdict = await FinancialService.check(stale, { maxAgeMs: 60 * 1000 });
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toMatch(/EXPIRED/i);
  });
});

describe("provenance factories record their origin", () => {
  it("createSimulated records a SIMULATED entry", async () => {
    await FinancialService.createSimulated(ORG_A, {
      source: "demo/market-snapshot",
      reason: "DEMO_FIXTURE",
    });
    const d = await FinancialService.dashboard(ORG_A);
    expect(d.countsByStatus.SIMULATED).toBe(1);
    expect(d.blockedDecisions).toBe(1);
  });

  it("createReal records a REAL entry", async () => {
    const p = await FinancialService.createReal(ORG_A, {
      source: "wallet/settlement", provider: "stripe", currency: "USD",
    });
    expect(p.status).toBe("REAL");
    const d = await FinancialService.dashboard(ORG_A);
    expect(d.countsByStatus.REAL).toBe(1);
  });
});

describe("tenant isolation", () => {
  it("two organizations never share a ledger", async () => {
    await FinancialService.decide(ORG_A, realProvenance);
    await FinancialService.decide(ORG_B, realProvenance);
    expect((await FinancialService.dashboard(ORG_A)).ledgerCount).toBe(1);
    expect((await FinancialService.dashboard(ORG_B)).ledgerCount).toBe(1);
    expect((await FinancialService.dashboard(ORG_A)).recentLedger[0].organizationId).toBe(ORG_A);
  });
});
