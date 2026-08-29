/**
 * Global Multi-Currency & Localization singleton (Session 80).
 *
 * - Currency/locale/timezone auto-detection (Country → Currency/Language/TZ/Date/Number/Tax-Region)
 * - Multi-provider exchange rates with live/cache/enterprise-override/offline-fallback layers
 * - User currency preferences (auto-detect / manual override / multi-currency wallet / cross-device)
 * - Payment-method localization adapter (registers WMPC gift cards + cards/bank/mobile-money/local-networks/crypto)
 * - Localized receipt formatter, regional pricing engine, multi-currency reporting
 * - 3 AI agents extending ExpertAgent (S77): exchange-rate-trend, international-pricing-optimizer,
 *   regional-purchasing-monitor
 * - Security: ExchangeRateFraudDetection + CurrencyManipulationGuard (extend Security Framework)
 * - Keys gcu:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import type {
  GcExchangeRate, GcUserCurrencyPrefs, GcLocalizedPrice, GcRateSource,
  GcRateStaleness, GcDetection, GcRegionalPrice, GcManipulationCheck,
} from "@windels/shared";

const K = {
  rates: "gcu:rates",                    // hash: `${from}:${to}` → JSON(GcExchangeRate)
  currencies: "gcu:currencies",          // set of supported ISO codes
  prefs: (uid: string) => `gcu:prefs:${uid}`,
  agents: "gcu:agents",
  fraud: "gcu:fraud:events",
  metrics: { conversions24: "gcu:m:c24", flags24: "gcu:m:f24" },
};
const j = (s: string | null) => (s ? JSON.parse(s) : null);
const s2 = (o: any) => JSON.stringify(o);

/**
 * Constants compiled into this repository. NOT market rates.
 *
 * S167 — these were written into Redis by the bootstrap with
 * `source: "cache"` and a fresh `updatedAt`, so `getRate`'s "< 1h means fresh"
 * branch served them as recently cached values. Restarting the process reset
 * `updatedAt`, so they never aged out: an installation that restarts hourly
 * served these forever as current rates.
 *
 * They are approximate 2024-era values. They are retained only as a
 * last-resort fallback, are labelled `offline-constant`, and are never
 * `usableForBilling`.
 */
const OFFLINE_RATES: Record<string, number> = {
  "USD:USD": 1, "USD:EUR": 0.92, "USD:GBP": 0.79, "USD:NGN": 1520, "USD:JPY": 151,
  "USD:CNY": 7.24, "USD:CAD": 1.37, "USD:AUD": 1.52, "USD:INR": 83.4, "USD:ZAR": 18.5,
  "USD:GHS": 12.8, "USD:KES": 129, "USD:XAF": 602, "USD:XOF": 602, "USD:BRL": 5.1,
};
/**
 * The actual upstream sources. S167 — the dashboard reported "4 rate
 * providers", which was the number of cache layers, not sources.
 */
const UPSTREAM_PROVIDERS = ["frankfurter.app", "open.er-api.com"] as const;

const CURRENCY_SEEDS = ["USD","EUR","GBP","NGN","JPY","CNY","CAD","AUD","INR","ZAR"];
const LANGUAGE_SEEDS = ["en","fr","es","de","pt","zh","ja","ar","yo","ig","ha","pcm"];

const COUNTRY_DEFAULTS: Record<string, { currency: string; language: string; timezone: string; dateFmt: string; numFmt: string; tax?: string; paymentMethods: string[] }> = {
  NG: { currency: "NGN", language: "en",    timezone: "Africa/Lagos",       dateFmt: "dd/MM/yyyy", numFmt: "#,##0.00", tax: "VAT-7.5%",  paymentMethods: ["card","bank-transfer","mobile-money-paga","mobile-money-opay","ussd","wmpc-gift-cards","crypto","bank-transfer-usd"] },
  US: { currency: "USD", language: "en",    timezone: "America/New_York",  dateFmt: "MM/dd/yyyy", numFmt: "#,##0.00", tax: "sales-tax-state", paymentMethods: ["card","ach","apple-pay","google-pay","paypal","wmpc-gift-cards","crypto","bank-transfer-usd"] },
  GB: { currency: "GBP", language: "en",    timezone: "Europe/London",     dateFmt: "dd/MM/yyyy", numFmt: "#,##0.00", tax: "VAT-20%",    paymentMethods: ["card","bacs","fps","apple-pay","google-pay","paypal","wmpc-gift-cards","bank-transfer-usd"] },
  DE: { currency: "EUR", language: "de",    timezone: "Europe/Berlin",     dateFmt: "dd.MM.yyyy", numFmt: "#.##0,00", tax: "VAT-19%",    paymentMethods: ["card","sepa","sofort","giropay","apple-pay","paypal","wmpc-gift-cards","bank-transfer-usd"] },
  FR: { currency: "EUR", language: "fr",    timezone: "Europe/Paris",      dateFmt: "dd/MM/yyyy", numFmt: "# ##0,00", tax: "VAT-20%",    paymentMethods: ["card","sepa","carte-bancaire","apple-pay","paypal","wmpc-gift-cards","bank-transfer-usd"] },
  JP: { currency: "JPY", language: "ja",    timezone: "Asia/Tokyo",        dateFmt: "yyyy/MM/dd", numFmt: "#,##0",    tax: "consumption-10%", paymentMethods: ["card","konbini","bank-transfer-jp","apple-pay","paypay","wmpc-gift-cards","crypto","bank-transfer-usd"] },
  CN: { currency: "CNY", language: "zh",    timezone: "Asia/Shanghai",     dateFmt: "yyyy-MM-dd", numFmt: "#,##0.00", tax: "VAT-13%",    paymentMethods: ["card","alipay","wechat-pay","unionpay","wmpc-gift-cards","bank-transfer-usd"] },
  GH: { currency: "GHS", language: "en",    timezone: "Africa/Accra",      dateFmt: "dd/MM/yyyy", numFmt: "#,##0.00", tax: "VAT-15%",    paymentMethods: ["card","mobile-money-mtn","mobile-money-voda","wmpc-gift-cards","bank-transfer-usd"] },
  KE: { currency: "KES", language: "en",    timezone: "Africa/Nairobi",    dateFmt: "dd/MM/yyyy", numFmt: "#,##0.00", tax: "VAT-16%",    paymentMethods: ["card","mpesa","airtel-money","wmpc-gift-cards","bank-transfer-usd"] },
  ZA: { currency: "ZAR", language: "en",    timezone: "Africa/Johannesburg", dateFmt: "yyyy/MM/dd", numFmt: "#,##0.00", tax: "VAT-15%",  paymentMethods: ["card","eft","snapscan","apple-pay","wmpc-gift-cards","bank-transfer-usd"] },
};

/**
 * S167 — extracted from an inline ternary chain inside `regionalPrice`. Same
 * values, but now reviewable next to COUNTRY_DEFAULTS, which carries the
 * matching human-readable tax region.
 */
const TAX_RATES: Record<string, number> = {
  NG: 0.075, GB: 0.20, DE: 0.19, FR: 0.20, JP: 0.10,
  CN: 0.13, GH: 0.15, KE: 0.16, ZA: 0.15, US: 0,
};

const AI_AGENTS = [
  { id: "gcu-agent-trend",    name: "Exchange Rate Trend Agent",       domain: "global-currency", role: "Analyzes exchange rate trends, volatility, and forward curves", disclaimer: "Informational only; not FX or investment advice" },
  { id: "gcu-agent-pricing",  name: "International Pricing Optimizer", domain: "global-currency", role: "Optimizes regional prices using PPP + demand elasticity", disclaimer: "Pricing suggestions require human approval" },
  { id: "gcu-agent-regional", name: "Regional Purchasing Monitor",     domain: "global-currency", role: "Monitors regional purchasing patterns, drop-off, localization gaps", disclaimer: "Analytics; human judgement required for action" },
];

async function emitKernel(kind: string, payload: any) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ source: "global-currency", kind, payload });
  } catch { /* kernel optional during bootstrap */ }
}


/** 1h fresh · 24h aging · 7d stale · beyond that unusable. */
const HOUR = 3600_000, DAY = 86_400_000;
function stalenessOf(ageMs: number | null): GcRateStaleness {
  if (ageMs === null) return "unusable";   // a constant of unknown vintage
  if (ageMs < HOUR) return "fresh";
  if (ageMs < DAY) return "aging";
  if (ageMs < 7 * DAY) return "stale";
  return "unusable";
}

/**
 * A rate may be charged against only when it came from a real quote that is
 * recent enough, and was not computed from something that fails that test.
 */
function billable(source: GcRateSource, staleness: GcRateStaleness): boolean {
  if (source === "enterprise-override") return true;   // a contractual term
  if (source === "offline-constant" || source === "synthetic") return false;
  return staleness === "fresh" || staleness === "aging";
}

function buildRate(input: {
  from: string; to: string; rate: number; source: GcRateSource;
  updatedAt: string | null; derived?: boolean; provider?: string;
}): GcExchangeRate {
  const ageMs = input.updatedAt ? Math.max(0, Date.now() - new Date(input.updatedAt).getTime()) : null;
  const staleness = stalenessOf(ageMs);
  const derived = input.derived ?? false;
  return {
    from: input.from, to: input.to, rate: input.rate,
    source: input.source,
    updatedAt: input.updatedAt ?? new Date(0).toISOString(),
    ageMs, staleness, derived,
    provider: input.provider,
    // A value derived from an unusable rate is itself unusable.
    usableForBilling: billable(input.source, staleness),
  };
}

export const GlobalCurrencyService = {
  /**
   * Seed the supported-currency list, and optionally the offline constants.
   *
   * S167 — three changes:
   *
   *  1. Gated behind WINDELS_DEMO_DATA. Constants that look like live rates
   *     should not appear on a fresh install of a billing platform.
   *  2. Stored with `source: "offline-constant"`, never `"cache"`. The old
   *     label made `getRate`'s freshness check treat them as recently fetched,
   *     and made the honest `offline-fallback` branch unreachable.
   *  3. Inverses are NO LONGER STORED. They were written as if quoted and
   *     rounded to 4 decimal places, which put NGN:USD 6.40% off
   *     (0.0007 vs 0.00065789) — a $42 error on a single ₦1,000,000
   *     conversion. Inverses are now computed at read time at full precision
   *     and flagged `derived: true`.
   *
   * The currency list itself is a catalogue, not a measurement, so it is
   * always seeded (S161: a catalogue may be served, a posture must be earned).
   */
  async ensureBootstrapped(logger?: any) {
    if ((await redis.scard(K.currencies)) === 0) {
      for (const c of CURRENCY_SEEDS) await redis.sadd(K.currencies, c);
    }

    if (!demoDataEnabled()) return skipDemoSeed("global-currency", logger);
    if ((await redis.hlen(K.rates)) > 0) return;

    for (const [pair, rate] of Object.entries(OFFLINE_RATES)) {
      const [from, to] = pair.split(":");
      const rec = {
        from, to, rate,
        source: "offline-constant" as GcRateSource,
        // No vintage: nobody recorded when these numbers were true.
        updatedAt: null,
      };
      await redis.hset(K.rates, pair, s2(rec));
    }
    logger?.info?.("[global-currency] offline constants seeded", {
      pairs: Object.keys(OFFLINE_RATES).length,
      note: "labelled offline-constant; not usable for billing",
    });
  },

  async dashboard(): Promise<import("@windels/shared").GcuDashboard> {
    const raw = await redis.hgetall(K.rates);
    const entries = Object.entries(raw ?? {})
      .filter(([k]) => !k.startsWith("override:"))
      .map(([, v]) => { try { return JSON.parse(v); } catch { return null; } })
      .filter(Boolean) as Array<{ source: GcRateSource; updatedAt: string | null; provider?: string }>;

    const live = entries.filter((r) => r.source === "live" || r.source === "cache");
    const constants = entries.filter((r) => r.source === "offline-constant" || r.source === "synthetic");
    const ages = live.map((r) => (r.updatedAt ? Date.now() - new Date(r.updatedAt).getTime() : null))
      .filter((n): n is number => n !== null);
    const providers = new Set(live.map((r) => r.provider).filter(Boolean));

    return {
      currenciesSupported: await redis.scard(K.currencies),
      languagesSupported: LANGUAGE_SEEDS.length,
      // S167 — was `rateProviders: 4`, counting the cache LAYERS
      // (live/cache/override/offline-fallback) and calling them providers.
      upstreamProviders: UPSTREAM_PROVIDERS.length,
      // Null until something has actually been fetched; 0 is a claim that we
      // probed and found nothing reachable.
      providersReachable: live.length > 0 ? providers.size : null,
      ratesFromLiveProvider: live.length,
      ratesFromConstants: constants.length,
      oldestRateAgeMs: ages.length ? Math.max(...ages) : null,
      // S167 — replaces `offlineFallbackHealthy`, which was
      // `Object.keys(OFFLINE_RATES).length > 0`: true in every execution.
      fallbackPairsAvailable: Object.keys(OFFLINE_RATES).length,
      multiCurrencyReporting: true,
      paymentMethodsLocalized: Object.values(COUNTRY_DEFAULTS).reduce((a, v) => a + v.paymentMethods.length, 0),
      fraudGuardsActive: 2,
      agents: AI_AGENTS.length,
      countriesSupported: Object.keys(COUNTRY_DEFAULTS).length,
      conversions24h: await this.conversions24h(),
    };
  },

  /** Conversions in the trailing 24h. Null when the counter has never been set. */
  async conversions24h(): Promise<number | null> {
    const v = await redis.get(K.metrics.conversions24);
    return v === null || v === undefined ? null : Number(v);
  },

  listCurrencies(): string[] { return CURRENCY_SEEDS; },
  listLanguages(): string[] { return LANGUAGE_SEEDS; },
  listAgents() { return AI_AGENTS; },
  listCountries() { return Object.keys(COUNTRY_DEFAULTS); },

  /**
   * Detect country defaults.
   *
   * S167 — every unknown country used to resolve to `COUNTRY_DEFAULTS["NG"]`,
   * so a user in Brazil with no geo signal received a fully populated profile
   * stating their currency was NGN, their timezone Africa/Lagos and their tax
   * region VAT-7.5%. `detectedBy: "default-NG"` was technically present but
   * the payload looked exactly like a successful detection.
   *
   * An unsupported country now reports nulls and `supported: false`. A caller
   * that needs a default may choose one; the detector will not invent it.
   */
  detect(input: { country?: string; acceptLanguage?: string; ip?: string }): GcDetection {
    const cc = (input.country ?? "").toUpperCase();
    const d = cc ? COUNTRY_DEFAULTS[cc] : undefined;

    if (!d) {
      return {
        country: cc || "UNKNOWN",
        supported: false,
        currency: null, language: null, timezone: null,
        dateFormat: null, numberFormat: null, taxRegion: null,
        paymentMethods: [],
        detectedBy: input.country ? "manual" : input.ip ? "ip-fallback" : "unknown",
      };
    }

    const lang = input.acceptLanguage?.slice(0, 2).toLowerCase();
    return {
      country: cc,
      supported: true,
      currency: d.currency,
      language: lang || d.language,
      timezone: d.timezone,
      dateFormat: d.dateFmt,
      numberFormat: d.numFmt,
      taxRegion: d.tax ?? null,
      paymentMethods: d.paymentMethods,
      detectedBy: input.country ? "manual" : lang ? "accept-language" : "unknown",
    };
  },

  /**
   * Resolve a rate: enterprise override → stored quote → offline constant →
   * cross via USD.
   *
   * S167 — four defects fixed here.
   *
   *  1. The enterprise override was read only when `opts.useOverride` was
   *     passed, and NO CALLER anywhere in the repository passed it. An
   *     administrator could set a contractual rate, get a 200, see it stored,
   *     and have every conversion silently ignore it. The override is now the
   *     highest-precedence source by default.
   *  2. A stored constant labelled `cache` fell into the "< 1h means fresh"
   *     branch, so hardcoded numbers were served as recently fetched ones and
   *     the honest `offline-fallback` label was unreachable.
   *  3. Stale entries were returned with no age ceiling and nothing in the
   *     response to say how old they were ("stale cache still better than
   *     fallback"). Every rate now carries `ageMs`, `staleness` and
   *     `usableForBilling`.
   *  4. Inverses were read from storage where they had been rounded to 4dp.
   *     They are now computed at full precision and flagged `derived`.
   */
  async getRate(from: string, to: string, opts: { skipOverride?: boolean } = {}): Promise<GcExchangeRate> {
    from = from.toUpperCase(); to = to.toUpperCase();
    if (from === to) {
      return buildRate({ from, to, rate: 1, source: "live", updatedAt: new Date().toISOString() });
    }
    const key = `${from}:${to}`;

    // 1. Enterprise override — a negotiated commercial term outranks a quote.
    if (!opts.skipOverride) {
      const ov = await redis.hget(K.rates, `override:${key}`);
      if (ov) {
        const o = j(ov);
        return buildRate({ from, to, rate: o.rate, source: "enterprise-override", updatedAt: o.updatedAt });
      }
    }

    // 2. A stored quote for this exact pair.
    const stored = await redis.hget(K.rates, key);
    if (stored) {
      const r = j(stored);
      return buildRate({
        from, to, rate: r.rate,
        source: r.source ?? "cache",
        updatedAt: r.updatedAt ?? null,
        provider: r.provider,
      });
    }

    // 3. The reverse pair, inverted at full precision.
    const reverse = await redis.hget(K.rates, `${to}:${from}`);
    if (reverse) {
      const r = j(reverse);
      if (typeof r.rate === "number" && r.rate > 0) {
        return buildRate({
          from, to, rate: 1 / r.rate,
          source: r.source ?? "cache",
          updatedAt: r.updatedAt ?? null,
          provider: r.provider,
          derived: true,
        });
      }
    }

    // 4. Offline constant for the pair.
    const fallback = OFFLINE_RATES[key];
    if (fallback !== undefined) {
      return buildRate({ from, to, rate: fallback, source: "offline-constant", updatedAt: null });
    }

    // 5. Cross via USD, from constants. Derived from unusable inputs, so the
    //    result is unusable too — `billable()` enforces that.
    const usdFrom = OFFLINE_RATES[`USD:${from}`];
    const usdTo = OFFLINE_RATES[`USD:${to}`];
    if (usdFrom && usdTo) {
      return buildRate({
        from, to, rate: usdTo / usdFrom,
        source: "offline-constant", updatedAt: null, derived: true,
      });
    }

    // S167 — this message was wrapped in single quotes around a template
    // literal, so the caller was shown the characters `${from}` verbatim.
    throw AppError.badRequest(`No rate available for ${from} to ${to}`, { code: "NO_RATE" });
  },

  async setEnterpriseOverride(from: string, to: string, rate: number, setBy: string): Promise<GcExchangeRate> {
    if (rate <= 0 || !isFinite(rate)) throw AppError.badRequest("Invalid rate", { code: "INVALID_RATE" });
    const f = from.toUpperCase(), t = to.toUpperCase();
    const updatedAt = new Date().toISOString();
    await redis.hset(K.rates, `override:${f}:${t}`, s2({ from: f, to: t, rate, source: "enterprise-override", updatedAt, setBy }));
    await emitKernel("currency.override-set", { from: f, to: t, rate, setBy });
    return buildRate({ from: f, to: t, rate, source: "enterprise-override", updatedAt });
  },

  /** S167 — an override must be inspectable and removable, not write-only. */
  async getEnterpriseOverride(from: string, to: string): Promise<(GcExchangeRate & { setBy?: string }) | null> {
    const ov = await redis.hget(K.rates, `override:${from.toUpperCase()}:${to.toUpperCase()}`);
    if (!ov) return null;
    const o = j(ov);
    return { ...buildRate({ from: o.from, to: o.to, rate: o.rate, source: "enterprise-override", updatedAt: o.updatedAt }), setBy: o.setBy };
  },

  async clearEnterpriseOverride(from: string, to: string): Promise<{ cleared: boolean }> {
    const n = await redis.hdel(K.rates, `override:${from.toUpperCase()}:${to.toUpperCase()}`);
    return { cleared: Number(n) > 0 };
  },

  /**
   * Convert and format an amount for a locale.
   *
   * S167 — an unrecognised country used to fall back to Nigeria's formatting,
   * so a Brazilian price was rendered with a Naira symbol. It now throws
   * rather than silently formatting for the wrong country, and the result
   * carries the provenance of the rate it used.
   */
  async localizePrice(amount: number, fromCurrency: string, toCurrency: string, country?: string): Promise<GcLocalizedPrice> {
    const rate = await this.getRate(fromCurrency, toCurrency);
    const converted = Math.round(amount * rate.rate * 100) / 100;

    if (country) {
      const cc = country.toUpperCase();
      if (!COUNTRY_DEFAULTS[cc]) {
        throw AppError.badRequest(`Unsupported country ${cc}; no localization profile exists`, { code: "UNSUPPORTED_COUNTRY" });
      }
    }

    const symbols: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", NGN: "₦", JPY: "¥", CNY: "¥", CAD: "C$", AUD: "A$", INR: "₹", ZAR: "R", GHS: "₵", KES: "KSh", XAF: "FCFA", XOF: "CFA", BRL: "R$" };
    const sym = symbols[toCurrency.toUpperCase()] ?? toCurrency.toUpperCase();
    const digits = toCurrency.toUpperCase() === "JPY" ? 0 : 2;
    const formatted = `${sym}${converted.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

    // A rolling 24h window, so the counter means what its name says.
    await redis.incr(K.metrics.conversions24);
    await redis.expire(K.metrics.conversions24, 86400);

    return {
      amount: converted, currency: toCurrency.toUpperCase(), formatted,
      exchangeRate: rate.rate,
      sourceRate: rate.source,
      rateStaleness: rate.staleness,
      rateDerived: rate.derived,
      usableForBilling: rate.usableForBilling,
    };
  },

  async getPreferences(userId: string): Promise<GcUserCurrencyPrefs | null> {
    return j(await redis.get(K.prefs(userId)));
  },

  async setPreferences(userId: string, prefs: Omit<GcUserCurrencyPrefs, "userId">): Promise<GcUserCurrencyPrefs> {
    const p: GcUserCurrencyPrefs = { userId, ...prefs };
    await redis.set(K.prefs(userId), s2(p));
    return p;
  },

  /**
   * Check an observed rate against the best baseline available.
   *
   * S167 — this compared against OFFLINE_RATES, the same hardcoded table the
   * rest of the module was serving, which broke it in both directions:
   *
   *   - it FAILED OPEN for any pair absent from the table — every inverse and
   *     every cross — returning `{ safe: true, deviation: 0 }`, i.e. reporting
   *     an unchecked rate as verified safe;
   *   - as real rates drift from constants written in 2024, it flags correct
   *     LIVE rates as manipulation. NGN has moved far more than the 10%
   *     threshold, so an accurate quote trips the alarm.
   *
   * A guard whose baseline is a stale constant is an alarm wired to the wrong
   * door. The baseline is now the most recent real quote, and when there is no
   * trustworthy baseline the result says so instead of claiming safety.
   */
  async checkRateManipulation(from: string, to: string, observedRate: number): Promise<GcManipulationCheck> {
    const f = from.toUpperCase(), t = to.toUpperCase();

    let baseline: number | undefined;
    let baselineSource: GcRateSource | undefined;

    const stored = await redis.hget(K.rates, `${f}:${t}`);
    if (stored) {
      const r = j(stored);
      // Only a real quote is a defensible baseline.
      if (r && (r.source === "live" || r.source === "cache") && typeof r.rate === "number") {
        baseline = r.rate;
        baselineSource = r.source;
      }
    }

    if (baseline === undefined) {
      // Explicitly NOT safe-by-default. Nothing was checked.
      return { safe: false, deviation: null, baselineAvailable: false };
    }

    const deviation = Math.abs(observedRate - baseline) / baseline;
    if (deviation > 0.10) {
      const id = "frc-" + randomUUID().slice(0, 8);
      const event = { id, kind: "rate-anomaly", pair: `${f}:${t}`, observed: observedRate, baseline, baselineSource, deviation, at: new Date().toISOString() };
      await redis.zadd(K.fraud, Date.now(), id);
      await redis.hset(`gcu:fraud:${id}`, "_doc", s2(event));
      await redis.incr(K.metrics.flags24);
      await redis.expire(K.metrics.flags24, 86400);
      await emitKernel("currency.fraud-flagged", event);
      return { safe: false, deviation, baselineAvailable: true, baselineSource, flagId: id };
    }
    return { safe: true, deviation, baselineAvailable: true, baselineSource };
  },

  /**
   * Convert a USD amount into a country's currency and report its tax.
   *
   * S167 — two dishonest claims removed:
   *
   *   - the method is documented as "PPP + tax adjustment" and performs NO
   *     purchasing-power adjustment. It converts at the FX rate. `pppAdjusted`
   *     now reports false.
   *   - it returned `tax: { included: true }` while adding no tax to the
   *     amount, so `localAmount` was pre-tax and labelled tax-inclusive. The
   *     tax is now computed and reported alongside a real total.
   *
   * An unsupported country throws rather than being priced and taxed as
   * Nigeria.
   */
  async regionalPrice(baseAmountUSD: number, country: string): Promise<GcRegionalPrice> {
    const cc = country.toUpperCase();
    const profile = COUNTRY_DEFAULTS[cc];
    if (!profile) {
      throw AppError.badRequest(`Unsupported country ${cc}; no regional pricing profile exists`, { code: "UNSUPPORTED_COUNTRY" });
    }

    const lp = await this.localizePrice(baseAmountUSD, "USD", profile.currency, cc);
    const taxRate = TAX_RATES[cc] ?? 0;
    const taxAmount = Math.round(lp.amount * taxRate * 100) / 100;

    return {
      country: cc,
      localAmount: lp.amount,
      currency: lp.currency,
      formatted: lp.formatted,
      tax: { rate: taxRate, included: false },
      taxAmount,
      totalWithTax: Math.round((lp.amount + taxAmount) * 100) / 100,
      pppAdjusted: false,
      rateStaleness: lp.rateStaleness,
      usableForBilling: lp.usableForBilling,
    };
  },

  /**
   * Convert a list of rows into one target currency.
   *
   * S167 — the total used to be a bare number. A report that mixes a live EUR
   * quote with a hardcoded XAF constant is not uniformly trustworthy, so the
   * result now reports how many rows were backed by a billable rate and the
   * worst staleness encountered.
   */
  async multiCurrencyReport(rows: Array<{ amount: number; currency: string }>, target: string): Promise<{
    total: number; target: string;
    breakdown: Array<{ original: number; currency: string; converted: number; rate: number; source: GcRateSource; staleness: GcRateStaleness; derived: boolean; usableForBilling: boolean }>;
    usableForBilling: boolean;
    rowsWithUnusableRate: number;
    worstStaleness: GcRateStaleness | null;
  }> {
    const targetU = target.toUpperCase();
    const breakdown: Array<{ original: number; currency: string; converted: number; rate: number; source: GcRateSource; staleness: GcRateStaleness; derived: boolean; usableForBilling: boolean }> = [];
    const order: GcRateStaleness[] = ["fresh", "aging", "stale", "unusable"];
    let total = 0;
    let worstIdx = -1;
    let unusable = 0;

    for (const r of rows) {
      const rate = await this.getRate(r.currency, targetU);
      const conv = Math.round(r.amount * rate.rate * 100) / 100;
      breakdown.push({
        original: r.amount, currency: r.currency.toUpperCase(), converted: conv, rate: rate.rate,
        source: rate.source, staleness: rate.staleness, derived: rate.derived,
        usableForBilling: rate.usableForBilling,
      });
      total += conv;
      if (!rate.usableForBilling) unusable++;
      worstIdx = Math.max(worstIdx, order.indexOf(rate.staleness));
    }

    return {
      total: Math.round(total * 100) / 100,
      target: targetU,
      breakdown,
      // One unusable rate makes the whole total unusable for billing.
      usableForBilling: rows.length > 0 && unusable === 0,
      rowsWithUnusableRate: unusable,
      worstStaleness: worstIdx >= 0 ? order[worstIdx]! : null,
    };
  },
};

export default GlobalCurrencyService;
