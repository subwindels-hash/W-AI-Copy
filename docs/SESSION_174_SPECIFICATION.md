# Session 174 — `biomedical` completion (unfinished-module track, 9/N — Tier 2 #1)

**Module:** `biomedical` (Session 65 — Enterprise Biomedical & Healthcare Intelligence)  
**Track:** unfinished-module completion (Tier 2, Module #9) — `docs/UNFINISHED_MODULES.md`  
**Rule under test:** *a read path must never be a seeder; a seed must be gated behind `WINDELS_DEMO_DATA`; an unmeasured value is `null`, never `0`*

---

## 1. What was unfinished

`biomedical` was reported COMPLETE by `audit/build-inventory.json` (9 routes, shared contract 131 LOC, web client 17 LOC, 2 unit suites) and had already been fixed in Session 65 to remove synthetic diagnostics (the 1.5 s random-finding timer and the 18 seeded studies). That fix was real and is preserved. What remained violated the track's own discipline:

| # | Defect | Location | Consequence |
|---|--------|----------|-------------|
| B1 | **Read-path bootstrap** — `dashboard(oid)` calls `ensureBootstrapped` when `K.meta(oid)` is missing | `biomedical.service.ts:69` | Every GET on a fresh organisation performs a Redis write. A cold `GET /biomedical/dashboard/rollup` is not a read — it mutates. This is the exact S156 defect. |
| B2 | **`avgTurnaroundMin: 0` on empty register** | `biomedical.service.ts:83–89`  `packages/shared/src/biomedical.ts:41` | Empty org reports `avgTurnaroundMin: 0` — interpreted by the UI as “0 min turnaround” (instant). No completed study has ever been measured. Per S158/S160 rule an unmeasured value is `null`, never `0`. The existing test `biomedical.test.ts:22` asserts `toBe(0)` and pins the defect. |
| B3 | **Tenant-isolation defaults** — all routes use `const oid = (req: any)=>(req.user as any).organizationId` without null guard; service signatures default `oid="org-windels"` and `input.organizationId \|\| "org-windels"` | `routes/biomedical.ts:55` + `service:62,68,139` | Null-org token silently reads/writes the house org `org-windels`. Cross-tenant leak by default. The six `notes`-style sub-routers in other modules guard correctly — the pattern is known and simply not applied here. |
| B4 | **Uncatalogued Redis namespaces** — `bm:*` never appears in `TI_NAMESPACE_CATALOG` | `tenantIsolation.service.ts` | Tenant-isolation audit cannot verify the eight biomedical prefixes. `grep bm: TI catalog → 0 hits`. |
| B5 | **No console surface** — `apps/web/src/pages` contains no `biomedical` page | `audit/build-inventory.mjs → web.pages:[]` | Track defines COMPLETE as including a dedicated `/app/biomedical` console. |
| B6 | **Honest-label gap** — `dashboard` returns no provenance and the web client exposes only 2 of 10 API methods | `shared/biomedical.ts` + `web/lib/biomedical.ts` | Operators cannot distinguish measured counts from structural emptiness. |

`areas.*.models:0`, `pharmacyAlerts` filtering and `complianceStatus:"gap"` are intentionally retained — they are honest origins (no model registry → 0, gaps until attested).

---

## 2. What this session builds (additive-only)

### 2.1 Shared contract (`packages/shared/src/biomedical.ts`)

```ts
// was: avgTurnaroundMin: number
imaging: { studies24h: number; aiAssisted: number; pendingReview: number; avgTurnaroundMin: number | null }
// new:
provenance?: BiomedicalProvenance; // S118/S121 pattern — which numbers are measured vs null
```

`BiomedicalProvenance` carries `avgTurnaroundMin: "measured" | "unmeasured_no_completed"` and `studiesMeasured: boolean`. All other dashboard fields remain typed as counts/arrays (honest zeros are correct for counts).

A Zod `BiomedicalDashboardSchema` addition is not required — routes already validate write bodies — but the nullable widening is the breaking type change that must surface.

### 2.2 Service (`apps/api/src/biomedical/biomedical.service.ts`)

* **Delete the read-path seeding** on `dashboard` L69 — make `dashboard(oid: string)` a pure read. It returns empty arrays/counters and `avgTurnaroundMin: null` when nothing exists. No Redis write.
* **Change `avgTurnaroundMin`** to `completed.length ? Math.round(mean) : null`.
* **Remove `oid = "org-windels"` defaults** from `ensureBootstrapped` and `dashboard` — org becomes a required parameter. `submitStudy` continues to accept `organizationId?: string` at the route boundary but now throws 400 if the resolved org is empty (service asserts).
* **Add `provenance` construction** mirroring S160/S121 — explicitly names the unmeasured figure.
* **Gate any future demo seeding** behind `demoDataEnabled()` (currently `ensureBootstrapped` only sets `K.meta`, which is a topology flag not demo data; retained but never called from a read).
* Preserve the registry-only guarantee — `aiFindings` remain `[]` and `status:"queued"` until `recordFindings` is explicitly called. No timers, no RNG.

### 2.3 Routes (`apps/api/src/http/routes/biomedical.ts`)

* Add the `orgOf(req,res): string | null` helper (the `industry.ts:14–21` / `voiceStudio.ts:56–63` pattern) — 403 `FORBIDDEN` with `organization context required` when `req.user?.organizationId` is falsy.
* Guard **all 10** biomedical handlers with `orgOf`. Remove the bare `(req.user as any).organizationId` getter.
* Mount `authenticate` before the handlers (sub-router level) so unauthenticated requests receive 401, not 500.
* Keep all 10 existing paths, request bodies, response shapes, status codes and error codes unchanged; only the org-resolution line changes.

### 2.4 Tenant isolation (`apps/api/src/tenantIsolation/tenantIsolation.service.ts`)

Register the eight biomedical prefixes as `org_scoped` (prefix length determines org segment — all follow `bm:<kind>:<org>[:<id>]`):

```
bm:img   → org_scoped  (bm:img:<org>:<id>)
bm:imgs  → org_scoped  (bm:imgs:<org>)
bm:ph    → org_scoped
bm:phs   → org_scoped
bm:tl    → org_scoped
bm:tls   → org_scoped
bm:ops   → org_scoped  (bm:ops:<org>)
bm:meta  → org_scoped  (bm:meta:<org>)
```

Bare `bm` is deliberately never added — see `opx:`/`pt:`/`pub:` constraint in CONVENTIONS §S118–S120 (a bare `bm` entry would make the sweep read the literal kind string as an org id).

### 2.5 Web (`apps/web/src/`)

* **Expand `lib/biomedical.ts`** from 2 to 10 typed methods: `dashboard`, `listStudies`, `getStudy`, `submitStudy`, `recordFindings`, `listPharmacyAlerts` (via dashboard), `addPharmacyAlert`, `startTelemedSession`, `endTelemedSession`, `setOpsMetrics`.
* **New console** `pages/biomedical/BiomedicalPage.tsx` at `/app/biomedical` with tabs: *Dashboard* (KPI cards, provenance badge, avgTurnaround rendered as “— not measured” when null), *Imaging Registry* (studies table, submit form, findings dialog), *Pharmacy Alerts*, *Telemedicine*, *Hospital Ops*, *Compliance*. Uses the existing design system; no raw uploaded JS.
* Register `/app/biomedical` in `router.tsx` and `Sidebar.tsx` (“Biomedical” under Health).

### 2.6 Tests

* `biomedical.completion.test.ts` — **new**, 14 cases, all with `FakeKv`:
  - dashboard on empty org returns `avgTurnaroundMin === null` (fails on B2)
  - `submitStudy` queues with `aiFindings:[]` and `status:"queued"` — preserved invariant
  - study never grows findings over time (no timer)
  - `recordFindings` → measured turnaround becomes a number; dashboard provenance reflects `measured`
  - second-org isolation — study written in org A is not visible from org B (fails on B3)
  - `dashboard` performs no write when meta is absent (fails on B1) — verified by keyspace diff
  - demo-gate: `ensureBootstrapped` is idempotent and does not create studies
* **Update existing** `biomedical.test.ts:22` from `toBe(0)` to `toBeNull()` — the one place the session rewrites a defect-pinning assertion (S168 technique for sustainability).
* `tests/e2e/biomedical.spec.ts` — **new**, 8 Playwright cases: `GET /biomedical/dashboard/rollup` 401/403, empty dashboard null affordance, submit→list→get round-trip, findings admin gate, pharmacy alert, telemed lifecycle, second-org isolation.

### 2.7 Order of work

1. Shared contract (`number | null` widening) → `apps/web` tsc to surface consumers.
2. Service — delete read-path seed, null turnaround, remove defaults, add provenance.
3. Routes — `orgOf` on all 10 handlers + `authenticate`.
4. Tenant-isolation catalog (`bm:*`).
5. Web lib + console page + router/sidebar.
6. Tests (unit + e2e) — mutation-verify the three discriminating cases (`0` vs `null`, isolation, no-write).
7. `PROGRESS.md` 🟡 · `CONVENTIONS.md` · `docs/UNFINISHED_MODULES.md` strike row 9 · inventory · verify.

---

## 3. Acceptance

* No read path calls `ensureBootstrapped` in `biomedical`.
* No `Math.random` / `_rng` outside a `demoDataEnabled()`-gated block (this module has none).
* No service method defaults `organizationId` to `"org-windels"`.
* Every unmeasured value is `null` — `avgTurnaroundMin === null` on an empty org; counts remain honest `0` where they are counts.
* `bm:*` appears in `TI_NAMESPACE_CATALOG` as `org_scoped` with correct org-segment derivation.
* `GET /app/biomedical` renders; `GET /biomedical/dashboard/rollup` on empty org shows “— not measured” for turnaround.
* `apps/web` tsc 0; `apps/api` vitest ≥ +14 passing, existing `biomedical.test.ts` updated and green.
* `PROGRESS.md` row is 🟡 — runtime validation is not possible in this sandbox.

---

## 4. Non-goals

* No image interpretation — `aiFindings` remain empty until a real provider or clinician records them (S65 guarantee preserved).
* No new compliance assessment — `complianceStatus` stays `gap` until a future assessed control writes it.
* No model registry — `areas.*.models` stays `0` (honest count of configured models, which is zero).
