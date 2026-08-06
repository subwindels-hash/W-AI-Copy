# SESSION 99 SPECIFICATION — SOFTWARE FACTORY: FIVE STUDIOS & BUILD FARM COMPILATION TARGETS

```
WINDELS AI OS Enterprise Documentation
Version: 1.0 (implements AI_APPLICATION_BUILDER_SPECIFICATION.md V3.0 §3–§4)
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S98, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: VP of AI Engineering & Platform Tools
```

---

## 1. OBJECTIVES & ARCHITECTURE

Session 96 implemented the core of `docs/AI_APPLICATION_BUILDER_SPECIFICATION.md`
(V3.0): projects, tasks, the build state machine, the artifact registry and
the Human Decision Inbox. Session 99 completes the spec's **§3 (Five
Enterprise Studios)** and **§4 (Build Farm compilation targets)**:

1. **The Five Enterprise Studios** — a real catalog of the five studios from
   §3 (AI Product, AI Engineering, AI Quality, AI DevOps, AI Operations),
   each with its defined responsibilities/deliverables.
2. **Studio plans** — org-scoped, project-linked work items per studio with a
   deliverable list (chosen from the studio's catalog and validated) and an
   honest status lifecycle (`planned → in_progress → completed`, with
   `completedAt` stamped only on the real transition).
3. **Project studio coverage** — computed per read: for a project, plans and
   completed deliverables per studio, plus whether all five studios are
   covered — never fabricated.
4. **Build Farm compilation targets** — per build run, the real compilation
   targets declared from the project's `targetType` (a deterministic
   targetType → platform/format/extension mapping: WEB → static bundle,
   DESKTOP → .exe/.msix/.app/.dmg/.deb/.rpm/.AppImage, MOBILE → .apk/.aab/
   .ipa, API/MICROSERVICE → docker image, BROWSER_EXTENSION → .crx, CLI →
   binaries). Each target carries a **real manifest** (deterministic file
   name, platform, format, extension, and a real SHA-256 of the manifest),
   and an **honest status derived from the run's real state** (pending →
   compiling → built | failed). The actual binary is **never fabricated**:
   every target honestly reports `binaryEmitted: false` with a
   `requiresToolchain` note — emitting real binaries requires the external
   build-farm host.
5. **Tenant isolation by construction** — `sf:*` org-scoped keys, fail-closed
   reads, and the namespace registered in the Session 89 isolation-audit
   catalog.

```
                 SOFTWARE FACTORY: STUDIOS & BUILD FARM
                 --------------------------------------
   [studios]  ->  static catalog (5 studios, deliverables)
   [plans]    ->  sf:plan:i:<org>:<id>        (per-project studio work items)
   [coverage] ->  computed per read (never invented)
   [targets]  ->  derived per run (pure projection — never stored)
```

---

## 2. THE FIVE STUDIOS (SPEC §3 — REAL STATIC CATALOG)

| key | name | deliverables (catalog) |
|---|---|---|
| `product` | AI Product Studio | Business Requirements, PRDs, User Stories, Acceptance Criteria, Architecture Decisions, Product Roadmaps, Milestones, Cost Estimates, Risk Assessments |
| `engineering` | AI Engineering Studio | Web Applications, Desktop Applications, Mobile Applications, APIs, Microservices, AI Agents, SDKs, Browser Extensions, CLI Tools, Enterprise Integrations |
| `quality` | AI Quality Studio | Unit Testing, Integration Testing, E2E Testing, Load Testing, Accessibility Reviews, Security Audits, Static Analysis, Regression Testing, Performance Benchmarking |
| `devops` | AI DevOps Studio | Docker Image Generation, Kubernetes Manifests, CI/CD Pipelines, Infrastructure as Code, Artifact Registries, Secret Management, Release Automation, Deployment Pipelines |
| `operations` | AI Operations Studio | Monitoring & Metrics, Alerting Rules, Incident Management, Feature Flags, Cost Optimization, Capacity Planning, Production Analytics, Continuous Optimization |

## 3. BUILD FARM COMPILATION TARGETS (SPEC §4 — DETERMINISTIC, HONEST)

Target-type → target mapping (real static data, like the SBOM catalog):

| targetType | targets |
|---|---|
| WEB | `{ platform: web, format: static-bundle, extension: zip }` |
| DESKTOP | windows `.exe` (installer), windows `.msix`, macos `.app`, macos `.dmg`, linux `.deb`, linux `.rpm`, linux `.AppImage` |
| MOBILE | android `.apk`, android `.aab`, ios `.ipa` |
| API | `{ platform: container, format: docker-image, extension: tar }` |
| MICROSERVICE | same as API |
| BROWSER_EXTENSION | `{ platform: web, format: extension, extension: crx }`, `zip` |
| CLI | `linux-amd64`, `darwin-arm64`, `win32-x64` binary targets |

Per run, each target produces a **real manifest** (deterministic):

- `fileName = slug(project.name)-<version>-<platform>.<extension>`
- `manifestJson` — `{ project: {id,name}, run: {id,version}, target: {platform,
  format, extension, fileName}, declaredAt }`
- `sha256` — real `node:crypto` hash of the manifest

**Honest status (derived from the run, never stored):**

- run before `COMPILING` → `pending`
- run `COMPILING` or `SIGNING` → `compiling`
- run `SUCCEEDED` → `built` (manifest finalized)
- run `FAILED` → `failed`

Every target reports `binaryEmitted: false` and `requiresToolchain` (e.g.
`windows-msi toolchain (external build farm host)`) — the platform never
pretends a binary exists when none was compiled. Identical run state ⇒
identical targets (pure projection).

## 4. DATA MODEL

All types live in `packages/shared/src/softwareFactory.ts` (prefixed `Sf`).

### 4.1 Studio plan

`id` (`sfp-`), `organizationId`, `projectId`, `studio` (`product | engineering |
quality | devops | operations`), `deliverables[]` (1–10, validated against the
studio catalog), `status` (`planned | in_progress | completed`),
`completedAt?` (stamped only on the planned/in_progress → completed
transition), `notes?`, `createdAt`/`updatedAt`.

### 4.2 Compile target (derived — never stored)

`SfCompileTarget`: `{ id, runId, projectId, platform, format, extension,
fileName, manifestJson, sha256, status: pending|compiling|built|failed,
binaryEmitted: false, requiresToolchain }`.

### 4.3 Project studio coverage (computed per read)

`SfStudioCoverage`: per project — `plans` (count), `completedPlans`, `coverage`
(array of `{ studio, plans, completed, deliverables }`),
`allStudiosCovered` (all five studios have ≥1 completed plan), `totalDeliverables`,
`completedDeliverables`.

### 4.4 Rollup (computed per read)

`SfRollup`: `counts` (`plans`, `plansByStatus`, `runsWithTargets`,
`targetsByStatus` derived across runs), `studiosCovered` (sum of projects with
allStudiosCovered), `recentPlans` (up to 6), `lastUpdatedAt`.

## 5. API SURFACE (extensions under `/api/v1/builder`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/studios` | static five-studio catalog |
| GET/POST | `/studios/plans` | list (filter projectId, studio, status) / create plan |
| GET/PATCH/DELETE | `/studios/plans/:id` | read / update (deliverables, notes, status) / delete |
| GET | `/projects/:id/studios` | project studio coverage (computed) |
| GET | `/builds/:id/targets` | compile targets for a run (derived) |
| GET | `/dashboard/rollup` (extended) | factory rollup incl. plans + targets |

## 6. DELIVERY SLICE

1. `packages/shared/src/softwareFactory.ts` (+ index export)
2. `apps/api/src/softwareFactory/softwareFactory.service.ts`
3. `apps/api/src/softwareFactory/bootstrap.ts` — demo seed (gated)
4. `apps/api/src/http/routes/softwareFactory.ts` + server wiring (same
   `/builder` prefix, additive)
5. `tenantIsolation.service.ts` — register `sf:plan` namespace
6. `apps/web/src/lib/softwareFactory.ts` + `pages/softwareFactory/StudiosPage.tsx` + router + sidebar
7. `apps/api/src/softwareFactory/softwareFactory.test.ts`
8. Decision log, PROGRESS.md, CHANGELOG.md

## 7. DEFINITION OF DONE

- [ ] `pnpm build` + `pnpm typecheck` pass; `make verify` green.
- [ ] No `Math.random` in read paths; all guard suites pass.
- [ ] Cross-tenant test proves org B cannot read org A's studio plans.
- [ ] Compile targets are a pure projection (derived from run state, never
      stored); manifests + SHA-256 are real; `binaryEmitted` is always
      honestly false with a `requiresToolchain` note.
- [ ] Studio plans have honest lifecycle (completedAt only on transition).
- [ ] UI renders real API data with demo-honesty rules intact.
