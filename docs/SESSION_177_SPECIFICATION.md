# Session 177 — `cognitive` completion (unfinished-module track, 12/N — Tier 2 #4)

**Module:** `cognitive` (Session 69 — Cognitive Platform observability rollup, completed by Session 110 World Model)  
**Track:** unfinished-module completion (Tier 2, Module #12) — `docs/UNFINISHED_MODULES.md`  
**Rule under test:** *a read path must never be a seeder; an unmeasured value is `null`, never `0`*

---

## 1. What was unfinished

`cognitive` was reported COMPLETE (16 routes via `cognitive` + `worldModel`, 5671 LOC `cognitive.service.ts` + 22332 LOC `worldModel.service.ts`, 2 unit suites) and Session 110 had already made the World Model evidence register honest (fail-closed, human-resolved hypotheses, null avg confidence). What remained in the **legacy observability rollup** `CognitiveService.dashboard`:

| # | Defect | Location | Consequence |
|---|--------|----------|-------------|
| C1 | **Read-path bootstrap** — `dashboard(oid)` calls `ensureBootstrapped` before reading | `cognitive.service.ts:27` (`await this.ensureBootstrapped`) | `GET /cognitive/dashboard/rollup` on a fresh org writes `cog:<org>:meta`. Same S156 defect as biomedical/health/opex. |
| C2 | **Default tenant fallback** — `ensureBootstrapped(logger, oid="org-windels")` | `cognitive.service.ts:26` | Missing org silently initializes house org. |
| C3 | **Structural zeros presented as measurements** — nine fields hardcode `0` with a file comment admitting those subsystems “do not exist yet”: `selfEvolutionHealth:0`, `autoFixes30d:0`, `dnaCompleteness:0`, `marketplaceUnifiedAssets:0`, `federationPartners:0`, `innovationProposalsOpen:0`, `innovationPipelineValueUsd:0`, `civilizationEntities:0`, `worldScenariosTracked:0` | `cognitive.service.ts:66–78` | A fresh org reports 0% DNA completeness, 0 federation partners, $0 pipeline, etc. Per S158/S160 rule an unmeasured value is `null`, never `0` — a risk/score of 0 reads as the worst or best result, not “not measured”. The comment documents the defect and does not fix it. |

`observatoryHealthyPct`, `reasoningAccuracyAvg`, `globalMemoryEntries`, `predictionsMade30d`, `predictionAccuracyPct`, `activeBottlenecks`, `observabilityNodes` are **measured** aggregates over real `prisma.*.count` tables and correctly remain `number` (0 when nothing has run is the measured share of healthy nodes, not an invented subsystem). `worldModel` delegate is already honest (via `worldModel.service.ts`) and untouched.

---

## 2. What this session builds (additive-only)

### 2.1 Shared contract (`packages/shared/src/cognitive.ts`)

Widen the nine unmeasured fields to `number | null` (the measured aggregates stay `number`):

```ts
selfEvolutionHealth: number | null;        // null — self-evolution subsystem does not exist
autoFixes30d: number | null;               // null — no auto-fix ledger
dnaCompleteness: number | null;            // null — DNA framework not implemented
marketplaceUnifiedAssets: number | null;   // null — no unified marketplace
federationPartners: number | null;         // null — no federation
innovationProposalsOpen: number | null;    // null — innovation proposals subsystem not built
innovationPipelineValueUsd: number | null; // null
civilizationEntities: number | null;       // null
worldScenariosTracked: number | null;      // null
// plus:
provenance?: CognitiveProvenance; // which rolls are measured vs null
```

Add `CognitiveProvenance` noting the nine structural-null fields and that observability/memory/predictions are measured.

### 2.2 Service (`apps/api/src/cognitive/cognitive.service.ts`)

* **Delete the read-path seeding** — `dashboard(oid: string)` no longer calls `ensureBootstrapped`. It is a pure read over `prisma.*` and the world-model delegate. `ensureBootstrapped(logger, oid: string)` now requires `oid` (no default), early-returns if falsy, and is only called from `bootstrapCognitive` at server start.
* **Return `null` for the nine structural fields** instead of `0`. Keep the file comment but update it to say they now report `null` until built.
* **Add `provenance` construction** mirroring S160 (measured vs `structural_null`).
* Keep all measured aggregates (`activeBottlenecks = runningWorkflows + failedRuns`, `observatoryHealthyPct`, etc.) as numbers.

### 2.3 Routes (`apps/api/src/http/routes/cognitive.ts`)

Already has `router.use(authenticate)` and `orgOf = req.user!.organizationId!`. Replace the two `orgOf` helpers with the `AppError.forbidden` guard (like `opexAssurance`) for consistency, but keep `authenticate` at router level — no new behavior, just consistent error shape.

### 2.4 Tenant isolation

Already catalogued: `cog:meta/entity/obs/hypothesis` as `org_scoped` (worldModel keys are `cog:entity:<org>:<id>` etc., correctly). No new entries. Verify inventory.

### 2.5 Web (`apps/web/src/`)

* `lib/cognitive.ts` — retype to nullable (no method changes).
* `pages/cognitive/CognitivePage.tsx` and `PlatformPage.tsx` `CognitiveTab` — replace `value={`${data.selfEvolutionHealth}%`}` etc. with `metric(data.selfEvolutionHealth, n=>`${n}%`)` (using the `metric` helper introduced in S168) so null renders as `—`, not `0%`/`$0M`. The nine fields already have a comment “do not exist yet” next to them — make the UI match.
* No new standalone page needed — `/app/cognitive` already exists (Session 110).

### 2.6 Tests

* `cognitive.completion.test.ts` — **new**, 10 cases with `FakePrisma`/`FakeKv` mocks (prisma counts mocked to 0, dashboard mocked via `prisma` stub):
  - empty org dashboard returns `selfEvolutionHealth:null` etc. (nine fields) and `provenance` marks them `structural_null` (fails on C3)
  - dashboard on empty org creates no `cog:*:meta` key (fails on C1)
  - second-org isolation — dashboard counts for org A not leaking to org B (via prisma mock per-org? Actually cognitive dashboard counts are per-org via prisma where `organizationId: oid` — mock must be org-scoped; test via `FakePrisma` per-org map)
  - ensureBootstrapped requires oid

* Existing `cognitive.test.ts` (if any) and `worldModel.test.ts` preserved — the latter already asserts null `avgRecordedConfidencePct`.

### 2.7 Order of work

1. Shared contract widening → `apps/web` tsc to surface consumers.
2. Service — delete read-path seed, null the nine fields, remove default.
3. Routes — `orgOf` guard (cosmetic).
4. Web — null-aware `metric` in both pages.
5. Tests (unit) — mutation-verify the null vs 0 cases.
6. `PROGRESS.md` 🟡 · `CONVENTIONS.md` · `docs/UNFINISHED_MODULES.md` strike row 12 · inventory · verify.

---

## 3. Acceptance

* No read path in `cognitive` calls `ensureBootstrapped`.
* No `oid = "org-windels"` default remains.
* Empty-org `CognitiveDashboard` returns `null` for the nine structural fields; measured aggregates remain `number` and `0` is honest there.
* `GET /app/cognitive` renders “—” for the nine null fields, not `0%`/`$0`.
* `apps/web` tsc 0; `apps/api` vitest ≥ +10 passing, existing world-model suite stays green.
* `PROGRESS.md` row is 🟡 — runtime validation not possible in this sandbox.

---

## 4. Non-goals

* No World Model changes — `worldModel.service.ts` is already honest (null `avgRecordedConfidencePct`, evidence coverage, no invented intelligence).
* No new console — one already exists.
* No `DailyHealth` null widening — cognitive's measured aggregates are over real tables (0 healthy nodes is measured as 0/0? Actually `observatoryHealthyPct` is derived from real counts, so 0 there is measured).

