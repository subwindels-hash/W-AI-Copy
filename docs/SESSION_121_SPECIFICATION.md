# Session 121 — Sustainability/ESG: a ledger that survives concurrent writes, changes measured against the right window, and no invented scores

**Module:** `sustainability` · **Status before:** PARTIAL (routes = 3, shared contract = 69 LOC, tests = E2E only)
**Status after:** COMPLETE (routes = 5, shared contract = 170 LOC, tests = 1 unit suite / 28 tests + 2 e2e specs)
**Date:** 2026-08-06 · **Branch:** `arena/019fd6f3-win`

---

## 1. What already existed, and is untouched

Session 64 shipped three endpoints on `/api/v1/sustainability`:

| Endpoint | Access | Status |
| --- | --- | --- |
| `GET /sustainability/dashboard/rollup` | any authenticated member | 200 |
| `GET /sustainability/records` | any authenticated member | 200 |
| `POST /sustainability/activity` | `requireAdmin` | 201 |

Their paths, request bodies, status codes and response shapes are **unchanged**
(the rollup gains one **optional** `provenance` field, the S118 pattern). The
ledger's honesty charter — activities carry an explicit, disclosed emission
factor and every reported figure is arithmetic over the records — is kept.
The demo seed stays gated behind `WINDELS_DEMO_DATA`. **Nothing was removed or
rewritten away.**

## 2. What was wrong

| Defect | Consequence before Session 121 |
| --- | --- |
| **The whole org ledger was one JSON string** (`esg:<org>:records`) and every record was a read-modify-write over it. | Two administrators (or an API call and a dashboard seed) recording activity in the same instant **silently lost one of them**. No per-record key, no index. |
| **`emissionsYtdChangePct` compared year-to-date against the FULL previous calendar year.** | On 2026-08-06, 8 months of this year were measured against 12 months of last year — every "reduction" was systematically exaggerated, and an increase could be hidden. |
| **Per-source `changePct` compared ALL-TIME totals against last year.** | An activity recorded for three years showed a "change" of (all years − last year)/last year — a number that had nothing to do with a year-on-year change. |
| **`changePct`/`emissionsYtdChangePct` were `0` without a baseline.** | 0 reads as "no change". An organization that started recording this year reported a flat trend instead of an unknown one. |
| **ESG scores were invented.** `environmental = max(10, min(100, round(92 − ytd×2.5)))` and hard-coded `social: 85` / `governance: 88` — presented as "Data-derived ESG Scores" while the code comment claimed "never invented ratings". | The dashboard published fabricated ratings derived from one arbitrary formula. An ESG score requires an attested assessment; nothing here attests one. |
| **`greenAi[].kwh` mixed scopes.** The compute row summed *every* record's kWh — including non-compute scope2 electricity — into "recorded compute". | A 18 000 kWh grid reading inflated the compute row to 18 450 kWh. |
| **`greenAi` vanished for small compute records.** `computeTCO2e` was rounded to 3 decimals *before* the truthiness check. | A compute record below 0.0005 tCO2e (under 0.5 kg CO2e) rounded to `0.000` → falsy → **no greenAi row at all**, even though the compute record existed. |
| **No correction path.** | A mis-entered record could never be removed or even fetched singly. |
| **`esg` was missing from the Session 89 namespace catalog.** | The tenant-isolation sweep never audited the module's keys. |

## 3. What Session 121 adds

### 3.1 Storage — one key per record behind an append-only index

`esg:<org>:rec:<id>` (one record) + `esg:<org>:idx` (append-only newest-first
list, LPUSH + LTRIM capped at 10 000). `record()` is a pure write — no
read-modify-write — so concurrent POSTs cannot erase each other. The Session
64 blob (`esg:<org>:records`) is **adopted once** (marker
`esg:<org>:imported`): every entry becomes its own key, the legacy string is
**left in place**, a corrupt blob is tolerated rather than fatal, and malformed
entries are skipped without failing the rest.

### 3.2 Arithmetic — same-period windows, null baselines

- `emissionsYtdChangePct` = YTD this year vs **YTD last year**, cut off at the
  same instant one year ago (never the full prior calendar year).
- Per-source `changePct` = same-period YTD vs YTD; the row's `tCO2e` stays
  all-time so `emissionsBySource` still sums to `emissionsTotalTCO2e`.
- Both are **`null`** when the prior period has no records — never `0`.
- A signed change is **truncated toward zero** (never exaggerates a
  magnitude: +12.46 % → 12.4, −12.46 % → −12.4, where rounding would give
  12.5/−12.5).
- `scores.trend` is `null` without a baseline.

### 3.3 Honest scores

Every `EsgScore` field is `null` with a `note` — "a rating requires an
attested assessment, and nothing in this platform attests one". The invented
formula and hard-coded 85/88 are gone. Structural zeros that cannot be
measured by this module (`energyRenewablePct`, `waterMl`, `wasteRecycledPct`,
`offsetsPurchasedT`, `netZeroTargetYear`, `energySeries[].renewablePct` /
`costUsd`, `greenAi[].gpuHours` / `optimizedPct`) keep their 0 for contract
compatibility but are **named field by field** in the new optional
`provenance` block (measured · structural_zero · not_assessed), the Session
118 pattern.

### 3.4 Fixes and additions

- `greenAi[].kwh` sums **compute records only**; the row's presence is
  decided on the unrounded sum (a 0.24 kg CO2e compute record now shows up);
  `gpuHours`/`optimizedPct` are `null`, never 0.
- New endpoints (additive): `GET /sustainability/records/:id` (single record,
  any member) and `DELETE /sustainability/records/:id` (`requireAdmin` — the
  correction path). Routes 3 → 5.
- The activity body schema moved into the shared contract
  (`SustainabilityActivitySchema` — same fields, same rules).
- Every handler refuses a session carrying **no organization** with 403
  instead of building a Redis key containing the literal string `undefined`
  (the S118 guard).
- `esg` is now catalogued in `TI_NAMESPACE_CATALOG` as org-scoped — the org id
  sits in the segment straight after the prefix for every key
  (`esg:<org>:meta|records|imported|idx|rec`), so the S89 sweep's derivation
  holds for the legacy and new keys alike.

### 3.5 Web — client + first console

`apps/web/src/lib/sustainability.ts` keeps `esgApi.dashboard()` and adds
`records`, `record`, `recordActivity`, `removeRecord`, re-exporting the
widened shared contract. New `apps/web/src/pages/admin/SustainabilityPage.tsx`
at `/app/sustainability` (sidebar "Sustainability"): measured cards (total
tCO2e, same-period YTD change with "no baseline", 12-month energy, compute),
an ESG-score card that prints **"not attested"** with the API's note, an
emissions-by-source list, a 12-month energy chart (measured kWh only), the raw
records table with an admin-only delete, an admin-only "Record activity" form
that discloses the factor arithmetic, and a provenance card naming every
structural zero. **No `?? 0` in any value position.**

## 4. Tests

- `apps/api/src/sustainability/sustainability.completion.test.ts` — **new,
  28 tests** (the module previously had no unit suite):
  - storage: per-record keys + index, **25 concurrent records all preserved**,
    index cap, org isolation;
  - adoption: once-only, legacy string left in place, corrupt blob tolerated,
    malformed entries skipped, coexistence with new records;
  - same-period arithmetic: the full-last-year-vs-YTD trap (a Dec-last-year
    record excluded from the baseline), per-source same-period changes, null
    baselines, truncation toward zero in both directions, trend semantics;
  - honesty: all scores null with a note even with data, greenAi kwh
    compute-only, the small-compute-record visibility fix, by-source sums
    equal the total, provenance naming, structural zeros preserved, honest
    empty dashboard;
  - records surface: tCO2e arithmetic, single fetch, delete + index removal +
    dashboard exclusion, newest-first ordering + limit;
  - shared Zod: valid bodies with/without kwh, bad categories, non-positive
    quantities, non-datetime occurredAt, id bounds.
- `tests/e2e/sustainability.spec.ts` — **new, 7 Playwright cases**: anonymous
  refusals, rollup shape with null scores + provenance, **20 concurrent
  POSTs all preserved**, record → rollup arithmetic + single fetch, the delete
  correction path, per-source change null without a baseline, over-long id →
  400 and unknown id → 404.
- Two in-repo assertions that pinned the old behavior were updated to pin the
  honest behavior (both are "nothing is invented" tests): the S64 rollup e2e
  (`scores.overall > 0` → `null` + note) and `usage/rollups.test.ts`
  (`scores.overall` → `null`, `emissionsYtdChangePct` → `null`).

**Full suite: 1684 passing / 51 skipped / 113 files** (Session 120 baseline
1656 / 51 / 112). API and web typecheck clean; web production build emits the
new console chunk.

## 5. Honesty notes

- An ESG score is an attestation, not arithmetic; this module has none, and
  now says so in the payload instead of printing a formula.
- A change without a same-period baseline is `null`, never `0`.
- Structural zeros are named by `provenance`; nothing reports a feed it does
  not have as if it measured it.
- The legacy blob is adopted once and left in place; a corrupt blob degrades
  to an empty ledger rather than a crash.
- No `Math.random` anywhere; demo seeding remains gated behind
  `WINDELS_DEMO_DATA`.

## 6. Runtime validation

Live PostgreSQL 17 + Redis 8 + Prisma generation is not reachable in this
sandbox, so this session ends **🟡 VERIFIED (partial)** and ships
`docs/SESSION_121_RUNTIME_VALIDATION_CHECKLIST.md` for the target environment.

## 7. Files touched

| File | Change |
| --- | --- |
| `packages/shared/src/sustainability.ts` | scores/changes widened to `null`-able, `provenance`, record types + Zod (appended/widened) |
| `apps/api/src/sustainability/sustainability.service.ts` | per-record storage + adoption, same-period arithmetic, honest scores, greenAi fixes, get/delete, provenance |
| `apps/api/src/http/routes/sustainability.ts` | 3 unchanged + `GET/DELETE /records/:id`, org guard, shared schema |
| `apps/api/src/tenantIsolation/tenantIsolation.service.ts` | `esg` catalogued org-scoped |
| `apps/api/src/sustainability/sustainability.completion.test.ts` | **new** — 28 tests |
| `apps/api/src/usage/rollups.test.ts` | sustainability assertions updated to null |
| `apps/web/src/lib/sustainability.ts` | records surface + shared types |
| `apps/web/src/pages/admin/SustainabilityPage.tsx` | **new** — console |
| `apps/web/src/router.tsx`, `apps/web/src/app/Sidebar.tsx` | `/app/sustainability` wired |
| `tests/e2e/sustainability.spec.ts` | **new** — 7 cases |
| `tests/e2e/sessions61-72-82.spec.ts` | S64 assertion updated to honest shape |
| `audit/module-inventory.json` | regenerated |
| `PROGRESS.md`, `docs/CHANGELOG.md`, `CONVENTIONS.md`, `README.md`, `project-understanding.md` | updated |
