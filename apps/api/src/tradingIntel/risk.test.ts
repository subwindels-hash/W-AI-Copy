import { describe, it, expect } from "vitest";
import { RiskEngine } from "./risk.js";

const engine = new RiskEngine();
const baseAcct = { equityUsd: 100_000, positions: [], dailyPnlUsd: 0, peakEquityUsd: 100_000 };

describe("risk engine", () => {
  it("approves a standard 1% risk trade with stop loss", () => {
    // buy 100 shares @ 100, stop 99 → $100 risk = 0.1% of equity — fine
    const r = engine.evaluate({
      portfolioId:"p1", instrumentId:"AAPL", marketClass:"stocks",
      side:"long", type:"market", size:100, price:100, stopLoss:99,
      account: baseAcct,
    });
    expect(r.approved).toBe(true);
    expect(r.rulesFailed).toHaveLength(0);
  });

  it("blocks oversized position (exceeds 1% risk)", () => {
    // buy 10000 shares @100, stop 99 → $10000 = 10% risk — blocked
    const r = engine.evaluate({
      portfolioId:"p1", instrumentId:"AAPL", marketClass:"stocks",
      side:"long", type:"market", size:10000, price:100, stopLoss:99,
      account: baseAcct,
    });
    expect(r.approved).toBe(false);
    expect(r.blockedBy).toBe("MAX_ACCOUNT_RISK_PER_TRADE");
    expect(r.suggestedSize).toBeLessThan(10000);
  });

  it("blocks trade when daily loss exceeded", () => {
    const r = engine.evaluate({
      portfolioId:"p1", instrumentId:"AAPL", marketClass:"stocks",
      side:"long", type:"market", size:10, price:100, stopLoss:99,
      account: { ...baseAcct, dailyPnlUsd: -4000 }, // -4% > -3% limit
    });
    expect(r.approved).toBe(false);
    expect(r.blockedBy).toBe("DAILY_LOSS_LIMIT");
  });

  it("blocks trade when drawdown exceeded", () => {
    const r = engine.evaluate({
      portfolioId:"p1", instrumentId:"AAPL", marketClass:"stocks",
      side:"long", type:"market", size:10, price:100, stopLoss:99,
      account: { ...baseAcct, equityUsd: 88_000, peakEquityUsd: 100_000 }, // -12%
    });
    expect(r.approved).toBe(false);
    expect(r.blockedBy).toBe("MAX_DRAWDOWN");
  });

  it("blocks leverage over cap", () => {
    const r = engine.evaluate({
      portfolioId:"p1", instrumentId:"BTC/USD", marketClass:"crypto",
      side:"long", type:"market", size:1, price:50000, leverage:25,
      account: baseAcct,
    });
    expect(r.approved).toBe(false);
    expect(r.blockedBy).toBe("LEVERAGE_CAP");
  });

  it("blocks exposure limit", () => {
    // many positions already adding up to 199% of equity; new 50k pushes over
    const r = engine.evaluate({
      portfolioId:"p1", instrumentId:"AAPL", marketClass:"stocks",
      side:"long", type:"market", size:1000, price:100,
      account: { ...baseAcct, positions: Array.from({length:10},(_,i)=>({id:`p${i}`,instrumentId:"X",marketClass:"stocks",side:"long" as const,size:200,entryPrice:100,currentPrice:100,pnlUsd:0,pnlPct:0,openedAt:new Date().toISOString()})) },
    });
    // 10 positions × 200×100 = 200k (200% of equity); new 1k×100 = 100k more → total 300% = blocked
    expect(r.approved).toBe(false);
    expect(r.blockedBy).toBe("EXPOSURE_LIMIT");
  });

  it("populates metrics", () => {
    const r = engine.evaluate({
      portfolioId:"p1", instrumentId:"AAPL", marketClass:"stocks",
      side:"long", type:"market", size:100, price:100, stopLoss:99,
      account: baseAcct,
    }, 2);
    expect(r.metrics.riskPerTradeUsd).toBe(100);
    expect(r.metrics.positionValueUsd).toBe(10000);
    expect(r.metrics.dailyLossPct).toBe(0);
  });
});
