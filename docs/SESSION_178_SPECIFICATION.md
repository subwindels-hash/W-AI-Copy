# Session 178 — `command` completion (unfinished-module track, 13/N — Tier 2 #5)

**Module:** `command` (Session 70 — Global Command Center, completed by Session 111 Operations)  
**Track:** unfinished-module completion (Tier 2, Module #13) — `docs/UNFINISHED_MODULES.md`  
**Rule under test:** *a read path must never be a seeder; tenant required on every call*

---

## 1. What was unfinished

`command` was reported COMPLETE (29 routes via `command` + `operations`, 7838 LOC `command.service.ts` + 38226 LOC `operations.service.ts`, 5 unit suites in `operations.test.ts`) and Session 111 had already made the operations register honest (operator-declared regions, `unreported` health, human-acknowledged/resolved incidents with measured MTTR). What remained in the legacy rollup `CommandService.dashboard`:

| # | Defect | Location | Consequence |
|---|--------|----------|-------------|
| M1 | **Read-path bootstrap + cascade** — `dashboard(oid)` calls `ensureBootstrapped` which writes `cmd:<org>:meta` **and** cascades into `CommandOperationsService.ensureBootstrapped` (which writes its own meta/indices) | `command.service.ts:15` + `25` (`await this.ensureBootstrapped`, `await CommandOperationsService.ensureBootstrapped`) | `GET /command/dashboard/rollup` on a fresh org writes two namespaces. Same S156 defect as biomedical/health/opex/cognitive, now with a cascade that doubles the write. |
| M2 | **Default tenant fallback** — `ensureBootstrapped(logger, oid="org-windels")` | `command.service.ts:15` | Missing org silently initializes house org and its operations register. |
| M3 | **`req.user!` assertion** — `registerCommandRoutes` uses `const orgOf = req.user!.organizationId!` without a forbidden guard | `http/routes/command.ts:17` (and `operations` sub-handlers reuse it) | Inconsistent with `opexAssurance`/`cognitive` guards; an unauthenticated request would throw raw `TypeError` instead of 403. `authenticate` is already at router level, but the guard makes the two sub-routers consistent. |

`enterpriseHealth`, `incidentsOpen`, `regions`, etc. are **measured** aggregates over real `prisma.*` + `CommandOperationsService` records and correctly remain `number`/arrays (0 open incidents is honest; empty `regions` is honest; `mttrMinutes` already surfaces `operations.mttrKind === "none"` for no sample). No null-widening needed.

---

## 2. What this session builds (additive-only)

### 2.1 Service (`apps/api/src/command/command.service.ts`)

* **Delete the read-path seeding** — `dashboard(oid: string)` no longer calls `ensureBootstrapped`. It is a pure read over `prisma.*` and `CommandOperationsService` (which itself is pure read for `operations/list*`). The `ensureBootstrapped(logger, oid: string)` now requires `oid` (no default), early-returns if falsy, and is only called from `bootstrapCommand` at server start.
* Keep `operations(oid)` delegate as is (it already just forwards to `CommandOperationsService.operations`).
* No change to `CommandOperationsService` itself — its `ensureBootstrapped` already only sets `cmd:meta`/`cmd:* :idx` markers and is only reached via `CommandService.ensureBootstrapped` (now server-start only), so the cascade is also removed from the read path.

### 2.2 Routes (`apps/api/src/http/routes/command.ts`)

* Replace `const orgOf = req.user!.organizationId!` / `const userOf = req.user!.id` with `orgOf(req): string` / `userOf(req): string` guards that throw `AppError.forbidden` when `organizationId`/`id` missing, mirroring `opexAssurance`/`cognitive` (like S176/S177). `router.use(authenticate)` already exists, so the guard is defense-in-depth.

### 2.3 Tenant isolation

Already catalogued: `cmd:meta/incident/region/briefing/initiative/dir` as `org_scoped` (keys are `cmd:<entity>:idx:<org>` / `cmd:<entity>:i:<org>:<id>`). No new entries. Verify inventory.

### 2.4 Web

No new page — `/app/command` (`CommandCenterPage.tsx` + `CommandBar.tsx` + `BrokerCommandCenterPage.tsx`) already exists and already handles `mttrKind === "none"` (shows “—” for MTTR) and `unreported` regions. No `||0` lie exists in that page (S111 already fixed). No change.

### 2.5 Tests

* `command.completion.test.ts` — **new**, 8 cases with `FakeKv` + `FakePrisma` (prisma counts mocked to 0, operations mocked via `CommandOperationsService` in-memory):
  - `dashboard` on empty org creates no `cmd:*` keys (fails on M1)
  - `ensureBootstrapped` idempotent
  - dashboard requires `oid` (throws on empty) (fails on M2)
  - second-org isolation — dashboard counts/operations for org A not leaking to org B (via prisma+operations per-org)

* Existing `operations.test.ts` (5 suites) preserved.

### 2.6 Order of work

1. Service — delete read-path seed, remove default, add asserts.
2. Routes — `orgOf`/`userOf` guards on all handlers.
3. Tests (unit) — mutation-verify no-write cases.
4. `PROGRESS.md` 🟡 · `CONVENTIONS.md` · `docs/UNFINISHED_MODULES.md` strike row 13 · inventory · verify.

---

## 3. Acceptance

* No read path in `CommandService` calls `ensureBootstrapped`.
* No `oid = "org-windels"` default remains in `CommandService`.
* `GET /command/dashboard/rollup` on empty org creates no `cmd:*` keys.
* `apps/api` vitest ≥ +8 passing, existing `operations.test.ts` stays green.
* `PROGRESS.md` row is 🟡 — runtime validation not possible in this sandbox.

---

## 4. Non-goals

* No `GlobalCommandDashboard` null-widening — `enterpriseHealth` etc. are measured over real tables; 0 is honest there, and `operations.mttrKind === "none"` already marks the one unmeasured `mttrMinutes`.
* No new console — one already exists and honors `unreported`/`none`.
* No `CommandOperationsService` changes beyond the cascade removal.

