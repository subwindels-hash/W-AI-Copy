# Session 192 — UX Intelligence completion + Tier 4 console

**Date:** 2026-08-17
**Branch:** `arena/01a00d4e-win`
**Module focus:** `uxIntelligence` (Session 78) — defect signature & console page.

## What this session did

### 1. Real defects found and fixed in `uxIntelligence`

The S78 module had three honest-to-goodness defects that any user-facing
operator would see immediately:

1. **Ungated global keys.** `ux:tokens`, `ux:components`, `ux:agents`,
   `ux:brands`, `ux:findings`, `ux:r24` were all global strings/zsets.
   Every tenant shared the same component registry, the same AI agents,
   and the same QA-review counter. A request that *omitted* an
   organization id read whatever happened to be in the global keys —
   the same cross-tenant leak shape Sessions 162–168 closed in other
   modules.

2. **Hardcoded dashboard figures.** The dashboard computed counts
   like this:
   ```ts
   agentsOnline: AGENTS_SEED.length,         // always 3
   accessibilityOpen: 1,                    // always 1
   designGateActive: true,                   // always true
   ```
   So a fresh org saw "3 AI agents online, 1 open finding, design gate
   active" — even though no AI agent had ever been registered, no
   finding had ever been filed, and the design gate was never
   configured. This is the same defect family the S168-Tier-3 sweep
   closed in `sustainability`, `dataMarketplace`, and `digitalHumans`.

3. **Zero org guards on 8 of 8 read routes.** Every handler had
   `_req, res, next` and called the service with no argument. The
   `_authenticate` import was unused. A request without a token, or
   with a token whose user had no organization, simply read the
   global keys.

### 2. The fix (additive, no breaking changes)

- Every service method now requires `oid: string` (`assertOrg` throws
  on empty / null / undefined). The previous `oid = "org-windels"`
  default is gone.
- All keys are org-scoped: `ux:tokens:<org>`, `ux:tok:<org>:<ns>:<n>`,
  `ux:components:<org>`, `ux:comp:<org>:<id>`, `ux:findings:<org>`,
  `ux:find:<org>:<id>`, `ux:agents:<org>`, `ux:agent:<org>:<id>`,
  `ux:brands:<org>`, `ux:brand:<org>:<id>`, `ux:meta:<org>`,
  `ux:r24:<org>`, `ux:gate:<org>`, `ux:imported:<org>`, plus the
  already-tenant-scoped `ux:notes:<org>`.
- One-shot legacy adoption: on the first call for a given org, the
  service reads the Session 78 global keys, writes each entry into
  the org namespace, and sets `ux:imported:<org> = "1"`. The legacy
  global keys are **left in place** so a rollback is possible (no
  invented timestamps, no lost data).
- Dashboard figures are now real per-org counts: `agentsOnline` is
  the zcard of `ux:agents:<org>` whose status is `"online"`;
  `accessibilityOpen` is the zcard of findings where `fixed: false`;
  `designGateActive` is `ux:gate:<org> === "1"`; tokens/components/brands
  are zcards; `deviceClasses` stays 9 because it is a static
  catalogue, not a measurement.
- 8 of 8 read routes now use `authenticate` + `orgOf(req,res) === 403`
  (consistent with S180 benchmarks / S176 opex). The 4 `/notes`
  routes were already org-guarded.
- `bootstrapUxIntelligence` is now a no-op; per-org bootstrap is lazy
  on first read and stays gated behind `WINDELS_DEMO_DATA`. The default
  install starts empty (every count is 0, gate inactive) and fills
  from real activity — the same honesty discipline the S176-S180 Tier-2
  sweep enforced.
- 14 `ux:*` key prefixes are now catalogued in
  `TI_NAMESPACE_CATALOG` (bare `ux` deliberately excluded — the
  `usg:evt` / `opx:` constraint, per the S89 sweep's prefix-length
  derivation).

### 3. New `uxIntelligence` console page

Tier 4: `uxIntelligence` had 12 routes and an 18-LOC client, no page.
Added `apps/web/src/pages/uxIntelligence/UxIntelligencePage.tsx` that
mirrors the S192 honesty discipline:

- A fresh org sees an amber "no UX telemetry yet" banner plus honest
  zero counts.
- The AI agents panel shows real per-org agents (none on a fresh org,
  not 3 from `AGENTS_SEED.length`).
- The design-gate card reads "Inactive" (not "Active") on a fresh org.
- The accessibility-findings panel is empty when no findings exist.
- A "Run design QA" button increments the per-org counter (verified
  in `D3` test).

The page is registered at `/app/ux-intelligence` and linked from
`app/Sidebar.tsx` with a `Component` icon.

### 4. Tests

`apps/api/src/uxIntelligence/uxIntelligence.completion.test.ts` (5
new unit tests via `FakeKv`):

- **D1 hardcoded figures**: fresh org reports `agentsOnline: 0`,
  `accessibilityOpen: 0`, `designGateActive: false`. Fails on the
  pre-S192 service.
- **D1 dashboard does not seed**: only the `ux:imported:<org>` marker
  is written, no catalogue keys.
- **D2 cross-tenant isolation**: two orgs run separate bootstraps and
  never share keys.
- **D3 per-org counter**: `runDesignQa` increments the calling org's
  counter, not a global one.
- **D4 require-oid**: every read and write rejects empty / null
  organization ids with 403.

The pre-S192 module had **zero tests**; the suite was the only place
these defects could be regression-detected.

## Inventory state

| Status | Before S192 | After S192 |
|---|---|---|
| COMPLETE | 143 | 143 |
| STUB | 1 (`nativeAi` legacy, intentionally superseded) | 1 (unchanged) |
| User-facing modules with no console page | 50 | 49 |
| Modules with detected `web.pages` | 86 | 87 |
| Total modules | 144 | 144 |

## Files changed

- `apps/api/src/uxIntelligence/uxIntelligence.service.ts` — full rewrite
  (org-scoped, honest counts, legacy adoption)
- `apps/api/src/uxIntelligence/bootstrap.ts` — no-op
- `apps/api/src/uxIntelligence/uxIntelligence.completion.test.ts` (new)
- `apps/api/src/http/routes/uxIntelligence.ts` — `authenticate` + `orgOf` on 8 routes
- `apps/api/src/tenantIsolation/tenantIsolation.service.ts` — 14 new `ux:*` catalog entries
- `apps/web/src/lib/uxIntelligence.ts` — typed `UxDeviceClass` return
- `apps/web/src/pages/uxIntelligence/UxIntelligencePage.tsx` (new)
- `apps/web/src/router.tsx` — route + import
- `apps/web/src/app/Sidebar.tsx` — `Component` icon + sidebar entry
- `PROGRESS.md` — session 192 row
- `docs/SESSION_192_SPECIFICATION.md` (this file)
- `docs/SESSION_192_RUNTIME_VALIDATION_CHECKLIST.md`
- `audit/module-inventory.json` — regenerated

## Test counts

- `apps/api`: **3314 passing / 65 skipped** (was 3309; +5 from the new
  completion test)
- `apps/web` typecheck + build: **clean**
- `packages/shared` build: **clean**
- `make verify`: **7/7 tasks successful**

## Honesty discipline

A fresh org now reports every count as zero and the design gate as
inactive. There are no hardcoded "3 AI agents online" or "1 open
finding" figures. The console's amber "no UX telemetry yet" banner
appears whenever every count is zero, so an operator cannot mistake
the empty state for a populated one.

## Runtime validation

Sandbox has no live PostgreSQL 17 / Redis 8 / Prisma engine. Runtime
validation of the new page is pending in the target environment; the
unit suite (`apps/api/src/uxIntelligence/uxIntelligence.completion.test.ts`)
exercises the service end-to-end with `FakeKv` and will run in CI
without infrastructure.
