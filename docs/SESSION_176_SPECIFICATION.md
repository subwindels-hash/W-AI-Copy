# Session 176 — `opex` completion (unfinished-module track, 11/N — Tier 2 #3)

**Module:** `opex` (Session 73 — Operational Excellence & Responsible AI, completed by Session 118)  
**Track:** unfinished-module completion (Tier 2, Module #11) — `docs/UNFINISHED_MODULES.md`  
**Rule under test:** *a read path must never be a seeder; tenant required on every call*

---

## 1. What was unfinished

`opex` was reported COMPLETE (23 routes via `opex` + `opexAssurance`, 3935 LOC assurance + 8377 LOC opex, 3 unit suites) and had been heavily fixed in Session 118 (per-record storage, `provenance` block, `GET /opex/trust` nullable measures, legacy adoption). What remained:

| # | Defect | Location | Consequence |
|---|--------|----------|-------------|
| O1 | **Read-path bootstrap** — `OpexService.createAlert` calls `ensureBootstrapped` before writing, and `dashboard` calls `ensureBootstrapped` before reading | `opex.service.ts:68` and `114` | Every `GET /opex/dashboard/rollup` writes `opex:<org>:meta = 1`; every `POST /opex/safety-alerts` also writes it. A read is not a write. This is the same S156 defect as biomedical/health, now on two paths. |
| O2 | **Default tenant fallback** — `ensureBootstrapped(logger, oid="org-windels")` | `opex.service.ts:50` | Missing org silently initializes the house org. Same pattern fixed in S163–S175. |
| O3 | **Legacy route `req.user!` assertion** — `registerOpexRoutes` uses `req.user!.organizationId!` without an `orgOf` forbidden guard | `routes/opex.ts:7–9` | An unauthenticated request (if authenticate ever mis-ordered) would throw unhandled instead of 403; inconsistent with the assurance sub-router which uses `orgOf` → `AppError.forbidden`. |

`dashboard` remaining structural zeros (`regulations`, `playbooks`, `explanations`, `governance.gates`, `safety.benchmarks`, `maturityScore`, `collaborationSessionsActive`) are intentionally retained — Session 118 documents them in the `provenance` block and `GET /opex/trust` reports nullable `OpexMeasure`s. No null-widening needed here.

---

## 2. What this session builds (additive-only)

### 2.1 Service (`apps/api/src/opex/opex.service.ts`)

* **Delete the `ensureBootstrapped` calls** from `createAlert` (68) and `dashboard` (114). Both become pure reads/writes on already-existing orgs. The org meta flag is set only by `bootstrapOpex` at server start (which still calls `ensureBootstrapped` with the default org). A first write on a cold org still succeeds — it just does not invent a flag via a read.
* **Remove default** — `ensureBootstrapped(logger, oid: string)` requires `oid` (no `"org-windels"`), with an early-return if `!oid` and an `assertOrg` check. All other methods already take `oid: string` explicitly; `createAlert` and `dashboard` now validate.
* Keep `OpexAssuranceService.ensureLegacyImported` in `dashboard` — that is a one-shot legacy migration (sets `opx:imported`), not a seeder, and is required for correctness on old data.

### 2.2 Routes (`apps/api/src/http/routes/opex.ts`)

* Replace `req.user!.organizationId!` with an `orgOf(req): string` helper that throws `AppError.forbidden` when `organizationId` is missing, mirroring `opexAssurance.ts:16–23`. `authenticate` is already applied at the router level in `server.ts:1291`, so the guard is defense-in-depth and makes the two sub-routers consistent.
* Keep all 3 paths, bodies, shapes, status codes.

### 2.3 Tenant isolation

Already catalogued: `opex` + `opx:alert/idx/assess/policy/event/imported` as `org_scoped`. No new entries needed. Verify the inventory still reports them.

### 2.4 Web

No new page — `apps/web/src/pages/admin/OpexAssurancePage.tsx` already provides the console (`/app/opex`), and the PlatformPage `OpexTab` already renders provenance. No `||0` lie exists in that tab (Session 118 already fixed `reliability` rounding and `mitigations24h` window). No change.

### 2.5 Tests

* `opex.completion.test.ts` — **new**, 8 cases with `FakeKv` + `prismaClientMock`:
  - `dashboard` on empty org creates no `opex:*`/`opx:*` keys (fails on O1)
  - `createAlert` on empty org creates no `opex:<org>:meta` (fails on O1)
  - `ensureBootstrapped` idempotent
  - dashboard + createAlert require `oid` (throws on empty) (fails on O2)
  - second-org isolation — alert written in org A not visible from org B (via `OpexAssuranceService.listAlerts`)
* Existing `opexAssurance.test.ts` (118) and any `opex.test.ts` preserved.

### 2.6 Order of work

1. Service — delete two `ensureBootstrapped` calls, remove default, add assert.
2. Routes — `orgOf` guard on all 3 handlers.
3. Tests (unit) — mutation-verify the no-write cases.
4. `PROGRESS.md` 🟡 · `CONVENTIONS.md` · `docs/UNFINISHED_MODULES.md` strike row 11 · inventory · verify.

---

## 3. Acceptance

* No read (or write) path in `OpexService` calls `ensureBootstrapped` except `bootstrapOpex`.
* No `oid = "org-windels"` default remains.
* `opex:*` appears in `TI_NAMESPACE_CATALOG` and dashboard on empty org creates no new `opex:*`/`opx:*` keys.
* `apps/api` vitest ≥ +8 passing, existing opex suites stay green.
* `PROGRESS.md` row is 🟡 — runtime validation not possible in this sandbox.

---

## 4. Non-goals

* No `DailyHealth` null widening — provenance already explains structural zeros.
* No new console page — one already exists.
* No synthetic health data — record-only preserved.
