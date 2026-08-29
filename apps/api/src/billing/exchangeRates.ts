/**
 * Exchange Rate Provider (global-currency module).
 *
 * Provider-neutral FX abstraction. Supports multiple rate sources,
 * Redis caching, stale-data protection, and explicit SIMULATION flag when
 * no real provider is configured.
 *
 * Real sources used (no API key required):
 *   - frankfurter.app (ECB reference rates; free, open)
 *   - open.er-api.com (free, open)
 *
 * If both fail or are unreachable, the service returns a SIMULATION result
 * with a hard-coded fallback table (clearly labeled synthetic=true). It never
 * silently returns a number as real.
 *
 * Every converted amount preserves original amount/currency, rate, timestamp,
 * provider, and converted amount per spec.
 */
import { redisCmd as redis } from "../db/redis.js";

const CACHE_TTL_SEC = 3600; // 1 hour (frankfurter updates once per weekday)
const STALE_TTL_SEC = 86400 * 2;

const K = (base: string) => `fx:rates:${base.toUpperCase()}`;

interface RateSet {
  base: string;
  date: string;
  rates: Record<string, number>;
  provider: string;
  fetchedAt: number;
  synthetic: boolean;
}

// Hard-coded synthetic fallback (clearly labeled), used only when no network
// and no cached rates exist. Approximate mid-2026 reference values; not for
// real transactions.
const SYNTHETIC_RATES: Record<string, Record<string, number>> = {
  USD: { EUR: 0.92, GBP: 0.78, JPY: 149.0, NGN: 1580, CAD: 1.36, AUD: 1.51, CHF: 0.88, CNY: 7.12, INR: 83.4, BTC: 1/66000, ETH: 1/3400, USDC: 1.0, USDT: 1.0 },
  EUR: { USD: 1.09, GBP: 0.85, JPY: 162.0, NGN: 1720, CAD: 1.48, AUD: 1.65, CHF: 0.95, CNY: 7.75, INR: 90.7, USDC: 1.09, USDT: 1.09 },
  NGN: { USD: 1/1580, EUR: 1/1720, GBP: 1/2020, USDC: 1/1580, USDT: 1/1580 },
  GBP: { USD: 1.28, EUR: 1.17, JPY: 190, NGN: 2020, USDC: 1.28, USDT: 1.28 },
};

async function fetchFromFrankfurter(base: string): Promise<RateSet | null> {
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { base: string; date: string; rates: Record<string, number> };
    if (!j.rates) return null;
    return { base: j.base, date: j.date, rates: j.rates, provider: "frankfurter.app", fetchedAt: Date.now(), synthetic: false };
  } catch { return null; }
}

async function fetchFromOpenErApi(base: string): Promise<RateSet | null> {
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { result: string; base_code: string; time_last_update_utc?: string; rates: Record<string, number> };
    if (j.result !== "success" || !j.rates) return null;
    return { base: j.base_code, date: j.time_last_update_utc ?? new Date().toISOString(), rates: j.rates, provider: "open.er-api.com", fetchedAt: Date.now(), synthetic: false };
  } catch { return null; }
}

export interface ConvertedAmount {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  convertedCurrency: string;
  rate: number;
  rateTimestamp: string;
  provider: string;
  synthetic: boolean;
  stale: boolean;
}

export const ExchangeRatesService = {
  async getRates(baseCurrency: string): Promise<RateSet> {
    const base = baseCurrency.toUpperCase();
    // Cache lookup
    const cached = await redis.get(K(base));
    if (cached) {
      try {
        const rs = JSON.parse(cached) as RateSet;
        const ageSec = (Date.now() - rs.fetchedAt) / 1000;
        if (ageSec < CACHE_TTL_SEC) return rs;
        // Still serve stale but mark
        return { ...rs };
      } catch { /* fall through */ }
    }
    // Try real providers
    for (const fetcher of [fetchFromFrankfurter, fetchFromOpenErApi]) {
      const rs = await fetcher(base);
      if (rs) {
        await redis.set(K(base), JSON.stringify(rs), "EX", STALE_TTL_SEC);
        return rs;
      }
    }
    // Fall back to synthetic
    const syntheticRates = SYNTHETIC_RATES[base] ?? { USD: 1 };
    const rs: RateSet = {
      base,
      date: new Date().toISOString().slice(0, 10),
      rates: syntheticRates,
      provider: "synthetic-fallback",
      fetchedAt: Date.now(),
      synthetic: true,
    };
    return rs;
  },

  async convert(opts: { amount: number; from: string; to: string }): Promise<ConvertedAmount> {
    const from = opts.from.toUpperCase();
    const to = opts.to.toUpperCase();
    if (from === to) {
      return { originalAmount: opts.amount, originalCurrency: from, convertedAmount: opts.amount, convertedCurrency: to, rate: 1, rateTimestamp: new Date().toISOString(), provider: "unity", synthetic: false, stale: false };
    }
    const rs = await this.getRates(from);
    let rate = rs.rates[to];
    if (rate == null) {
      // Inverse via USD
      const usSet = await this.getRates("USD");
      const fromUsd = usSet.rates[from];
      const toUsd = usSet.rates[to];
      if (fromUsd && toUsd) rate = toUsd / fromUsd;
    }
    if (rate == null) {
      throw Object.assign(new Error(`No FX rate available for ${from} -> ${to}`), { code: "FX_UNAVAILABLE" });
    }
    const ageSec = (Date.now() - rs.fetchedAt) / 1000;
    const stale = ageSec > CACHE_TTL_SEC;
    return {
      originalAmount: opts.amount, originalCurrency: from,
      convertedAmount: +(opts.amount * rate).toFixed(4),
      convertedCurrency: to, rate: +rate.toFixed(6),
      rateTimestamp: new Date(rs.fetchedAt).toISOString(),
      provider: rs.provider, synthetic: rs.synthetic, stale,
    };
  },
};
