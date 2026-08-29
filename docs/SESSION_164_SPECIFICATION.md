# Session 164 — Licensing completion (unfinished-module track, 10/N)

**Module:** `licensing` (Session 52 — AI Licensing & Monetization)
**Status:** 🟡 VERIFIED (partial)

> Note: two unrelated services are both exported as `LicensingService`.
> `apps/api/src/platformServices/licensing.service.ts` (Slice 251) issues signed
> licence *keys* and is tested and healthy. This session concerns
> `apps/api/src/licensing/licensing.service.ts` (S52), the asset-monetization
> module, which has **zero tests**.

## What was unfinished

The audit queued this for "ungated seed registers `SEED_ASSETS` as owned IP".
That is true. But this module records revenue, computes fee splits and accrues
payout liabilities, and every one of those paths is wrong.

### 1. Every route drops the caller's organization — and money follows (critical)

`registerLicensingRoutes` contains **zero** references to `organizationId`. All
six handlers call the service with no org, so all six fall through to
`oid = "org-windels"`:

```ts
router.get("/assets", … LicensingService.listAssets())            // → org-windels
router.post("/grants", … LicensingService.grant(req.body))        // → org-windels
router.post("/usage",  … LicensingService.recordUsage(req.body))  // → org-windels
```

The consequences are worse than a read leak:

- Every tenant sees org-windels' asset catalogue and grant book.
- An asset a tenant registers is filed under org-windels — they cannot see
  their own asset afterwards, and org-windels owns it.
- `recordUsage` credits `lic:m:org-windels` `revenue30d`, `revenueAll` and
  `pending`. **One tenant's usage increments another tenant's revenue and
  payout liability.** The dashboard renders `pending` as "Pending Payouts" in
  dollars.

`lic:*` is also absent from `TI_NAMESPACE_CATALOG`.

### 2. `revenueCents30d` is a lifetime total wearing a 30-day label

`recordUsage` does `a.revenueCents30d += usageCents` and
`hincrby(metrics, "revenue30d", …)`. Neither is ever decayed, expired or
windowed. The dashboard prints it as "30d Revenue" and `topAssets` ranks by it.
This is the same defect class as the repo-wide `jobs24` bug, but applied to a
financial figure. `revenueCentsAllTime` increments identically — the two fields
are always equal, which is itself the tell.

### 3. Payouts accrue forever and can never be settled

`pending` accumulates `ownerPayoutCents` on every usage event. Nothing ever
decrements it: there is **no payout path at all**. `RoyaltyEntry.paid` is
written `false` and no code ever sets it `true`. So "Pending Payouts" only ever
grows, and is presented as a real dollar liability.

### 4. Royalty entries are written and never readable

Every usage event writes `lic:r:<oid>:<id>` and a `lic:rs:<oid>` zset entry.
**No endpoint or service method reads either.** The royalty ledger — the record
of what is owed to whom — is write-only dead data.

### 5. A missing asset fabricates a revenue share and still bills

```ts
const a = ar._doc ? JSON.parse(ar._doc) : { revenueSharePct: 10 } as any;
```

If the grant references an asset that does not exist, the service invents a 10%
revenue share and records the transaction anyway. A billing event against a
missing asset should be an error, not a guess.

### 6. The 20% platform fee is hardcoded and undeclared

`const platformFee = Math.round(usageCents * 0.2)` — a fifth of every
transaction, with the rate appearing in no type, no config and no API response.
`revenueSharePct ?? 10` likewise invents a 10% default split for assets that
never declared one.

### 7. Grants never expire

`LicenseGrant.status` includes `"expired"` and `grant()` accepts `expiresAt`,
but no code ever compares the two. A grant with `expiresAt` in the past stays
`"active"`, still counts in `activeLicenses`, and `recordUsage` still bills it.
Cancelled grants are equally billable — nothing checks status.

## What this session adds

**Organization scoping.** `orgOf(req,res)` on all six routes (403 without
context); service org parameters become required rather than defaulted, so the
type system catches an omission. `lic:a/as/g/gs/ag/r/rs/m` catalogued.

**A real 30-day window.** Revenue is a ledger, not a counter. Each usage event
already writes a royalty entry; `revenueCents30d` and the dashboard's
`revenueCents30d` are now computed by summing entries inside the window, and
the lifetime figure ships separately as `revenueCentsAllTime`. Per-asset
`revenueCents30d` becomes a derived read, and `revenueCentsAllTime` is added.

**Settleable payouts.** New `POST /licensing/payouts/settle` marks royalty
entries paid (stamping `paidAt`) and decrements `pending`. `payoutsPendingCents`
is derived from unpaid entries rather than from a counter that only grows.

**The royalty ledger is readable.** `GET /licensing/royalties` returns the
entries, with `period`, the fee split and paid state.

**Billing refuses what it should.** `recordUsage` throws 404 on a missing
asset instead of inventing a share; it refuses a grant that is `canceled`,
`expired`, or past its `expiresAt`; and `listGrants`/`dashboard` reflect
expiry so an out-of-date grant stops counting as active.

**Fees are declared.** `PLATFORM_FEE_PCT` moves into the shared contract and
is echoed on every `RoyaltyEntry` as `platformFeePct`, so a payout can be
audited without reading the source. An asset with no `revenueSharePct` uses
`0`, not an invented 10 — and `RoyaltyEntry` records which was applied.

**Seed gated.** `WINDELS_DEMO_DATA`; seeded assets tagged
`source: "demo_seed"`. Unlike S163 there is no fail-closed concern: an empty
catalogue is simply an empty catalogue.

**Surfaces.** `/app/licensing` console (Assets / Grants / Royalties) + sidebar.

## Not claimed

No payment processor is involved. Settling a payout marks the ledger and
nothing more — no money moves, and the console says so. `priceCents` is
recorded, not charged; `recordUsage` is an explicit metering call, not an
automatic subscription biller.

## Additive-only

Existing paths keep their shapes. `RoyaltyEntry` and `LicensingDashboard` gain
fields; per-asset `revenueCents30d` changes meaning from lifetime to windowed,
which is the fix.
