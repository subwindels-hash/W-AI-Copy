/**
 * Shared types — Session 80: Global Multi-Currency & Localization.
 *
 * Currency/locale detection, multi-provider exchange rates with caching and
 * offline fallback, user currency preferences, payment-method localization
 * (including WMPC gift cards from Session 79), multi-currency reporting,
 * and AI agents for trend/optimization/monitoring. LocalizationContext is
 * the single source of truth; no other surface computes locale itself.
 */

/**
 * Where a rate actually came from.
 *
 * S167 — `offline-constant` and `synthetic` were added because the seeded
 * hardcoded table was written into Redis as `source: "cache"`, and `getRate`
 * then treated anything under an hour old as fresh. A constant compiled into
 * the source therefore reached callers labelled as a recently cached rate, and
 * the `offline-fallback` branch that would have told the truth was unreachable
 * for every seeded pair.
 */
export type GcRateSource =
  /** Fetched from an upstream FX provider. */
  | "live"
  /** Previously fetched from a provider and cached; see `staleness`. */
  | "cache"
  /** Set by an administrator as a contractual rate. Highest precedence. */
  | "enterprise-override"
  /** A constant compiled into this repository. Never a market rate. */
  | "offline-constant"
  /** Provider-side synthetic fallback (ExchangeRatesService.synthetic). */
  | "synthetic";

/**
 * How old the underlying quote is.
 *
 * S167 — `getRate` previously served an arbitrarily old cache entry with the
 * comment "stale cache still better than fallback" and no age ceiling, and the
 * response carried nothing to say how old it was.
 */
export type GcRateStaleness =
  /** Under 1 hour. */
  | "fresh"
  /** 1–24 hours. Usable, but disclose it. */
  | "aging"
  /** 1–7 days. Not suitable for billing without acknowledgement. */
  | "stale"
  /** Over 7 days, or a hardcoded constant of unknown vintage. */
  | "unusable";

export interface GcExchangeRate {
  from: string;
  to: string;
  rate: number;
  source: GcRateSource;
  updatedAt: string;
  /** Age of the underlying quote in ms. Null for a constant with no vintage. */
  ageMs: number | null;
  staleness: GcRateStaleness;
  /**
   * True when this rate was computed rather than quoted — an inverse (1/rate)
   * or a cross via USD.
   *
   * S167 — inverses used to be *stored* as if quoted, and rounded to 4 decimal
   * places, which put `NGN:USD` 6.40% away from the true reciprocal
   * (0.0007 vs 0.00065789). Converting NGN 1,000,000 produced $700.00 instead
   * of $657.89. A reciprocal is also not a quote: real FX has a bid/ask spread
   * and 1/rate is neither side of it.
   */
  derived: boolean;
  /** Upstream provider name when known. */
  provider?: string;
  /**
   * False when this rate must not be used to charge a customer: a hardcoded
   * constant, an unusably old quote, or a value derived from either.
   */
  usableForBilling: boolean;
}

export interface GcUserCurrencyPrefs {
  userId: string;
  autoDetect: boolean;
  preferredCurrency: string;
  preferredLanguage: string;
  timezone: string;
  dateFormat: string;
  numberFormat: string;
  taxRegion?: string;
}

export interface GcLocalizedPrice {
  amount: number;
  currency: string;
  formatted: string;
  exchangeRate: number;
  sourceRate: GcRateSource;
  /** S167 — a converted price must carry the provenance of its rate. */
  rateStaleness: GcRateStaleness;
  rateDerived: boolean;
  usableForBilling: boolean;
}

export interface GcuDashboard {
  currenciesSupported: number;
  languagesSupported: number;
  /**
   * S167 — was `rateProviders: 4`, which counted the cache layers
   * (live/cache/override/offline-fallback), not providers. There are two
   * upstream sources: frankfurter.app and open.er-api.com.
   */
  upstreamProviders: number;
  /** How many upstream providers have actually served a rate. Null if never probed. */
  providersReachable: number | null;
  /** Stored pairs whose most recent value came from a real provider. */
  ratesFromLiveProvider: number;
  /** Stored pairs still backed by a constant compiled into this repository. */
  ratesFromConstants: number;
  /** Age of the oldest stored rate, or null when nothing is stored. */
  oldestRateAgeMs: number | null;
  /**
   * S167 — replaces `offlineFallbackHealthy`, which was
   * `Object.keys(OFFLINE_RATES).length > 0`: a compile-time constant that was
   * `true` in every possible execution and told an operator nothing.
   */
  fallbackPairsAvailable: number;
  multiCurrencyReporting: boolean;
  paymentMethodsLocalized: number;
  fraudGuardsActive: number;
  agents: number;
  countriesSupported: number;
  /** Conversions in the trailing 24h, or null when the window has no data. */
  conversions24h: number | null;
}

/**
 * Locale detection result.
 *
 * S167 — every field used to be populated by falling back to Nigeria when the
 * country was unknown: a user in Brazil with no geo signal was told their
 * currency was NGN, their timezone Africa/Lagos and their tax VAT-7.5%. An
 * unsupported country now reports nulls and `supported: false` rather than a
 * confident profile for the wrong hemisphere.
 */
export interface GcDetection {
  country: string;
  supported: boolean;
  currency: string | null;
  language: string | null;
  timezone: string | null;
  dateFormat: string | null;
  numberFormat: string | null;
  taxRegion: string | null;
  paymentMethods: string[];
  detectedBy: "manual" | "ip-fallback" | "accept-language" | "unknown";
}

export interface GcRegionalPrice {
  country: string;
  localAmount: number;
  currency: string;
  formatted: string;
  tax: {
    rate: number;
    /**
     * S167 — was hardcoded `included: true` while no tax was ever added to
     * `localAmount`. The converted figure is pre-tax.
     */
    included: boolean;
  };
  taxAmount: number;
  totalWithTax: number;
  /**
   * S167 — the method is documented as "PPP + tax adjustment per country" and
   * performs no purchasing-power adjustment whatsoever. It converts at the FX
   * rate. Until a PPP model exists this reports false.
   */
  pppAdjusted: boolean;
  rateStaleness: GcRateStaleness;
  usableForBilling: boolean;
}

/** Result of a rate-manipulation check. */
export interface GcManipulationCheck {
  safe: boolean;
  deviation: number | null;
  /**
   * S167 — false when nothing trustworthy exists to compare against. The guard
   * previously returned `{ safe: true, deviation: 0 }` for any pair missing
   * from the hardcoded table, which is every inverse and every cross: it
   * failed open and reported that as safety.
   */
  baselineAvailable: boolean;
  baselineSource?: GcRateSource;
  flagId?: string;
}
