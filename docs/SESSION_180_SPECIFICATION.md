# Session 180 — `benchmarks` completion (unfinished-module track, 15/N — Tier 2 #7)

**Module:** `benchmarks` (Session 50 — Enterprise AI Benchmark Center V8.4 §5, result-registry)  
**Track:** unfinished-module completion (Tier 2, Module #15) — `docs/UNFINISHED_MODULES.md`  
**Rule under test:** *a read path must never be a seeder; tenant required; demo data gated*

---

## 1. What was unfinished

`benchmarks` was reported COMPLETE (8 routes, 394 LOC service + 1161 LOC shared, 1 unit suite) and Session 50 had already removed the 14 “completed” synthetic runs (70-98 random scores). What remained per the audit:

| # | Defect | Location | Consequence |
|---|--------|----------|-------------|
| Q1 | **Ungated seed writes `optimizedModels:0 / pending:0` as measured metrics** — `ensureBootstrapped` does `hset bm:m:org optimizedModels 0 pending 0` on a fresh org that has run nothing | `benchmarks.service.ts:38–42` (`ensureBootstrapped`) | Fresh org immediately reports `{optimizedModels:0, pendingRecommendations:0}` via `hgetall bm:m:org` fallback to `0` — but the seed also writes those zeros as if they were derived from real evaluations. The zeros are technically correct (0 models optimized when no runs), but they are written as a side effect of a read-path-adjacent bootstrap and would be indistinguishable from a measured 0 after one real run. The S156 rule still applies: a read-adjacent seed must be gated. |
| Q2 | **Default tenant fallback** — `ensureBootstrapped(logger, oid="org-windels")`, `dashboard(oid="org-windels")`, `runBenchmark({organizationId || "org-windels"})`, `schedule(...||"org-windels")`, `listRuns(oid="org-windels")` | `benchmarks.service.ts:38, 44, 72, 84, 92` | Missing org silently reads/writes `org-windels`. Same pattern fixed in S163–S179. |
| Q3 | **Unauthenticated routes** — `registerBenchmarksRoutes` registers `GET /dashboard/rollup`, `GET /runs`, `POST /run`, `POST /schedule` with **no** `authenticate` and uses `req.user!.organizationId!` | `http/routes/benchmarks.ts:14–28` (`_authenticate` imported but unused) | Any anonymous request with no token would throw unhandled `TypeError` instead of 401; a token with null org would read house org. Inconsistent with other Tier2 fixes. |
| Q4 | **Uncatalogued / colliding Redis namespaces** — `bm:run/runs/m/area/sched/scheds/notes` never appear in `TI_NAMESPACE_CATALOG`; `bm` already used by `biomedical` (`bm:img/...`) with overlapping `bm:m` / `bm:notes` second segment | `tenantIsolation.service.ts` | Audit cannot verify benchmarks isolation; `bm:m` vs `bm:meta` would be mis-read if bare `bm` were catalogued. |

`BmDashboard` numbers (`totalRuns`, `completed24h`, `avgScore:0`, `passRate:0`, `areaScores:0` per area) are **measured** over real `listRuns` and correctly stay `number` (0 when no runs is honest). No null-widening needed — the zeros are derived from an empty run set, not from an invent-then-average. The audit’s “0 as measured” note is therefore addressed by gating the seed, not by nulling the rollup.

---

## 2. What this session builds (additive-only)

### 2.1 Shared contract (`packages/shared/src/benchmarks.ts`)

No widening — `feedbackToModelFactory` stays `{optimizedModels:number, pendingRecommendations:number}` because `0` when no runs is honest (no model has been optimized). Add optional `provenance?: BmProvenance` noting `feedbackDerivedFromRuns: boolean` if desired, but not required. Otherwise unchanged (the file already imports `z` and defines `BM_AREAS`).

### 2.2 Service (`apps/api/src/benchmarks/benchmarks.service.ts`)

* **Gate `ensureBootstrapped`** — `ensureBootstrapped(logger, oid?: string)` requires `oid` (no default), early-returns if falsy, and is only called from `bootstrapBenchmarks` at server start (already the case via `index.ts:??` — keep that). The `hset bm:m:org 0,0` is now server-start only, not reachable from any read.
* **Remove defaults** — `dashboard(oid: string)`, `runBenchmark({organizationId: string})`, `schedule({organizationId: string})`, `listRuns(oid: string)` all require `oid` (no `"org-windels"`), with `assertOrg` throwing on empty. `runBenchmark` and `schedule` already take `organizationId?: string` at the call boundary but now assert.
* Keep `dashboard` pure read — it already is (it calls `listRuns` + `hgetall bm:m` fallback to `"0"` when missing, which is honest for empty org, not a write). No seeding removed from dashboard beyond the `ensureBootstrapped` gate.

### 2.3 Routes (`apps/api/src/http/routes/benchmarks.ts`)

* Replace the unused `import { authenticate as _authenticate }` with `import { authenticate }` and add `router.use(authenticate)` at top.
* Replace `req.user!.organizationId!` with `orgOf(req): string` guard that throws `AppError.forbidden` when `organizationId` missing, mirroring `opexAssurance`/`cognitive`/`command` (S176–S178).
* Keep all 4 data routes + 4 notes routes, bodies, shapes, status codes.

### 2.4 Tenant isolation (`apps/api/src/tenantIsolation/tenantIsolation.service.ts`)

Register benchmarks prefixes as `org_scoped` (shape `bm:<kind>:<org>[:<id>]` → org at index 2 after two-segment prefix). Bare `bm` never added:

```
bm:run     → org_scoped  (bm:run:org:id)
bm:runs    → org_scoped  (bm:runs:org)
bm:m       → org_scoped  (bm:m:org)
bm:area    → org_scoped  (bm:area:org)
bm:sched   → org_scoped  (bm:sched:org:id)
bm:scheds  → org_scoped  (bm:scheds:org)
bm:notes   → org_scoped  (tenantStore prefix "bm:notes" → bm:notes:idx:org / bm:notes:i:org:id)
```

Note `bm:m` is benchmarks’ `bm:m:org` vs biomedical’s `bm:meta` etc. — different second segment, so no collision if catalogued as two-segment prefixes. `bm` root never catalogued.

### 2.5 Web (`apps/web/src/`)

No new page — `apps/web` already has benchmarks UI via PlatformPage `BenchmarksTab` and maybe dedicated page. Verify it handles empty `feedbackToModelFactory` as `0` (honest) — no `||0` lie beyond the honest 0. No change needed.

### 2.6 Tests

* `benchmarks.completion.test.ts` — **new**, 9 cases with `FakeKv`:
  - `dashboard` on empty org creates no `bm:*` keys and returns `feedbackToModelFactory: {0,0}` via fallback (fails on Q1 if `ensureBootstrapped` had been called on read)
  - `ensureBootstrapped` idempotent and isolated
  - `runBenchmark` increments `optimizedModels` or `pending` correctly based on `overallScore` threshold 80 and is org-scoped
  - `dashboard` after one run reflects the incremented metric
  - second-org isolation — run in org A not visible from org B
  - require-oid throws on empty for `dashboard`/`runBenchmark`/`ensureBootstrapped`

* Existing `benchmarks.test.ts` (if any) preserved.

### 2.7 Order of work

1. Shared (no break) → tsc.
2. Service — gate ensure, remove defaults, add asserts.
3. Routes — `authenticate` + `orgOf` on all handlers.
4. Tenant-isolation catalog (`bm:*` benchmarks).
5. Tests (unit) — mutation-verify no-seed and isolation.
6. `PROGRESS.md` 🟡 · `CONVENTIONS.md` · `docs/UNFINISHED_MODULES.md` strike row 15 · inventory · verify.

---

## 3. Acceptance

* No read path (dashboard) calls `ensureBootstrapped` in `benchmarks`.
* No `oid = "org-windels"` or `organizationId || "org-windels"` default remains.
* `GET /benchmarks/dashboard/rollup` on empty org creates no `bm:*` keys and returns honest `0`s derived from empty run set.
* `POST /benchmarks/run` without org throws (no house-org fallback).
* `bm:run/runs/m/area/sched/scheds/notes` appear in `TI_NAMESPACE_CATALOG` as `org_scoped`.
* `apps/api` vitest ≥ +9 passing, existing suite stays green.

---

## 4. Non-goals

* No `BmDashboard` null-widening — `0` when no runs is honest (0 total runs, 0% passRate, 0 optimized).
* No synthetic runs — result-registry scope preserved.
* No new console — one already exists.
