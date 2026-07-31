/**
 * Derivatives & fixed-income routes:
 *   POST /derivatives/option-greeks     — Black-Scholes Greeks + IV solver
 *   POST /derivatives/option-payoff     — multi-leg strategy payoff at expiry
 *   POST /fixed-income/bond-analytics   — duration / convexity / sensitivity
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { blackScholes, impliedVolatility, strategyPayoff, analyzeOption, bondAnalytics } from "../../tradingIntel/derivatives.js";

const greeksBody = z.object({
  S: z.number().positive(),
  K: z.number().positive(),
  T: z.number().positive(), // years
  r: z.number().optional(),
  sigma: z.number().positive().optional(),
  q: z.number().optional(),
  type: z.enum(["call", "put"]).default("call"),
  marketPrice: z.number().positive().optional(),
});
const payoffBody = z.object({
  legs: z.array(z.object({
    type: z.enum(["call", "put"]),
    side: z.enum(["long", "short"]),
    K: z.number().positive(),
    premium: z.number().nonnegative(),
    contracts: z.number().int().positive().optional(),
  })).min(1),
  underlyingAtExpiry: z.number().positive(),
});
const bondBody = z.object({
  faceValue: z.number().positive().optional(),
  couponRate: z.number().nonnegative(),         // decimal, e.g. 0.05
  couponFreq: z.number().int().positive().optional(),
  yearsToMaturity: z.number().positive(),
  ytm: z.number().optional(),
  marketPrice: z.number().positive().optional(),
});

export function registerDerivativesRoutes(router: Router) {
  router.post("/derivatives/option-greeks", validate({ body: greeksBody }), (req, res) => {
    res.json({ ok: true, data: analyzeOption(req.body) });
  });
  router.post("/derivatives/implied-vol", validate({ body: greeksBody }), (req, res) => {
    const { S, K, T, r, q, type, marketPrice } = req.body;
    if (marketPrice == null) return res.status(400).json({ ok: false, error: { code: "MARKET_PRICE_REQUIRED" } });
    const iv = impliedVolatility(marketPrice, { S, K, T, r: r ?? 0.045, q, type });
    res.json({ ok: true, data: { iv } });
  });
  router.post("/derivatives/option-payoff", validate({ body: payoffBody }), (req, res) => {
    const { legs, underlyingAtExpiry } = req.body;
    res.json({ ok: true, data: { pnl: strategyPayoff(legs, underlyingAtExpiry), underlyingAtExpiry } });
  });
  router.post("/fixed-income/bond-analytics", validate({ body: bondBody }), (req, res) => {
    res.json({ ok: true, data: bondAnalytics(req.body) });
  });
}
