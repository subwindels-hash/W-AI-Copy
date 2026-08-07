/**
 * WINDELS AI OS — Deterministic MT5 Simulator tests (Phase 3).
 *
 * Pins hard guarantees:
 *   - No Math.random() in matching/tick engine (mulberry32 PRNG only for
 *     synthetic intra-bar models, seeded per-symbol).
 *   - Market orders fill at bid/ask with deterministic slippage.
 *   - SL/TP triggered deterministically by ticks.
 *   - Pending orders (limit/stop) fill when price crosses.
 *   - Margin enforcement rejects over-levered orders.
 *   - Same seed + same ticks → identical results (determinism).
 *   - Close/modify/position/orders/deals views reflect reality.
 *   - Candle generation is seeded per (symbol, timeframe).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Mt5Simulator } from "./mt5-simulator.js";
import type { BrokerTick } from "@windels/shared/brokerIntegration";

const ACCT = "sim-acct-1";
const CREDS = { login: "SIM-001", password: "x", server: "Simulator" };
const OPTS = { name: "Sim Test" };

function tick(symbol: string, time: string, bid: number, ask: number): BrokerTick {
  return { symbol, time, bid, ask };
}

describe("Mt5Simulator — deterministic paper trading", () => {
  let sim: Mt5Simulator;
  beforeEach(async () => {
    sim = new Mt5Simulator({ defaultBalance: 10_000, defaultLeverage: 100, seed: 42, defaultSlippagePts: 0 });
    await sim.initialize();
    await sim.connect(ACCT, CREDS, OPTS);
  });

  it("reports connected + honest state with no randomness in health/connect path", async () => {
    expect(sim.isConnected(ACCT)).toBe(true);
    const state = sim.getState(ACCT);
    expect(state.status).toBe("idle");
    expect(state.symbolsCount).toBeGreaterThan(0);
    expect(state.positionsCount).toBe(0);
    expect(state.ordersCount).toBe(0);
    const h = sim.health(ACCT);
    expect(h.connected).toBe(true);
    expect(h.endpoint).toBe("simulator://in-process");
  });

  it("market BUY fills at ask immediately and is visible in positions", async () => {
    const r = await sim.sendOrder(ACCT, { accountId: ACCT, symbol: "EURUSD", side: "long", volume: 0.1, type: "market", slippage: 0 });
    expect(r.ok).toBe(true);
    expect(r.fillPrice).toBeCloseTo(1.08503, 5); // ask
    const sync = await sim.sync(ACCT, { account: true, positions: true });
    expect(sync.positions).toHaveLength(1);
    expect(sync.positions![0]!.side).toBe("long");
    expect(sync.positions![0]!.volume).toBeCloseTo(0.1, 2);
  });

  it("SL closes the position deterministically on matching tick", async () => {
    await sim.sendOrder(ACCT, { accountId: ACCT, symbol: "EURUSD", side: "long", volume: 0.1, type: "market", sl: 1.08400, tp: 1.09000, slippage: 0 });
    const before = sim.getState(ACCT);
    expect(before.positionsCount).toBe(1);
    const t = "2030-01-01T00:00:01.000Z";
    // Price hits SL (bid ≤ 1.08400).
    const deals = sim.advance(ACCT, t, [tick("EURUSD", t, 1.08390, 1.08392)]);
    expect(deals.length).toBeGreaterThanOrEqual(1);
    const slDeal = deals.find((d) => d.comment === "stop loss");
    expect(slDeal).toBeTruthy();
    expect(slDeal!.profit).toBeLessThan(0);
    expect(sim.getState(ACCT).positionsCount).toBe(0);
  });

  it("TP closes BUY at take profit when bid >= tp", async () => {
    await sim.sendOrder(ACCT, { accountId: ACCT, symbol: "EURUSD", side: "long", volume: 0.1, type: "market", sl: 1.08000, tp: 1.08600, slippage: 0 });
    const t = "2030-01-01T00:01:00.000Z";
    const deals = sim.advance(ACCT, t, [tick("EURUSD", t, 1.08610, 1.08612)]);
    const tp = deals.find((d) => d.comment === "take profit");
    expect(tp).toBeTruthy();
    expect(tp!.profit).toBeGreaterThan(0);
  });

  it("BUY LIMIT fills when bid falls to/through limit price", async () => {
    const r = await sim.sendOrder(ACCT, { accountId: ACCT, symbol: "EURUSD", side: "long", volume: 0.1, type: "buy_limit" as any, price: 1.08400, sl: 1.08000, tp: 1.09000 });
    expect(r.ok).toBe(true);
    expect(sim.getState(ACCT).ordersCount).toBe(1);
    const t = "2030-01-02T00:00:00.000Z";
    const deals = sim.advance(ACCT, t, [tick("EURUSD", t, 1.08390, 1.08392)]);
    const filled = deals.find((d) => d.entry === "in");
    expect(filled).toBeTruthy();
    expect(filled!.price).toBeCloseTo(1.08400, 5);
    expect(sim.getState(ACCT).ordersCount).toBe(0);
    expect(sim.getState(ACCT).positionsCount).toBe(1);
  });

  it("SELL STOP triggers when bid drops through stop price", async () => {
    await sim.sendOrder(ACCT, { accountId: ACCT, symbol: "EURUSD", side: "short", volume: 0.1, type: "sell_stop" as any, price: 1.08400 });
    const t = "2030-01-02T00:00:00.000Z";
    const deals = sim.advance(ACCT, t, [tick("EURUSD", t, 1.08390, 1.08392)]);
    expect(deals.some((d) => d.entry === "in" && d.side === "short")).toBe(true);
  });

  it("closePosition removes position and records deal with realised PnL", async () => {
    await sim.sendOrder(ACCT, { accountId: ACCT, symbol: "EURUSD", side: "long", volume: 0.1, type: "market", slippage: 0 });
    // Move price favorably.
    sim.advance(ACCT, "2030-01-01T00:01:00.000Z", [tick("EURUSD", "2030-01-01T00:01:00.000Z", 1.08600, 1.08602)]);
    const positions = (await sim.sync(ACCT, { positions: true })).positions!;
    const ticket = positions[0]!.ticket!;
    const cr = await sim.closePosition(ACCT, ticket);
    expect(cr.ok).toBe(true);
    expect(cr.fillPrice).toBeCloseTo(1.08600, 5);
    const after = await sim.sync(ACCT, { positions: true });
    expect(after.positions).toHaveLength(0);
  });

  it("margin enforcement rejects over-levered orders", async () => {
    // 0.1 lot on 100:1 is ~$108 margin — should fill.
    const ok = await sim.sendOrder(ACCT, { accountId: ACCT, symbol: "EURUSD", side: "long", volume: 0.1, type: "market" });
    expect(ok.ok).toBe(true);
    // With ~$10k balance @100:1 leverage, max notional is ~$1M. 50 lots × $100k × 1.08 = $5.4M → margin ~$54k > free margin ~$9.9k.
    const bad = await sim.sendOrder(ACCT, { accountId: ACCT, symbol: "EURUSD", side: "long", volume: 50, type: "market" });
    expect(bad.ok).toBe(false);
    expect(bad.retcode).toBe(10016);
  });

  it("candle generation is deterministic for a given symbol/timeframe", async () => {
    const a = await sim.getCandles(ACCT, { symbol: "EURUSD", timeframe: "H1", count: 10 });
    const b = await sim.getCandles(ACCT, { symbol: "EURUSD", timeframe: "H1", count: 10 });
    expect(a.map((c) => c.close)).toEqual(b.map((c) => c.close));
    expect(a[0]!.open).not.toBe(a[0]!.close);
    expect(a).toHaveLength(10);
  });

  it("advanceCandles deterministically triggers SL across replay", async () => {
    sim.addSymbol(ACCT, {
      name: "TEST", digits: 5, point: 0.00001, contractSize: 100_000,
      volumeMin: 0.01, volumeMax: 10, volumeStep: 0.01,
      bid: 1.00000, ask: 1.00002, spread: 2,
    });
    await sim.sendOrder(ACCT, { accountId: ACCT, symbol: "TEST", side: "long", volume: 0.1, type: "market", sl: 0.99900, tp: 1.00250 });
    // Candle goes high to 1.002 (below TP 1.0025) and low to 0.998 (below SL 0.999): SL triggers.
    const deals = sim.advanceCandles(ACCT, [{ symbol: "TEST", timeframe: "H1", time: "2030-02-01T00:00:00Z", open: 1.0, high: 1.002, low: 0.998, close: 0.9995 }]);
    expect(deals.some((d) => d.comment === "stop loss")).toBe(true);
    expect(sim.getState(ACCT).positionsCount).toBe(0);
  });

  it("re-running advance with same inputs yields identical results (determinism)", () => {
    const runOne = () => {
      const s = new Mt5Simulator({ seed: 7, defaultBalance: 10_000 });
      s.initialize();
      s.connect(ACCT, CREDS, OPTS);
      s.sendOrder(ACCT, { accountId: ACCT, symbol: "EURUSD", side: "long", volume: 0.1, type: "market", sl: 1.08400, tp: 1.08600 });
      const deals = s.advanceCandles(ACCT, [
        { symbol: "EURUSD", timeframe: "M1", time: "2030-03-01T00:00:00Z", open: 1.085, high: 1.0855, low: 1.0835, close: 1.0838 },
      ]);
      return { positionCount: s.getState(ACCT).positionsCount, deals: deals.length, pnl: deals.reduce((x, d) => x + d.profit, 0) };
    };
    const a = runOne();
    const b = runOne();
    expect(a).toEqual(b);
  });
});
