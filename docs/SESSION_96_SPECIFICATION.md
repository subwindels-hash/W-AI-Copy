# SESSION 96 SPECIFICATION — ENTERPRISE AI SOFTWARE FACTORY & APPLICATION BUILDER

```
WINDELS AI OS Enterprise Documentation
Version: 1.0 (implements AI_APPLICATION_BUILDER_SPECIFICATION.md V3.0)
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S95, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: VP of AI Engineering & Platform Tools
```

---

## 1. OBJECTIVES & ARCHITECTURE

`docs/AI_APPLICATION_BUILDER_SPECIFICATION.md` (V3.0, APPROVED by the EAB)
defines the **Enterprise AI Software Factory** — a top-level platform that
orchestrates AI workforces to turn ideas into shipped software. Until now
the spec had **no implementation in the repo**. Session 96 ships its core as
a full vertical slice:

1. **App Builder projects** — org-scoped projects with target type
   (WEB/DESKTOP/MOBILE/API/MICROSERVICE/BROWSER_EXTENSION/CLI), a declared
   tech stack, and a system prompt.
2. **AI workforce tasks** — per-project tasks assigned to the spec's **17 AI
   personas** organized into the 6 functional clusters; honest completion
   state + optional AI-generated output code via the ProviderRegistry
   (`generationSource: real|echo-demo|manual`).
3. **Build farm runs** — real, state-machine build runs following the spec's
   `BuildStatus` chain (QUEUED → GENERATING_CODE → TESTING → COMPILING →
   SIGNING → SUCCEEDED | FAILED) with **real appended log entries** (step +
   timestamp + actor) — never fabricated success.
4. **Enterprise artifact registry** — every completed run produces an
   **immutable, version-gated artifact** (version unique per project) whose
   manifest is real computed data: the project snapshot, a **real SBOM**
   derived from the declared dependency catalog, real build logs, a **real
   SHA-256** (node:crypto) and real byte size.
5. **Human Decision Inbox (approval gate)** — artifacts are created
   unpublished; a release requires an explicit, audited approval
   (`request-release` → pending → `decide` → `release`), honoring the
   spec's "never automatically publishes" rule.
6. **AI Workforce registry** — the 6 functional clusters + 17 personas as a
   real static catalog endpoint.
7. **Deterministic rollup** — projects/tasks/builds-by-status/artifacts/
   approvals counts + average build time measured from real timestamps.
8. **Tenant isolation by construction** — `ab:*` org-scoped keys, fail-closed
   reads, namespaces registered in the Session 89 isolation-audit catalog.

```
                 AI SOFTWARE FACTORY (CORE)
                 --------------------------
   [projects] ->  ab:project:i:<org>:<id>     (AppBuilderProject)
   [tasks]    ->  ab:task:i:<org>:<id>        (AI workforce assignments)
   [runs]     ->  ab:run:i:<org>:<id>         (build farm state machine)
   [artifacts]-> ab:artifact:i:<org>:<id>     (immutable, version-gated)
   [approvals]-> ab:approval:i:<org>:<id>     (Human Decision Inbox)
   [agents]   ->  static catalog (6 clusters / 17 personas)
```

The spec's §9 Prisma models map 1:1 onto these records; this session uses
the repo's established org-scoped Redis pattern (S90–S95) so the module is
immediately runtime-safe without a schema migration, and the S89 isolation
audit covers it.

---

## 2. DATA MODEL

All types live in `packages/shared/src/appBuilder.ts` (prefixed `Ab`).

### 2.1 Project

`id` (`abp-`), `organizationId`, `name`, `description?`, `targetType`
(`WEB | DESKTOP | MOBILE | API | MICROSERVICE | BROWSER_EXTENSION | CLI`),
`techStack` (`Record<string,string>` — e.g. `{ frontend: "react",
backend: "express", db: "postgres" }`), `systemPrompt` (required),
`createdById`, `createdAt`/`updatedAt`.

### 2.2 Task

`id` (`abt-`), `organizationId`, `projectId`, `assignedAgent` (persona, e.g.
`"PM"`), `group` (cluster, e.g. `"Product"`), `title`, `description`,
`isCompleted` (default false), `outputCode?` (text), `generationSource`
(`manual | real | echo-demo` — labeled when AI-generated), `completedAt?`
(stamped only on completion transition), `createdAt`.

### 2.3 Build run

`id` (`abr-`), `organizationId`, `projectId`, `version` (e.g. `v1.0.0`,
unique per project), `status` (`QUEUED | GENERATING_CODE | TESTING |
COMPILING | SIGNING | SUCCEEDED | FAILED`), `logs[]` (real appended
entries `{ at, step, actor, detail }`), `errorLog[]`, `artifactId?`,
`requestedBy`, `startedAt?`, `finalizedAt?`, `createdAt`.

Transitions are explicit (`POST /builds/:id/advance`); reaching SUCCEEDED
finalizes the run and **creates the artifact** from real computed data. A
`FAILED` run may be `retried` (new run, same version).

### 2.4 Artifact (immutable, version-gated)

`id` (`aba-`), `organizationId`, `projectId`, `runId`, `version`, `name`,
`targetType`, `manifestJson` (real computed manifest), `sbom[]`
(`{ name, version, declared }` — real dependency manifest), `sha256` (real
SHA-256 of `manifestJson`), `sizeBytes` (real byte length), `published`
(default false), `releasedAt?`, `createdById`, `createdAt`. No update
endpoint; duplicate version per project is rejected → immutable.

### 2.5 Approval (Human Decision Inbox)

`id` (`abapr-`), `organizationId`, `artifactId`, `projectId`, `runId`,
`status` (`pending | approved | denied`), `requestedBy`, `decidedBy?`,
`decidedAt?`, `note?`, `createdAt`.

### 2.6 Agent catalog (static, real)

`AbAgentCatalog` — the 6 functional clusters, each with its persona names
(3+2+6+2+2+2 = 17): Product (PM, Business Analyst, Solution Architect),
Design (UX Researcher, UI Designer), Engineer (Frontend, Backend, Mobile,
Desktop, Database, AI Engineers), Quality (QA Engineer, Security Engineer),
Platform (DevOps Engineer, Site Reliability Engineer), Delivery (Technical
Writer, Release Manager).

### 2.7 Rollup (computed per read)

`AbRollup` — `counts` (`projects`, `tasks`, `tasksCompleted`, `runs`,
`runsByStatus` per BuildStatus, `artifacts`, `releasedArtifacts`,
`pendingApprovals`), `avgBuildTimeMs` (mean of `finalizedAt − startedAt`
over SUCCEEDED runs, or `null`), `recentProjects` (up to 5), `recentRuns`
(up to 6), `latestArtifacts` (up to 5), `lastUpdatedAt`.

---

## 3. HONESTY RULES

- No `Math.random` anywhere; ids from CSPRNG; artifact SHA-256 is a **real
  `node:crypto` hash** of the manifest; size is a real byte count; SBOM
  entries come from a real pinned dependency catalog (`react` 18.3.1,
  `express` 4.21.1, `postgres` 16, …) or are labeled `declared (unpinned)`.
- Build log entries are real records of actual transitions (step + timestamp
  + actor) — a run is only SUCCEEDED after the full state chain; nothing
  fabricates compiler output, test counts, or binary files.
- AI-generated task code carries `generationSource: real | echo-demo`
  (ProviderRegistry); without a real provider it is honestly labeled and the
  UI shows a demo banner.
- Artifacts are unpublished until an approved Human Decision Inbox record
  gates the release (spec §7).

## 4. DEMO DATA POLICY

Fresh orgs start empty. `WINDELS_DEMO_DATA=true` seeds an idempotent demo
(`org-demo-ab`): 2 projects, 6 tasks across clusters, 2 build runs (one
SUCCEEDED → artifact, one QUEUED), 1 pending approval. See
`apps/api/src/appBuilder/bootstrap.ts`.

## 5. API SURFACE (`/api/v1/builder`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/rollup` | computed factory intelligence |
| GET | `/agents` | static AI workforce catalog |
| GET/POST | `/projects` | list / create |
| GET/PATCH/DELETE | `/projects/:id` | read / update / delete |
| GET/POST | `/projects/:id/tasks` | list / create task |
| GET/PATCH/DELETE | `/tasks/:id` | read / update (incl. completion) / delete |
| POST | `/tasks/:id/generate` | AI code generation (labeled) |
| GET/POST | `/projects/:id/builds` | list / create build run |
| GET | `/builds/:id` | run detail with logs |
| POST | `/builds/:id/advance` | real status transition (finalizes on SUCCEEDED) |
| POST | `/builds/:id/retry` | new run for a FAILED version |
| GET | `/artifacts` | list (filter projectId, published) |
| GET | `/artifacts/:id` | read artifact (manifest + SBOM + SHA-256) |
| POST | `/artifacts/:id/request-release` | create pending approval |
| GET | `/approvals` | list (filter status) |
| POST | `/approvals/:id/decide` | approve / deny (audited) |
| POST | `/artifacts/:id/release` | release when approved (stamps releasedAt) |

## 6. DELIVERY SLICE

1. `packages/shared/src/appBuilder.ts` (+ index export)
2. `apps/api/src/appBuilder/appBuilder.service.ts`
3. `apps/api/src/appBuilder/bootstrap.ts` — demo seed (gated)
4. `apps/api/src/http/routes/appBuilder.ts` + server/index wiring
5. `tenantIsolation.service.ts` — register `ab:*` namespaces
6. `apps/web/src/lib/appBuilder.ts` + `pages/appBuilder/SoftwareFactoryPage.tsx` + router + sidebar
7. `apps/api/src/appBuilder/appBuilder.test.ts`
8. Decision log, PROGRESS.md, CHANGELOG.md

## 7. DEFINITION OF DONE

- [ ] `pnpm build` + `pnpm typecheck` pass; `make verify` green.
- [ ] No `Math.random` in read paths; all guard suites pass.
- [ ] Cross-tenant test proves org B cannot read org A's projects/artifacts.
- [ ] Artifacts are immutable (no update, duplicate version rejected);
      SHA-256/SBOM/size are real computed values; build SUCCEEDED only via
      the full state chain; release requires an approved approval.
- [ ] AI task generation carries `generationSource` labeling.
- [ ] UI renders real API data with demo-honesty rules intact.
