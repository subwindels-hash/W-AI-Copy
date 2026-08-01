/**
 * Options pricing & Greeks (Black-Scholes approximation).
 *
 * Returns delta/gamma/theta/vega/rho, implied-vol from a market price
 * (Newton-Raphson), and strategy payoff helpers. Works for European
 * options. Used by the Options Analysis Agent when inputs (S, K, T, r, σ)
 * are available from a chain provider; without a chain the agent returns
 * "OPTIONS CHAIN DATA REQUIRED" rather than fabricating numbers.
 */

function normCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}
function normPdf(x: number): number {
  return 0.3989422804014327 * Math.exp(-(x * x) / 2);
}

export interface OptionInput {
  S: number;       // underlying price
  K: number;       // strike
  T: number;       // time to expiry in years
  r: number;       // risk-free rate (annual, decimal)
  sigma: number;   // implied volatility (annual, decimal)
  q?: number;      // continuous dividend yield
}
export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number;   // per calendar day
  vega: number;    // per 1 vol-point (0.01)
  rho: number;     // per 1% rate move (0.01)
  iv?: number;
}

export function blackScholes(opt: OptionInput & { type: "call"|"put" }): Greeks {
  const { S, K, T, r, sigma, type } = opt;
  const q = opt.q ?? 0;
  const sqrtT = Math.sqrt(Math.max(T, 1e-9));
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const Nd1 = normCdf(d1), Nd2 = normCdf(d2);
  const pdf = normPdf(d1);
  const disc = Math.exp(-q * T), rdisc = Math.exp(-r * T);
  let price: number, delta: number;
  if (type === "call") {
    price = S * disc * Nd1 - K * rdisc * Nd2;
    delta = disc * Nd1;
  } else {
    price = K * rdisc * normCdf(-d2) - S * disc * normCdf(-d1);
    delta = -disc * normCdf(-d1);
  }
  const gamma = (disc * pdf) / (S * sigma * sqrtT);
  const theta =
    (-(S * sigma * disc * pdf) / (2 * sqrtT)
      - (type === "call" ? r * K * rdisc * Nd2 : -r * K * rdisc * normCdf(-d2))
      + (q ? q * S * disc * (type === "call" ? Nd1 : -normCdf(-d1)) : 0))
    / 365;
  const vega = (S * disc * pdf * sqrtT) * 0.01; // per 1 vol point
  const rho = (type === "call" ? K * T * rdisc * Nd2 : -K * T * rdisc * normCdf(-d2)) * 0.01;
  return { price: +price.toFixed(4), delta: +delta.toFixed(4), gamma: +gamma.toFixed(6), theta: +theta.toFixed(4), vega: +vega.toFixed(4), rho: +rho.toFixed(4) };
}

/** Implied vol from option market price (Newton-Raphson). */
export function impliedVolatility(
  marketPrice: number,
  opt: Omit<OptionInput, "sigma"> & { type: "call"|"put" },
): number | null {
  if (marketPrice <= 0) return null;
  const SIGMA_MIN = 0.001;
  const SIGMA_MAX = 5;
  let sigma = 0.2;
  for (let i = 0; i < 60; i++) {
    const g = blackScholes({ ...opt, sigma });
    const diff = g.price - marketPrice;
    if (Math.abs(diff) < 1e-4) return +sigma.toFixed(4);
    // vega is per 1% vol; convert back to per-unit
    const vegaPerUnit = g.vega / 0.01;
    if (vegaPerUnit < 1e-8) break;
    sigma -= diff / vegaPerUnit;
    if (sigma < SIGMA_MIN) sigma = SIGMA_MIN;
    if (sigma > SIGMA_MAX) sigma = SIGMA_MAX;
  }
  // Newton did not converge within the iteration budget.
  //
  // This previously returned the last `sigma` regardless, so a price that no
  // volatility can produce — below intrinsic value, or above the underlying —
  // came back as a confident 0.001 or 5.0. The caller could not tell a solved
  // volatility from a clamped boundary, and analyzeOption() would then price
  // Greeks off it and report them as real. Verify the candidate actually
  // reproduces the market price before returning it; otherwise report failure.
  const check = blackScholes({ ...opt, sigma });
  const tolerance = Math.max(1e-3, Math.abs(marketPrice) * 1e-4);
  if (!Number.isFinite(check.price) || Math.abs(check.price - marketPrice) > tolerance) return null;
  return +sigma.toFixed(4);
}

/** Simple option-strategy payoff at expiry (single-leg for now). */
export function strategyPayoff(
  legs: Array<{ type: "call"|"put"; side: "long"|"short"; K: number; premium: number; contracts?: number }>,
  underlyingAtExpiry: number,
): number {
  let pnl = 0;
  for (const l of legs) {
    const mult = l.contracts ?? 1;
    const intrinsic = l.type === "call"
      ? Math.max(0, underlyingAtExpiry - l.K)
      : Math.max(0, l.K - underlyingAtExpiry);
    const sign = l.side === "long" ? 1 : -1;
    pnl += sign * (intrinsic - l.premium) * mult * 100; // 100 shares/contract
  }
  return pnl;
}

/**
 * Greeks-based option analysis for an option quote.
 * Returns null if any required input is missing.
 */
export function analyzeOption(input: Partial<OptionInput> & { type?: "call"|"put"; marketPrice?: number }):
  | { greeks: Greeks; iv: number | null; note: string }
  | { error: "OPTIONS_CHAIN_REQUIRED"; message: string } {
  const { S, K, T, r, sigma, type = "call", marketPrice } = input;
  if (S == null || K == null || T == null) {
    return { error: "OPTIONS_CHAIN_REQUIRED", message: "Options Greeks require underlying price (S), strike (K), and days-to-expiry (T). Configure an options-chain provider or supply inputs manually." };
  }
  const rate = r ?? 0.045;
  let vol = sigma;
  let iv: number | null = null;
  if (vol == null && marketPrice != null) {
    vol = 0.3;
    iv = impliedVolatility(marketPrice, { S, K, T, r: rate, type, q: input.q });
    if (iv != null) vol = iv;
  }
  if (vol == null) return { error: "OPTIONS_CHAIN_REQUIRED", message: "Implied volatility required. Provide sigma or marketPrice." };
  return {
    greeks: blackScholes({ S, K, T, r: rate, sigma: vol, type, q: input.q }),
    iv,
    note: "Black-Scholes European approximation. Real OI/volume/Greeks require an options-chain data provider.",
  };
}

// ── Bond analytics ──────────────────────────────────────────────────────
export interface BondInput {
  faceValue?: number;    // default 1000
  couponRate: number;    // annual, decimal (e.g., 0.05 = 5%)
  couponFreq?: number;   // payments/yr, default 2
  yearsToMaturity: number;
  ytm?: number;          // yield-to-maturity (annual, decimal)
  marketPrice?: number;
}
export interface BondAnalytics {
  price: number;
  ytm: number;
  duration: number;         // Macaulay duration (years)
  modifiedDuration: number; // % change per 1% rate move
  convexity: number;
  currentYield: number;
  sensitivityPer100Bps: number; // approximate price change per +1% rate move (-)
  creditNote: string;
}

export function bondAnalytics(b: BondInput): BondAnalytics {
  const F = b.faceValue ?? 1000;
  const freq = b.couponFreq ?? 2;
  const cpn = (b.couponRate * F) / freq;
  const n = b.yearsToMaturity * freq;
  const yPeriod = (b.ytm ?? 0.05) / freq;
  // price = sum of discounted coupons + discounted face
  let price = 0;
  let ytm = b.ytm;
  if (b.marketPrice != null && b.ytm == null) {
    // solve for YTM via bisection
    let lo = -0.5, hi = 2;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const p = bondPrice(F, cpn, n, mid / freq);
      if (p > b.marketPrice) lo = mid; else hi = mid;
    }
    ytm = (lo + hi) / 2;
    price = b.marketPrice;
  } else {
    price = bondPrice(F, cpn, n, yPeriod);
  }
  // Macaulay duration
  let tW = 0, pvSum = 0;
  const y = (ytm ?? 0.05) / freq;
  for (let t = 1; t <= n; t++) {
    const cf = t < n ? cpn : cpn + F;
    const pv = cf / Math.pow(1 + y, t);
    tW += (t / freq) * pv; pvSum += pv;
  }
  const macaulay = pvSum > 0 ? tW / pvSum : 0;
  const modDur = macaulay / (1 + y);
  // Convexity
  let conv = 0;
  for (let t = 1; t <= n; t++) {
    const cf = t < n ? cpn : cpn + F;
    const pv = cf / Math.pow(1 + y, t);
    conv += (t * (t + 1) * pv) / Math.pow(1 + y, 2);
  }
  conv = conv / (price * freq * freq);
  const annualCoupon = cpn * freq;
  return {
    price: +price.toFixed(4),
    ytm: +(ytm ?? 0).toFixed(4),
    duration: +macaulay.toFixed(3),
    modifiedDuration: +modDur.toFixed(3),
    convexity: +conv.toFixed(3),
    currentYield: price > 0 ? +(annualCoupon / price).toFixed(4) : 0,
    sensitivityPer100Bps: +(-modDur * price * 0.01).toFixed(4),
    creditNote: "Duration/convexity computed from user-supplied coupon/maturity/yield. Credit spreads and issuer fundamentals require a bond-data provider.",
  };
}
function bondPrice(F: number, cpn: number, n: number, y: number): number {
  let p = 0;
  for (let t = 1; t <= n; t++) {
    p += cpn / Math.pow(1 + y, t);
  }
  p += F / Math.pow(1 + y, n);
  return p;
}
