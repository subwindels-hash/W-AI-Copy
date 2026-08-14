# Session 167 — `globalCurrency` completion (unfinished-module track, 13/N)

Module: **Global Multi-Currency & Localization** (Session 80) — country/locale
detection, multi-provider FX, regional pricing, multi-currency reporting.

This module produces **exchange rates that other modules bill against**.
`geoBilling.service.ts:315` calls `getRate("USD", profile.currency)` and uses
the result to price a customer. Every defect below is a money defect.

## Defects found

### D1 — hardcoded rates are stored as `cache`, which the reader treats as fresh

`ensureBootstrapped` writes all 15 `OFFLINE_RATES` into `gcu:rates` with
`source: "cache"` and `updatedAt: new Date()`. `getRate` then does:

```ts
const age = Date.now() - new Date(r.updatedAt).getTime();
if (age < 3600_000) return { ...r, source: r.source === "cache" ? "cache" : "live" };
```

So for the first hour after boot, a constant compiled into the source is served
as a **fresh cached rate**. The `offline-fallback` branch below it is
unreachable for any seeded pair — the label that would have told the truth is
precisely the one that never fires. Restarting the server refreshes
`updatedAt`, so the rate never ages out: an installation that restarts hourly
serves 2024-era constants as current, forever.

### D2 — computed inverses stored as if quoted, at 4 decimal places

```ts
const inv = { rate: Math.round((1 / rate) * 10000) / 10000, source: "cache", ... }
```

Rounding a reciprocal to 4dp is catastrophic for weak currencies. Measured:

| pair | true inverse | stored | error |
|---|---|---|---|
| `NGN:USD` | 0.00065789 | 0.0007 | **+6.40%** |
| `XAF:USD` | 0.00166113 | 0.0017 | +2.34% |
| `XOF:USD` | 0.00166113 | 0.0017 | +2.34% |
| `KES:USD` | 0.00775194 | 0.0078 | +0.62% |

Converting ₦1,000,000 → USD yields **$700.00** instead of $657.89 — a $42
overstatement on a single transaction, entirely from storage precision. The
inverse is also not a quote: real FX has a bid/ask spread, and `1/rate` is
neither side of it.

### D3 — no staleness bound on a financial figure

`getRate` returns a stale cache entry with the comment *"stale cache still
better than fallback"* and no age ceiling. A rate fetched once and never
refreshed is served indefinitely with `source: "cache"`, indistinguishable from
one fetched a minute ago. Nothing in the response says how old it is.

### D4 — `rateProviders: 4` counts layers, not providers

The dashboard reports `rateProviders: 4` with the comment
`live/cache/enterprise-override/offline-fallback`. Those are **cache layers**.
There are exactly **two** upstream providers (frankfurter.app,
open.er-api.com), and the dashboard cannot say whether either is reachable.
`offlineFallbackHealthy` is `Object.keys(OFFLINE_RATES).length > 0` — a
compile-time constant that is `true` in every possible execution.

### D5 — the enterprise override is written but never read

`setEnterpriseOverride` writes `override:FROM:TO`. `getRate` reads it only when
`opts.useOverride` is true — and **no caller anywhere passes it**
(`grep useOverride` → 2 hits, both the definition). So an administrator can set
a contractual FX rate, receive a 200, see it stored, and have every conversion
in the platform silently ignore it. Same shape as licensing's write-only
royalty ledger, but here the ignored value is a negotiated commercial term.

### D6 — the fraud guard validates against the constants it should be checking

`checkRateManipulation` compares an observed rate to `OFFLINE_RATES` — the same
hardcoded table. So:
- it fails **open** for any pair not in the table (`return { safe: true }`),
  including every inverse and every cross;
- as real rates drift from the 2024 constants, it flags **legitimate** rates.
  NGN has moved far more than 10% since those constants were written, so a
  correct live rate is now reported as manipulation.

A guard whose baseline is a stale constant is an alarm wired to the wrong door.

### D7 — `detect()` defaults everyone to Nigeria

`const cc = (input.country ?? "NG").toUpperCase()` and every unknown country
falls back to `COUNTRY_DEFAULTS["NG"]`. A user in Brazil with no geo signal is
told their currency is NGN, their timezone Africa/Lagos, their tax VAT-7.5%.
`detectedBy: "default-NG"` is at least honest, but the caller gets a fully
populated profile that looks detected. Unknown must be unknown.

`localizePrice` and `regionalPrice` repeat the same `?? COUNTRY_DEFAULTS["NG"]`
fallback, so an unrecognised country is silently **priced and taxed as
Nigeria** — `regionalPrice(100, "BR")` returns a Naira figure with 0% tax.

### D8 — `regionalPrice` claims PPP it does not compute

Documented as *"returns price with PPP + tax adjustment per country"*. There is
no PPP adjustment: it converts at the FX rate and attaches a tax rate from an
inline ternary chain. It also returns `tax: { rate, included: true }` while
adding no tax to the amount — `localAmount` is the pre-tax converted figure, so
`included: true` is false.

### D9 — a template literal in single quotes

```ts
throw AppError.badRequest('`No rate available for ${from}→${to}`', ...)
```

The user sees the literal text `` `No rate available for ${from}→${to}` ``.

### D10 — `gcu:*` absent from the tenant-isolation catalogue, and prefs are global

`gcu:prefs:<userId>` is keyed by user with no org segment, and `gcu:rates`,
`gcu:fraud` are platform-global. Rates *should* be global (an FX rate is not
tenant data), but that must be **declared** rather than left uncatalogued. The
catalogue has no `gcu` entry at all.

### D11 — write-only conversion counters

`gcu:m:c24` and `gcu:m:f24` are incremented and never read. Named `24` with no
TTL and no window — a lifetime total labelled as 24-hour. Identical to the
licensing `revenueCents30d` defect from S164.

### D12 — no tests, no console

Zero test files. No `/app/global-currency` page; the module is reachable only
through the PlatformPage admin tab, whose "Rate Providers 4 / offline healthy"
stat is D4 rendered.

## Changes

**`packages/shared/src/globalCurrency.ts`**
- `GcExchangeRate.source`: add `"offline-constant"`, `"synthetic"`; keep the
  rest. Add `ageMs`, `staleness: "fresh" | "aging" | "stale" | "unusable"`,
  `derived: boolean` (true for computed inverses/crosses), `provider?`,
  `usableForBilling: boolean`.
- `GcuDashboard`: `rateProviders` → `upstreamProviders: 2`,
  `providersReachable: number | null`, `ratesFromLiveProvider`,
  `ratesFromConstants`, `oldestRateAgeMs: number | null`, drop
  `offlineFallbackHealthy` for `fallbackPairsAvailable: number`.
- `GcLocalizedPrice`: add `rateStaleness`, `rateDerived`, `usableForBilling`.
- `GcDetection` promoted from the web client into shared, with
  `currency: string | null` etc. and `supported: boolean`.
- `GcRegionalPrice`: `pppAdjusted: false`, `taxIncluded: false`,
  `taxAmount`, `totalWithTax`.

**`apps/api/src/globalCurrency/globalCurrency.service.ts`**
- Seed gated behind `demoDataEnabled()`; constants stored with
  `source: "offline-constant"`, never `"cache"`.
- **Inverses are not stored.** They are computed at read time at full float
  precision and flagged `derived: true`.
- `getRate` returns real `ageMs`/`staleness`; `usableForBilling` false for
  constants, unusable-age, and derived-from-constant rates.
- `getRate` reads the enterprise override **by default** (highest precedence).
- `checkRateManipulation` baselines against the last **live** rate, returns
  `baselineAvailable: false` rather than `safe: true` when there is none.
- `detect()` returns nulls + `supported: false` for unknown countries.
- `localizePrice` / `regionalPrice` refuse an unsupported country rather than
  pricing it as Nigeria.
- `regionalPrice` reports `pppAdjusted: false` and computes real
  `taxAmount`/`totalWithTax`.
- Fix the quoted template literal.
- `conversions24` given a real 24h TTL window and surfaced.

**Routes** — `/rates/:from/:to` gains no auth change (admin-gated already);
add `GET /rates/:from/:to/override`, `DELETE .../override`, `GET /health`.

**Tenant isolation** — catalogue `gcu:rates`, `gcu:currencies`, `gcu:fraud`,
`gcu:m` as `platform_global` with a comment saying why, and `gcu:prefs` as
`user_scoped`; `gc:notes` as `org_scoped`.

**Web** — new `/app/global-currency` console + sidebar; PlatformPage tab
corrected (provider count, staleness, no "offline healthy" constant).

**Tests** — `globalCurrency.service.test.ts` (new, ~35 cases) and
`tests/e2e/globalCurrency.spec.ts`.

## Non-goals

- **No new FX provider integration.** `refreshRates.ts` already pulls
  frankfurter/open.er-api and is correct; this session makes the *service*
  honest about what it is serving, it does not add sources.
- **No bid/ask spread model.** Out of scope; `derived: true` marks computed
  values instead of pretending they are quotes.
- **No PPP engine.** `pppAdjusted: false` is the honest report until one exists.
