/**
 * Tests for StrategyBacktestEngine — analytical market-replay tool, NOT a broker.
 * Confirms the backtest engine is a pure replay/evaluation utility (no balances,
 * no fills, no custody, no IBrokerConnector) and behaves deterministically.
 */
import { describe, it, expect } from "vitest";
import { runBacktest, type StrategyFn, type BrokerCandle } from "./strategy-backtest.js";

// Note: BrokerCandle is from @windels/shared — use a small local shape for tests
// to avoid cross-module import churn.
function makeCandle(time: string, open: number, high: number, low: number, close: number, volume = 1000) {
  return { symbol: "BTCUSDT", timeframe: "H1" as const, time, open, high, low, close, tickVolume: Math.floor(volume), spread: 0 } as unknown as BrokerCandle;
}

function trendingSeries(n: number, start = 100, drift = 0.001): BrokerCandle[] {
  const out: BrokerCandle[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const o = price;
    const c = price * (1 + drift);
    out.push(makeCandle(new Date(i * 3600_000).toISOString(), o, Math.max(o, c) * 1.001, Math.min(o, c) * 0.999, c));
    price = c;
  }
  return out;
}

describe("StrategyBacktest (analytical, not a broker)", () => {
  it("is a pure data transform — does NOT implement IBrokerConnector", async () => {
    // Import should not expose a broker-typed connector.
    const mod = await import("./strategy-backtest.js");
    expect(typeof mod.runBacktest).toBe("function");
    expect((mod as any).broker).toBeUndefined();
    expect((mod as any).connect).toBeUndefined();
    expect((mod as any).sendOrder).toBeUndefined();
  });

  it("produces a deterministic report for a buy-and-hold strategy", () => {
    const series = trendingSeries(200, 100, 0.001);
    const buyAndHold: StrategyFn = ({ i }) => (i === 1 ? "long" : null);
    const r1 = runBacktest(series, buyAndHold, { startingEquity: 10_000, commissionRate: 0.001, slippageRate: 0 });
    const r2 = runBacktest(series, buyAndHold, { startingEquity: 10_000, commissionRate: 0.001, slippageRate: 0 });
    expect(r1.numTrades).toBe(1);
    expect(r1.endingEquity).toBeGreaterThan(r1.startingEquity);
    expect(r1.totalReturnPct).toBeCloseTo(r2.totalReturnPct, 8); // deterministic
  });

  it("flat strategy returns zero trades and equity unchanged (minus zero commission/slippage)", () => {
    const series = trendingSeries(100, 100, 0.002);
    const flat: StrategyFn = () => "flat";
    const r = runBacktest(series, flat, { startingEquity: 10_000, commissionRate: 0, slippageRate: 0 });
    expect(r.numTrades).toBe(0);
    expect(r.endingEquity).toBe(10_000);
    expect(r.maxDrawdownPct).toBe(0);
  });

  it("closes open position at SL before TP when hit first", () => {
    // A candle sequence that triggers SL on trade 1:
    //   i=0 baseline
    //   i=1 enter long at open=100 (sl=98, tp=104)
    //   i=2 low=97 (below sl=98) -> stop out at 98
    const series: BrokerCandle[] = [
      makeCandle("2024-01-01T00:00:00Z", 100, 101, 99, 100),
      makeCandle("2024-01-01T01:00:00Z", 100, 102, 99.5, 101),
      makeCandle("2024-01-01T02:00:00Z", 101, 101, 97, 97.5),
      makeCandle("2024-01-01T03:00:00Z", 97.5, 99, 96, 98),
    ];
    const strategy: StrategyFn = ({ i }) => (i === 1 ? "long" : null);
    const r = runBacktest(series, strategy, { startingEquity: 10_000, commissionRate: 0, slippageRate: 0, stopLossPct: 0.02, takeProfitMultiple: 2, riskPerTrade: 1 });
    expect(r.numTrades).toBe(1);
    expect(r.trades[0]!.exitReason).toBe("sl");
  });

  it("closes at TP when hit before SL", () => {
    const series: BrokerCandle[] = [
      makeCandle("2024-01-01T00:00:00Z", 100, 101, 99, 100),
      makeCandle("2024-01-01T01:00:00Z", 100, 105, 99.5, 104),
      makeCandle("2024-01-01T02:00:00Z", 104, 106, 103.5, 105),
    ];
    const strategy: StrategyFn = ({ i }) => (i === 1 ? "long" : null);
    const r = runBacktest(series, strategy, { startingEquity: 10_000, commissionRate: 0, slippageRate: 0, stopLossPct: 0.02, takeProfitMultiple: 2, riskPerTrade: 1 });
    expect(r.trades[0]!.exitReason).toBe("tp");
  });

  it("never contains negative ending equity with risk-based sizing (does not invent leverage)", () => {
    const series = trendingSeries(500, 100, -0.002); // sustained downtrend
    const longOnly: StrategyFn = ({ i }) => (i === 1 ? "long" : null);
    const r = runBacktest(series, longOnly, { startingEquity: 10_000, riskPerTrade: 0.01, stopLossPct: 0.02 });
    // Stop-loss caps loss to ~1% per trade; a single losing trade should not wipe account.
    expect(r.endingEquity).toBeGreaterThan(10_000 * 0.9);
    expect(r.numTrades).toBe(1);
  });
});
