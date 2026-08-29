# Session 194 — hybridExec completion + Tier 4 console

**Date:** 2026-08-17
**Branch:** `arena/01a00d4e-win`
**Module focus:** `hybridExec` (Session 43) — defect signature & console page.

## What this session did

### 1. Real defects found and fixed in `hybridExec`

The S43 module had three honest-to-goodness defects that any
multi-tenant operator would see immediately:

1. **Global keys.** `hx:models`, `hx:nodes`, `hx:routes`, `hx:m:req`,
   `hx:m:rb` were global strings/zsets. Every tenant shared the same
   model registry, GPU nodes, route ledger, and counters. A request
   that *omitted* an organization id read whatever happened to be in
   the global keys — the same cross-tenant leak shape Sessions
   162/163/164/165/168/179/192/193 closed in other modules.

2. **Hardcoded dashboard figures.** The dashboard asserted:
   ```ts
   activeMode: "hybrid",              // always "hybrid"
   costOptimization: true,           // always true
   vendorNeutral: true,              // always true
   routedThroughKernel: true,         // always true
   ```
   So every org saw "hybrid mode active, cost optimization enabled,
   vendor-neutral, routed through kernel" — even though the operator
   had not configured any of this. The pre-S194 `registerModel`,
   `promoteCanary`, and `rollback` methods also leaked across tenants:
   one tenant could call `rollback` on another tenant's model id and
   mutate its `deployed` status.

3. **Zero org guards on 7 of 7 read routes.** Every handler had
   `_req, res, next` and called the service with no argument. The
   `_authenticate` import was unused. A request without a token, or
   with a token whose user had no organization, simply read the
   global keys.

### 2. The fix (additive, no breaking changes)

- Every service method now requires `oid: string` (`assertOrg`
  throws on empty / null / undefined).
- All keys are org-scoped: `hx:models:<org>`, `hx:model:<org>:<id>`,
  `hx:nodes:<org>`, `hx:node:<org>:<id>`, `hx:routes:<org>`,
  `hx:route:<org>:<id>`, `hx:m:req:<org>`, `hx:m:rb:<org>`, plus
  per-org config keys `hx:mode:<org>` and `hx:flags:<org>` for the
  previously hardcoded fields, `hx:imported:<org>`, plus the
  already-tenant-scoped `hx:notes:<org>`.
- One-shot legacy adoption: on the first call for a given org, the
  service reads the S43 global keys, writes each entry into the org
  namespace, and sets `hx:imported:<org> = "1"`. The legacy global
  keys are **left in place** so a rollback is possible.
- Removed the hardcoded `activeMode: "hybrid"` — the dashboard reads
  `hx:mode:<org>` (defaulting to `"self-hosted"` until the operator
  calls `PUT /hybrid-execution/mode`).
- The three boolean flags are now org-configurable and default to
  `false` on a fresh org. The dashboard reads
  `hx:flags:<org>` (a hash), not literal `true`. The
  `PUT /hybrid-execution/flags` route toggles them.
- 7 of 7 read routes + the 2 new PUTs use `authenticate` + `orgOf`
  403 (consistent with S180 benchmarks / S176 opex / S192
  uxIntelligence / S193 architecture). The 4 `/notes` routes were
  already org-guarded.
- `bootstrapHybridExec` is now a no-op; per-org seeding is lazy on
  first read. `HybridExecService.bootstrapOrg(oid)` is provided for
  explicit installation.
- 12 new `hx:*` key prefixes are now catalogued in
  `TI_NAMESPACE_CATALOG` (bare `hx` deliberately excluded — the
  `usg:evt` / `opx:` / `ux:` / `arch:` constraint, per the S89
  sweep's prefix-length derivation).

### 3. New `hybridExec` console page

Tier 4: `hybridExec` had 11 routes and a 17-LOC client, no page.
Added `apps/web/src/pages/hybridExec/HybridExecPage.tsx` that mirrors
the S194 honesty discipline:

- A fresh org sees an amber "no hybrid execution telemetry yet"
  banner plus honest zero counts.
- The model registry lists per-org models (empty on a fresh org, not
  the S43 hardcoded six).
- The GPU nodes panel lists per-org nodes (empty on a fresh org, not
  the S43 hardcoded four).
- The active-mode and feature-flag controls are real, not
  hardcoded. The dashboard reflects the org's `hx:mode:<org>` and
  `hx:flags:<org>` rather than asserting "hybrid / all flags on".
- The route-tester card calls `routeRequest` against the org's nodes
  and shows the policy decision.

The page is registered at `/app/hybrid-execution` and linked from
`app/Sidebar.tsx` with a `Cpu` icon.

### 4. Tests

`apps/api/src/hybridExec/hybridExec.completion.test.ts` (6 new
unit tests via `FakeKv`):

- **D1 require-oid**: every read and write rejects empty / null
  organization ids with 403.
- **D2 hardcoded figures**: fresh org reports `modelsRegistered: 0`,
  `gpuNodes: 0`, `costOptimization: false`, `vendorNeutral: false`,
  `routedThroughKernel: false`.
- **D2 setFlag/setMode**: setting a flag/mode updates the
  dashboard.
- **D3 cross-tenant isolation**: two orgs register separate models
  and never share keys.
- **D4 no-seed on read**: only the `hx:imported:<org>` marker is
  written.
- **D5 per-org counter**: `routeRequest` increments the calling
  org's counter, not a global one.

The pre-S194 module had **zero** tests; the suite is the only
place these defects could be regression-detected.

## Inventory state

| Status | Before S194 | After S194 |
|---|---|---|
| COMPLETE | 143 | 143 |
| STUB | 1 (`nativeAi` legacy, intentionally superseded) | 1 (unchanged) |
| User-facing modules with no console page | 48 | 47 |
| Modules with detected `web.pages` | 88 | 89 |
| Total modules | 144 | 144 |

## Files changed

- `apps/api/src/hybridExec/hybridExec.service.ts` — full rewrite
  (org-scoped, configurable, legacy adoption)
- `apps/api/src/hybridExec/bootstrap.ts` — no-op
- `apps/api/src/hybridExec/hybridExec.completion.test.ts` (new)
- `apps/api/src/http/routes/hybridExec.ts` — `authenticate` + `orgOf`
  on 7 routes, plus 2 new PUTs (`/mode`, `/flags`)
- `apps/api/src/tenantIsolation/tenantIsolation.service.ts` — 12
  new `hx:*` catalog entries
- `apps/web/src/lib/hybridExec.ts` — added `setMode()`, `setFlag()`
- `apps/web/src/pages/hybridExec/HybridExecPage.tsx` (new)
- `apps/web/src/router.tsx` — route + import
- `apps/web/src/app/Sidebar.tsx` — `Cpu` icon + sidebar entry
- `PROGRESS.md` — session 194 row
- `docs/SESSION_194_SPECIFICATION.md` (this file)
- `docs/SESSION_194_RUNTIME_VALIDATION_CHECKLIST.md`
- `audit/module-inventory.json` — regenerated

## Test counts

- `apps/api`: **3325 passing / 65 skipped** (was 3319; +6 from the
  new completion test)
- `apps/web` typecheck + build: **clean**
- `packages/shared` build: **clean**
- `make verify`: **7/7 tasks successful**

## Honesty discipline

A fresh org now reports every count as zero and the active mode
defaults to `self-hosted`. There are no hardcoded "hybrid mode
active, cost optimization on, vendor-neutral, routed through
kernel" figures. The model registry, GPU nodes, and route
counter each reflect only the calling org's own data. The three
boolean flags require an explicit `PUT /flags` to flip on.

## Runtime validation

Sandbox has no live PostgreSQL 17 / Redis 8 / Prisma engine. Runtime
validation of the new page is pending in the target environment;
the unit suite (`apps/api/src/hybridExec/hybridExec.completion.test.ts`)
exercises the service end-to-end with `FakeKv` and will run in CI
without infrastructure.
