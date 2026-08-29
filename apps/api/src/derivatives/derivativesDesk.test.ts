/**
 * Session 113 — Derivatives & Fixed-Income Desk tests.
 *
 * Runs fully in-memory (FakeKv stands in for Redis). The properties pinned here
 * are the ones the module's honesty rules actually depend on, not a snapshot of
 * today's output:
 *
 *   - organization scoping, including a planted record from another tenant;
 *   - a position without a mark or a volatility is **excluded and explained**,
 *     never counted as zero exposure;
 *   - `deltaNotional` and `unrealizedPnl` are `null` when nothing supports
 *     them, and a position with no entry premium is counted, not defaulted;
 *   - the aggregate agrees with the underlying Black-Scholes function (short
 *     positions negate, multipliers scale) rather than re-deriving it;
 *   - scenario cells are a *full reprice* and report how many positions each
 *     one managed to price;
 *   - payoff-curve maxima are labelled in-range and unbounded strategies say
 *     so; breakevens land on the arithmetic answer;
 *   - the bond ladder weights by market value, excludes what it cannot value,
 *     and its shifted-yield repricing moves the right way;
 *   - repeated reads of an unchanged book are byte-identical.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
const dispatch = vi.fn(async () => ({}));
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn() }));
vi.mock("../kernel/kernel.service.js", () => ({ KernelService: { dispatch } }));

const { DerivativesDeskService: Desk } = await import("./derivativesDesk.service.js");
const { blackScholes } = await import("../tradingIntel/derivatives.js");
const {
  DERIV_DEFAULT_RATE,
  DerivBondCreateSchema,
  DerivPositionCreateSchema,
  DerivScenarioSchema,
} = await import("@windels/shared/derivatives");

const A = "org-deriv-a";
const B = "org-deriv-b";

/** A fully marked, priceable long call. */
const longCall = (overrides: Record<string, unknown> = {}) =>
  DerivPositionCreateSchema.parse({
    label: "ACME Jan 100 call",
    underlying: "acme",
    type: "call",
    side: "long",
    strike: 100,
    yearsToExpiry: 1,
    contracts: 2,
    premiumPerShare: 8,
    markSpot: 100,
    impliedVol: 0.2,
    riskFreeRate: 0.05,
    ...overrides,
  });

const bond = (overrides: Record<string, unknown> = {}) =>
  DerivBondCreateSchema.parse({
    label: "Treasury 5% 2036",
    couponRate: 0.05,
    yearsToMaturity: 10,
    ytm: 0.05,
    quantity: 10,
    ...overrides,
  });

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  dispatch.mockClear();
});

describe("position book", () => {
  it("stores positions under org-scoped keys with CSPRNG ids and no leaked org field", async () => {
    const position = await Desk.createPosition(A, longCall(), "user-1");
    expect(position.id).toMatch(/^deriv_pos_[0-9a-f]{8}-/);
    expect(position).not.toHaveProperty("organizationId");
    expect(position.markSource).toBe("operator_entered");
    expect(position.underlying).toBe("ACME");
    expect([...kv.hashes.keys()]).toContain(`deriv:pos:i:${A}:${position.id}`);
    expect(await Desk.listPositions(A)).toHaveLength(1);
    expect(await Desk.listPositions(A, { underlying: "ACME" })).toHaveLength(1);
    expect(await Desk.listPositions(A, { underlying: "OTHER" })).toHaveLength(0);
    expect(await Desk.listPositions(A, { side: "short" })).toHaveLength(0);
  });

  it("keeps one organization's book invisible to another, including a planted record", async () => {
    const mine = await Desk.createPosition(A, longCall());
    await Desk.createPosition(B, longCall({ label: "Other tenant" }));

    expect(await Desk.listPositions(B)).toHaveLength(1);
    expect((await Desk.listPositions(B))[0].label).toBe("Other tenant");
    await expect(Desk.getPosition(B, mine.id)).rejects.toThrow(/not found/i);
    await expect(Desk.deletePosition(B, mine.id)).rejects.toThrow(/not found/i);

    // A record written under B's key but stamped with A's org must not be read
    // back by B: the fail-closed re-check, not the key shape, is the guarantee.
    const planted = { ...mine, organizationId: A };
    await kv.hset(`deriv:bond:i:${B}:planted`, "_doc", JSON.stringify(planted));
    await kv.zadd(`deriv:bond:idx:${B}`, Date.now(), "planted");
    expect(await Desk.listBonds(B)).toHaveLength(0);
  });

  it("records a mark timestamp only when something was actually marked, and re-marking refreshes it", async () => {
    const unmarked = await Desk.createPosition(A, longCall({ markSpot: null, impliedVol: null }));
    expect(unmarked.markedAt).toBeNull();

    const relabelled = await Desk.updatePosition(A, unmarked.id, { label: "Renamed" });
    // Renaming is not re-marking.
    expect(relabelled.markedAt).toBeNull();
    expect(relabelled.label).toBe("Renamed");

    const marked = await Desk.updatePosition(A, unmarked.id, { markSpot: 101, impliedVol: 0.3 });
    expect(marked.markedAt).not.toBeNull();
    expect(marked.markSpot).toBe(101);
  });

  it("refuses to price an unmarked position and says why, instead of reporting zero exposure", async () => {
    await Desk.createPosition(A, longCall({ markSpot: null }));
    await Desk.createPosition(A, longCall({ label: "No vol", impliedVol: null }));

    const portfolio = await Desk.portfolio(A);
    expect(portfolio.positionCount).toBe(2);
    expect(portfolio.pricedCount).toBe(0);
    expect(portfolio.unpriceableCount).toBe(2);
    // Both reasons are reported verbatim; the order of two positions created
    // in the same millisecond is decided by their random ids, so match by set.
    const reasons = portfolio.unpriceable.map((u) => u.reason).sort();
    expect(reasons.some((r) => /no underlying mark recorded/i.test(r))).toBe(true);
    expect(reasons.some((r) => /no volatility recorded/i.test(r))).toBe(true);
    // The distinction that matters: unknown exposure is null, not a flat book.
    expect(portfolio.totals.deltaNotional).toBeNull();
    expect(portfolio.totals.unrealizedPnl).toBeNull();
    expect(portfolio.byUnderlying).toEqual([]);
  });
});

describe("portfolio exposure", () => {
  it("agrees with the Black-Scholes function it delegates to, scaled by contracts and multiplier", async () => {
    const position = await Desk.createPosition(A, longCall());
    const expected = blackScholes({ S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, q: 0, type: "call" });

    const portfolio = await Desk.portfolio(A);
    const valuation = portfolio.valuations[0];
    expect(valuation.positionId).toBe(position.id);
    expect(valuation.theoreticalPricePerShare).toBeCloseTo(expected.price, 4);
    expect(valuation.positionValue).toBeCloseTo(expected.price * 2 * 100, 2);
    expect(valuation.deltaShares).toBeCloseTo(expected.delta * 200, 1);
    expect(valuation.deltaNotional).toBeCloseTo(expected.delta * 200 * 100, 0);
    expect(valuation.rateSource).toBe("position");
    expect(valuation.rateUsed).toBe(0.05);
    // 2 contracts × 100 shares × $8 premium = $1,600 paid.
    expect(valuation.unrealizedPnl).toBeCloseTo((expected.price - 8) * 200, 2);
  });

  it("applies the desk default rate only when the position omits one, and says which was used", async () => {
    await Desk.createPosition(A, longCall({ riskFreeRate: null }));
    const [valuation] = (await Desk.portfolio(A)).valuations;
    expect(valuation.rateSource).toBe("desk_default");
    expect(valuation.rateUsed).toBe(DERIV_DEFAULT_RATE);
  });

  it("negates a short position and nets it against the matching long", async () => {
    await Desk.createPosition(A, longCall({ label: "Long", contracts: 1 }));
    await Desk.createPosition(A, longCall({ label: "Short", contracts: 1, side: "short" }));

    const portfolio = await Desk.portfolio(A);
    expect(portfolio.pricedCount).toBe(2);
    expect(portfolio.byUnderlying).toHaveLength(1);
    const group = portfolio.byUnderlying[0];
    expect(group.underlying).toBe("ACME");
    expect(group.netValue).toBeCloseTo(0, 6);
    expect(group.deltaShares).toBeCloseTo(0, 6);
    expect(group.thetaPerDay).toBeCloseTo(0, 6);
    expect(group.markSpot).toBe(100);
    expect(group.markSpotConflict).toBe(false);
  });

  it("counts positions with no entry premium instead of assuming a free option", async () => {
    await Desk.createPosition(A, longCall({ label: "With premium", contracts: 1 }));
    await Desk.createPosition(A, longCall({ label: "No premium", contracts: 1, premiumPerShare: null }));

    const portfolio = await Desk.portfolio(A);
    expect(portfolio.pricedCount).toBe(2);
    expect(portfolio.totals.positionsMissingPremium).toBe(1);
    // The reported P&L belongs to the one position that can have one.
    const priced = portfolio.valuations.find((v) => v.label === "With premium")!;
    expect(portfolio.totals.unrealizedPnl).toBeCloseTo(priced.unrealizedPnl as number, 4);
    expect(portfolio.valuations.find((v) => v.label === "No premium")!.unrealizedPnl).toBeNull();
  });

  it("reports disagreeing marks on one underlying rather than picking one", async () => {
    await Desk.createPosition(A, longCall({ label: "Marked 100", contracts: 1 }));
    await Desk.createPosition(A, longCall({ label: "Marked 120", contracts: 1, markSpot: 120 }));

    const [group] = (await Desk.portfolio(A)).byUnderlying;
    expect(group.markSpot).toBeNull();
    expect(group.markSpotConflict).toBe(true);
    expect(group.positions).toBe(2);
  });

  it("groups exposure per underlying and totals only currency-denominated figures", async () => {
    await Desk.createPosition(A, longCall({ underlying: "ACME", contracts: 1 }));
    await Desk.createPosition(A, longCall({ underlying: "ZETA", contracts: 1, strike: 50, markSpot: 50 }));

    const portfolio = await Desk.portfolio(A);
    expect(portfolio.byUnderlying.map((g) => g.underlying)).toEqual(["ACME", "ZETA"]);
    expect(portfolio.totals.deltaNotional).toBeCloseTo(
      portfolio.byUnderlying[0].deltaNotional! + portfolio.byUnderlying[1].deltaNotional!, 2,
    );
    expect(portfolio.aggregationNote).toMatch(/delta notional/i);
    expect(portfolio.disclaimer).toMatch(/fetches no market data/i);
    // Filtering narrows the book without changing the maths.
    const filtered = await Desk.portfolio(A, { underlying: "ZETA" });
    expect(filtered.positionCount).toBe(1);
    expect(filtered.byUnderlying).toHaveLength(1);
  });

  it("returns a byte-identical portfolio across repeated reads of an unchanged book", async () => {
    await Desk.createPosition(A, longCall());
    await Desk.createPosition(A, longCall({ label: "Second", side: "short", strike: 110 }));
    const first = JSON.stringify(await Desk.portfolio(A));
    const second = JSON.stringify(await Desk.portfolio(A));
    expect(second).toBe(first);
  });
});

describe("scenario grid", () => {
  it("fully reprices each cell and matches the model at the shocked inputs", async () => {
    await Desk.createPosition(A, longCall({ contracts: 1 }));
    const grid = await Desk.scenarios(A, DerivScenarioSchema.parse({ spotShocks: [-0.1, 0, 0.1], volShocks: [0, 0.05] }));

    expect(grid.method).toBe("full_reprice");
    expect(grid.rows).toHaveLength(3);
    expect(grid.rows[0].cells).toHaveLength(2);
    expect(grid.pricedPositions).toBe(1);

    const shocked = blackScholes({ S: 110, K: 100, T: 1, r: 0.05, sigma: 0.25, q: 0, type: "call" });
    const cell = grid.rows[2].cells[1];
    expect(cell.netValue).toBeCloseTo(shocked.price * 100, 2);
    expect(cell.pnlVsBase).toBeCloseTo(shocked.price * 100 - grid.baseNetValue, 2);
    // A long call gains on a rally and loses on a sell-off — a Taylor
    // approximation could pass a looser assertion; a full reprice must be exact.
    expect(grid.rows[0].cells[0].pnlVsBase).toBeLessThan(0);
    expect(grid.rows[2].cells[0].pnlVsBase).toBeGreaterThan(0);
    expect(grid.bestCell!.spotShock).toBe(0.1);
    expect(grid.worstCell!.spotShock).toBe(-0.1);
  });

  it("drops a position from the cells where a shock invalidates the model and says how many it priced", async () => {
    await Desk.createPosition(A, longCall({ contracts: 1, impliedVol: 0.1 }));
    const grid = await Desk.scenarios(A, DerivScenarioSchema.parse({ spotShocks: [0], volShocks: [0, -0.2] }));

    expect(grid.rows[0].cells[0].pricedPositions).toBe(1);
    // −20 vol points takes a 10-vol option below zero volatility.
    expect(grid.rows[0].cells[1].pricedPositions).toBe(0);
    expect(grid.rows[0].cells[1].netValue).toBe(0);
  });

  it("carries unpriceable positions into the grid's excluded list", async () => {
    await Desk.createPosition(A, longCall({ contracts: 1 }));
    await Desk.createPosition(A, longCall({ label: "Unmarked", markSpot: null }));
    const grid = await Desk.scenarios(A, DerivScenarioSchema.parse({ spotShocks: [0], volShocks: [0] }));
    expect(grid.pricedPositions).toBe(1);
    expect(grid.excluded).toHaveLength(1);
    expect(grid.excluded[0].label).toBe("Unmarked");
  });
});

describe("delta hedge", () => {
  it("suggests selling shares against a long call and reports the hedge notional", async () => {
    await Desk.createPosition(A, longCall({ contracts: 1 }));
    const hedge = await Desk.hedge(A, "ACME");
    expect(hedge.netDeltaShares).toBeGreaterThan(0);
    expect(hedge.hedgeShares).toBeCloseTo(-hedge.netDeltaShares, 6);
    expect(hedge.direction).toBe("sell");
    expect(hedge.hedgeNotional).toBeCloseTo(Math.abs(hedge.hedgeShares) * 100, 2);
    expect(hedge.method).toBe("static_delta_neutral");
    expect(hedge.note).toMatch(/gamma is ignored/i);
  });

  it("does not call an unmeasured book flat", async () => {
    await Desk.createPosition(A, longCall({ impliedVol: null }));
    const hedge = await Desk.hedge(A, "ACME");
    expect(hedge.pricedPositions).toBe(0);
    expect(hedge.excludedPositions).toBe(1);
    expect(hedge.direction).toBe("none");
    expect(hedge.note).toMatch(/not a flat book/i);
  });
});

describe("payoff curve", () => {
  it("finds the arithmetic breakeven of a long call and labels its range", () => {
    // Long 100 call at $5: breakeven is 105, loss is capped at the premium.
    const curve = Desk.payoffCurve({
      legs: [{ type: "call", side: "long", K: 100, premium: 5 }],
      spotMin: 80, spotMax: 130, steps: 51,
    } as any);

    expect(curve.breakevens).toHaveLength(1);
    expect(curve.breakevens[0]).toBeCloseTo(105, 6);
    expect(curve.maxLossInRange).toBeCloseTo(-500, 6);
    expect(curve.netPremium).toBeCloseTo(500, 6);
    expect(curve.unboundedAbove).toBe(true);
    expect(curve.unboundedBelow).toBe(false);
    expect(curve.rangeNote).toMatch(/sampled range/i);
    expect(curve.points).toHaveLength(51);
  });

  it("reports a bounded spread as bounded, with two breakevens on a straddle", () => {
    const spread = Desk.payoffCurve({
      legs: [
        { type: "call", side: "long", K: 100, premium: 5 },
        { type: "call", side: "short", K: 110, premium: 2 },
      ],
      spotMin: 80, spotMax: 130, steps: 101,
    } as any);
    expect(spread.unboundedAbove).toBe(false);
    expect(spread.maxProfitInRange).toBeCloseTo(700, 6);
    expect(spread.breakevens[0]).toBeCloseTo(103, 6);

    const straddle = Desk.payoffCurve({
      legs: [
        { type: "call", side: "long", K: 100, premium: 5 },
        { type: "put", side: "long", K: 100, premium: 5 },
      ],
      spotMin: 70, spotMax: 130, steps: 121,
    } as any);
    expect(straddle.breakevens).toHaveLength(2);
    expect(straddle.breakevens[0]).toBeCloseTo(90, 6);
    expect(straddle.breakevens[1]).toBeCloseTo(110, 6);
    expect(straddle.unboundedAbove).toBe(true);
    expect(straddle.unboundedBelow).toBe(true);
  });
});

describe("put-call parity", () => {
  it("passes on model-consistent prices and names the rich leg when they are not", () => {
    const inputs = { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, q: 0 } as const;
    const call = blackScholes({ ...inputs, type: "call" });
    const put = blackScholes({ ...inputs, type: "put" });

    const consistent = Desk.parityCheck({
      callPrice: call.price, putPrice: put.price, S: 100, K: 100, T: 1, r: 0.05, q: 0, tolerance: 0.01,
    });
    expect(consistent.withinTolerance).toBe(true);
    expect(consistent.richLeg).toBeNull();
    expect(consistent.note).toMatch(/not an arbitrage claim/i);

    const rich = Desk.parityCheck({
      callPrice: call.price + 3, putPrice: put.price, S: 100, K: 100, T: 1, r: 0.05, q: 0, tolerance: 0.01,
    });
    expect(rich.withinTolerance).toBe(false);
    expect(rich.richLeg).toBe("call");
    expect(rich.residual).toBeCloseTo(3, 2);
  });
});

describe("bond ladder", () => {
  it("refuses a holding with neither a yield nor a price", async () => {
    await expect(Desk.createBond(A, { label: "Unvaluable", couponRate: 0.05, couponFreq: 2, faceValue: 1000, yearsToMaturity: 5, quantity: 1 }))
      .rejects.toThrow(/yield to maturity or a market price/i);
    await expect(Desk.listBonds(A)).resolves.toHaveLength(0);
  });

  it("prices a par bond at par and weights the ladder by market value", async () => {
    await Desk.createBond(A, bond());                                             // 10 × ~1000
    await Desk.createBond(A, bond({ label: "Short 2y", yearsToMaturity: 2, quantity: 1 }));

    const ladder = await Desk.ladder(A);
    expect(ladder.holdingCount).toBe(2);
    expect(ladder.valuedCount).toBe(2);
    // A 5% coupon at a 5% yield prices at par.
    const tenYear = ladder.valuations.find((v) => v.label === "Treasury 5% 2036")!;
    expect(tenYear.pricePerBond).toBeCloseTo(1000, 1);
    expect(tenYear.marketValue).toBeCloseTo(10_000, 1);
    expect(tenYear.priceSource).toBe("model");
    // The 10-year dominates by market value, so the weighted duration sits far
    // closer to its ~7.9y than to the 2-year's ~1.9y.
    expect(ladder.weightedMacaulayDuration!).toBeGreaterThan(7);
    expect(ladder.weightedModifiedDuration!).toBeLessThan(ladder.weightedMacaulayDuration!);
    expect(ladder.weightedYtm!).toBeCloseTo(0.05, 3);
    const bucketTotal = ladder.buckets.reduce((a, b) => a + b.marketValue, 0);
    expect(bucketTotal).toBeCloseTo(ladder.totalMarketValue, 2);
    expect(ladder.buckets.find((b) => b.label === "5-10y")!.holdings).toBe(0);
    expect(ladder.buckets.find((b) => b.label === "10y+")!.holdings).toBe(1);
  });

  it("reprices at shifted yields in the right direction and reports contractual cashflows", async () => {
    await Desk.createBond(A, bond({ quantity: 1 }));
    const ladder = await Desk.ladder(A, [-100, 100]);

    const down = ladder.shiftedYields.find((s) => s.shiftBps === -100)!;
    const up = ladder.shiftedYields.find((s) => s.shiftBps === 100)!;
    expect(down.changeFromBase).toBeGreaterThan(0);
    expect(up.changeFromBase).toBeLessThan(0);
    // Convexity: the gain from a rally exceeds the loss from an equal sell-off.
    expect(down.changeFromBase).toBeGreaterThan(Math.abs(up.changeFromBase));

    // 10y, semi-annual 5% on 1000 face → $50/yr for 10 years, principal at 10.
    expect(ladder.cashflows).toHaveLength(10);
    expect(ladder.cashflows[0]).toMatchObject({ year: 1, coupon: 50, principal: 0, total: 50 });
    expect(ladder.cashflows[9]).toMatchObject({ year: 10, coupon: 50, principal: 1000, total: 1050 });
    expect(ladder.note).toMatch(/full reprice/i);
  });

  it("keeps an operator-supplied price as the price and solves its yield", async () => {
    await Desk.createBond(A, bond({ label: "Discount", ytm: null, marketPrice: 900, quantity: 1 }));
    const ladder = await Desk.ladder(A, []);
    const valuation = ladder.valuations[0];
    expect(valuation.priceSource).toBe("operator_price");
    expect(valuation.pricePerBond).toBeCloseTo(900, 4);
    // Below par on a 5% coupon means the solved yield must exceed the coupon.
    expect(valuation.ytm).toBeGreaterThan(0.05);
  });

  it("reports null weighted metrics rather than zero when nothing can be valued", async () => {
    const ladder = await Desk.ladder(A);
    expect(ladder.holdingCount).toBe(0);
    expect(ladder.valuedCount).toBe(0);
    expect(ladder.totalMarketValue).toBe(0);
    expect(ladder.weightedMacaulayDuration).toBeNull();
    expect(ladder.weightedModifiedDuration).toBeNull();
    expect(ladder.weightedConvexity).toBeNull();
    expect(ladder.weightedYtm).toBeNull();
  });

  it("updates and deletes a holding, and refuses to leave one unvaluable", async () => {
    const held = await Desk.createBond(A, bond({ quantity: 1 }));
    const updated = await Desk.updateBond(A, held.id, { quantity: 5, label: "Renamed" });
    expect(updated.quantity).toBe(5);
    expect(updated.label).toBe("Renamed");
    await expect(Desk.updateBond(A, held.id, { ytm: null, marketPrice: null })).rejects.toThrow(/unvaluable/i);
    await expect(Desk.getBond(B, held.id)).rejects.toThrow(/not found/i);
    expect(await Desk.deleteBond(A, held.id)).toEqual({ deleted: true, id: held.id });
    await expect(Desk.getBond(A, held.id)).rejects.toThrow(/not found/i);
  });
});

describe("desk summary", () => {
  it("rolls both books up with their disclaimers and an explicit market-data source", async () => {
    await Desk.createPosition(A, longCall({ contracts: 1 }));
    await Desk.createPosition(A, longCall({ label: "Unmarked", markSpot: null }));
    await Desk.createBond(A, bond({ quantity: 1 }));

    const summary = await Desk.summary(A);
    expect(summary.positions).toMatchObject({ total: 2, priced: 1, unpriceable: 1, underlyings: 1 });
    expect(summary.positions.deltaNotional).not.toBeNull();
    expect(summary.bonds).toMatchObject({ total: 1, valued: 1, excluded: 0 });
    expect(summary.bonds.marketValue).toBeCloseTo(1000, 1);
    expect(summary.marketDataSource).toBe("none_operator_entered_only");
    expect(summary.disclaimer).toMatch(/model output, not a market quote/i);
    expect(summary.bondNote).toMatch(/market-value weighted/i);

    // And it stays scoped: the other tenant's desk is empty, not a copy.
    const other = await Desk.summary(B);
    expect(other.positions.total).toBe(0);
    expect(other.positions.deltaNotional).toBeNull();
  });

  it("emits kernel telemetry for writes without letting it fail the write", async () => {
    dispatch.mockRejectedValueOnce(new Error("kernel down"));
    const position = await Desk.createPosition(A, longCall());
    expect(position.id).toBeTruthy();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ source: "derivatives", kind: "derivatives.position.created" }));
  });
});
