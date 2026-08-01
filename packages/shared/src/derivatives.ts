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
