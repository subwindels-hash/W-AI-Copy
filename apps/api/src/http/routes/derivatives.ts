/**
 * Derivatives & fixed-income routes:
 *   POST /derivatives/option-greeks     — Black-Scholes Greeks + IV solver
 *   POST /derivatives/option-payoff     — multi-leg strategy payoff at expiry
 *   POST /fixed-income/bond-analytics   — duration / convexity / sensitivity
 */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { blackScholes, impliedVolatility, strategyPayoff, analyzeOption, bondAnalytics } from "../../tradingIntel/derivatives.js";
// Request schemas and result shapes live in @windels/shared so the web
// calculator renders against the same definitions this route validates.
import {
  OptionGreeksSchema,
  StrategyPayoffSchema,
  BondAnalyticsSchema,
  type OptionAnalysisResult,
  type BondAnalytics,
  type StrategyPayoffResult,
  type ImpliedVolResult,
} from "@windels/shared/derivatives";

const greeksBody = OptionGreeksSchema;
const payoffBody = StrategyPayoffSchema;
const bondBody = BondAnalyticsSchema;

export function registerDerivativesRoutes(router: Router) {
  router.post("/derivatives/option-greeks", validate({ body: greeksBody }), (req, res) => {
    // May legitimately return OPTIONS_CHAIN_REQUIRED — the pricer refuses to
    // invent a volatility rather than emitting a confident wrong number.
    const data: OptionAnalysisResult = analyzeOption(req.body);
    res.json({ ok: true, data });
  });
  router.post("/derivatives/implied-vol", validate({ body: greeksBody }), (req, res) => {
    const { S, K, T, r, q, type, marketPrice } = req.body;
    if (marketPrice == null) return res.status(400).json({ ok: false, error: { code: "MARKET_PRICE_REQUIRED" } });
    // `iv` is null when the solver cannot converge; that is reported, not
    // replaced with a default.
    const data: ImpliedVolResult = { iv: impliedVolatility(marketPrice, { S, K, T, r: r ?? 0.045, q, type }) };
    res.json({ ok: true, data });
  });
  router.post("/derivatives/option-payoff", validate({ body: payoffBody }), (req, res) => {
    const { legs, underlyingAtExpiry } = req.body;
    const data: StrategyPayoffResult = { pnl: strategyPayoff(legs, underlyingAtExpiry), underlyingAtExpiry };
    res.json({ ok: true, data });
  });
  router.post("/fixed-income/bond-analytics", validate({ body: bondBody }), (req, res) => {
    const data: BondAnalytics = bondAnalytics(req.body);
    res.json({ ok: true, data });
  });
}
