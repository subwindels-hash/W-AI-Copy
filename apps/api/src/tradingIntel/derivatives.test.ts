/**
 * Options pricing, implied vol and bond analytics.
 *
 * The inventory lists `derivatives` as a STUB with "no service directory", but
 * the module is not hollow at all — the logic lives in tradingIntel/derivatives.ts
 * and is real quantitative finance: Black-Scholes with Greeks, a Newton-Raphson
 * IV solver, strategy payoffs and bond duration/convexity. It had no tests.
 *
 * These assert against *mathematical identities* rather than snapshots of the
 * current output. A snapshot would happily lock in a wrong number; put-call
 * parity, monotonicity and round-tripping the IV solver only hold if the maths
 * is actually right, and they would catch a sign error or a misplaced discount
 * factor that eyeballing the code would not.
 */
import { describe, it, expect } from "vitest";
import {
  blackScholes, impliedVolatility, strategyPayoff, analyzeOption, bondAnalytics,
} from "./derivatives.js";

// A plain at-the-money-ish European option.
const BASE = { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2 };

describe("Black-Scholes pricing", () => {
  it("matches the textbook value for a standard call", () => {
    // S=100 K=100 T=1 r=5% sigma=20% is the canonical worked example; the
    // closed-form call price is ~10.4506.
    const c = blackScholes({ ...BASE, type: "call" });
    expect(c.price).toBeCloseTo(10.4506, 2);
  });

  it("matches the textbook value for the matching put", () => {
    const p = blackScholes({ ...BASE, type: "put" });
    expect(p.price).toBeCloseTo(5.5735, 2);
  });

  it("satisfies put-call parity", () => {
    // C - P = S*e^(-qT) - K*e^(-rT). This is an arbitrage identity: it holds
    // for ANY correct pricer, so it catches a sign or discounting error that a
    // hardcoded expected value would not.
    const c = blackScholes({ ...BASE, type: "call" });
    const p = blackScholes({ ...BASE, type: "put" });
    const lhs = c.price - p.price;
    const rhs = BASE.S - BASE.K * Math.exp(-BASE.r * BASE.T);
    expect(lhs).toBeCloseTo(rhs, 2);
  });

  it("prices a deep in-the-money call near its intrinsic value", () => {
    const c = blackScholes({ S: 200, K: 100, T: 1, r: 0.05, sigma: 0.2, type: "call" });
    const intrinsic = 200 - 100 * Math.exp(-0.05);
    expect(c.price).toBeGreaterThanOrEqual(intrinsic - 0.01);
    expect(c.price).toBeLessThan(intrinsic + 1);
  });

  it("prices a deep out-of-the-money call near zero", () => {
    const c = blackScholes({ S: 50, K: 200, T: 0.25, r: 0.05, sigma: 0.2, type: "call" });
    expect(c.price).toBeLessThan(0.05);
    expect(c.price).toBeGreaterThanOrEqual(0);
  });
});

describe("Greeks behave as they must", () => {
  it("bounds call delta in [0,1] and put delta in [-1,0]", () => {
    const c = blackScholes({ ...BASE, type: "call" });
    const p = blackScholes({ ...BASE, type: "put" });
    expect(c.delta).toBeGreaterThan(0);
    expect(c.delta).toBeLessThan(1);
    expect(p.delta).toBeLessThan(0);
    expect(p.delta).toBeGreaterThan(-1);
  });

  it("keeps call and put delta one apart (no dividend)", () => {
    const c = blackScholes({ ...BASE, type: "call" });
    const p = blackScholes({ ...BASE, type: "put" });
    expect(c.delta - p.delta).toBeCloseTo(1, 2);
  });

  it("gives calls and puts identical gamma and vega", () => {
    const c = blackScholes({ ...BASE, type: "call" });
    const p = blackScholes({ ...BASE, type: "put" });
    expect(c.gamma).toBeCloseTo(p.gamma, 6);
    expect(c.vega).toBeCloseTo(p.vega, 4);
  });

  it("keeps gamma and vega positive for a long option", () => {
    const c = blackScholes({ ...BASE, type: "call" });
    expect(c.gamma).toBeGreaterThan(0);
    expect(c.vega).toBeGreaterThan(0);
  });

  it("peaks gamma near the money", () => {
    const atm = blackScholes({ ...BASE, type: "call" }).gamma;
    const otm = blackScholes({ ...BASE, K: 150, type: "call" }).gamma;
    const itm = blackScholes({ ...BASE, K: 50, type: "call" }).gamma;
    expect(atm).toBeGreaterThan(otm);
    expect(atm).toBeGreaterThan(itm);
  });

  it("prices monotonically in volatility", () => {
    const lo = blackScholes({ ...BASE, sigma: 0.1, type: "call" }).price;
    const hi = blackScholes({ ...BASE, sigma: 0.4, type: "call" }).price;
    expect(hi).toBeGreaterThan(lo);
  });

  it("prices monotonically in time to expiry", () => {
    const near = blackScholes({ ...BASE, T: 0.1, type: "call" }).price;
    const far = blackScholes({ ...BASE, T: 2, type: "call" }).price;
    expect(far).toBeGreaterThan(near);
  });

  it("gives a call positive rho and a put negative rho", () => {
    expect(blackScholes({ ...BASE, type: "call" }).rho).toBeGreaterThan(0);
    expect(blackScholes({ ...BASE, type: "put" }).rho).toBeLessThan(0);
  });
});

describe("implied volatility solver", () => {
  it("recovers the volatility used to generate a price", () => {
    // Round-trip: price at a known sigma, then solve for it. This is the
    // strongest available check on the solver — it must invert the pricer.
    for (const sigma of [0.1, 0.2, 0.35, 0.6]) {
      const { price } = blackScholes({ ...BASE, sigma, type: "call" });
      const iv = impliedVolatility(price, { ...BASE, type: "call" } as never);
      expect(iv).toBeCloseTo(sigma, 2);
    }
  });

  it("recovers volatility for puts too", () => {
    const { price } = blackScholes({ ...BASE, sigma: 0.28, type: "put" });
    const iv = impliedVolatility(price, { ...BASE, type: "put" } as never);
    expect(iv).toBeCloseTo(0.28, 2);
  });

  it("recovers volatility away from the money", () => {
    const opt = { S: 100, K: 130, T: 0.5, r: 0.03, sigma: 0.45 };
    const { price } = blackScholes({ ...opt, type: "call" });
    const iv = impliedVolatility(price, { ...opt, type: "call" } as never);
    expect(iv).toBeCloseTo(0.45, 2);
  });
});

describe("strategy payoff", () => {
  // P&L is per contract of 100 shares, evaluated at one expiry price.
  const longCall = [{ type: "call" as const, side: "long" as const, K: 100, premium: 5 }];
  const shortCall = [{ type: "call" as const, side: "short" as const, K: 100, premium: 5 }];

  it("pays off a long call only above the strike, net of premium", () => {
    expect(strategyPayoff(longCall, 80)).toBeCloseTo(-500, 4);   // worthless: lose the premium
    expect(strategyPayoff(longCall, 100)).toBeCloseTo(-500, 4);  // at the money: still lose it
    expect(strategyPayoff(longCall, 120)).toBeCloseTo(1500, 4);  // 20 intrinsic - 5 premium
  });

  it("caps a short call's gain at the premium and leaves the loss open", () => {
    expect(strategyPayoff(shortCall, 80)).toBeCloseTo(500, 4);
    expect(strategyPayoff(shortCall, 130)).toBeCloseTo(-2500, 4);
  });

  it("nets a spread's two legs against each other", () => {
    const spread = [
      { type: "call" as const, side: "long" as const, K: 100, premium: 5 },
      { type: "call" as const, side: "short" as const, K: 110, premium: 2 },
    ];
    // Above both strikes the spread is capped at (10 width - 3 net debit) x 100.
    expect(strategyPayoff(spread, 130)).toBeCloseTo(700, 4);
    // Below both, the whole net debit is lost.
    expect(strategyPayoff(spread, 90)).toBeCloseTo(-300, 4);
  });
});

describe("analyzeOption refuses to guess", () => {
  it("reports missing inputs rather than inventing a price", () => {
    // The module's stated contract: without a chain it must say so rather than
    // fabricate Greeks.
    const r = analyzeOption({ type: "call" });
    expect(r).toBeTruthy();
    const text = JSON.stringify(r).toLowerCase();
    expect(text).toMatch(/required|missing|unavailable|insufficient/);
  });

  it("produces Greeks once every input is supplied", () => {
    const r = analyzeOption({ ...BASE, type: "call", marketPrice: 10.45 });
    expect(JSON.stringify(r)).toMatch(/delta|greeks/i);
  });
});

describe("bond analytics", () => {
  it("prices a par bond at par when the yield equals the coupon", () => {
    const b = bondAnalytics({ faceValue: 1000, couponRate: 0.05, ytm: 0.05, yearsToMaturity: 10, couponFreq: 2 });
    expect(b.price).toBeCloseTo(1000, 0);
  });

  it("prices at a discount above the coupon and a premium below it", () => {
    const disc = bondAnalytics({ faceValue: 1000, couponRate: 0.05, ytm: 0.08, yearsToMaturity: 10, couponFreq: 2 });
    const prem = bondAnalytics({ faceValue: 1000, couponRate: 0.05, ytm: 0.02, yearsToMaturity: 10, couponFreq: 2 });
    expect(disc.price).toBeLessThan(1000);
    expect(prem.price).toBeGreaterThan(1000);
  });

  it("keeps duration below maturity for a coupon bond", () => {
    // Macaulay duration of a coupon-paying bond is strictly less than its term.
    const b = bondAnalytics({ faceValue: 1000, couponRate: 0.05, ytm: 0.05, yearsToMaturity: 10, couponFreq: 2 });
    expect(b.duration).toBeGreaterThan(0);
    expect(b.duration).toBeLessThan(10);
    expect(b.modifiedDuration).toBeLessThan(b.duration);
  });

  it("gives a longer bond greater duration", () => {
    const short = bondAnalytics({ faceValue: 1000, couponRate: 0.05, ytm: 0.05, yearsToMaturity: 2, couponFreq: 2 });
    const long = bondAnalytics({ faceValue: 1000, couponRate: 0.05, ytm: 0.05, yearsToMaturity: 20, couponFreq: 2 });
    expect(long.duration).toBeGreaterThan(short.duration);
  });

  it("reports positive convexity", () => {
    const b = bondAnalytics({ faceValue: 1000, couponRate: 0.05, ytm: 0.05, yearsToMaturity: 10, couponFreq: 2 });
    expect(b.convexity).toBeGreaterThan(0);
  });
});
