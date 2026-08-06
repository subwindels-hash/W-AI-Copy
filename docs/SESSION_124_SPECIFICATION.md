# Session 124 — AI Software Engineering Workforce: an autonomous engineering department, not a coding agent

**Module:** `aiEngineering` (new) · **Mount:** `/api/v1/ai-engineering` · **Status:** COMPLETE (routes = 42, shared contract = 342 LOC, tests = 4 unit suites / 28 tests + 1 e2e spec)
**Date:** 2026-08-06 · **Branch:** `arena/019fd6f3-win`

---

## 1. What already existed, and is untouched

The Session 26 `engineering` module (observability: metrics, deployments, tech debt, pipeline analytics, productivity) is **untouched**. The AI workforce is a new, additive module that does not replace it: the command center reads the department's own stores (and GitHub) rather than rewriting Session 26's dashboards. Nothing was removed or rewritten.

## 2. What was missing (what this session adds)

The spec asked for a complete autonomous engineering department. The gap analysis:

| Requirement | Before Session 124 |
| --- | --- |
| 18 specialized AI engineers + orchestrator | **none** — no engineering-role catalog, no per-repo teams |
| GitHub engineering module (accounts/orgs, repos, branches, commits, PRs, issues, milestones, releases, actions, checks) | **none** — the repo's own GitHub usage is the sandbox `gh` CLI, not a product capability |
| Repository intelligence (knowledge graph: structure, architecture, schema, API, deps, docs, tech debt, duplicates, dead code, security, performance) | **none** — no scanner, no graph |
| Autonomous development pipeline (single command → plan → build → test → fix → PR → notify) | partial — Session 96's app-builder runs tasks, but not a coordinated multi-role engineering pipeline with review/fix/PR stages |
| Multi-repository workspace with per-repo teams + shared memory | **none** |
| Engineering command center dashboard | **none** |
| Engineering memory (decisions, standards, patterns, lessons) | **none** |

## 3. What Session 124 adds

### 3.1 The workforce — `workforce.service.ts`

- **Role catalog** (19): product manager, business analyst, solution architect, system architect, backend, frontend, mobile, database, API, UI/UX, DevOps, security, QA & test, performance, code reviewer, documentation, deployment, monitoring engineers + the **orchestrator**.
- **Multi-repo workspace**: org-scoped repositories (`aew:repo:<org>:<id>` + newest-first index), each with `status`, `connectionId`, optional `localPath`, `defaultBranch`, `intelSummary` and a per-repo **team** (`role → engineer assignment`). Engineers are assigned per repo (`aew:eng:<org>:<id>`); the orchestrator coordinates every repo and cannot be "assigned" away.
- **Tasks** (`aew:task:<org>:<id>`) and the **orchestrator pipeline**: `queued → planning → implementing → testing → reviewing → fixing (bounded loop) → pr_ready → pr_open → done | failed`. Every step records its **mode** (`advisory` vs `executed`) and whether an AI provider produced it. Test execution is real only when the repo has a `localPath` and the caller opts in (`execute: true`); otherwise the step is labelled advisory and the task says so. A failed pipeline records a **lesson** into engineering memory (`source: "task"`). Opening a PR goes through the GitHub client adapter and only marks `pr_open` when the PR actually opened; without a connection the task honestly stops at `pr_ready`.

### 3.2 The GitHub engineering module — `github.service.ts`

Connections are org-scoped (`aew:conn:<org>:<id>`), verified against the GitHub API at connect time, and stored **token-in-store / masked-on-read** (`tokenMasked` is all any read returns). The client is the real REST API over injectable `fetch` (tested with a mocked transport):

- **Accounts/orgs**: connect (verifies `/user` + `/user/orgs`), list connections, remove; multiple accounts per org supported.
- **Repositories**: list (user or org), create, recursive structure read (tree API), file read.
- **Branches**: list, create (from a sha or the default branch). **Commits**: blobs → tree → commit → ref-update.
- **Pull requests**: open, list, merge, review (APPROVE / REQUEST_CHANGES / COMMENT), close.
- **Issues**: list, create, update (open/close/title/body). **Milestones**: list, create.
- **Releases**: list, create, and GitHub's own **generate-notes** endpoint.
- **Actions**: list workflows, trigger `workflow_dispatch`, list runs. **Checks**: check-runs per ref.

Upstream failures surface with their status; a missing connection is an explicit "no GitHub connection" error — the workforce never fabricates a remote result.

### 3.3 Repository intelligence — `repoIntel.service.ts`

A real scanner over a local checkout (or the sandbox workspace) producing a persisted knowledge graph (`aew:intel:<org>:<repoId>:<nodeId>` + per-repo index), with 21 node kinds. **`basis: "observed"`** (read directly: structure, dependencies + framework detection from package.json, Prisma models, route definitions, services, models, components, auth modules, docs, CI workflows, Dockerfiles, K8s manifests, tests, TODO/FIXME counts) vs **`basis: "heuristic"`** with a confidence (duplicate 6-line blocks, possibly-dead exports, secret literals, `eval`, oversized files, sync fs calls). Re-scans replace the graph; scans respect ignore lists (node_modules, .git, dist, …); an empty directory is reported honestly as empty.

### 3.4 Engineering memory — `memory.service.ts`

Org-scoped or repo-scoped entries (`aew:mem:<org>:<id>`): kinds `decision | standard | pattern | instruction | lesson | bugfix`, tagged, searchable, and **source-labelled** (`user | orchestrator | review | task`) — the workforce records lessons from finished/failed tasks and never invents memory.

### 3.5 Command center — `commandCenter.service.ts`

Rollup of the locally-known half (repositories, engineers by role, tasks by status, intel-derived security/performance flags, memory, recent activity) plus a GitHub-backed half (PRs, issues, builds, releases) filled only from connected accounts — with a `note` stating what contributed. Unmeasured values are `null`/`unknown`, never 0.

### 3.6 Web — client + command-center console

`apps/web/src/lib/aiEngineering.ts` (typed client) and the `/app/ai-engineering` console (sidebar "AI Engineering"): command-center cards, repositories with scan + knowledge-graph viewer (observed/heuristic badges), tasks with pipeline-step timelines (advisory/executed badges), memory with source labels, and the GitHub connections panel (masked tokens). Router + sidebar wired.

### 3.7 Tenant isolation

`aew` catalogued org-scoped in the Session 89 sweep — every key is `aew:<entity>:<org>:…` with the org in the segment straight after the prefix (the same shape as `esg`).

## 4. Tests

- `workforce.test.ts` (9): role catalog (19), workspace CRUD + isolation, engineer assignment (orchestrator refused per-repo), pipeline state walk, real test execution with an injected executor, fix-loop on failure, lesson recording, PR opening + no-connection refusal.
- `github.test.ts` (10): connect verify + masked-token rule + failed status on 401, missing-connection errors, repo list/create, branches, commit sequence, PRs (open/list/merge/review/close), issues/milestones/releases/generate-notes, workflows/runs/checks, upstream 404 surfacing.
- `repoIntel.test.ts` (4): observed nodes from a real fixture (deps, frameworks, schema, routes, docs, CI, tests), heuristic nodes with basis+confidence, graph replacement on re-scan, empty-dir honesty, ignore lists.
- `memory.test.ts` (3): org/repo scoping + source labelling, filters + isolation, removal.
- `tests/e2e/aiEngineering.spec.ts` (5): surface answers (19 roles), repo → task → pipeline → done over HTTP, memory round-trip, GitHub connection recorded `failed` with a bad token and never leaking the token, anonymous refusals.

**Full suite: 1753 passing / 51 skipped / 119 files** (Session 123 baseline 1725 / 51 / 115). API and web typecheck clean; web production build emits the console chunk.

## 5. Honesty notes

- Pipeline steps are labelled advisory vs executed; plan/test content is never presented as measured.
- GitHub tokens are verified at connect time, stored only in the org-scoped store, and only ever read back masked.
- Intelligence nodes state their basis (observed/heuristic) and confidence; heuristics may be wrong and say so.
- Command-center counts that need a connection show "not connected", never 0-as-success; unmeasured metrics are null/unknown.
- Upstream GitHub errors surface with their status; a missing connection is refused, not faked.

## 6. Runtime validation

Live PostgreSQL 17 + Redis 8 + a reachable GitHub API are not available in this sandbox, so this session ends **🟡 VERIFIED (partial)** and ships `docs/SESSION_124_RUNTIME_VALIDATION_CHECKLIST.md`.

## 7. Files touched

| File | Change |
| --- | --- |
| `packages/shared/src/aiEngineering.ts` | **new** — roles, connections, repos, tasks, GitHub entities, intel, memory, command-center types + Zod |
| `packages/shared/src/index.ts` | export added |
| `apps/api/src/aiEngineering/workforce.service.ts` | **new** — roles, workspace, teams, orchestrator pipeline |
| `apps/api/src/aiEngineering/github.service.ts` | **new** — connections + GitHub REST client |
| `apps/api/src/aiEngineering/repoIntel.service.ts` | **new** — knowledge-graph scanner |
| `apps/api/src/aiEngineering/memory.service.ts` | **new** — engineering memory |
| `apps/api/src/aiEngineering/commandCenter.service.ts` | **new** — rollup |
| `apps/api/src/http/routes/aiEngineering.ts` | **new** — 42 routes |
| `apps/api/src/http/server.ts` | `/api/v1/ai-engineering` mount |
| `apps/api/src/tenantIsolation/tenantIsolation.service.ts` | `aew` catalogued org-scoped |
| `apps/api/src/aiEngineering/*.test.ts` | **new** — 4 suites / 28 tests |
| `apps/web/src/lib/aiEngineering.ts` | **new** — client |
| `apps/web/src/pages/admin/AiEngineeringPage.tsx` | **new** — command center |
| `apps/web/src/router.tsx`, `apps/web/src/app/Sidebar.tsx` | `/app/ai-engineering` wired |
| `tests/e2e/aiEngineering.spec.ts` | **new** — 5 cases |
| `audit/build-inventory.mjs` | module auto-discovered (route file + service dir) |
| `audit/module-inventory.json` | regenerated (107 modules, 104 COMPLETE) |
| `PROGRESS.md`, `docs/CHANGELOG.md`, `CONVENTIONS.md`, `README.md`, `project-understanding.md` | updated |
