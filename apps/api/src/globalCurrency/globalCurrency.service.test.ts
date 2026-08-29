/**
 * Global Currency — S167 defects.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * This module had NO tests, and it produces the exchange rates other modules
 * bill against — `geoBilling.service.ts:315` calls `getRate("USD", currency)`
 * and prices a customer with the result. Every defect below is a money defect.
 *
 *   1. Hardcoded constants were stored with `source: "cache"`, and `getRate`
 *      treated anything under an hour old as fresh. So numbers compiled into
 *      the source were served as recently fetched rates, and the honest
 *      `offline-fallback` label was unreachable. Restarting reset `updatedAt`,
 *      so they never aged out.
 *   2. Inverses were STORED, rounded to 4 decimal places. NGN:USD came out
 *      0.0007 against a true 0.00065789 — 6.40% high. Converting ₦1,000,000
 *      produced $700.00 instead of $657.89.
 *   3. No staleness bound: an arbitrarily old quote was returned with nothing
 *      to say how old it was.
 *   4. The enterprise override was written and never read — `getRate` checked
 *      it only behind an `opts.useOverride` flag that NO caller ever passed.
 *   5. The fraud guard baselined against those same constants: it failed OPEN
 *      for any pair not in the table, and flags correct live rates as drift.
 *   6. `detect()` resolved every unknown country to Nigeria.
 *   7. `regionalPrice` claimed PPP it never computed and `included: true` tax
 *      it never added.
 *
 * Redis is substituted with FakeKv; no infrastructure required.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const demoEnabled = vi.hoisted(() => ({ value: false }));
vi.mock("../config/demoData.js", () => ({
  demoDataEnabled: () => demoEnabled.value,
  skipDemoSeed: () => undefined,
}));

const { GlobalCurrencyService: Gcu } = await import("./globalCurrency.service.js");

const RATES = "gcu:rates";

/** Write a quote as if a provider had just returned it. */
async function storeLiveRate(from: string, to: string, rate: number, ageMs = 0, provider = "frankfurter.app") {
  await kv.hset(RATES, `${from}:${to}`, JSON.stringify({
    from, to, rate, source: "live", provider,
    updatedAt: new Date(Date.now() - ageMs).toISOString(),
  }));
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  demoEnabled.value = false;
});

// ───────────────────────────────────────────────────────────────────────────
describe("a hardcoded constant is never served as a fresh rate", () => {
  it("labels seeded constants offline-constant, not cache", async () => {
    demoEnabled.value = true;
    await Gcu.ensureBootstrapped();
    const r = await Gcu.getRate("USD", "NGN");
    expect(r.source).toBe("offline-constant");
    expect(r.source).not.toBe("cache");
  });

  it("never marks a constant fresh, however recently it was written", async () => {
    demoEnabled.value = true;
    await Gcu.ensureBootstrapped();
    const r = await Gcu.getRate("USD", "NGN");
    // THE REGRESSION: stored as `cache` with `updatedAt: now`, the old getRate
    // returned it through the "< 1h means fresh" branch.
    expect(r.staleness).toBe("unusable");
    expect(r.ageMs).toBeNull();
  });

  it("refuses to mark a constant usable for billing", async () => {
    demoEnabled.value = true;
    await Gcu.ensureBootstrapped();
    expect((await Gcu.getRate("USD", "NGN")).usableForBilling).toBe(false);
  });

  it("does not seed constants at all unless demo data is enabled", async () => {
    await Gcu.ensureBootstrapped();
    const stored = await kv.hgetall(RATES);
    expect(Object.keys(stored ?? {})).toHaveLength(0);
  });

  it("still seeds the supported-currency catalogue", async () => {
    // A currency list is a catalogue, not a measurement.
    await Gcu.ensureBootstrapped();
    expect(await kv.scard("gcu:currencies")).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("inverses are computed, not stored at 4dp", () => {
  it("does not store any inverse pairs", async () => {
    demoEnabled.value = true;
    await Gcu.ensureBootstrapped();
    const stored = await kv.hgetall(RATES);
    expect(stored["USD:NGN"]).toBeTruthy();
    // THE REGRESSION: `NGN:USD` was written as Math.round((1/1520)*1e4)/1e4.
    expect(stored["NGN:USD"]).toBeUndefined();
  });

  it("computes NGN:USD at full precision", async () => {
    demoEnabled.value = true;
    await Gcu.ensureBootstrapped();
    const r = await Gcu.getRate("NGN", "USD");
    // True reciprocal of 1520, not the 0.0007 that used to be stored.
    expect(r.rate).toBeCloseTo(1 / 1520, 12);
    expect(r.rate).not.toBeCloseTo(0.0007, 8);
    expect(r.derived).toBe(true);
  });

  it("the old rounding was 6.4% wrong on a real conversion", async () => {
    demoEnabled.value = true;
    await Gcu.ensureBootstrapped();
    const r = await Gcu.getRate("NGN", "USD");

    const correct = 1_000_000 * r.rate;
    const oldBehaviour = 1_000_000 * 0.0007;
    expect(correct).toBeCloseTo(657.89, 1);
    expect(oldBehaviour).toBeCloseTo(700.0, 1);
    // Over $42 of error on one transaction, purely from storage precision.
    expect(oldBehaviour - correct).toBeGreaterThan(40);
  });

  it("inverts a live quote at full precision too", async () => {
    await storeLiveRate("USD", "EUR", 0.923456);
    const r = await Gcu.getRate("EUR", "USD");
    expect(r.rate).toBeCloseTo(1 / 0.923456, 12);
    expect(r.derived).toBe(true);
    expect(r.source).toBe("live");
  });

  it("marks a direct quote as not derived", async () => {
    await storeLiveRate("USD", "EUR", 0.92);
    expect((await Gcu.getRate("USD", "EUR")).derived).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("every rate discloses its age", () => {
  it("reports a fresh quote as fresh", async () => {
    await storeLiveRate("USD", "EUR", 0.92, 60_000);
    const r = await Gcu.getRate("USD", "EUR");
    expect(r.staleness).toBe("fresh");
    expect(r.usableForBilling).toBe(true);
  });

  it("reports a 6-hour-old quote as aging but usable", async () => {
    await storeLiveRate("USD", "EUR", 0.92, 6 * 3600_000);
    const r = await Gcu.getRate("USD", "EUR");
    expect(r.staleness).toBe("aging");
    expect(r.usableForBilling).toBe(true);
  });

  it("reports a 3-day-old quote as stale and unfit for billing", async () => {
    await storeLiveRate("USD", "EUR", 0.92, 3 * 86_400_000);
    const r = await Gcu.getRate("USD", "EUR");
    expect(r.staleness).toBe("stale");
    expect(r.usableForBilling).toBe(false);
  });

  it("reports a 30-day-old quote as unusable", async () => {
    // THE REGRESSION: "stale cache still better than fallback", returned
    // indefinitely with no age ceiling and nothing to signal it.
    await storeLiveRate("USD", "EUR", 0.92, 30 * 86_400_000);
    const r = await Gcu.getRate("USD", "EUR");
    expect(r.staleness).toBe("unusable");
    expect(r.usableForBilling).toBe(false);
  });

  it("exposes a numeric age so a caller can decide for itself", async () => {
    await storeLiveRate("USD", "EUR", 0.92, 7200_000);
    const r = await Gcu.getRate("USD", "EUR");
    expect(r.ageMs).toBeGreaterThan(7_000_000);
  });

  it("treats a same-currency conversion as exact", async () => {
    const r = await Gcu.getRate("USD", "USD");
    expect(r.rate).toBe(1);
    expect(r.usableForBilling).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("the enterprise override is actually honoured", () => {
  it("is used by getRate without any opt-in flag", async () => {
    await storeLiveRate("USD", "NGN", 1600);
    await Gcu.setEnterpriseOverride("USD", "NGN", 1450, "admin-1");

    // THE REGRESSION: getRate only checked the override when a caller passed
    // `opts.useOverride`, and nothing in the repository ever did — so a
    // negotiated contractual rate was silently ignored by every conversion.
    const r = await Gcu.getRate("USD", "NGN");
    expect(r.rate).toBe(1450);
    expect(r.source).toBe("enterprise-override");
  });

  it("outranks a fresh live quote", async () => {
    await storeLiveRate("USD", "EUR", 0.92, 0);
    await Gcu.setEnterpriseOverride("USD", "EUR", 0.88, "admin-1");
    expect((await Gcu.getRate("USD", "EUR")).rate).toBe(0.88);
  });

  it("is readable back", async () => {
    await Gcu.setEnterpriseOverride("USD", "GBP", 0.75, "admin-1");
    const ov = await Gcu.getEnterpriseOverride("USD", "GBP");
    expect(ov?.rate).toBe(0.75);
    expect(ov?.setBy).toBe("admin-1");
  });

  it("can be cleared, restoring the market rate", async () => {
    await storeLiveRate("USD", "EUR", 0.92);
    await Gcu.setEnterpriseOverride("USD", "EUR", 0.5, "admin-1");
    expect((await Gcu.getRate("USD", "EUR")).rate).toBe(0.5);

    const { cleared } = await Gcu.clearEnterpriseOverride("USD", "EUR");
    expect(cleared).toBe(true);
    expect((await Gcu.getRate("USD", "EUR")).rate).toBe(0.92);
  });

  it("is billable — a contractual rate is a decision, not a stale quote", async () => {
    await Gcu.setEnterpriseOverride("USD", "NGN", 1450, "admin-1");
    expect((await Gcu.getRate("USD", "NGN")).usableForBilling).toBe(true);
  });

  it("rejects a non-positive rate", async () => {
    await expect(Gcu.setEnterpriseOverride("USD", "EUR", 0, "a")).rejects.toBeTruthy();
    await expect(Gcu.setEnterpriseOverride("USD", "EUR", -1, "a")).rejects.toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("the manipulation guard does not fail open", () => {
  it("reports that nothing was checked when there is no baseline", async () => {
    // THE REGRESSION: `{ safe: true, deviation: 0 }` for any pair absent from
    // the hardcoded table — every inverse and every cross.
    const c = await Gcu.checkRateManipulation("USD", "XYZ", 999);
    expect(c.baselineAvailable).toBe(false);
    expect(c.safe).toBe(false);
    expect(c.deviation).toBeNull();
  });

  it("will not baseline against a hardcoded constant", async () => {
    demoEnabled.value = true;
    await Gcu.ensureBootstrapped();
    // USD:NGN exists, but only as an offline constant — not a defensible
    // baseline for accusing anyone of manipulation.
    const c = await Gcu.checkRateManipulation("USD", "NGN", 1600);
    expect(c.baselineAvailable).toBe(false);
  });

  it("passes a rate close to the live baseline", async () => {
    await storeLiveRate("USD", "NGN", 1600);
    const c = await Gcu.checkRateManipulation("USD", "NGN", 1650);
    expect(c.baselineAvailable).toBe(true);
    expect(c.safe).toBe(true);
  });

  it("flags a rate far from the live baseline", async () => {
    await storeLiveRate("USD", "NGN", 1600);
    const c = await Gcu.checkRateManipulation("USD", "NGN", 2400);
    expect(c.safe).toBe(false);
    expect(c.flagId).toBeTruthy();
    expect(c.baselineSource).toBe("live");
  });

  it("does not flag a correct live rate that merely drifted from the constants", async () => {
    // NGN has moved far more than 10% since the 1520 constant was written.
    // Baselining on constants made a correct quote look like manipulation.
    await storeLiveRate("USD", "NGN", 1600);
    expect((await Gcu.checkRateManipulation("USD", "NGN", 1601)).safe).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("detection does not invent a country", () => {
  it("reports an unknown country as unsupported rather than Nigerian", async () => {
    const d = Gcu.detect({ country: "BR" });
    // THE REGRESSION: fell through to COUNTRY_DEFAULTS["NG"], telling a
    // Brazilian user their currency was NGN and their timezone Africa/Lagos.
    expect(d.supported).toBe(false);
    expect(d.currency).toBeNull();
    expect(d.timezone).toBeNull();
    expect(d.currency).not.toBe("NGN");
  });

  it("reports no signal at all as unknown, not Nigeria", () => {
    const d = Gcu.detect({});
    expect(d.supported).toBe(false);
    expect(d.country).toBe("UNKNOWN");
    expect(d.detectedBy).toBe("unknown");
  });

  it("returns a real profile for a supported country", () => {
    const d = Gcu.detect({ country: "DE" });
    expect(d.supported).toBe(true);
    expect(d.currency).toBe("EUR");
    expect(d.timezone).toBe("Europe/Berlin");
    expect(d.detectedBy).toBe("manual");
  });

  it("honours an Accept-Language hint over the country default", () => {
    const d = Gcu.detect({ country: "CA" as string });
    expect(d.supported).toBe(false); // CA has no profile — not silently NG
  });

  it("does not offer payment methods for an unsupported country", () => {
    expect(Gcu.detect({ country: "BR" }).paymentMethods).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("pricing refuses to guess a country", () => {
  it("localizePrice rejects an unsupported country", async () => {
    await storeLiveRate("USD", "EUR", 0.92);
    await expect(Gcu.localizePrice(100, "USD", "EUR", "BR")).rejects.toMatchObject({ status: 400 });
  });

  it("regionalPrice rejects an unsupported country instead of pricing it as Nigeria", async () => {
    // THE REGRESSION: regionalPrice(100, "BR") returned a Naira figure taxed
    // at 0%, formatted with a ₦ symbol.
    await expect(Gcu.regionalPrice(100, "BR")).rejects.toMatchObject({ status: 400 });
  });

  it("carries rate provenance into the localized price", async () => {
    await storeLiveRate("USD", "EUR", 0.92, 3 * 86_400_000);
    const p = await Gcu.localizePrice(100, "USD", "EUR", "DE");
    expect(p.rateStaleness).toBe("stale");
    expect(p.usableForBilling).toBe(false);
  });

  it("reports that no PPP adjustment was performed", async () => {
    await storeLiveRate("USD", "NGN", 1600);
    const p = await Gcu.regionalPrice(100, "NG");
    // Documented as "PPP + tax adjustment"; it only ever converted at FX.
    expect(p.pppAdjusted).toBe(false);
  });

  it("does not claim tax is included when no tax was added", async () => {
    await storeLiveRate("USD", "NGN", 1600);
    const p = await Gcu.regionalPrice(100, "NG");
    expect(p.tax.included).toBe(false);
    expect(p.tax.rate).toBe(0.075);
    expect(p.taxAmount).toBeCloseTo(p.localAmount * 0.075, 2);
    expect(p.totalWithTax).toBeCloseTo(p.localAmount + p.taxAmount, 2);
    // The old shape asserted included: true while localAmount was pre-tax.
    expect(p.totalWithTax).toBeGreaterThan(p.localAmount);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("multi-currency reporting discloses mixed provenance", () => {
  it("marks a report unusable when any row used a constant", async () => {
    demoEnabled.value = true;
    await Gcu.ensureBootstrapped();
    await storeLiveRate("EUR", "USD", 1.09);

    const rep = await Gcu.multiCurrencyReport(
      [{ amount: 100, currency: "EUR" }, { amount: 100, currency: "NGN" }], "USD",
    );
    expect(rep.rowsWithUnusableRate).toBe(1);
    expect(rep.usableForBilling).toBe(false);
  });

  it("is usable when every row had a fresh quote", async () => {
    await storeLiveRate("EUR", "USD", 1.09);
    await storeLiveRate("GBP", "USD", 1.27);
    const rep = await Gcu.multiCurrencyReport(
      [{ amount: 100, currency: "EUR" }, { amount: 100, currency: "GBP" }], "USD",
    );
    expect(rep.usableForBilling).toBe(true);
    expect(rep.total).toBeCloseTo(236, 0);
  });

  it("reports the worst staleness across rows", async () => {
    await storeLiveRate("EUR", "USD", 1.09, 0);
    await storeLiveRate("GBP", "USD", 1.27, 3 * 86_400_000);
    const rep = await Gcu.multiCurrencyReport(
      [{ amount: 1, currency: "EUR" }, { amount: 1, currency: "GBP" }], "USD",
    );
    expect(rep.worstStaleness).toBe("stale");
  });

  it("an empty report is not billable", async () => {
    const rep = await Gcu.multiCurrencyReport([], "USD");
    expect(rep.usableForBilling).toBe(false);
    expect(rep.worstStaleness).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("the dashboard counts providers, not cache layers", () => {
  it("reports two upstream providers", async () => {
    // THE REGRESSION: `rateProviders: 4` counted
    // live/cache/override/offline-fallback — the layers, not the sources.
    const d = await Gcu.dashboard();
    expect(d.upstreamProviders).toBe(2);
  });

  it("reports providersReachable as null before anything is fetched", async () => {
    expect((await Gcu.dashboard()).providersReachable).toBeNull();
  });

  it("counts a provider once a live rate exists", async () => {
    await storeLiveRate("USD", "EUR", 0.92);
    const d = await Gcu.dashboard();
    expect(d.providersReachable).toBe(1);
    expect(d.ratesFromLiveProvider).toBe(1);
  });

  it("separates constants from live quotes", async () => {
    demoEnabled.value = true;
    await Gcu.ensureBootstrapped();
    await storeLiveRate("USD", "EUR", 0.92);
    const d = await Gcu.dashboard();
    expect(d.ratesFromConstants).toBeGreaterThan(0);
    expect(d.ratesFromLiveProvider).toBe(1);
  });

  it("reports the oldest live rate age, or null when there are none", async () => {
    expect((await Gcu.dashboard()).oldestRateAgeMs).toBeNull();
    await storeLiveRate("USD", "EUR", 0.92, 5 * 3600_000);
    expect((await Gcu.dashboard()).oldestRateAgeMs).toBeGreaterThan(4 * 3600_000);
  });

  it("reports conversions24h as null before any conversion", async () => {
    expect((await Gcu.dashboard()).conversions24h).toBeNull();
  });

  it("counts a conversion once one happens", async () => {
    await storeLiveRate("USD", "EUR", 0.92);
    await Gcu.localizePrice(10, "USD", "EUR", "DE");
    expect((await Gcu.dashboard()).conversions24h).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("error messages are readable", () => {
  it("does not print a raw template literal for an unknown pair", async () => {
    await expect(Gcu.getRate("AAA", "BBB")).rejects.toThrow(/No rate available for AAA to BBB/);
    // THE REGRESSION: the message was wrapped in single quotes around a
    // template literal, so users saw the characters ${from} verbatim.
    await expect(Gcu.getRate("AAA", "BBB")).rejects.not.toThrow(/\$\{from\}/);
  });
});
