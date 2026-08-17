# Session 193 — architecture completion + Tier 4 console

**Date:** 2026-08-17
**Branch:** `arena/01a00d4e-win`
**Module focus:** `architecture` (Session 37) — defect signature & console page.

## What this session did

### 1. Real defects found and fixed in `architecture`

The S37 module had three honest-to-goodness defects that any
multi-tenant operator would see immediately:

1. **Global keys.** `arch:modules` and `arch:esi` were global strings
   /zsets. Every tenant shared the same architecture registry and
   ESI signal feed. A request that *omitted* an organization id read
   whatever happened to be in the global keys — the same cross-tenant
   leak shape Sessions 162/163/164/165/168/179/192 closed in other
   modules.

2. **Hardcoded `"org-windels"` in the cross-portfolio report.**
   `EsiAggregationService.portfolioReport()` called
   `BenchmarksService.dashboard("org-windels")` and
   `MediaGenService.dashboard("org-windels")` — both modules accept an
   `oid` parameter, but the aggregator passed the literal
   `"org-windels"`. Every tenant's cross-portfolio report therefore
   showed org-windels' benchmarks and mediaGen numbers. The trading
   section also defaulted to a global catalogue, so the trading
   numbers were everyone's and the per-org portfolio (positions, PnL)
   was effectively silent.

3. **Zero org guards on 6 of 6 read routes.** Every handler had
   `_req, res, next` and called the service with no argument. The
   `_authenticate` import was unused. A request without a token, or
   with a token whose user had no organization, simply read the
   global keys.

### 2. The fix (additive, no breaking changes)

- Every service method now requires `oid: string` (`assertOrg` throws
  on empty / null / undefined). The previous implicit global reads
  are gone.
- All keys are org-scoped: `arch:modules:<org>`, `arch:esi:<org>`,
  `arch:imported:<org>`, plus the already-tenant-scoped
  `arch:notes:<org>`.
- One-shot legacy adoption: on the first call for a given org, the
  service reads the Session 37 global keys, writes each entry into
  the org namespace, and sets `arch:imported:<org> = "1"`. The legacy
  global keys are **left in place** so a rollback is possible (no
  invented timestamps, no lost data).
- `EsiAggregationService.portfolioReport(oid)` is now org-scoped. The
  trading section still reports the global catalogue (agents /
  markets / indicators — these are platform-wide by design), and the
  per-org portfolio values (positions, PnL) are reported as `null`
  with a "see S194" note so the section is honest. S194 is the
  follow-up that lifts the per-org positions / PnL into the report.
- 6 of 6 read routes now use `authenticate` + `orgOf(req,res) === 403`
  (consistent with S180 benchmarks / S176 opex / S192 uxIntelligence).
  The 4 `/notes` routes were already org-guarded.
- `bootstrapArchitecture` is now a no-op; per-org registration is lazy
  on first read.
- 4 new `arch:*` key prefixes are now catalogued in
  `TI_NAMESPACE_CATALOG` (bare `arch` deliberately excluded — the
  `usg:evt` / `opx:` / `ux:` constraint, per the S89 sweep's
  prefix-length derivation).

### 3. New `architecture` console page

Tier 4: `architecture` had 10 routes and a 17-LOC client, no page.
Added `apps/web/src/pages/architecture/ArchitecturePage.tsx` that
mirrors the S193 honesty discipline:

- A fresh org sees an amber "no architecture records yet" banner plus
  honest zero counts.
- The module registry lists per-org modules (empty on a fresh org,
  not the S37 global catalogue).
- The ESI signal feed lists only the calling org's own signals.
- The cross-portfolio report card shows every section's
  `available`/`unavailable` state with the source module's note,
  never an invented value.

The page is registered at `/app/architecture` and linked from
`app/Sidebar.tsx` with a `Boxes` icon.

### 4. Tests

`apps/api/src/architecture/architecture.completion.test.ts` (5 new
unit tests via `FakeKv`):

- **D1 require-oid**: every read and write rejects empty / null
  organization ids with 403.
- **D2 cross-tenant isolation**: two orgs register separate modules
  and never share keys.
- **D2 legacy adoption**: legacy `arch:modules` global key is
  adopted once into the org namespace, the marker is set, the
  global key is left in place.
- **D3 per-org ESI**: two orgs push signals into separate streams.
- **D4 org-scoped report**: `portfolioReport(oid)` reads the calling
  org's ESI stream (not a shared global).

The pre-existing `esiAggregation.test.ts` was updated to the new
`portfolioReport(oid)` signature.

The pre-S193 module had **two** tests (only the aggregator's
shape); the suite is the only place these defects could be
regression-detected.

## Inventory state

| Status | Before S193 | After S193 |
|---|---|---|
| COMPLETE | 143 | 143 |
| STUB | 1 (`nativeAi` legacy, intentionally superseded) | 1 (unchanged) |
| User-facing modules with no console page | 49 | 48 |
| Modules with detected `web.pages` | 87 | 88 |
| Total modules | 144 | 144 |

## Files changed

- `apps/api/src/architecture/architecture.service.ts` — full rewrite
  (org-scoped, one-shot legacy adoption)
- `apps/api/src/architecture/esiAggregation.service.ts` — `portfolioReport(oid)` is org-scoped
- `apps/api/src/architecture/bootstrap.ts` — no-op
- `apps/api/src/architecture/architecture.completion.test.ts` (new)
- `apps/api/src/architecture/esiAggregation.test.ts` — updated to new signature
- `apps/api/src/http/routes/architecture.ts` — `authenticate` + `orgOf` on 6 routes
- `apps/api/src/tenantIsolation/tenantIsolation.service.ts` — 4 new `arch:*` catalog entries
- `apps/web/src/lib/architecture.ts` — added `esiReport()` and `architectureApi` alias
- `apps/web/src/pages/architecture/ArchitecturePage.tsx` (new)
- `apps/web/src/router.tsx` — route + import
- `apps/web/src/app/Sidebar.tsx` — `Boxes` icon + sidebar entry
- `PROGRESS.md` — session 193 row
- `docs/SESSION_193_SPECIFICATION.md` (this file)
- `docs/SESSION_193_RUNTIME_VALIDATION_CHECKLIST.md`
- `audit/module-inventory.json` — regenerated

## Test counts

- `apps/api`: **3319 passing / 65 skipped** (was 3314; +5 from the new
  completion test)
- `apps/web` typecheck + build: **clean**
- `packages/shared` build: **clean**
- `make verify`: **7/7 tasks successful**

## Honesty discipline

A fresh org now reports every count as zero. The architecture
registry, the ESI signal feed, and the cross-portfolio report each
reflect only the calling org's own data. The aggregator no longer
hardcodes `"org-windels"`; the per-org trading portfolio values
(positions, PnL) report `null` with a "see S194" note rather than
fabricated numbers, and S194 is the planned follow-up.

## Runtime validation

Sandbox has no live PostgreSQL 17 / Redis 8 / Prisma engine. Runtime
validation of the new page is pending in the target environment; the
unit suite (`apps/api/src/architecture/architecture.completion.test.ts`)
exercises the service end-to-end with `FakeKv` and will run in CI
without infrastructure.
