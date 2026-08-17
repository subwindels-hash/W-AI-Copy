# Session 179 — `disasterRecovery` completion (unfinished-module track, 14/N — Tier 2 #6)

**Module:** `disasterRecovery` (Session 51 — Enterprise Disaster Recovery & AI Continuity V8.4 §6)  
**Track:** unfinished-module completion (Tier 2, Module #14) — `docs/UNFINISHED_MODULES.md`  
**Rule under test:** *a read path must never be a seeder; tenant required; unmeasured topology is `null`, never an invented region*

---

## 1. What was unfinished

`disasterRecovery` was reported COMPLETE (13 routes, 419 LOC service + 419 LOC bootstrap? actually 416 LOC service, shared contract `disasterRecovery.ts`, 1 unit suite) and Session 51 had already removed synthetic replication lag and a “passed” drill. What remained per the audit:

| # | Defect | Location | Consequence |
|---|--------|----------|-------------|
| D1 | **Ungated seed writes a na-east topology** — `ensureBootstrapped` writes `dr:active:org = "na-east"`, `dr:em:org = "0"` and a `DrStatus` for **every** of the 12 `DR_COMPONENTS` with `activeRegion:"na-east"` + `standbyRegions:["na-west","eu-west"]` even though no operator configured a region | `disasterRecovery.service.ts:45–58` (`ensureBootstrapped`) | Fresh org immediately reports a failover topology (active na-east, two standbys per component) that nobody configured. Health stays `healthy:false` (honest), but `activeRegion/standbyRegions/components` are fabricated. The doc notes: honest on health, dishonest on topology. |
| D2 | **Dashboard is not org-scoped and not authenticated** — `registerDisasterRecoveryRoutes` registers `GET /dashboard/rollup`, `/status`, `/events`, `/drills`, `POST /failover`, `/drills`, `/drills/:id/run`, `/drills/:id/result`, `/emergency` with **no** `authenticate` and **no** `orgOf`; service calls like `dashboard()` use `oid = "org-windels"` fallback (`input.organizationId || "org-windels"` or default param) | `http/routes/disasterRecovery.ts:22–45` + `service:43, 60, 102, 130, 150` | Any unauthenticated request reads `org-windels`’s topology; `POST /failover` with no org triggers a failover in `org-windels`; `triggerFailover({toRegion, reason})` without org writes to house org. Cross-tenant + unauthenticated leak. |
| D3 | **Uncatalogued Redis namespaces** — `dr:*` never appears in `TI_NAMESPACE_CATALOG` | `tenantIsolation.service.ts` | Audit cannot verify `dr:active/status/ev/drill/drills/em/m/notes`. |
| D4 | **No null for unconfigured topology** — `DrDashboard` types `activeRegion: string` (not null), `standbyRegions: string[]` (always non-empty due to seed), `components: DrStatus[]` (12 seeded) — fresh org should show empty/no topology, not na-east | `shared/disasterRecovery.ts:45` + `service:60` | Same S160 rule: unconfigured is `null`/empty, not an invented region. |

---

## 2. What this session builds (additive-only)

### 2.1 Shared contract (`packages/shared/src/disasterRecovery.ts`)

Widen topology fields to honest null/empty:

```ts
activeRegion: string | null;      // null until topology is configured (no default na-east)
standbyRegions: string[];         // [] until configured (no invented standbys)
replicationLagMs: number | null;  // null when no component has reported lag (was 0)
components: DrStatus[];           // [] until at least one status exists (was 12 seeded)
overallHealthy: boolean;          // false until a drill/probe proves otherwise (already false, keep)
```

Add optional `provenance?: DrProvenance` noting `topologyMeasured: false` until `ensureBootstrapped` has run via bootstrap.

### 2.2 Service (`apps/api/src/disasterRecovery/disasterRecovery.service.ts`)

* **Gate `ensureBootstrapped`** — `ensureBootstrapped(logger, oid?: string)` requires `oid` (no `"org-windels"`), early-returns if falsy, and is only called from `bootstrapDisasterRecovery` at server start (already the case via `index.ts:??` — keep that). No other caller should seed.
* **Make `dashboard(oid: string)` pure read** — remove any implicit seeding. If `K.activeRegion(oid)` missing and `getStatus(oid)` returns `[]`, return `activeRegion: null`, `standbyRegions: []`, `components: []`, `replicationLagMs: null`, `overallHealthy: false` (instead of fabricating na-east). Only when `activeRegion` exists do we return that region and derived standbys. `maxLag` becomes `null` when no sampled lag exists (instead of 0).
* **Remove `oid = "org-windels"` defaults** from `getStatus`, `triggerFailover`, `scheduleDrill`, `runDrill`, `recordDrillResult`, `setEmergencyMode`, `getEvents`, `getDrills` — all now require `oid` and throw if empty (`assertOrg`). `triggerFailover` already takes `input.organizationId?: string` but now requires it (route will supply `orgOf(req)`).
* Keep health logic (`healthy:false` until `recordDrillResult` sets it) — already honest.

### 2.3 Routes (`apps/api/src/http/routes/disasterRecovery.ts`)

* Add `router.use(authenticate)` at top (or per-route) and `orgOf(req,res): string | null` / `userOf(req,res)` guards (403) mirroring `healthEcosystem`/`command`. Every handler now does `const oid = orgOf(req,res); if (!oid) return;` and passes `oid` explicitly to the service. `POST /failover` and `POST /drills` now send `{..., organizationId: oid}`.
* Keep all 13 paths, bodies, shapes, status codes; only org resolution changes. The `dr:notes` sub-router already guarded correctly — keep it.

### 2.4 Tenant isolation (`apps/api/src/tenantIsolation/tenantIsolation.service.ts`)

Register the 8 disaster-recovery prefixes as `org_scoped` (shape `dr:<kind>:<org>[:<id>]` → org at index 1 or 2? For `dr:status:org:comp` split → ["dr","status","org","comp"] prefix "dr:status" length 2 → org at 2 correct; for `dr:active:org` prefix "dr:active" length 2 → org at 2; bare `dr` never added):

```
dr:active    → org_scoped
dr:status    → org_scoped
dr:ev        → org_scoped
dr:drill     → org_scoped
dr:drills    → org_scoped
dr:em        → org_scoped
dr:m         → org_scoped
dr:notes     → org_scoped  (tenantStore prefix "dr:notes")
```

### 2.5 Web (`apps/web/src/`)

* No new page — `apps/web` already has disaster-recovery UI (via PlatformPage `DrTab` and maybe dedicated page). Update the `DrTab`/`DisasterRecoveryPage` to handle `activeRegion == null` as “— no topology configured” instead of showing `na-east`, and `replicationLagMs == null` as “—” not `0ms`.

### 2.6 Tests

* `disasterRecovery.completion.test.ts` — **new**, 10 cases with `FakeKv`:
  - `dashboard` on empty org creates no `dr:*` keys and returns `activeRegion:null`, `components:[]`, `replicationLagMs:null` (fails on D1/D4)
  - `ensureBootstrapped` idempotent and isolated (other org still empty)
  - `triggerFailover` without org throws (fails on D2 fallback)
  - second-org isolation — failover/drill written in org A not visible from org B
  - `scheduleDrill` + `runDrill` + `recordDrillResult` measured path still works and makes `healthy` true only after recorded `passed:true`

* Existing `disasterRecovery.test.ts` (if any) preserved — it likely expects `healthy:false` after bootstrap, which remains true.

### 2.7 Order of work

1. Shared contract widening → tsc.
2. Service — gate ensure, make dashboard pure, null topology, remove defaults.
3. Routes — `authenticate` + `orgOf` on all 13 handlers.
4. Tenant-isolation catalog (`dr:*`).
5. Web null-aware activeRegion/replicationLag.
6. Tests (unit) — mutation-verify no-seed and null topology.
7. `PROGRESS.md` 🟡 · `CONVENTIONS.md` · `docs/UNFINISHED_MODULES.md` strike row 14 · inventory · verify.

---

## 3. Acceptance

* No read path calls `ensureBootstrapped` in `disasterRecovery`; `dashboard` on empty org creates no `dr:*` keys.
* No `oid = "org-windels"` default remains.
* Empty-org `DrDashboard` returns `activeRegion:null`, `standbyRegions:[]`, `components:[]`, `replicationLagMs:null` (not `na-east`/`0`).
* `GET /app/disaster-recovery` (or Platform `DR` tab) shows “— no topology” when null, not `na-east`.
* `dr:*` appears in `TI_NAMESPACE_CATALOG` as `org_scoped`.
* `apps/api` vitest ≥ +10 passing, existing suite stays green.

---

## 4. Non-goals

* No synthetic drill result — `recordDrillResult` still requires `passed` + `rto/rpo` from the operator who ran it.
* No new console — one already exists (Platform `DrTab`).
* No health fabrication — `healthy:false` until a drill proves otherwise (already honest).

