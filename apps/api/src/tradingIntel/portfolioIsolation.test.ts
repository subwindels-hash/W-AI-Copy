/**
 * S209 — tenant isolation for trading portfolio reads.
 *
 * Before this suite existed, `TradingIntelService.listPositions()` and
 * `riskProfile()` took no organization and read two global Redis keys
 * (`ti:positions`, `ti:risk`) that were written by exactly one thing: the
 * `WINDELS_DEMO_DATA` seed. Every tenant therefore read the same book, and with
 * the seed enabled every tenant read a fabricated portfolio — three winning
 * positions and a $2.48M / 1.82-Sharpe risk profile — as its own.
 *
 * These tests pin the fix: portfolio state is derived per-org from the already
 * org-scoped BrokerIntegrationService, an org with no broker gets an empty book
 * rather than someone else's, and an org-less call fails closed.
 */
import { describe, it, expect, vi } from "vitest";

type Pos = {
  id: string; accountId: string; symbol: string; side: "long" | "short";
  volume: number; openPrice: number; currentPrice: number; profit: number;
  openTime: string; sl?: number; tp?: number;
};

const ACCOUNTS: Record<string, Array<{ id: string }>> = {
  "org-a": [{ id: "acc-a1" }],
  "org-b": [{ id: "acc-b1" }],
};

const POSITIONS: Record<string, Pos[]> = {
  "acc-a1": [
    { id: "pa1", accountId: "acc-a1", symbol: "EURUSD", side: "long", volume: 100000, openPrice: 1.078, currentPrice: 1.0842, profit: 620, openTime: "2026-08-29T10:00:00.000Z", sl: 1.07 },
    { id: "pa2", accountId: "acc-a1", symbol: "BTCUSD", side: "long", volume: 0.5, openPrice: 64200, currentPrice: 68412, profit: 2106, openTime: "2026-08-27T10:00:00.000Z" },
  ],
  "acc-b1": [
    { id: "pb1", accountId: "acc-b1", symbol: "AAPL", side: "short", volume: 10, openPrice: 214.2, currentPrice: 210.0, profit: 42, openTime: "2026-08-28T10:00:00.000Z" },
  ],
};

vi.mock("./brokerIntegration.service.js", () => ({
  BrokerIntegrationService: {
    async listAccounts(oid: string) { return ACCOUNTS[oid] ?? []; },
    async listPositions(_oid: string, accountId: string) { return POSITIONS[accountId] ?? []; },
  },
}));

const { FakeKv } = await import("../mediaFactory/publishing/fakeKv.js");
const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { TradingIntelService } = await import("./tradingIntel.service.js");

describe("tradingIntel portfolio isolation", () => {
  it("returns only the calling org's positions", async () => {
    const a = await TradingIntelService.listPositions("org-a");
    const b = await TradingIntelService.listPositions("org-b");
    expect(a.map((p) => p.instrumentId).sort()).toEqual(["BTCUSD", "EURUSD"]);
    expect(b.map((p) => p.instrumentId)).toEqual(["AAPL"]);
    // The defect: both orgs used to receive the same global book.
    expect(a).not.toEqual(b);
  });

  it("gives an org with no connected broker an empty book, not the demo one", async () => {
    expect(await TradingIntelService.listPositions("org-none")).toEqual([]);
    expect(await TradingIntelService.riskProfile("org-none")).toBeNull();
  });

  it("fails closed when the session carries no organization", async () => {
    await expect(TradingIntelService.listPositions("")).rejects.toThrow(/organization/i);
    await expect(TradingIntelService.riskProfile(undefined as any)).rejects.toThrow(/organization/i);
  });

  it("derives exposure from real positions and never invents risk metrics", async () => {
    const r = (await TradingIntelService.riskProfile("org-a"))!;
    expect(r.portfolioId).toBe("org-a");
    // 100000*1.0842 + 0.5*68412 = 108420 + 34206 = 142626
    expect(r.totalExposureUsd).toBe(142626);
    // The seed used to assert a 1.82 Sharpe, -$32,500 VaR and 7 passing
    // stress tests for a book nobody held. Unmodelled values are null.
    expect(r.sharpeRatio).toBeNull();
    expect(r.var95Usd).toBeNull();
    expect(r.stressTestsPassed).toBeNull();
    expect(r.volatilityRegime).toBeNull();
    expect(r.positionSizing).toBeNull();
    // stopLoss.enabled is measured: org-a holds one position carrying an SL.
    expect(r.stopLoss.enabled).toBe(true);
    expect(r.stopLoss.defaultPct).toBeNull();
  });

  it("maps broker fields into the Ti contract, including pnlPct and market class", async () => {
    const positions = await TradingIntelService.listPositions("org-a");
    const btc = positions.find((p) => p.instrumentId === "BTCUSD")!;
    expect(btc.marketClass).toBe("crypto");
    expect(btc.entryPrice).toBe(64200);
    expect(btc.pnlUsd).toBe(2106);
    // 2106 / (64200 * 0.5) = 6.56%
    expect(btc.pnlPct).toBeCloseTo(6.56, 2);

    const eur = positions.find((p) => p.instrumentId === "EURUSD")!;
    expect(eur.marketClass).toBe("forex");
    expect(eur.stopLoss).toBe(1.07);
    expect(eur.takeProfit).toBeUndefined();
  });

  it("dashboard reports the caller's book, and an empty one with no org", async () => {
    const scoped = await TradingIntelService.dashboard("org-a");
    expect(scoped.positionsOpen).toBe(2);
    expect(scoped.pnl24hUsd).toBe(2726); // 620 + 2106

    // No org: catalogue still resolves, portfolio is empty rather than global.
    const unscoped = await TradingIntelService.dashboard();
    expect(unscoped.positionsOpen).toBe(0);
    expect(unscoped.pnl24hUsd).toBe(0);
  });
});
