# Session 164 — Runtime validation checklist (`licensing`)

Runtime validation requires live PostgreSQL 17 + Redis 8 + `prisma generate`.
This sandbox reaches none of them, so Session 164 ships 🟡 **VERIFIED (partial)**.

**§1 is a financial-isolation regression gate — run it before anything else.**
This module records revenue and accrues payout liabilities; a regression here
corrupts money figures across tenants.

## Prerequisites

```bash
pnpm install && pnpm --filter @windels/shared build
cd apps/api && pnpm exec prisma generate
pnpm dev
```

Register a second organization and export `A=<primary token>`, `B=<tenant B token>`:

```bash
curl -sX POST localhost:4000/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"b@example.test","password":"W1ndels!Tenant#2026","displayName":"B","organizationName":"Tenant-B"}'
```

## 1. Financial isolation (regression gate)

- [ ] Record A's dashboard `revenueCents30d` and `payoutsPendingCents`.
- [ ] As **B**: register an asset, grant it, `POST /licensing/usage` for 5000c.
- [ ] B's dashboard shows the 5000c.
- [ ] **A's dashboard is unchanged** on both figures. Pre-S164 A was credited.
- [ ] An asset registered by B does not appear in `GET /licensing/assets` as A.
- [ ] `GET /licensing/royalties` as A contains none of B's entries.
- [ ] `POST /licensing/grants` as A against B's `assetId` returns 404.
- [ ] `POST /licensing/payouts/settle` as A leaves B's pending balance intact.
- [ ] Every route returns **403 FORBIDDEN** when the token resolves to a user
      with no `organizationId`.
- [ ] `redis-keys 'lic:*'` shows only `lic:<entity>:<org>:…` shapes.

## 2. Revenue is a window, not a counter

- [ ] Record one usage event; `revenueCents30d` and `revenueCentsAllTime` both
      reflect it.
- [ ] Backdate that royalty entry's `at` by 45 days in Redis, then re-read the
      dashboard: `revenueCents30d` drops to 0 and `revenueCentsAllTime` does not.
- [ ] The same holds per-asset in `GET /licensing/assets`.
- [ ] Confirm the two figures are **not** always equal — that equality was the
      original tell that "30d" was a lifetime total.

## 3. Payouts settle

- [ ] After a 1000c usage event with no declared revenue share,
      `payoutsPendingCents` is 800 and `payoutsPaidCents` is 0.
- [ ] `POST /licensing/payouts/settle` returns `settled: 1`,
      `centsSettled: 800`, `moneyMoved: false`.
- [ ] Pending drops to 0 and paid rises to 800.
- [ ] Settling again returns `settled: 0` — no double payment.
- [ ] The entry carries `paid: true` and a `paidAt` timestamp.
- [ ] Settling a specific `royaltyIds` subset leaves the rest pending.

## 4. Billing refuses what it should

- [ ] Usage against an unknown `grantId` → 404.
- [ ] Delete the asset behind a grant in Redis, then meter it → **404**, and no
      royalty entry is written. Pre-S164 this fabricated a 10% share and billed.
- [ ] Usage against a grant with `expiresAt` in the past → 409.
- [ ] `POST /licensing/grants/cancel` then meter → 409.
- [ ] After a refused charge, `GET /licensing/royalties` gained no entry and
      the grant's `usageCount`/`spendCents` did not move.

## 5. Grants expire

- [ ] A grant with a past `expiresAt` reports `status: "expired"` from
      `GET /licensing/grants` (and the transition persists in Redis).
- [ ] It is excluded from `activeLicenses`.
- [ ] A future-dated grant stays active and remains billable.

## 6. Fees are declared

- [ ] Every `RoyaltyEntry` carries `platformFeePct: 20` and the matching
      `platformFeeCents`.
- [ ] An asset with no `revenueSharePct` produces `revenueSharePct: 0` — not
      the old invented 10%.
- [ ] An asset with `revenueSharePct: 30` produces a 30% share.
- [ ] For every entry, `platformFeeCents + revenueShareCents +
      ownerPayoutCents === grossCents`.

## 7. Seeding is opt-in

- [ ] With `WINDELS_DEMO_DATA` unset and empty Redis, `GET /licensing/assets`
      is `[]` and the log shows `synthetic seed skipped`.
- [ ] With `WINDELS_DEMO_DATA=true`, four assets appear, every one with
      `source: "demo_seed"`.
- [ ] A seeded catalogue still reports zero revenue and zero pending payouts.
- [ ] An operator-registered asset carries `source: "operator_registered"`.

## 8. Console

- [ ] `/app/licensing` loads with Assets · Grants · Royalties.
- [ ] The amber "Ledger only — no money moves" banner is visible above the
      dollar figures and names the platform fee.
- [ ] Seeded assets show the "demo seed" badge.
- [ ] An expired grant renders with its expired badge and no Cancel button.
- [ ] The Royalties tab shows the full split arithmetic per entry.
- [ ] "Settle all unpaid" reports how many entries were marked and states that
      no money moved.
- [ ] The PlatformPage Licensing tab shows the same ledger-only disclaimer.
- [ ] The sidebar has exactly one "Licensing" entry.

## 9. Regression

- [ ] `pnpm --filter @windels/api test` — 29 licensing tests pass.
- [ ] Full API suite matches the known baseline (2941 passed / 29 pre-existing
      Prisma `.prisma/client/default` failures).
- [ ] `pnpm --filter @windels/web build` succeeds.
- [ ] `npx playwright test tests/e2e/licensing.spec.ts` passes.
- [ ] The tenant-isolation sweep reports the eight `lic:*` prefixes as
      `org_scoped` with no findings.

## 10. Known limitations to confirm, not fix

- [ ] **No payment processor.** Settling marks the ledger; no funds move and no
      external system is notified. `payoutsSettleable` is `false` to say so.
- [ ] **`priceCents` is recorded, not charged.** `recordUsage` is an explicit
      metering call — nothing bills a subscription automatically, so a
      `subscription`-model asset accrues nothing until someone meters it.
- [ ] **`royaltyPct` is stored and unused.** Only `revenueSharePct` takes part
      in the split. Wiring the royalty billing model is its own session.
- [ ] The lifetime `lic:m:<org>` `revenueAll` counter is still incremented for
      operators reading Redis directly, but the dashboard no longer derives
      anything from it.
