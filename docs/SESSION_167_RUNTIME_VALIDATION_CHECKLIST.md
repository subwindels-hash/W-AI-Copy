# Session 167 — Runtime validation checklist (`globalCurrency`)

Runtime validation requires live PostgreSQL 17 + Redis 8 + `prisma generate`.
This sandbox reaches none of them, so Session 167 ships 🟡 **VERIFIED (partial)**.

**This module sets the exchange rates other modules bill against.**
`geoBilling.service.ts:315` calls `getRate("USD", profile.currency)` and prices
a customer with the result. **§1 is a billing-safety gate — run it first.**

## Prerequisites

```bash
pnpm install && pnpm --filter @windels/shared build
cd apps/api && pnpm exec prisma generate
pnpm dev
```

All `/global-currency` routes are ORG_ADMIN-gated. Export `A=<admin token>`.

## 1. No hardcoded constant can reach a customer's invoice (billing gate)

- [ ] On empty Redis with `WINDELS_DEMO_DATA` unset, `redis-cli HLEN gcu:rates`
      returns **0**. Constants are no longer seeded by default.
- [ ] `GET /global-currency/rates/USD/NGN` either resolves from a live provider
      or reports `source: "offline-constant"`.
- [ ] Any `offline-constant` rate has `usableForBilling: false`,
      `staleness: "unusable"` and `ageMs: null`.
- [ ] With `WINDELS_DEMO_DATA=true`, seeded rates are stored with
      `"source":"offline-constant"` — confirm with
      `redis-cli HGET gcu:rates USD:NGN`. Pre-S167 this said `"cache"` with a
      fresh `updatedAt`, so `getRate` returned it through the "< 1h means
      fresh" branch and the honest `offline-fallback` label was unreachable.
- [ ] Restart the API twice and confirm the constant's `ageMs` stays `null`.
      Pre-S167 each restart reset `updatedAt`, so constants never aged out.
- [ ] Ask geoBilling for a price and confirm it can observe
      `usableForBilling` on the rate it used.

## 2. Inverses are computed, not stored

- [ ] `redis-cli HGET gcu:rates NGN:USD` returns **nil** — no inverse is stored.
- [ ] `GET /rates/NGN/USD` returns `derived: true`.
- [ ] Its `rate` equals `1 / (USD:NGN rate)` to at least 10 decimal places.
- [ ] Specifically, it is **not** `0.0007`. Pre-S167 the stored 4dp inverse was
      6.40% above the true 0.00065789.
- [ ] Convert 1,000,000 NGN to USD: the result is ~**$657.89**, not $700.00.
- [ ] A live-quoted inverse is also full precision and `derived: true`.

## 3. Staleness is disclosed and enforced

- [ ] A rate fetched moments ago reports `fresh` and `usableForBilling: true`.
- [ ] Backdate a cached rate 6h (`redis-cli HSET` with an older `updatedAt`):
      reports `aging`, still billable.
- [ ] Backdate 3 days: `stale`, `usableForBilling: false`.
- [ ] Backdate 30 days: `unusable`, `usableForBilling: false`. Pre-S167 this was
      returned indefinitely with the comment "stale cache still better than
      fallback" and nothing in the response to signal age.
- [ ] Every rate response carries a numeric `ageMs`.

## 4. The enterprise override is actually used

- [ ] `POST /rates/USD/NGN/override {"rate":1450}` returns 200.
- [ ] **`GET /rates/USD/NGN` now returns 1450 with
      `source: "enterprise-override"`** — with no flag passed. Pre-S167
      `getRate` consulted the override only when a caller passed
      `opts.useOverride`, and *nothing in the repository ever did*: an admin
      could set a contractual rate, see it stored, and have every conversion
      ignore it.
- [ ] The override outranks a fresh live quote.
- [ ] `GET /rates/USD/NGN/override` returns it with `setBy`.
- [ ] `DELETE /rates/USD/NGN/override` returns `cleared: true` and the market
      rate resumes.
- [ ] An override is `usableForBilling: true` — a contractual term is a
      decision, not a stale quote.
- [ ] A non-positive override is rejected.

## 5. The manipulation guard does not fail open

- [ ] `POST /fraud/check` for a pair with no live baseline returns
      `baselineAvailable: false`, `safe: false`, `deviation: null`.
      Pre-S167 it returned `{ safe: true, deviation: 0 }` — reporting an
      unchecked rate as verified.
- [ ] With only an `offline-constant` stored, `baselineAvailable` is still
      false. A constant is not a defensible baseline for an accusation.
- [ ] With a live quote stored, a rate within 10% passes and one beyond 10% is
      flagged, writes `gcu:fraud:<id>` and emits `currency.fraud-flagged`.
- [ ] A *correct* live rate that has drifted far from the 2024 constants is
      **not** flagged. NGN has moved well beyond 10%, so constant-baselining
      accused accurate quotes.

## 6. Nothing is silently priced as Nigeria

- [ ] `POST /detect {"country":"BR"}` returns `supported: false`, null currency,
      null timezone, empty `paymentMethods`. Pre-S167 it returned NGN /
      Africa/Lagos / VAT-7.5% as a fully populated profile.
- [ ] `POST /detect {}` returns `country: "UNKNOWN"`, `detectedBy: "unknown"`.
- [ ] `POST /detect {"country":"DE"}` returns EUR / Europe/Berlin.
- [ ] `POST /regional-price {"amountUSD":100,"country":"BR"}` returns **400**,
      not a Naira figure.
- [ ] `POST /localize-price` with an unsupported country returns 400.

## 7. Regional pricing states what it does not do

- [ ] `pppAdjusted: false` on every response. The method is documented as a
      "PPP + tax adjustment" engine and performs only FX conversion.
- [ ] `tax.included: false`, with `taxAmount` and `totalWithTax` present.
      Pre-S167 it claimed `included: true` while adding no tax at all.
- [ ] `totalWithTax === localAmount + taxAmount`.
- [ ] The console shows "not included" rather than "Tax (incl.)".

## 8. Dashboard counts sources, not layers

- [ ] `upstreamProviders` is **2** (frankfurter.app, open.er-api.com).
      Pre-S167 `rateProviders: 4` counted the cache layers.
- [ ] `providersReachable` is `null` before any fetch, not 0.
- [ ] `ratesFromLiveProvider` and `ratesFromConstants` are reported separately.
- [ ] `oldestRateAgeMs` is null with nothing stored.
- [ ] `conversions24h` is null before any conversion, then counts, and the
      Redis key carries a real 86400s TTL (`redis-cli TTL gcu:m:c24`).
      Pre-S167 it was a lifetime counter named `24`.
- [ ] `offlineFallbackHealthy` is **gone** — it was
      `Object.keys(OFFLINE_RATES).length > 0`, true in every execution.

## 9. Console

- [ ] `/app/global-currency` loads with Rates · Convert · Localization.
- [ ] With no live rate fetched, the red "No live exchange rate has been
      fetched" banner appears on both the console and the PlatformPage tab.
- [ ] Each rate row shows staleness, source, `derived`, age and a
      billable / not-for-billing badge.
- [ ] A conversion using an unusable rate shows "Display only".
- [ ] An unsupported country shows the amber unsupported notice.

## 10. Regression

- [ ] `pnpm --filter @windels/api test` — `src/globalCurrency` is 49/49
      (the module previously had **no tests at all**).
- [ ] Full API suite matches baseline (3064 passed / 29 pre-existing Prisma
      `.prisma/client/default` failures).
- [ ] `pnpm --filter @windels/web build` succeeds.
- [ ] `npx playwright test tests/e2e/globalCurrency.spec.ts` passes.
- [ ] The tenant-isolation sweep reports `gcu:rates`, `gcu:currencies`,
      `gcu:fraud`, `gcu:m`, `gcu:agents` as `platform_global`, `gcu:prefs` as
      `user_scoped`, `gc:notes` as `org_scoped`, with no findings.

## 11. Known limitations to confirm, not fix

- [ ] **No new FX provider was added.** `refreshRates.ts` already pulls
      frankfurter/open.er-api on a 60-minute timer and is correct. This session
      made the *service* honest about what it serves; if both providers are
      unreachable the platform has no billable rate, and now says so.
- [ ] **No bid/ask spread.** A computed inverse is flagged `derived` rather
      than being presented as a quote, but no spread model exists.
- [ ] **No PPP engine.** `pppAdjusted: false` until one is built.
- [ ] **FX rates are deliberately platform-global**, not per-tenant — an
      exchange rate is a property of the market. This is now recorded in
      `TI_NAMESPACE_CATALOG` rather than left uncatalogued.
- [ ] **`gcu:prefs` is keyed by user with no org segment.** Correct for a
      personal preference, but it means a user carries one currency preference
      across organizations.
