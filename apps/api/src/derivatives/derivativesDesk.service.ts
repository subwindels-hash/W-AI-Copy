/**
 * Session 113 — Derivatives & Fixed-Income Desk.
 *
 * Session 81 delivered four *stateless* endpoints over genuinely good maths
 * (`tradingIntel/derivatives.ts`: Black-Scholes with Greeks, a Newton-Raphson
 * IV solver that reports non-convergence as `null`, multi-leg payoff, bond
 * duration/convexity). Nothing was ever stored. There was no book, so there was
 * no portfolio delta, no scenario analysis, no ladder and no way to ask what an
 * organization holds — every call was a calculator keystroke that vanished.
 *
 * This service is the desk around that maths. It stores two organization-scoped
 * record types and derives everything else from them, re-using the Session 81
 * functions rather than re-implementing (or subtly re-deriving) them:
 *
 *   - **Option positions** — label, underlying, type/side, strike, expiry,
 *     contracts, multiplier, entry premium, and the operator's own mark
 *     (spot + implied vol + optional rate/dividend yield).
 *   - **Bond holdings** — face, coupon, frequency, maturity, quantity and
 *     either a yield or a price.
 *
 * The honesty rules this file exists to enforce:
 *
 *   - **No market data is fetched, ever.** Every spot, vol and yield is
 *     `markSource: "operator_entered"` with the timestamp it was entered, and a
 *     mark older than DERIV_MARK_STALE_AFTER_HOURS is reported `stale`. The
 *     desk never refreshes a mark behind the operator's back.
 *   - **Un-priceable is not zero.** A position without a mark or without a
 *     volatility is excluded from every aggregate and listed in `unpriceable[]`
 *     with the reason. `pricedCount` / `pricedPositions` say how many inputs
 *     each number was actually built from, and a portfolio with nothing priced
 *     reports `deltaNotional: null`, not `0`.
 *   - **Unknown P&L stays null.** A position with no recorded entry premium
 *     contributes nothing to unrealized P&L and is counted in
 *     `positionsMissingPremium`.
 *   - **Cross-underlying sums are labelled.** Raw delta is summed only within
 *     one underlying; the portfolio total is delta *notional*, which is
 *     currency-denominated and additive. DERIV_AGGREGATION_NOTE ships with it.
 *
 * Keys (org-scoped, audited by the Session 89 namespace sweep):
 *   deriv:pos:i:<org>:<id>    deriv:pos:idx:<org>
 *   deriv:bond:i:<org>:<id>   deriv:bond:idx:<org>
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import {
  blackScholes,
  bondAnalytics,
  strategyPayoff,
} from "../tradingIntel/derivatives.js";
import {
  DERIV_AGGREGATION_NOTE,
  DERIV_BOND_LADDER_NOTE,
  DERIV_DEFAULT_CONTRACT_MULTIPLIER,
  DERIV_DEFAULT_RATE,
  DERIV_MARK_STALE_AFTER_HOURS,
  DERIV_MAX_BONDS,
  DERIV_MAX_POSITIONS,
  DERIV_VALUATION_DISCLAIMER,
  type DerivBondHolding,
  type DerivBondLadder,
  type DerivBondQuery,
  type DerivBondValuation,
  type DerivCashflowYear,
  type DerivDeskSummary,
  type DerivHedgeSuggestion,
  type DerivMarkFreshness,
  type DerivMaturityBucket,
  type DerivParityCheck,
  type DerivParityCheckInput,
  type DerivPayoffCurve,
  type DerivPayoffCurveInput,
  type DerivPortfolioGreeks,
  type DerivPortfolioQuery,
  type DerivPosition,
  type DerivPositionQuery,
  type DerivPositionUpdateInput,
  type DerivPositionValuation,
  type DerivRateSource,
  type DerivScenarioCell,
  type DerivScenarioGrid,
  type DerivScenarioInput,
  type DerivScenarioRow,
  type DerivShiftedYield,
  type DerivUnderlyingExposure,
  type DerivUnpriceable,
  type StrategyLeg,
} from "@windels/shared/derivatives";

/* ── Storage plumbing ─────────────────────────────────────────────────── */

type Entity = "pos" | "bond";
type Owned<T> = T & { organizationId: string };
type PositionRecord = Owned<DerivPosition>;
type BondRecord = Owned<DerivBondHolding>;

const K = {
  item: (entity: Entity, org: string, id: string) => `deriv:${entity}:i:${org}:${id}`,
  index: (entity: Entity, org: string) => `deriv:${entity}:idx:${org}`,
};

const parse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};

/** CSPRNG identifiers — never a counter, a timestamp or Math.random. */
const positionId = () => `deriv_pos_${randomUUID()}`;
const bondId = () => `deriv_bnd_${randomUUID()}`;

const strip = <T extends { organizationId: string }>(record: T): Omit<T, "organizationId"> => {
  const { organizationId: _organizationId, ...rest } = record;
  return rest;
};

async function writeItem<T extends { id: string }>(entity: Entity, org: string, value: T, score: number): Promise<void> {
  await redis.hset(K.item(entity, org, value.id), "_doc", JSON.stringify({ ...value, organizationId: org }));
  await redis.zadd(K.index(entity, org), score, value.id);
}

/** Fail-closed read: a record whose stored organization differs is invisible. */
async function readOwned<T extends { organizationId: string }>(entity: Entity, org: string, id: string): Promise<T | null> {
  const value = parse<T>(await redis.hget(K.item(entity, org, id), "_doc"));
  return value && value.organizationId === org ? value : null;
}

async function listOwned<T extends { organizationId: string }>(entity: Entity, org: string): Promise<T[]> {
  const ids = await redis.zrange(K.index(entity, org), 0, -1);
  const out: T[] = [];
  for (const id of ids) {
    const record = await readOwned<T>(entity, org, id);
    if (record) out.push(record);
  }
  return out;
}

async function removeItem(entity: Entity, org: string, id: string): Promise<void> {
  await redis.del(K.item(entity, org, id));
  await redis.zrem(K.index(entity, org), id);
}

async function emitKernel(kind: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ source: "derivatives", kind, payload });
  } catch { /* best effort — a telemetry failure must not fail the write */ }
}

/* ── Numeric helpers ──────────────────────────────────────────────────── */

/**
 * Fixed-precision rounding so repeated reads of the same book are byte
 * identical. Rounding is presentation only; it is applied once, at the edge.
 */
const round = (value: number, dp = 4): number => {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
};

const finite = (value: number): boolean => Number.isFinite(value);

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

/** Newest-first ordering with the id as a stable tie-break. */
const byNewest = <T extends { id: string; createdAt: string }>(a: T, b: T) =>
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

const nullableNumber = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const nullableText = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

/* ── Option position book ─────────────────────────────────────────────── */

export const DerivativesDeskService = {
  async createPosition(org: string, input: Record<string, any>, actor?: string | null): Promise<DerivPosition> {
    const existing = await redis.zcard(K.index("pos", org));
    if (existing >= DERIV_MAX_POSITIONS) {
      throw AppError.conflict(`This organization already holds the maximum of ${DERIV_MAX_POSITIONS} option positions. Delete one before adding another.`);
    }
    const now = new Date().toISOString();
    const markSpot = nullableNumber(input.markSpot);
    const impliedVol = nullableNumber(input.impliedVol);
    const record: PositionRecord = {
      id: positionId(),
      organizationId: org,
      label: String(input.label),
      underlying: String(input.underlying),
      type: input.type,
      side: input.side,
      strike: Number(input.strike),
      yearsToExpiry: Number(input.yearsToExpiry),
      contracts: Number(input.contracts),
      contractMultiplier: Number(input.contractMultiplier ?? DERIV_DEFAULT_CONTRACT_MULTIPLIER),
      premiumPerShare: nullableNumber(input.premiumPerShare),
      markSpot,
      impliedVol,
      riskFreeRate: nullableNumber(input.riskFreeRate),
      dividendYield: nullableNumber(input.dividendYield),
      markSource: "operator_entered",
      // A mark timestamp only exists if the operator supplied something to mark.
      markedAt: markSpot !== null || impliedVol !== null ? now : null,
      notes: nullableText(input.notes),
      createdAt: now,
      createdBy: actor ?? null,
      updatedAt: now,
      updatedBy: actor ?? null,
    };
    await writeItem("pos", org, record, Date.parse(now));
    await emitKernel("derivatives.position.created", { organizationId: org, positionId: record.id, underlying: record.underlying });
    return strip(record);
  },

  async listPositions(org: string, query: Partial<DerivPositionQuery> = {}): Promise<DerivPosition[]> {
    const records = await listOwned<PositionRecord>("pos", org);
    const limit = query.limit ?? 200;
    return records
      .filter((r) => (query.underlying ? r.underlying === query.underlying : true))
      .filter((r) => (query.type ? r.type === query.type : true))
      .filter((r) => (query.side ? r.side === query.side : true))
      .sort(byNewest)
      .slice(0, limit)
      .map(strip);
  },

  async getPosition(org: string, id: string): Promise<DerivPosition> {
    const record = await readOwned<PositionRecord>("pos", org, id);
    if (!record) throw AppError.notFound("Option position not found.");
    return strip(record);
  },

  async updatePosition(org: string, id: string, patch: DerivPositionUpdateInput, actor?: string | null): Promise<DerivPosition> {
    const record = await readOwned<PositionRecord>("pos", org, id);
    if (!record) throw AppError.notFound("Option position not found.");
    const now = new Date().toISOString();
    const touchesMark = "markSpot" in patch || "impliedVol" in patch;
    const next: PositionRecord = {
      ...record,
      label: patch.label ?? record.label,
      contracts: patch.contracts ?? record.contracts,
      yearsToExpiry: patch.yearsToExpiry ?? record.yearsToExpiry,
      premiumPerShare: "premiumPerShare" in patch ? nullableNumber(patch.premiumPerShare) : record.premiumPerShare,
      markSpot: "markSpot" in patch ? nullableNumber(patch.markSpot) : record.markSpot,
      impliedVol: "impliedVol" in patch ? nullableNumber(patch.impliedVol) : record.impliedVol,
      riskFreeRate: "riskFreeRate" in patch ? nullableNumber(patch.riskFreeRate) : record.riskFreeRate,
      dividendYield: "dividendYield" in patch ? nullableNumber(patch.dividendYield) : record.dividendYield,
      notes: "notes" in patch ? nullableText(patch.notes) : record.notes,
      updatedAt: now,
      updatedBy: actor ?? null,
    };
    // Re-marking is the only thing that refreshes markedAt. Renaming a position
    // must not make a three-week-old spot look like it was entered today.
    if (touchesMark) next.markedAt = next.markSpot !== null || next.impliedVol !== null ? now : null;
    await writeItem("pos", org, next, Date.parse(next.createdAt));
    await emitKernel("derivatives.position.updated", { organizationId: org, positionId: id, remarked: touchesMark });
    return strip(next);
  },

  async deletePosition(org: string, id: string): Promise<{ deleted: boolean; id: string }> {
    const record = await readOwned<PositionRecord>("pos", org, id);
    if (!record) throw AppError.notFound("Option position not found.");
    await removeItem("pos", org, id);
    await emitKernel("derivatives.position.deleted", { organizationId: org, positionId: id });
    return { deleted: true, id };
  },

  /* ── Portfolio exposure ─────────────────────────────────────────────── */

  async portfolio(org: string, query: Partial<DerivPortfolioQuery> = {}): Promise<DerivPortfolioGreeks> {
    const records = (await listOwned<PositionRecord>("pos", org))
      .filter((r) => (query.underlying ? r.underlying === query.underlying : true))
      .sort(byNewest);
    return buildPortfolio(records);
  },

  /**
   * Re-prices the whole book across a grid of spot and volatility shocks.
   *
   * Each cell is a *full reprice* through the same Black-Scholes function the
   * base valuation used — not a delta/gamma Taylor expansion — and reports how
   * many positions it managed to price, because a shock that drives a
   * volatility to zero or below leaves that position unpriceable in that cell.
   */
  async scenarios(org: string, input: DerivScenarioInput): Promise<DerivScenarioGrid> {
    const underlying = input.underlying ?? null;
    const records = (await listOwned<PositionRecord>("pos", org))
      .filter((r) => (underlying ? r.underlying === underlying : true))
      .sort(byNewest);

    const nowMs = Date.now();
    const base: DerivPositionValuation[] = [];
    const excluded: DerivUnpriceable[] = [];
    for (const record of records) {
      const valued = valuePosition(record, nowMs);
      if ("reason" in valued) excluded.push({ positionId: record.id, label: record.label, reason: valued.reason });
      else base.push(valued);
    }
    const baseNetValue = round(sum(base.map((v) => v.positionValue)));

    const rows: DerivScenarioRow[] = [];
    let worstCell: DerivScenarioGrid["worstCell"] = null;
    let bestCell: DerivScenarioGrid["bestCell"] = null;

    for (const spotShock of input.spotShocks) {
      const cells: DerivScenarioCell[] = [];
      for (const volShock of input.volShocks) {
        let netValue = 0;
        let priced = 0;
        for (const record of records) {
          const shocked = valuePosition(record, nowMs, { spotFactor: 1 + spotShock, volDelta: volShock });
          if ("reason" in shocked) continue;
          netValue += shocked.positionValue;
          priced += 1;
        }
        const cell: DerivScenarioCell = {
          volShock,
          netValue: round(netValue),
          pnlVsBase: round(netValue - baseNetValue),
          pricedPositions: priced,
        };
        cells.push(cell);
        if (!worstCell || cell.pnlVsBase < worstCell.pnlVsBase) worstCell = { spotShock, volShock, pnlVsBase: cell.pnlVsBase };
        if (!bestCell || cell.pnlVsBase > bestCell.pnlVsBase) bestCell = { spotShock, volShock, pnlVsBase: cell.pnlVsBase };
      }
      rows.push({ spotShock, cells });
    }

    return {
      underlying,
      baseNetValue,
      pricedPositions: base.length,
      rows,
      excluded,
      worstCell,
      bestCell,
      method: "full_reprice",
      disclaimer: DERIV_VALUATION_DISCLAIMER,
    };
  },

  /**
   * Shares of the underlying that would flatten delta on one symbol.
   *
   * This is a static delta-neutral suggestion over the desk's own model
   * numbers: it ignores gamma, so it is only valid for a small move, and the
   * returned note says exactly that.
   */
  async hedge(org: string, underlying: string): Promise<DerivHedgeSuggestion> {
    const records = (await listOwned<PositionRecord>("pos", org)).filter((r) => r.underlying === underlying);
    const nowMs = Date.now();
    const priced: DerivPositionValuation[] = [];
    let excludedPositions = 0;
    for (const record of records) {
      const valued = valuePosition(record, nowMs);
      if ("reason" in valued) excludedPositions += 1;
      else priced.push(valued);
    }
    const netDeltaShares = round(sum(priced.map((v) => v.deltaShares)), 2);
    const hedgeShares = round(-netDeltaShares, 2);
    const marks = new Set(records.map((r) => r.markSpot).filter((s): s is number => s !== null));
    const agreedSpot = marks.size === 1 ? [...marks][0] : null;
    return {
      underlying,
      netDeltaShares,
      hedgeShares,
      direction: hedgeShares > 0 ? "buy" : hedgeShares < 0 ? "sell" : "none",
      pricedPositions: priced.length,
      excludedPositions,
      hedgeNotional: agreedSpot === null ? null : round(Math.abs(hedgeShares) * agreedSpot),
      method: "static_delta_neutral",
      note:
        priced.length === 0
          ? "No position on this underlying could be priced, so there is no delta to hedge. This is not a flat book — it is an unmeasured one."
          : "Static delta-neutral hedge over model deltas computed from operator-supplied marks. Gamma is ignored, so the hedge is only valid for a small move and must be re-struck as the underlying moves. Excluded positions carry unmeasured delta.",
    };
  },

  /* ── Stateless analytics over the shared contract ───────────────────── */

  /**
   * Payoff of a multi-leg strategy sampled across a spot range.
   *
   * Re-uses Session 81's `strategyPayoff` for every sample rather than
   * re-deriving intrinsic value here, so the curve and the single-point
   * endpoint can never disagree.
   */
  payoffCurve(input: DerivPayoffCurveInput): DerivPayoffCurve {
    const legs = input.legs as StrategyLeg[];
    const steps = input.steps;
    const stride = (input.spotMax - input.spotMin) / (steps - 1);
    const points = Array.from({ length: steps }, (_unused, i) => {
      const spot = input.spotMin + stride * i;
      return { spot: round(spot, 6), pnl: round(strategyPayoff(legs as any, spot)) };
    });

    const breakevens: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1];
      const current = points[i];
      if (previous.pnl === 0) breakevens.push(previous.spot);
      else if ((previous.pnl < 0 && current.pnl > 0) || (previous.pnl > 0 && current.pnl < 0)) {
        // Linear interpolation between adjacent samples; the range note tells
        // the reader that sampling resolution bounds this.
        const t = Math.abs(previous.pnl) / (Math.abs(previous.pnl) + Math.abs(current.pnl));
        breakevens.push(round(previous.spot + t * (current.spot - previous.spot), 6));
      }
    }
    const last = points[points.length - 1];
    if (last.pnl === 0) breakevens.push(last.spot);

    let maxProfitInRange = points[0].pnl;
    let minInRange = points[0].pnl;
    let spotAtMaxProfit = points[0].spot;
    let spotAtMaxLoss = points[0].spot;
    for (const point of points) {
      if (point.pnl > maxProfitInRange) { maxProfitInRange = point.pnl; spotAtMaxProfit = point.spot; }
      if (point.pnl < minInRange) { minInRange = point.pnl; spotAtMaxLoss = point.spot; }
    }

    const multiplier = 100;
    const netPremium = round(sum(legs.map((l) =>
      (l.side === "long" ? 1 : -1) * l.premium * (l.contracts ?? 1) * multiplier)));
    // Beyond the sampled boundary only calls keep moving on the upside and only
    // puts on the downside; a non-zero net contract count there means the curve
    // does not flatten and the in-range extreme is not the strategy's extreme.
    const netCallContracts = sum(legs.filter((l) => l.type === "call").map((l) => (l.side === "long" ? 1 : -1) * (l.contracts ?? 1)));
    const netPutContracts = sum(legs.filter((l) => l.type === "put").map((l) => (l.side === "long" ? 1 : -1) * (l.contracts ?? 1)));

    return {
      points,
      breakevens,
      maxProfitInRange,
      maxLossInRange: minInRange,
      spotAtMaxProfit,
      spotAtMaxLoss,
      netPremium,
      unboundedAbove: netCallContracts !== 0,
      unboundedBelow: netPutContracts !== 0,
      rangeNote:
        "Payoff at expiry only — no time value, no early exercise, no financing. Maxima and minima are the extremes of the sampled range, not of the strategy; where unboundedAbove/unboundedBelow is true the payoff keeps moving past the sampled boundary. Breakevens are linearly interpolated between adjacent samples, so their precision is bounded by the step size.",
    };
  },

  /**
   * Put-call parity residual. A pure identity check on operator-supplied
   * prices: it reports the arithmetic, and never claims an arbitrage exists
   * (transaction costs, borrow, dividends and exercise style are not modelled).
   */
  parityCheck(input: DerivParityCheckInput): DerivParityCheck {
    const { callPrice, putPrice, S, K: strike, T, r, q, tolerance } = input;
    const lhs = callPrice - putPrice;
    const rhs = S * Math.exp(-q * T) - strike * Math.exp(-r * T);
    const residual = lhs - rhs;
    const within = Math.abs(residual) <= tolerance;
    return {
      callMinusPut: round(lhs, 6),
      forwardMinusDiscountedStrike: round(rhs, 6),
      residual: round(residual, 6),
      tolerance,
      withinTolerance: within,
      richLeg: within ? null : residual > 0 ? "call" : "put",
      note: "European put-call parity on operator-supplied prices: C - P = S*e^(-qT) - K*e^(-rT). A residual outside tolerance means these three inputs are mutually inconsistent under the model — it is not an arbitrage claim. Transaction costs, borrow cost, discrete dividends and American exercise are not modelled.",
    };
  },

  /* ── Bond holdings & ladder ─────────────────────────────────────────── */

  async createBond(org: string, input: Record<string, any>, actor?: string | null): Promise<DerivBondHolding> {
    const existing = await redis.zcard(K.index("bond", org));
    if (existing >= DERIV_MAX_BONDS) {
      throw AppError.conflict(`This organization already holds the maximum of ${DERIV_MAX_BONDS} bond holdings. Delete one before adding another.`);
    }
    const ytm = nullableNumber(input.ytm);
    const marketPrice = nullableNumber(input.marketPrice);
    if (ytm === null && marketPrice === null) {
      throw AppError.badRequest("A bond holding needs either a yield to maturity or a market price; without one of them it cannot be valued, and the desk will not assume a yield.");
    }
    const now = new Date().toISOString();
    const record: BondRecord = {
      id: bondId(),
      organizationId: org,
      label: String(input.label),
      issuer: nullableText(input.issuer),
      faceValue: Number(input.faceValue ?? 1000),
      couponRate: Number(input.couponRate),
      couponFreq: Number(input.couponFreq ?? 2),
      yearsToMaturity: Number(input.yearsToMaturity),
      ytm,
      marketPrice,
      quantity: Number(input.quantity ?? 1),
      notes: nullableText(input.notes),
      createdAt: now,
      createdBy: actor ?? null,
      updatedAt: now,
      updatedBy: actor ?? null,
    };
    await writeItem("bond", org, record, Date.parse(now));
    await emitKernel("derivatives.bond.created", { organizationId: org, holdingId: record.id });
    return strip(record);
  },

  async listBonds(org: string, query: Partial<DerivBondQuery> = {}): Promise<DerivBondHolding[]> {
    const records = await listOwned<BondRecord>("bond", org);
    return records.sort(byNewest).slice(0, query.limit ?? 200).map(strip);
  },

  async getBond(org: string, id: string): Promise<DerivBondHolding> {
    const record = await readOwned<BondRecord>("bond", org, id);
    if (!record) throw AppError.notFound("Bond holding not found.");
    return strip(record);
  },

  async updateBond(org: string, id: string, patch: Record<string, any>, actor?: string | null): Promise<DerivBondHolding> {
    const record = await readOwned<BondRecord>("bond", org, id);
    if (!record) throw AppError.notFound("Bond holding not found.");
    const next: BondRecord = {
      ...record,
      label: patch.label ?? record.label,
      issuer: "issuer" in patch ? nullableText(patch.issuer) : record.issuer,
      ytm: "ytm" in patch ? nullableNumber(patch.ytm) : record.ytm,
      marketPrice: "marketPrice" in patch ? nullableNumber(patch.marketPrice) : record.marketPrice,
      quantity: patch.quantity ?? record.quantity,
      yearsToMaturity: patch.yearsToMaturity ?? record.yearsToMaturity,
      notes: "notes" in patch ? nullableText(patch.notes) : record.notes,
      updatedAt: new Date().toISOString(),
      updatedBy: actor ?? null,
    };
    if (next.ytm === null && next.marketPrice === null) {
      throw AppError.badRequest("A bond holding needs either a yield to maturity or a market price; clearing both would leave it unvaluable.");
    }
    await writeItem("bond", org, next, Date.parse(next.createdAt));
    await emitKernel("derivatives.bond.updated", { organizationId: org, holdingId: id });
    return strip(next);
  },

  async deleteBond(org: string, id: string): Promise<{ deleted: boolean; id: string }> {
    const record = await readOwned<BondRecord>("bond", org, id);
    if (!record) throw AppError.notFound("Bond holding not found.");
    await removeItem("bond", org, id);
    await emitKernel("derivatives.bond.deleted", { organizationId: org, holdingId: id });
    return { deleted: true, id };
  },

  async ladder(org: string, shiftsBps: number[] = [-100, -50, 50, 100]): Promise<DerivBondLadder> {
    const records = (await listOwned<BondRecord>("bond", org)).sort(byNewest);
    return buildLadder(records, shiftsBps);
  },

  /* ── Desk rollup ────────────────────────────────────────────────────── */

  async summary(org: string): Promise<DerivDeskSummary> {
    const [positions, bonds] = await Promise.all([
      listOwned<PositionRecord>("pos", org),
      listOwned<BondRecord>("bond", org),
    ]);
    const portfolio = buildPortfolio(positions.sort(byNewest));
    const ladder = buildLadder(bonds.sort(byNewest), []);
    return {
      positions: {
        total: portfolio.positionCount,
        priced: portfolio.pricedCount,
        unpriceable: portfolio.unpriceableCount,
        staleMarks: portfolio.staleMarkCount,
        underlyings: portfolio.byUnderlying.length,
        netValue: portfolio.totals.netValue,
        deltaNotional: portfolio.totals.deltaNotional,
        thetaPerDay: portfolio.totals.thetaPerDay,
      },
      bonds: {
        total: ladder.holdingCount,
        valued: ladder.valuedCount,
        excluded: ladder.excluded.length,
        marketValue: ladder.totalMarketValue,
        weightedModifiedDuration: ladder.weightedModifiedDuration,
      },
      disclaimer: DERIV_VALUATION_DISCLAIMER,
      bondNote: DERIV_BOND_LADDER_NOTE,
      marketDataSource: "none_operator_entered_only",
    };
  },
};

/* ── Valuation core ───────────────────────────────────────────────────── */

function markFreshness(record: PositionRecord, nowMs: number): DerivMarkFreshness {
  if (!record.markedAt) return "unmarked";
  const markedMs = Date.parse(record.markedAt);
  if (!Number.isFinite(markedMs)) return "unmarked";
  return nowMs - markedMs > DERIV_MARK_STALE_AFTER_HOURS * 3_600_000 ? "stale" : "fresh";
}

/**
 * Prices one stored position against its own operator-supplied mark, optionally
 * under a scenario shock.
 *
 * Returns `{ reason }` instead of a number whenever the inputs do not support a
 * price. Every caller propagates that reason to the response — a position that
 * cannot be valued is reported as unmeasured, never counted as zero exposure.
 */
export function valuePosition(
  record: PositionRecord | DerivPosition,
  nowMs: number,
  shock?: { spotFactor?: number; volDelta?: number },
): DerivPositionValuation | { reason: string } {
  const spotFactor = shock?.spotFactor ?? 1;
  const volDelta = shock?.volDelta ?? 0;

  if (record.markSpot === null) {
    return { reason: "No underlying mark recorded. Enter a spot price for this position before it can be valued." };
  }
  if (record.impliedVol === null) {
    return { reason: "No volatility recorded. Enter an implied volatility, or solve one from a market price with /derivatives/implied-vol." };
  }
  if (!(record.yearsToExpiry > 0)) {
    return { reason: "Recorded time to expiry is not positive; an expired contract is not priced by this model." };
  }

  const spot = record.markSpot * spotFactor;
  const sigma = record.impliedVol + volDelta;
  if (!(spot > 0)) return { reason: "The scenario shock drove the underlying to zero or below, where this model does not apply." };
  if (!(sigma > 0)) return { reason: "The scenario shock drove volatility to zero or below, where this model does not apply." };

  const rateSource: DerivRateSource = record.riskFreeRate === null ? "desk_default" : "position";
  const rateUsed = record.riskFreeRate ?? DERIV_DEFAULT_RATE;

  const greeks = blackScholes({
    S: spot,
    K: record.strike,
    T: record.yearsToExpiry,
    r: rateUsed,
    sigma,
    q: record.dividendYield ?? 0,
    type: record.type,
  });
  if (!finite(greeks.price) || !finite(greeks.delta) || !finite(greeks.gamma)) {
    return { reason: "The model produced a non-finite value for these inputs; no number is reported rather than a misleading one." };
  }

  const sign = record.side === "long" ? 1 : -1;
  const scale = record.contracts * record.contractMultiplier;
  const positionValue = sign * greeks.price * scale;
  const deltaShares = sign * greeks.delta * scale;

  return {
    positionId: record.id,
    label: record.label,
    underlying: record.underlying,
    type: record.type,
    side: record.side,
    contracts: record.contracts,
    contractMultiplier: record.contractMultiplier,
    markFreshness: markFreshness(record as PositionRecord, nowMs),
    markedAt: record.markedAt,
    theoreticalPricePerShare: round(greeks.price),
    positionValue: round(positionValue),
    greeks,
    deltaShares: round(deltaShares, 2),
    deltaNotional: round(deltaShares * spot),
    gammaShares: round(sign * greeks.gamma * scale, 4),
    thetaPerDay: round(sign * greeks.theta * scale),
    vegaPerVolPoint: round(sign * greeks.vega * scale),
    rhoPerPercent: round(sign * greeks.rho * scale),
    // An unrecorded entry premium makes P&L unknowable. It stays null; it is
    // never treated as a free option.
    unrealizedPnl: record.premiumPerShare === null ? null : round(sign * (greeks.price - record.premiumPerShare) * scale),
    rateUsed,
    rateSource,
  };
}

function buildPortfolio(records: PositionRecord[]): DerivPortfolioGreeks {
  const nowMs = Date.now();
  const valuations: DerivPositionValuation[] = [];
  const unpriceable: DerivUnpriceable[] = [];
  const premiumById = new Map<string, number | null>();

  for (const record of records) {
    premiumById.set(record.id, record.premiumPerShare);
    const valued = valuePosition(record, nowMs);
    if ("reason" in valued) unpriceable.push({ positionId: record.id, label: record.label, reason: valued.reason });
    else valuations.push(valued);
  }

  const groups = new Map<string, DerivPositionValuation[]>();
  for (const valuation of valuations) {
    const bucket = groups.get(valuation.underlying) ?? [];
    bucket.push(valuation);
    groups.set(valuation.underlying, bucket);
  }

  const markByPosition = new Map(records.map((r) => [r.id, r.markSpot] as const));
  const byUnderlying: DerivUnderlyingExposure[] = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([underlying, group]) => {
      const marks = new Set(group.map((v) => markByPosition.get(v.positionId)).filter((s): s is number => typeof s === "number"));
      return {
        underlying,
        positions: group.length,
        markSpot: marks.size === 1 ? [...marks][0] : null,
        markSpotConflict: marks.size > 1,
        netValue: round(sum(group.map((v) => v.positionValue))),
        deltaShares: round(sum(group.map((v) => v.deltaShares)), 2),
        deltaNotional: round(sum(group.map((v) => v.deltaNotional))),
        gammaShares: round(sum(group.map((v) => v.gammaShares)), 4),
        thetaPerDay: round(sum(group.map((v) => v.thetaPerDay))),
        vegaPerVolPoint: round(sum(group.map((v) => v.vegaPerVolPoint))),
        rhoPerPercent: round(sum(group.map((v) => v.rhoPerPercent))),
      };
    });

  const withPnl = valuations.filter((v) => v.unrealizedPnl !== null);
  const missingPremium = valuations.length - withPnl.length;

  return {
    positionCount: records.length,
    pricedCount: valuations.length,
    unpriceableCount: unpriceable.length,
    staleMarkCount: valuations.filter((v) => v.markFreshness === "stale").length,
    byUnderlying,
    totals: {
      netValue: round(sum(valuations.map((v) => v.positionValue))),
      // Nothing priced means no measured exposure — which is not the same
      // number as a flat book, so it is reported as unknown.
      deltaNotional: valuations.length === 0 ? null : round(sum(valuations.map((v) => v.deltaNotional))),
      thetaPerDay: round(sum(valuations.map((v) => v.thetaPerDay))),
      vegaPerVolPoint: round(sum(valuations.map((v) => v.vegaPerVolPoint))),
      rhoPerPercent: round(sum(valuations.map((v) => v.rhoPerPercent))),
      unrealizedPnl: withPnl.length === 0 ? null : round(sum(withPnl.map((v) => v.unrealizedPnl as number))),
      positionsMissingPremium: missingPremium,
    },
    unpriceable,
    valuations,
    aggregationNote: DERIV_AGGREGATION_NOTE,
    disclaimer: DERIV_VALUATION_DISCLAIMER,
  };
}

/* ── Bond ladder core ─────────────────────────────────────────────────── */

const BUCKET_DEFS: ReadonlyArray<{ label: string; fromYears: number; toYears: number | null }> = [
  { label: "0-1y", fromYears: 0, toYears: 1 },
  { label: "1-3y", fromYears: 1, toYears: 3 },
  { label: "3-5y", fromYears: 3, toYears: 5 },
  { label: "5-10y", fromYears: 5, toYears: 10 },
  { label: "10y+", fromYears: 10, toYears: null },
];

/** Prices one holding through the Session 81 bond model. */
function valueBond(record: BondRecord): DerivBondValuation | { reason: string } {
  if (record.ytm === null && record.marketPrice === null) {
    return { reason: "Neither a yield to maturity nor a market price is recorded; the desk will not assume a yield." };
  }
  const analytics = bondAnalytics({
    faceValue: record.faceValue,
    couponRate: record.couponRate,
    couponFreq: record.couponFreq,
    yearsToMaturity: record.yearsToMaturity,
    ytm: record.ytm ?? undefined,
    marketPrice: record.ytm === null ? record.marketPrice ?? undefined : undefined,
  });
  if (!finite(analytics.price) || !finite(analytics.ytm) || !finite(analytics.duration)) {
    return { reason: "The discounted-cashflow model produced a non-finite value for these inputs; no number is reported." };
  }
  return {
    holdingId: record.id,
    label: record.label,
    quantity: record.quantity,
    pricePerBond: analytics.price,
    marketValue: round(analytics.price * record.quantity),
    ytm: analytics.ytm,
    macaulayDuration: analytics.duration,
    modifiedDuration: analytics.modifiedDuration,
    convexity: analytics.convexity,
    currentYield: analytics.currentYield,
    priceSource: record.ytm === null ? "operator_price" : "model",
  };
}

/** Reprices one holding at a parallel yield shift, in the same model. */
function repriceAtShift(record: BondRecord, baseYtm: number, shiftBps: number): number | null {
  const shifted = baseYtm + shiftBps / 10_000;
  const analytics = bondAnalytics({
    faceValue: record.faceValue,
    couponRate: record.couponRate,
    couponFreq: record.couponFreq,
    yearsToMaturity: record.yearsToMaturity,
    ytm: shifted,
  });
  return finite(analytics.price) ? analytics.price * record.quantity : null;
}

function buildLadder(records: BondRecord[], shiftsBps: number[]): DerivBondLadder {
  const valuations: DerivBondValuation[] = [];
  const excluded: DerivBondLadder["excluded"] = [];
  const valuedRecords: Array<{ record: BondRecord; valuation: DerivBondValuation }> = [];

  for (const record of records) {
    const valued = valueBond(record);
    if ("reason" in valued) excluded.push({ holdingId: record.id, label: record.label, reason: valued.reason });
    else { valuations.push(valued); valuedRecords.push({ record, valuation: valued }); }
  }

  const totalMarketValue = round(sum(valuations.map((v) => v.marketValue)));
  const weighted = (pick: (v: DerivBondValuation) => number): number | null => {
    if (!valuations.length || totalMarketValue === 0) return null;
    return round(sum(valuations.map((v) => pick(v) * v.marketValue)) / totalMarketValue, 4);
  };

  const buckets: DerivMaturityBucket[] = BUCKET_DEFS.map((def) => {
    const inBucket = valuedRecords.filter(({ record }) =>
      record.yearsToMaturity >= def.fromYears && (def.toYears === null || record.yearsToMaturity < def.toYears));
    const marketValue = round(sum(inBucket.map(({ valuation }) => valuation.marketValue)));
    return {
      label: def.label,
      fromYears: def.fromYears,
      toYears: def.toYears,
      holdings: inBucket.length,
      marketValue,
      shareOfPortfolio: totalMarketValue === 0 ? 0 : round(marketValue / totalMarketValue, 4),
    };
  });

  // Contractual cashflows from the stored terms. Nothing is projected or
  // reinvested; this is only what the recorded instruments promise to pay.
  const cashflowByYear = new Map<number, { coupon: number; principal: number }>();
  for (const { record } of valuedRecords) {
    const periods = Math.max(1, Math.round(record.yearsToMaturity * record.couponFreq));
    const couponPerPeriod = (record.couponRate * record.faceValue) / record.couponFreq * record.quantity;
    for (let t = 1; t <= periods; t++) {
      const year = Math.max(1, Math.ceil(t / record.couponFreq));
      const entry = cashflowByYear.get(year) ?? { coupon: 0, principal: 0 };
      entry.coupon += couponPerPeriod;
      cashflowByYear.set(year, entry);
    }
    const maturityYear = Math.max(1, Math.ceil(record.yearsToMaturity));
    const entry = cashflowByYear.get(maturityYear) ?? { coupon: 0, principal: 0 };
    entry.principal += record.faceValue * record.quantity;
    cashflowByYear.set(maturityYear, entry);
  }
  const cashflows: DerivCashflowYear[] = [...cashflowByYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, flows]) => ({
      year,
      coupon: round(flows.coupon),
      principal: round(flows.principal),
      total: round(flows.coupon + flows.principal),
    }));

  // Shifts are measured against the model's own base valuation at the recorded
  // yields, so a full reprice is compared like with like.
  const modelBase = sum(valuedRecords.map(({ record, valuation }) => repriceAtShift(record, valuation.ytm, 0) ?? valuation.marketValue));
  const shiftedYields: DerivShiftedYield[] = shiftsBps.map((shiftBps) => {
    let value = 0;
    for (const { record, valuation } of valuedRecords) {
      value += repriceAtShift(record, valuation.ytm, shiftBps) ?? 0;
    }
    return {
      shiftBps,
      value: round(value),
      changeFromBase: round(value - modelBase),
      changePct: modelBase === 0 ? 0 : round((value - modelBase) / modelBase, 6),
    };
  });

  return {
    holdingCount: records.length,
    valuedCount: valuations.length,
    excluded,
    totalMarketValue,
    weightedMacaulayDuration: weighted((v) => v.macaulayDuration),
    weightedModifiedDuration: weighted((v) => v.modifiedDuration),
    weightedConvexity: weighted((v) => v.convexity),
    weightedYtm: weighted((v) => v.ytm),
    buckets,
    cashflows,
    shiftedYields,
    valuations,
    method: "full_reprice",
    note: DERIV_BOND_LADDER_NOTE,
  };
}
