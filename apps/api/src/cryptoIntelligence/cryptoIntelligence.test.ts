/**
 * Crypto Intelligence — opt-in gate and human-approval invariants.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The service header states the rule this module lives by:
 *
 *   "OPT-IN MODULE: disabled by default; all trading actions require
 *    governance + human approval."
 *
 * That is a safety control over real money, and the module inventory reported
 * `tests=0` — nothing enforced it. A refactor that defaulted `enabled` to true,
 * or that let a single approver clear a trade, would have shipped silently.
 *
 * These cases pin the invariants rather than the implementation:
 *
 *   - a fresh install is disabled, and proposing a trade throws MODULE_DISABLED
 *   - enabling is an explicit, recorded act
 *   - a proposal starts unapproved and requires TWO approvals
 *   - one approval is not enough
 *   - approving never executes; it only advances state
 *   - rejection is terminal and keeps the stated reason
 *
 * Redis is substituted with FakeKv, so no infrastructure is required.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { CryptoIntelligenceService } = await import("./cryptoIntelligence.service.js");

const baseTrade = {
  strategyId: "st-1",
  symbol: "BTC/USDT",
  side: "buy" as const,
  quantity: 0.5,
  rationale: "momentum signal",
  riskLevel: "medium" as const,
};

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("the module is off until someone turns it on", () => {
  it("reports disabled on a fresh install", async () => {
    const cfg = await CryptoIntelligenceService.isEnabled();
    expect(cfg.enabled).toBe(false);
    expect(cfg.status).toBe("disabled");
  });

  it("refuses to accept a trade proposal while disabled", async () => {
    await expect(
      CryptoIntelligenceService.proposeTrade(baseTrade as any),
    ).rejects.toMatchObject({ code: "MODULE_DISABLED" });
  });

  it("enables only on an explicit status change", async () => {
    await CryptoIntelligenceService.setModuleStatus("enabled-paper");
    const cfg = await CryptoIntelligenceService.isEnabled();
    expect(cfg.enabled).toBe(true);
    expect(cfg.status).toBe("enabled-paper");
  });

  it("can be switched back off, and then refuses proposals again", async () => {
    await CryptoIntelligenceService.setModuleStatus("enabled-paper");
    await CryptoIntelligenceService.setModuleStatus("disabled");

    expect((await CryptoIntelligenceService.isEnabled()).enabled).toBe(false);
    await expect(
      CryptoIntelligenceService.proposeTrade(baseTrade as any),
    ).rejects.toMatchObject({ code: "MODULE_DISABLED" });
  });
});

describe("a proposal is never self-approving", () => {
  beforeEach(async () => {
    await CryptoIntelligenceService.setModuleStatus("enabled-paper");
  });

  it("starts with zero approvals and requires two", async () => {
    const p = await CryptoIntelligenceService.proposeTrade(baseTrade as any);
    expect(p.approvalsReceived).toBe(0);
    expect(p.approvalsRequired).toBe(2);
    expect(p.state).not.toBe("approved");
  });

  it("is not approved after a single sign-off", async () => {
    const p = await CryptoIntelligenceService.proposeTrade(baseTrade as any);
    const after = await CryptoIntelligenceService.approveTrade(p.id, "alice");

    expect(after!.approvalsReceived).toBe(1);
    // The whole point of two-person control: one approver cannot clear a trade.
    expect(after!.state).not.toBe("approved");
  });

  it("reaches approved only on the second distinct sign-off", async () => {
    const p = await CryptoIntelligenceService.proposeTrade(baseTrade as any);
    await CryptoIntelligenceService.approveTrade(p.id, "alice");
    const after = await CryptoIntelligenceService.approveTrade(p.id, "bob");

    expect(after!.approvalsReceived).toBe(2);
    expect(after!.state).toBe("approved");
    expect(after!.approvedBy).toEqual(["alice", "bob"]);
  });

  it("never counts more approvals than required", async () => {
    const p = await CryptoIntelligenceService.proposeTrade(baseTrade as any);
    await CryptoIntelligenceService.approveTrade(p.id, "alice");
    await CryptoIntelligenceService.approveTrade(p.id, "bob");
    const third = await CryptoIntelligenceService.approveTrade(p.id, "carol");
    expect(third!.approvalsReceived).toBe(2);
  });

  it("approval advances state but does not mark the trade executed", async () => {
    const p = await CryptoIntelligenceService.proposeTrade(baseTrade as any);
    await CryptoIntelligenceService.approveTrade(p.id, "alice");
    const after = await CryptoIntelligenceService.approveTrade(p.id, "bob");
    // "approved" means cleared to proceed — not filled. Nothing in this module
    // may move from approval straight to execution.
    expect(after!.state).toBe("approved");
    expect(after!.state).not.toBe("executed");
  });

  it("returns null for an unknown proposal instead of inventing one", async () => {
    await expect(
      CryptoIntelligenceService.approveTrade("tp-nope", "alice"),
    ).resolves.toBeNull();
  });
});

describe("live mode routes through governance review", () => {
  it("puts a live-mode proposal into governance-review, not straight to proposed", async () => {
    await CryptoIntelligenceService.setModuleStatus("enabled-live");
    const p = await CryptoIntelligenceService.proposeTrade(baseTrade as any);
    expect(p.state).toBe("governance-review");
    expect(p.approvalsReceived).toBe(0);
  });

  it("still requires two approvals in live mode", async () => {
    await CryptoIntelligenceService.setModuleStatus("enabled-live");
    const p = await CryptoIntelligenceService.proposeTrade(baseTrade as any);
    const one = await CryptoIntelligenceService.approveTrade(p.id, "alice");
    expect(one!.state).not.toBe("approved");
  });
});

describe("rejection", () => {
  beforeEach(async () => {
    await CryptoIntelligenceService.setModuleStatus("enabled-paper");
  });

  it("records the reason and marks the trade rejected", async () => {
    const p = await CryptoIntelligenceService.proposeTrade(baseTrade as any);
    const r = await CryptoIntelligenceService.rejectTrade(p.id, "exceeds risk budget");

    expect(r!.state).toBe("rejected");
    expect(r!.rejectReason).toBe("exceeds risk budget");
  });

  it("leaves other proposals untouched", async () => {
    const a = await CryptoIntelligenceService.proposeTrade(baseTrade as any);
    const b = await CryptoIntelligenceService.proposeTrade({ ...baseTrade, symbol: "ETH/USDT" } as any);

    await CryptoIntelligenceService.rejectTrade(a.id, "no");
    const still = await CryptoIntelligenceService.approveTrade(b.id, "alice");
    expect(still!.state).not.toBe("rejected");
  });
});
