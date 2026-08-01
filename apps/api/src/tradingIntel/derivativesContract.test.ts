/**
 * Derivatives & fixed-income HTTP contract (Session 81).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `derivatives.test.ts` already covers the maths well (Black-Scholes against
 * textbook values, put-call parity, Greek bounds, IV round-trips, bond
 * duration/convexity). What was never covered is the *boundary*: the request
 * schemas the route validates against, and the two honesty behaviours the new
 * UI depends on.
 *
 * Those two matter more than they look:
 *
 *   - `analyzeOption` returns `OPTIONS_CHAIN_REQUIRED` instead of inventing a
 *     volatility when inputs are insufficient. The panel renders that refusal
 *     as a banner. If the service ever "helpfully" defaulted sigma instead, the
 *     UI would silently start displaying confident, wrong Greeks.
 *   - `impliedVolatility` returns `null` when the solver cannot converge. A
 *     fallback number here would be indistinguishable from a solved one.
 *
 * These endpoints are pure functions over the request body — no Redis, no
 * Prisma, no infrastructure.
 */
import { describe, it, expect } from "vitest";
import {
  OptionGreeksSchema,
  StrategyPayoffSchema,
  BondAnalyticsSchema,
  isOptionAnalysisUnavailable,
  type OptionAnalysisResult,
} from "@windels/shared/derivatives";
import { analyzeOption, impliedVolatility, blackScholes } from "./derivatives.js";

describe("option-greeks request schema", () => {
  const valid = { S: 100, K: 100, T: 0.5, sigma: 0.25 };

  it("accepts a well-formed request and defaults to a call", () => {
    const r = OptionGreeksSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.type).toBe("call");
  });

  it.each([
    ["negative underlying", { ...valid, S: -1 }],
    ["zero strike", { ...valid, K: 0 }],
    ["zero time to expiry", { ...valid, T: 0 }],
    ["negative volatility", { ...valid, sigma: -0.1 }],
    ["unknown option type", { ...valid, type: "swaption" }],
  ])("rejects %s", (_label, body) => {
    expect(OptionGreeksSchema.safeParse(body).success).toBe(false);
  });

  it("allows a negative risk-free rate", () => {
    // Negative policy rates are real; the schema must not exclude them.
    expect(OptionGreeksSchema.safeParse({ ...valid, r: -0.005 }).success).toBe(true);
  });
});

describe("payoff request schema", () => {
  const leg = { type: "call", side: "long", K: 100, premium: 5 };

  it("requires at least one leg", () => {
    expect(StrategyPayoffSchema.safeParse({ legs: [], underlyingAtExpiry: 100 }).success).toBe(false);
  });

  it("accepts a multi-leg spread", () => {
    const r = StrategyPayoffSchema.safeParse({
      legs: [leg, { ...leg, side: "short", K: 110, premium: 2 }],
      underlyingAtExpiry: 105,
    });
    expect(r.success).toBe(true);
  });

  it("allows a zero premium but not a negative one", () => {
    expect(StrategyPayoffSchema.safeParse({ legs: [{ ...leg, premium: 0 }], underlyingAtExpiry: 100 }).success).toBe(true);
    expect(StrategyPayoffSchema.safeParse({ legs: [{ ...leg, premium: -1 }], underlyingAtExpiry: 100 }).success).toBe(false);
  });

  it("requires whole contracts", () => {
    expect(StrategyPayoffSchema.safeParse({ legs: [{ ...leg, contracts: 1.5 }], underlyingAtExpiry: 100 }).success).toBe(false);
  });
});

describe("bond request schema", () => {
  const valid = { couponRate: 0.05, yearsToMaturity: 10 };

  it("accepts the minimum viable request", () => {
    expect(BondAnalyticsSchema.safeParse(valid).success).toBe(true);
  });

  it("allows a zero-coupon bond", () => {
    expect(BondAnalyticsSchema.safeParse({ ...valid, couponRate: 0 }).success).toBe(true);
  });

  it("rejects a negative coupon or non-positive maturity", () => {
    expect(BondAnalyticsSchema.safeParse({ ...valid, couponRate: -0.01 }).success).toBe(false);
    expect(BondAnalyticsSchema.safeParse({ ...valid, yearsToMaturity: 0 }).success).toBe(false);
  });
});

describe("the pricer refuses rather than guessing", () => {
  it("returns OPTIONS_CHAIN_REQUIRED when volatility cannot be established", () => {
    // Full contract inputs but no sigma and no market price: there is nothing
    // to derive a volatility from, so no price may be reported.
    const r: OptionAnalysisResult = analyzeOption({ S: 100, K: 100, T: 0.5, type: "call" });
    expect(isOptionAnalysisUnavailable(r)).toBe(true);
    if (isOptionAnalysisUnavailable(r)) {
      expect(r.error).toBe("OPTIONS_CHAIN_REQUIRED");
      expect(r.message).toMatch(/volatility/i);
    }
  });

  it("returns OPTIONS_CHAIN_REQUIRED when core inputs are missing", () => {
    const r = analyzeOption({ type: "call", sigma: 0.25 });
    expect(isOptionAnalysisUnavailable(r)).toBe(true);
  });

  it("prices once volatility is supplied, and carries its own disclaimer", () => {
    const r = analyzeOption({ S: 100, K: 100, T: 0.5, sigma: 0.25, type: "call" });
    expect(isOptionAnalysisUnavailable(r)).toBe(false);
    if (!isOptionAnalysisUnavailable(r)) {
      expect(r.greeks.price).toBeGreaterThan(0);
      // The note is part of the payload so the UI cannot present a European
      // approximation as a market quote by omission.
      expect(r.note).toMatch(/black-scholes|approximation/i);
    }
  });

  it("solves for implied volatility from a market price", () => {
    const truth = 0.32;
    const priced = blackScholes({ S: 100, K: 105, T: 0.75, r: 0.045, sigma: truth, type: "call" });
    const r = analyzeOption({ S: 100, K: 105, T: 0.75, r: 0.045, type: "call", marketPrice: priced.price });

    expect(isOptionAnalysisUnavailable(r)).toBe(false);
    if (!isOptionAnalysisUnavailable(r)) {
      expect(r.iv).not.toBeNull();
      expect(r.iv!).toBeCloseTo(truth, 3);
    }
  });
});

describe("implied volatility reports non-convergence as null", () => {
  it("returns null for a price below intrinsic value", () => {
    // No volatility can produce a call worth less than S-K; the solver must say
    // so rather than returning a floor value.
    const iv = impliedVolatility(0.01, { S: 200, K: 100, T: 1, r: 0.045, type: "call" });
    expect(iv).toBeNull();
  });

  it("returns null for an implausibly high price", () => {
    const iv = impliedVolatility(10_000, { S: 100, K: 100, T: 1, r: 0.045, type: "call" });
    expect(iv).toBeNull();
  });
});
