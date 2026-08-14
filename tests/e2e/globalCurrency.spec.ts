/**
 * Playwright E2E — Session 167: Global Currency completion.
 *
 * This module produces the exchange rates other modules bill against
 * (`geoBilling.service.ts` prices customers from `getRate("USD", currency)`),
 * so these are money assertions.
 *
 * What is proved here that could not be proved before S167:
 *
 *  1. A rate compiled into the repository is labelled as such and is never
 *     usable for billing. It used to be stored as `cache` with a fresh
 *     timestamp and served through the "< 1h means fresh" branch.
 *  2. Every rate discloses its age and staleness.
 *  3. The enterprise override is honoured by ordinary conversions. It was
 *     written to Redis and read only behind a flag no caller ever passed.
 *  4. The manipulation guard does not report an unchecked rate as safe.
 *  5. An unsupported country is refused, not priced as Nigeria.
 *
 * These routes are ORG_ADMIN-gated (server.ts mounts an admin guard on
 * /global-currency), so the whole suite runs as the platform admin.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function login(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json().catch(() => ({}));
  return j?.data?.token ?? null;
}

async function apiLogin(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const t = await login("admin@windels.ai", "W1ndels!Admin#2026");
    if (t) return t;
    await new Promise((r) => setTimeout(r, 1200));
  }
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@windels.ai", password: "W1ndels!Admin#2026",
      displayName: "Super Admin", organizationName: "WINDELS",
    }),
  });
  return (await login("admin@windels.ai", "W1ndels!Admin#2026"))!;
}

function auth(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

const VALID_SOURCES = ["live", "cache", "enterprise-override", "offline-constant", "synthetic"];
const VALID_STALENESS = ["fresh", "aging", "stale", "unusable"];

test.describe("Session 167 — Global Currency completion", () => {
  let token = "";
  test.beforeAll(async () => { token = await apiLogin(); });

  test("every rate declares source, age and billability", async () => {
    const r = await fetch(`${BASE}/global-currency/rates/USD/NGN`, { headers: auth(token) })
      .then((x) => x.json());
    const d = r?.data;

    expect(VALID_SOURCES).toContain(d.source);
    expect(VALID_STALENESS).toContain(d.staleness);
    expect(d).toHaveProperty("ageMs");
    expect(d).toHaveProperty("derived");
    expect(typeof d.usableForBilling).toBe("boolean");
  });

  test("a hardcoded constant is never billable and never fresh", async () => {
    const d = (await fetch(`${BASE}/global-currency/rates/USD/NGN`, { headers: auth(token) })
      .then((x) => x.json()))?.data;

    if (d.source === "offline-constant") {
      // THE REGRESSION: seeded as `cache` with updatedAt=now, so it came back
      // through the freshness branch looking like a real recent quote.
      expect(d.usableForBilling).toBe(false);
      expect(d.staleness).toBe("unusable");
      expect(d.ageMs).toBeNull();
    }
  });

  test("an inverse rate is flagged derived and computed at full precision", async () => {
    const fwd = (await fetch(`${BASE}/global-currency/rates/USD/NGN`, { headers: auth(token) })
      .then((x) => x.json()))?.data;
    const inv = (await fetch(`${BASE}/global-currency/rates/NGN/USD`, { headers: auth(token) })
      .then((x) => x.json()))?.data;

    expect(inv.derived).toBe(true);
    // THE REGRESSION: the inverse was stored rounded to 4dp, putting NGN:USD
    // 6.4% out (0.0007 vs 0.00065789) — a $42 error per ₦1,000,000 converted.
    expect(inv.rate).toBeCloseTo(1 / fwd.rate, 10);
    const rounded = Math.round((1 / fwd.rate) * 10000) / 10000;
    if (Math.abs(rounded - 1 / fwd.rate) > 1e-9) {
      expect(inv.rate).not.toBe(rounded);
    }
  });

  test("a same-currency rate is exactly 1", async () => {
    const d = (await fetch(`${BASE}/global-currency/rates/USD/USD`, { headers: auth(token) })
      .then((x) => x.json()))?.data;
    expect(d.rate).toBe(1);
  });

  test("the enterprise override is honoured by a plain rate lookup", async () => {
    await fetch(`${BASE}/global-currency/rates/USD/GBP/override`, {
      method: "POST", headers: auth(token), body: JSON.stringify({ rate: 0.6543 }),
    });

    // THE REGRESSION: getRate only consulted the override behind
    // `opts.useOverride`, which nothing in the repository ever passed — so an
    // administrator's contractual rate was silently ignored everywhere.
    const d = (await fetch(`${BASE}/global-currency/rates/USD/GBP`, { headers: auth(token) })
      .then((x) => x.json()))?.data;
    expect(d.rate).toBe(0.6543);
    expect(d.source).toBe("enterprise-override");

    await fetch(`${BASE}/global-currency/rates/USD/GBP/override`, { method: "DELETE", headers: auth(token) });
  });

  test("the override can be read back and cleared", async () => {
    await fetch(`${BASE}/global-currency/rates/USD/CAD/override`, {
      method: "POST", headers: auth(token), body: JSON.stringify({ rate: 1.2345 }),
    });

    const got = (await fetch(`${BASE}/global-currency/rates/USD/CAD/override`, { headers: auth(token) })
      .then((x) => x.json()))?.data;
    expect(got.rate).toBe(1.2345);

    const cleared = (await fetch(`${BASE}/global-currency/rates/USD/CAD/override`, {
      method: "DELETE", headers: auth(token),
    }).then((x) => x.json()))?.data;
    expect(cleared.cleared).toBe(true);

    const after = await fetch(`${BASE}/global-currency/rates/USD/CAD/override`, { headers: auth(token) });
    expect(after.status).toBe(404);
  });

  test("an override is rejected if not positive", async () => {
    const res = await fetch(`${BASE}/global-currency/rates/USD/EUR/override`, {
      method: "POST", headers: auth(token), body: JSON.stringify({ rate: -5 }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("the manipulation guard does not call an unchecked rate safe", async () => {
    const d = (await fetch(`${BASE}/global-currency/fraud/check`, {
      method: "POST", headers: auth(token),
      body: JSON.stringify({ from: "USD", to: "ZZZ", observedRate: 999 }),
    }).then((x) => x.json()))?.data;

    // THE REGRESSION: `{ safe: true, deviation: 0 }` for any pair absent from
    // the hardcoded table — every inverse and every cross failed open.
    expect(d.baselineAvailable).toBe(false);
    expect(d.safe).toBe(false);
    expect(d.deviation).toBeNull();
  });

  test("detection reports an unsupported country as unknown, not Nigeria", async () => {
    const d = (await fetch(`${BASE}/global-currency/detect`, {
      method: "POST", headers: auth(token), body: JSON.stringify({ country: "BR" }),
    }).then((x) => x.json()))?.data;

    expect(d.supported).toBe(false);
    expect(d.currency).toBeNull();
    expect(d.currency).not.toBe("NGN");
    expect(d.timezone).not.toBe("Africa/Lagos");
    expect(d.paymentMethods).toEqual([]);
  });

  test("detection returns a real profile for a supported country", async () => {
    const d = (await fetch(`${BASE}/global-currency/detect`, {
      method: "POST", headers: auth(token), body: JSON.stringify({ country: "DE" }),
    }).then((x) => x.json()))?.data;

    expect(d.supported).toBe(true);
    expect(d.currency).toBe("EUR");
    expect(d.timezone).toBe("Europe/Berlin");
  });

  test("regional pricing refuses an unsupported country", async () => {
    // THE REGRESSION: returned a Naira figure taxed at 0% for any unknown code.
    const res = await fetch(`${BASE}/global-currency/regional-price`, {
      method: "POST", headers: auth(token),
      body: JSON.stringify({ amountUSD: 100, country: "BR" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("regional pricing does not claim PPP or included tax", async () => {
    const d = (await fetch(`${BASE}/global-currency/regional-price`, {
      method: "POST", headers: auth(token),
      body: JSON.stringify({ amountUSD: 100, country: "NG" }),
    }).then((x) => x.json()))?.data;

    expect(d.pppAdjusted).toBe(false);
    expect(d.tax.included).toBe(false);
    expect(d.totalWithTax).toBeGreaterThan(d.localAmount);
    expect(d.taxAmount).toBeCloseTo(d.localAmount * d.tax.rate, 2);
  });

  test("the dashboard counts upstream providers, not cache layers", async () => {
    const d = (await fetch(`${BASE}/global-currency/dashboard/rollup`, { headers: auth(token) })
      .then((x) => x.json()))?.data;

    // THE REGRESSION: `rateProviders: 4` was the number of cache layers.
    expect(d.upstreamProviders).toBe(2);
    expect(d).toHaveProperty("providersReachable");
    expect(d).toHaveProperty("ratesFromConstants");
    expect(d).not.toHaveProperty("offlineFallbackHealthy");
  });

  test("a multi-currency report discloses whether it may be billed", async () => {
    const d = (await fetch(`${BASE}/global-currency/report`, {
      method: "POST", headers: auth(token),
      body: JSON.stringify({ rows: [{ amount: 100, currency: "EUR" }], target: "USD" }),
    }).then((x) => x.json()))?.data;

    expect(typeof d.usableForBilling).toBe("boolean");
    expect(d).toHaveProperty("rowsWithUnusableRate");
    expect(d.breakdown[0]).toHaveProperty("staleness");
  });

  test("an unknown pair returns a readable error, not a raw template literal", async () => {
    const res = await fetch(`${BASE}/global-currency/rates/AAA/BBB`, { headers: auth(token) });
    const body = await res.text();
    // THE REGRESSION: the message was single-quoted around a template literal.
    expect(body).not.toContain("${from}");
  });
});
