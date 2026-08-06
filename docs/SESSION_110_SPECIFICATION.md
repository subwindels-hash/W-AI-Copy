# SESSION 110 SPECIFICATION — COGNITIVE / WORLD MODEL COMPLETION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-06
Status: AUTHORITATIVE (additive session — extends S1–S109, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Cognitive Systems & Enterprise Intelligence
```

## 1. Objective

Session 69 shipped the Cognitive surface as two thin pieces: a platform
observability rollup (`CognitiveService.dashboard`) computed from real tables,
and an "observations" list backed by the generic `tenantStore` helper. The
audit classified the module `PARTIAL`, and correctly so:

- `packages/shared/src/cognitive.ts` had **types but no Zod contracts** — the
  route file declared its own local schema;
- there were only four routes and no entity/hypothesis surface at all;
- observations were stored as opaque `{ data: … }` envelopes with no domain,
  provenance or entity link, so nothing could be rolled up from them;
- the web client exposed a single `dashboard()` call and the module existed in
  the UI only as a PlatformPage tab — a tab that rendered
  `reasoningAccuracyAvg` (already a whole percent) as `value × 100` and
  displayed a handful of memory rows as `0.0M`;
- the only coverage was two assertions inside `usage/rollups.test.ts`.

Session 110 completes the module as a real **world-model evidence register**
without inventing a single unit of intelligence:

1. shared `Cog*` entity/observation/hypothesis/rollup types and Zod contracts;
2. an organization-scoped service with fail-closed reads and CSPRNG ids;
3. an idempotent in-place migration of Session 69 observation envelopes;
4. a deterministic rollup (counts, coverage, blind spots) with honest empty
   states;
5. a complete route surface with admin-guarded mutations;
6. a typed client plus a dedicated `/app/cognitive` console;
7. fifteen service/contract tests, and two honesty fixes in the existing
   PlatformPage tab.

## 2. Domain model

| Record | Purpose | Honesty rule |
|---|---|---|
| `CogEntity` | a thing the organization models (customer, competitor, market, supplier, regulator, technology, internal system, partner, other) inside one of the twelve `WORLD_MODEL_DOMAINS` | an entity is only what a human entered; no entity is discovered automatically |
| `CogObservation` | an evidence-backed claim about an entity or a domain | `confidence` is the recorder's number, always stamped `confidenceKind: "self_reported"`; `origin` is `human`, `integration` or `ai_assisted`, and `aiAssisted` mirrors it so the UI can label advisory rows |
| `CogHypothesis` | a forward-looking statement with a horizon in months | created `open`; only a **named human** can move it to `supported` / `refuted` / `inconclusive`, and a written note is mandatory |
| `CogWorldModelRollup` | deterministic projection over the three record types | counts, shares and gaps only — no forecast, no score, no verdict |

### What is deliberately *not* implemented

The Session 69 `CognitiveDashboard` fields that have no backing store —
self-evolution health, DNA completeness, federation partners, marketplace
assets, civilization entities, innovation pipeline value — remain `0`/empty.
A plausible number there would imply subsystems that do not exist. The
observability half of the module continues to report only what the real
`Agent`, `Workflow`, `Conversation`, `AiRequest` and `Alert` tables contain.

## 3. Storage and isolation

```
cog:meta:i:<org>:register            register bootstrap marker
cog:entity:i:<org>:<id>              cog:entity:idx:<org>
cog:obs:i:<org>:<id>                 cog:obs:idx:<org>
cog:hypothesis:i:<org>:<id>          cog:hypothesis:idx:<org>
```

- Every read re-checks the stored `organizationId` and returns `null` when it
  does not match the requested slot (fail-closed) — a record planted under
  another organization's key is invisible, not merely unlisted.
- Ids are `randomUUID()`-derived: `cog_ent_…`, `cog_obs_…`, `cog_hyp_…`. There
  is no `Math.random` anywhere in the module, read path or write path.
- The observation key shape is the same one Session 69's
  `tenantStore({ prefix: "cog:obs" })` produced, so historical rows are read,
  normalized and rewritten in place on first access. Re-running the migration
  is a no-op: `data` envelopes are unwrapped exactly once, the index keeps a
  single entry per record, and nothing is duplicated.
- The four namespaces are registered in `TI_NAMESPACE_CATALOG`
  (`tenantIsolation.service.ts`) so the Session 89 live audit covers them.
- Kernel events (`cognitive.entity_created`, `cognitive.observation_recorded`,
  `cognitive.hypothesis_resolved`) are dispatched best-effort from write paths
  only; a telemetry failure never fails a write, and no event is emitted from
  a read.

## 4. Rollup mathematics (deterministic)

| Field | Definition |
|---|---|
| `evidenceCoveragePct` | `round(observations with ≥1 evidence item ÷ observations × 100)`, `0` when there are none |
| `avgRecordedConfidencePct` | `round(Σ confidence ÷ observations × 100)`, **`null`** when there are none — never `0`, which would read as "no confidence" |
| `confidenceKind` | `self_reported_average` or `none` |
| `humanObservations` / `integrationObservations` / `aiAssistedObservations` | partition of the register by `origin` |
| `domains[]` | per-domain entity/observation/hypothesis counts and `lastObservationAt` |
| `coveredDomains` / `uncoveredDomains` | domains with and without any record — a measured gap, not a prediction |
| `entitiesWithoutObservations` | entities nothing has been recorded about (blind spots) |
| `lastObservationAt` | max stored `createdAt`, `null` when empty |

The rollup contains **no wall-clock arithmetic and no generated timestamp**, so
two consecutive reads of an unchanged organization are byte-identical — pinned
by a `JSON.stringify` equality test.

## 5. API surface (`/api/v1/cognitive`, authenticated)

| Method | Path | RBAC | Purpose |
|---|---|---|---|
| GET | `/dashboard/rollup` | member | Session 69 observability rollup + `observations` + `worldModel` (backwards compatible superset) |
| GET | `/world-model` | member | deterministic world-model rollup |
| GET/POST | `/entities` | member / admin | list, create |
| GET/PATCH/DELETE | `/entities/:id` | member / admin | detail, update, delete |
| GET/POST | `/observations` | member / admin | list (filter by domain/entity/origin), record |
| GET/DELETE | `/observations/:id` | member / admin | detail, delete (204, as Session 69 clients expect) |
| GET/POST | `/hypotheses` | member / admin | list (filter by domain/status), open |
| GET/DELETE | `/hypotheses/:id` | member / admin | detail, delete |
| POST | `/hypotheses/:id/resolve` | admin | human resolution with mandatory note |

Deleting an entity that still carries observations returns `409 CONFLICT` with
the count rather than silently orphaning or rewriting evidence. Deleting an
observation prunes its id from every hypothesis that cited it, so no hypothesis
keeps a reference to evidence that no longer exists.

## 6. UI

`/app/cognitive` (sidebar: "Cognitive / World Model") is the dedicated console:

- entity/observation/hypothesis counts, evidence coverage and the average
  **self-reported** confidence (rendered `—` when nothing is recorded);
- per-domain coverage grid with uncovered domains visible as gaps;
- entity list with a "no observations" blind-spot badge;
- observation list where `ai_assisted` rows are badged
  "AI-assisted (advisory)" and evidence-free rows say "no evidence attached";
- hypothesis list showing the resolving human and note; resolution controls
  refuse to submit without a note;
- administrator-only mutations, explicit read-only state otherwise.

The existing PlatformPage "Cognitive / World" tab stays and gains a World Model
card. Two display bugs in it were corrected as part of this session: the AI
success rate is no longer multiplied by 100 a second time, and memory entries
are no longer divided by 1e6 and suffixed "M".

## 7. Verification gate

- `apps/api/src/cognitive/worldModel.test.ts` — 15 tests: entity/observation
  CRUD, index-stable updates, entity-delete conflict, foreign-entity rejection,
  full cross-tenant isolation, planted-record invisibility, rollup maths,
  repeated-read determinism, empty-organization honesty, AI-assisted labelling,
  human-only hypothesis resolution, evidence pruning, idempotent legacy
  migration, invalid Zod input, and a regression guard on the Session 69
  observability rollup.
- `make verify` (offline Prisma generate + build + typecheck + test) passes:
  **1179 tests, 51 skipped, 0 failures**.
- Runtime validation against live PostgreSQL 17 + Redis 8 + `prisma generate`
  remains pending in this sandbox, so Session 110 is recorded
  🟡 **VERIFIED (partial)** — see
  `docs/SESSION_110_RUNTIME_VALIDATION_CHECKLIST.md`.
