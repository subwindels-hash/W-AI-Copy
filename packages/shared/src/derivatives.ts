// Session 81 — Derivatives & fixed-income analytics contract.
//
// The four endpoints in apps/api/src/http/routes/derivatives.ts (option Greeks,
// implied volatility, multi-leg payoff, bond analytics) shipped with working,
// well-tested maths in tradingIntel/derivatives.ts but no UI and no shared
// contract — the request schemas were inline in the route and the result shapes
// were declared only as API-side interfaces.
//
// Declaring them here lets the route validate against the same definitions the
// web client renders, so a renamed field is a compile error rather than a blank
// figure in the calculator.

import { z } from "zod";

export const OPTION_TYPES = ["call", "put"] as const;
export type OptionType = (typeof OPTION_TYPES)[number];

export const OPTION_SIDES = ["long", "short"] as const;
export type OptionSide = (typeof OPTION_SIDES)[number];

/**
 * Black-Scholes outputs.
 *
 * Units matter and are easy to misread on a dashboard, so they are recorded
 * here rather than only in the pricing module: theta is per calendar day, vega
 * is per one volatility point (0.01), rho is per 1% rate move (0.01).
 */
export interface OptionGreeks {
  price: number;
  delta: number;
  gamma: number;
  /** Per calendar day. */
  theta: number;
  /** Per 1 vol-point (0.01). */
  vega: number;
  /** Per 1% rate move (0.01). */
  rho: number;
  iv?: number;
}

/**
 * A successful Greeks calculation.
 *
 * `note` carries the model's own disclaimer — Black-Scholes is a European
 * approximation and real open-interest/volume Greeks need an options-chain
 * provider. It is part of the payload so the UI cannot quietly drop it.
 */
export interface OptionAnalysis {
  greeks: OptionGreeks;
  iv: number | null;
  note: string;
}

/**
 * The honest refusal returned when inputs are insufficient. The service
 * declines to price rather than guessing a volatility.
 */
export interface OptionAnalysisUnavailable {
  error: "OPTIONS_CHAIN_REQUIRED";
  message: string;
}

export type OptionAnalysisResult = OptionAnalysis | OptionAnalysisUnavailable;

/** Narrowing helper shared by the route and the UI. */
export function isOptionAnalysisUnavailable(
  r: OptionAnalysisResult,
): r is OptionAnalysisUnavailable {
  return (r as OptionAnalysisUnavailable).error === "OPTIONS_CHAIN_REQUIRED";
}

export interface BondAnalytics {
  price: number;
  ytm: number;
  /** Macaulay duration, in years. */
  duration: number;
  /** Percentage price change per 1% rate move. */
  modifiedDuration: number;
  convexity: number;
  currentYield: number;
  /** Approximate price change per +1% rate move (negative). */
  sensitivityPer100Bps: number;
  creditNote: string;
}

export interface StrategyPayoffResult {
  pnl: number;
  underlyingAtExpiry: number;
}

export interface ImpliedVolResult {
  /** null when the solver cannot converge — never a fallback guess. */
  iv: number | null;
}

/* ── Request schemas ──────────────────────────────────────────────────── */

export const OptionGreeksSchema = z.object({
  S: z.number().positive(),
  K: z.number().positive(),
  /** Time to expiry, in years. */
  T: z.number().positive(),
  r: z.number().optional(),
  sigma: z.number().positive().optional(),
  q: z.number().optional(),
  type: z.enum(OPTION_TYPES).default("call"),
  marketPrice: z.number().positive().optional(),
});
export type OptionGreeksInput = z.infer<typeof OptionGreeksSchema>;

export const StrategyLegSchema = z.object({
  type: z.enum(OPTION_TYPES),
  side: z.enum(OPTION_SIDES),
  K: z.number().positive(),
  premium: z.number().nonnegative(),
  contracts: z.number().int().positive().optional(),
});
export type StrategyLeg = z.infer<typeof StrategyLegSchema>;

export const StrategyPayoffSchema = z.object({
  legs: z.array(StrategyLegSchema).min(1),
  underlyingAtExpiry: z.number().positive(),
});
export type StrategyPayoffInput = z.infer<typeof StrategyPayoffSchema>;

export const BondAnalyticsSchema = z.object({
  faceValue: z.number().positive().optional(),
  /** Annual coupon as a decimal, e.g. 0.05 for 5%. */
  couponRate: z.number().nonnegative(),
  couponFreq: z.number().int().positive().optional(),
  yearsToMaturity: z.number().positive(),
  ytm: z.number().optional(),
  marketPrice: z.number().positive().optional(),
});
export type BondAnalyticsInput = z.infer<typeof BondAnalyticsSchema>;

/* ═══════════════════════════════════════════════════════════════════════════
 * Session 113 — Derivatives & Fixed-Income Desk.
 *
 * Session 81 shipped four *stateless* calculators. You could price one option,
 * read the number and close the tab; nothing was stored, so there was no book,
 * no portfolio exposure, no scenario analysis and no way to ask "what does this
 * organization actually hold". This block adds the desk around the maths.
 *
 * Three honesty rules govern every type below, because a risk screen is the
 * easiest place in a product to launder a guess into a number:
 *
 *   1. **The platform fetches no market data.** Every spot price, volatility
 *      and yield here was typed in by an operator and is stamped
 *      `markSource: "operator_entered"` with the time it was entered. A stale
 *      mark is reported as stale, never refreshed behind the user's back.
 *   2. **Un-priceable is not zero.** A position with no volatility cannot be
 *      priced, so it is excluded from every aggregate and listed in
 *      `unpriceable[]` with the reason. Aggregates report how many inputs they
 *      actually used.
 *   3. **Model output is labelled as model output.** Values are Black-Scholes
 *      / discounted-cashflow figures over operator inputs — not marks, not
 *      quotes, not a broker statement.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** The desk's fallback risk-free rate, applied only when a position omits one. */
export const DERIV_DEFAULT_RATE = 0.045;

/** Standard equity-option contract size, overridable per position. */
export const DERIV_DEFAULT_CONTRACT_MULTIPLIER = 100;

/** A mark older than this is reported `stale` — it is never silently refreshed. */
export const DERIV_MARK_STALE_AFTER_HOURS = 24;

export const DERIV_MAX_POSITIONS = 500;
export const DERIV_MAX_BONDS = 500;
/** Guards the scenario grid: rows × columns may not exceed this. */
export const DERIV_MAX_GRID_CELLS = 400;

/**
 * Attached verbatim to every valuation payload. The UI renders it; it is part
 * of the contract so a redesign cannot drop it by accident.
 */
export const DERIV_VALUATION_DISCLAIMER =
  "Model output, not a market quote. Values and Greeks are Black-Scholes European approximations computed from inputs an operator typed in — this platform fetches no market data, no options chain and no yield curve. American exercise, dividends beyond a continuous yield, skew, borrow cost and liquidity are not modelled.";

/**
 * Attached to portfolio aggregates. Summing raw delta across different
 * underlyings is meaningless; delta notional is not, and this says so.
 */
export const DERIV_AGGREGATION_NOTE =
  "Raw delta and gamma are per-underlying quantities and are only summed within a single underlying. Portfolio totals are reported as delta notional (delta x spot x contracts x multiplier), which is currency-denominated and additive. Theta, vega and rho are currency-denominated and are summed directly.";

export const DERIV_BOND_LADDER_NOTE =
  "Duration, convexity and yield are market-value weighted across holdings that could be valued from operator-supplied inputs. Shifted-yield figures are a full reprice of the same discounted-cashflow model at the shifted yield, not a duration approximation, and they are compared against the model's own base valuation at the recorded yields rather than against an operator-supplied price. Credit spread, optionality, accrued interest and day-count conventions are not modelled.";

/* ── Option positions ─────────────────────────────────────────────────── */

export const DERIV_MARK_SOURCES = ["operator_entered"] as const;
export type DerivMarkSource = (typeof DERIV_MARK_SOURCES)[number];

export const DERIV_MARK_FRESHNESS = ["fresh", "stale", "unmarked"] as const;
export type DerivMarkFreshness = (typeof DERIV_MARK_FRESHNESS)[number];

/** Where the rate used in a valuation came from. */
export const DERIV_RATE_SOURCES = ["position", "desk_default"] as const;
export type DerivRateSource = (typeof DERIV_RATE_SOURCES)[number];

/**
 * One option line in the organization's book.
 *
 * Every field that could be unknown is `null` rather than a plausible default:
 * a position with `impliedVol: null` is one nobody has supplied a volatility
 * for, and it stays unpriced until somebody does.
 */
export interface DerivPosition {
  id: string;
  label: string;
  /** Operator-entered symbol. Not validated against any exchange listing. */
  underlying: string;
  type: OptionType;
  side: OptionSide;
  strike: number;
  /** Time to expiry in years, as recorded. Not decremented by a clock. */
  yearsToExpiry: number;
  contracts: number;
  contractMultiplier: number;
  /** Per-share premium at entry. `null` when the operator did not record one. */
  premiumPerShare: number | null;
  /** Operator-supplied underlying price. `null` until somebody marks it. */
  markSpot: number | null;
  /** Annualized volatility, decimal. `null` blocks pricing — by design. */
  impliedVol: number | null;
  /** `null` means the desk default is applied, and the response says so. */
  riskFreeRate: number | null;
  dividendYield: number | null;
  markSource: DerivMarkSource;
  /** When `markSpot`/`impliedVol` were last supplied. `null` when never. */
  markedAt: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

/** Why a position could not be valued. Always surfaced, never swallowed. */
export interface DerivUnpriceable {
  positionId: string;
  label: string;
  reason: string;
}

/** A single position priced against its own operator-supplied mark. */
export interface DerivPositionValuation {
  positionId: string;
  label: string;
  underlying: string;
  type: OptionType;
  side: OptionSide;
  contracts: number;
  contractMultiplier: number;
  markFreshness: DerivMarkFreshness;
  markedAt: string | null;
  /** Per-share theoretical value. */
  theoreticalPricePerShare: number;
  /** Signed position value: + for long, − for short. */
  positionValue: number;
  greeks: OptionGreeks;
  /** Position delta expressed in shares of the underlying. */
  deltaShares: number;
  deltaNotional: number;
  gammaShares: number;
  thetaPerDay: number;
  vegaPerVolPoint: number;
  rhoPerPercent: number;
  /** `null` when no entry premium was recorded — never assumed to be zero. */
  unrealizedPnl: number | null;
  rateUsed: number;
  rateSource: DerivRateSource;
}

/** Exposure grouped by underlying, where raw delta actually means something. */
export interface DerivUnderlyingExposure {
  underlying: string;
  positions: number;
  /** The spot every position on this underlying was marked at, when they agree. */
  markSpot: number | null;
  /** `true` when positions on the same underlying carry disagreeing marks. */
  markSpotConflict: boolean;
  netValue: number;
  deltaShares: number;
  deltaNotional: number | null;
  gammaShares: number;
  thetaPerDay: number;
  vegaPerVolPoint: number;
  rhoPerPercent: number;
}

export interface DerivPortfolioTotals {
  netValue: number;
  deltaNotional: number | null;
  thetaPerDay: number;
  vegaPerVolPoint: number;
  rhoPerPercent: number;
  /** `null` when *no* priced position recorded an entry premium. */
  unrealizedPnl: number | null;
  /** How many priced positions had no entry premium and were left out of it. */
  positionsMissingPremium: number;
}

export interface DerivPortfolioGreeks {
  positionCount: number;
  pricedCount: number;
  unpriceableCount: number;
  staleMarkCount: number;
  byUnderlying: DerivUnderlyingExposure[];
  totals: DerivPortfolioTotals;
  unpriceable: DerivUnpriceable[];
  valuations: DerivPositionValuation[];
  aggregationNote: string;
  disclaimer: string;
}

/* ── Scenario grid ────────────────────────────────────────────────────── */

export interface DerivScenarioCell {
  volShock: number;
  netValue: number;
  pnlVsBase: number;
  pricedPositions: number;
}

export interface DerivScenarioRow {
  spotShock: number;
  cells: DerivScenarioCell[];
}

export interface DerivScenarioGrid {
  underlying: string | null;
  baseNetValue: number;
  pricedPositions: number;
  rows: DerivScenarioRow[];
  excluded: DerivUnpriceable[];
  /** Worst and best cells in the grid, by P&L against the base valuation. */
  worstCell: { spotShock: number; volShock: number; pnlVsBase: number } | null;
  bestCell: { spotShock: number; volShock: number; pnlVsBase: number } | null;
  method: "full_reprice";
  disclaimer: string;
}

/* ── Payoff curve ─────────────────────────────────────────────────────── */

export interface DerivPayoffPoint {
  spot: number;
  pnl: number;
}

export interface DerivPayoffCurve {
  points: DerivPayoffPoint[];
  /**
   * Spots where the sampled curve crosses zero, linearly interpolated between
   * adjacent samples. Sampling resolution bounds their accuracy.
   */
  breakevens: number[];
  /** Extremes **within the sampled range only** — the field name says so. */
  maxProfitInRange: number;
  maxLossInRange: number;
  spotAtMaxProfit: number;
  spotAtMaxLoss: number;
  netPremium: number;
  /** True when the strategy keeps gaining/losing past the sampled boundary. */
  unboundedAbove: boolean;
  unboundedBelow: boolean;
  rangeNote: string;
}

/* ── Delta hedge ──────────────────────────────────────────────────────── */

export interface DerivHedgeSuggestion {
  underlying: string;
  netDeltaShares: number;
  /** Shares to trade to flatten delta. Sign matches `direction`. */
  hedgeShares: number;
  direction: "buy" | "sell" | "none";
  pricedPositions: number;
  excludedPositions: number;
  /** Notional of the hedge at the marked spot; `null` without an agreed mark. */
  hedgeNotional: number | null;
  method: "static_delta_neutral";
  note: string;
}

/* ── Put-call parity ──────────────────────────────────────────────────── */

export interface DerivParityCheck {
  callMinusPut: number;
  forwardMinusDiscountedStrike: number;
  residual: number;
  tolerance: number;
  withinTolerance: boolean;
  /** Which side is rich, when the residual exceeds tolerance. */
  richLeg: "call" | "put" | null;
  note: string;
}

/* ── Bond holdings & ladder ───────────────────────────────────────────── */

export interface DerivBondHolding {
  id: string;
  label: string;
  issuer: string | null;
  faceValue: number;
  /** Annual coupon as a decimal. */
  couponRate: number;
  couponFreq: number;
  yearsToMaturity: number;
  /** Yield to maturity, decimal. `null` when only a price was supplied. */
  ytm: number | null;
  /** Operator-supplied clean price per bond. `null` when only a yield exists. */
  marketPrice: number | null;
  /** Number of bonds held. */
  quantity: number;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface DerivBondValuation {
  holdingId: string;
  label: string;
  quantity: number;
  pricePerBond: number;
  marketValue: number;
  ytm: number;
  macaulayDuration: number;
  modifiedDuration: number;
  convexity: number;
  currentYield: number;
  /** `"operator_price"` when the price was supplied, `"model"` when derived. */
  priceSource: "operator_price" | "model";
}

export interface DerivMaturityBucket {
  label: string;
  fromYears: number;
  /** `null` on the open-ended final bucket. */
  toYears: number | null;
  holdings: number;
  marketValue: number;
  shareOfPortfolio: number;
}

export interface DerivCashflowYear {
  year: number;
  coupon: number;
  principal: number;
  total: number;
}

export interface DerivShiftedYield {
  shiftBps: number;
  value: number;
  changeFromBase: number;
  changePct: number;
}

export interface DerivBondLadder {
  holdingCount: number;
  valuedCount: number;
  excluded: Array<{ holdingId: string; label: string; reason: string }>;
  totalMarketValue: number;
  /** All `null` when nothing could be valued — never a zero standing in. */
  weightedMacaulayDuration: number | null;
  weightedModifiedDuration: number | null;
  weightedConvexity: number | null;
  weightedYtm: number | null;
  buckets: DerivMaturityBucket[];
  cashflows: DerivCashflowYear[];
  shiftedYields: DerivShiftedYield[];
  valuations: DerivBondValuation[];
  method: "full_reprice";
  note: string;
}

/* ── Desk summary ─────────────────────────────────────────────────────── */

export interface DerivDeskSummary {
  positions: {
    total: number;
    priced: number;
    unpriceable: number;
    staleMarks: number;
    underlyings: number;
    netValue: number;
    deltaNotional: number | null;
    thetaPerDay: number;
  };
  bonds: {
    total: number;
    valued: number;
    excluded: number;
    marketValue: number;
    weightedModifiedDuration: number | null;
  };
  /** Straight from `DERIV_VALUATION_DISCLAIMER` / `DERIV_BOND_LADDER_NOTE`. */
  disclaimer: string;
  bondNote: string;
  marketDataSource: "none_operator_entered_only";
}

/* ── Request schemas ──────────────────────────────────────────────────── */

const derivIdSchema = z.string().trim().min(6).max(80);
const symbolSchema = z.string().trim().min(1).max(24).transform((s) => s.toUpperCase());
const labelSchema = z.string().trim().min(1).max(120);
const notesSchema = z.string().trim().max(2000).nullable().optional();

export const DerivPositionIdParamSchema = z.object({ id: derivIdSchema });
export const DerivBondIdParamSchema = z.object({ id: derivIdSchema });

export const DerivPositionCreateSchema = z.object({
  label: labelSchema,
  underlying: symbolSchema,
  type: z.enum(OPTION_TYPES),
  side: z.enum(OPTION_SIDES),
  strike: z.number().positive().max(1e9),
  yearsToExpiry: z.number().positive().max(50),
  contracts: z.number().int().positive().max(1_000_000),
  contractMultiplier: z.number().int().positive().max(10_000).default(DERIV_DEFAULT_CONTRACT_MULTIPLIER),
  premiumPerShare: z.number().nonnegative().max(1e9).nullable().optional(),
  markSpot: z.number().positive().max(1e9).nullable().optional(),
  impliedVol: z.number().positive().max(5).nullable().optional(),
  // Negative policy rates are real; the schema must not exclude them.
  riskFreeRate: z.number().min(-0.5).max(1).nullable().optional(),
  dividendYield: z.number().min(0).max(1).nullable().optional(),
  notes: notesSchema,
});
export type DerivPositionCreateInput = z.input<typeof DerivPositionCreateSchema>;

export const DerivPositionUpdateSchema = z.object({
  label: labelSchema.optional(),
  contracts: z.number().int().positive().max(1_000_000).optional(),
  premiumPerShare: z.number().nonnegative().max(1e9).nullable().optional(),
  markSpot: z.number().positive().max(1e9).nullable().optional(),
  impliedVol: z.number().positive().max(5).nullable().optional(),
  riskFreeRate: z.number().min(-0.5).max(1).nullable().optional(),
  dividendYield: z.number().min(0).max(1).nullable().optional(),
  yearsToExpiry: z.number().positive().max(50).optional(),
  notes: notesSchema,
}).refine((v) => Object.keys(v).length > 0, { message: "At least one field must be supplied." });
export type DerivPositionUpdateInput = z.infer<typeof DerivPositionUpdateSchema>;

export const DerivPositionQuerySchema = z.object({
  underlying: symbolSchema.optional(),
  type: z.enum(OPTION_TYPES).optional(),
  side: z.enum(OPTION_SIDES).optional(),
  limit: z.coerce.number().int().min(1).max(DERIV_MAX_POSITIONS).default(200),
});
export type DerivPositionQuery = z.infer<typeof DerivPositionQuerySchema>;

export const DerivPortfolioQuerySchema = z.object({
  underlying: symbolSchema.optional(),
});
export type DerivPortfolioQuery = z.infer<typeof DerivPortfolioQuerySchema>;

export const DerivScenarioSchema = z.object({
  underlying: symbolSchema.nullable().optional(),
  /** Relative spot shocks as decimals: -0.1 is a 10% drop. */
  spotShocks: z.array(z.number().min(-0.95).max(5)).min(1).max(21),
  /** Absolute volatility shocks in decimals: 0.05 adds 5 vol points. */
  volShocks: z.array(z.number().min(-1).max(3)).min(1).max(21),
}).refine((v) => v.spotShocks.length * v.volShocks.length <= DERIV_MAX_GRID_CELLS, {
  message: `Grid may not exceed ${DERIV_MAX_GRID_CELLS} cells.`,
});
export type DerivScenarioInput = z.infer<typeof DerivScenarioSchema>;

export const DerivPayoffCurveSchema = z.object({
  legs: z.array(StrategyLegSchema).min(1).max(20),
  spotMin: z.number().nonnegative().max(1e9),
  spotMax: z.number().positive().max(1e9),
  steps: z.coerce.number().int().min(2).max(400).default(50),
}).refine((v) => v.spotMax > v.spotMin, { message: "spotMax must exceed spotMin." });
export type DerivPayoffCurveInput = z.infer<typeof DerivPayoffCurveSchema>;

export const DerivHedgeSchema = z.object({
  underlying: symbolSchema,
});
export type DerivHedgeInput = z.infer<typeof DerivHedgeSchema>;

export const DerivParityCheckSchema = z.object({
  callPrice: z.number().nonnegative().max(1e9),
  putPrice: z.number().nonnegative().max(1e9),
  S: z.number().positive().max(1e9),
  K: z.number().positive().max(1e9),
  T: z.number().positive().max(50),
  r: z.number().min(-0.5).max(1).default(DERIV_DEFAULT_RATE),
  q: z.number().min(0).max(1).default(0),
  tolerance: z.number().positive().max(1e6).default(0.01),
});
export type DerivParityCheckInput = z.infer<typeof DerivParityCheckSchema>;

export const DerivBondCreateSchema = z.object({
  label: labelSchema,
  issuer: z.string().trim().min(1).max(120).nullable().optional(),
  faceValue: z.number().positive().max(1e9).default(1000),
  couponRate: z.number().min(0).max(1),
  couponFreq: z.number().int().min(1).max(12).default(2),
  yearsToMaturity: z.number().positive().max(100),
  ytm: z.number().min(-0.5).max(1).nullable().optional(),
  marketPrice: z.number().positive().max(1e9).nullable().optional(),
  quantity: z.number().int().positive().max(1_000_000).default(1),
  notes: notesSchema,
});
export type DerivBondCreateInput = z.input<typeof DerivBondCreateSchema>;

export const DerivBondUpdateSchema = z.object({
  label: labelSchema.optional(),
  issuer: z.string().trim().min(1).max(120).nullable().optional(),
  ytm: z.number().min(-0.5).max(1).nullable().optional(),
  marketPrice: z.number().positive().max(1e9).nullable().optional(),
  quantity: z.number().int().positive().max(1_000_000).optional(),
  yearsToMaturity: z.number().positive().max(100).optional(),
  notes: notesSchema,
}).refine((v) => Object.keys(v).length > 0, { message: "At least one field must be supplied." });
export type DerivBondUpdateInput = z.infer<typeof DerivBondUpdateSchema>;

export const DerivBondQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(DERIV_MAX_BONDS).default(200),
});
export type DerivBondQuery = z.infer<typeof DerivBondQuerySchema>;

export const DerivLadderQuerySchema = z.object({
  /** Parallel yield shifts to reprice at, in basis points. */
  shiftsBps: z
    .union([z.string(), z.array(z.coerce.number())])
    .optional()
    .transform((v) => {
      if (v == null) return [-100, -50, 50, 100];
      const raw = Array.isArray(v) ? v : v.split(",");
      const parsed = raw
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x) && Math.abs(x) <= 1000);
      return parsed.length ? parsed.slice(0, 10) : [-100, -50, 50, 100];
    }),
});
export type DerivLadderQuery = z.infer<typeof DerivLadderQuerySchema>;
