# BUILD STATUS — WINDELS AI OS

**Date:** 2026-07-31
**Branch:** `arena/019fb824-win`
**Baseline commit:** `1461def` (sessions 1–88 + S77B social publishing pipeline)

This document records the first **end-to-end green build** of the monorepo, what
was blocking it, and the two environment limits that remain.

---

## 1. Current gate status

Verified 2026-07-31 on a **fresh clone**: no `.env`, no Postgres, no Redis, no
network access to `binaries.prisma.sh`. Reproduce with a single command:

```bash
make verify     # db:generate:offline + build + typecheck + test
```

| Gate | Command | Result |
|---|---|---|
| Build | `pnpm build` | ✅ **4/4 tasks successful** |
| Typecheck | `pnpm typecheck` | ✅ **5/5 tasks successful** |
| Tests | `pnpm test` | ✅ **7/7 tasks** — **390 passed, 51 skipped, 0 failed** (44 files: 41 passed, 3 integration suites auto-skipped) |
| Web bundle | `vite build` | ✅ 0 errors (PlatformPage 602 kB / 107 kB gzip) |
| API bundle | `tsc -p tsconfig.json` | ✅ 0 errors, `dist/index.js` emitted |

Before this pass the API had **never been typechecked end-to-end** (see
PROGRESS.md §S77B "Known pre-existing"). The reported baseline was ~402 errors.

> **Correction (2026-07-31, later pass).** The row above previously read
> "84 passed". That number was only achievable on a machine holding a
> **git-ignored local `.env`** — the remedy recorded in §4 below. On a clean
> checkout, 21 of 44 test files aborted during collection and only 246 tests
> ran. Both causes are now fixed **in tracked files**, so the figure reproduces
> for anyone who clones the repo. See §7.

---

## 2. What was blocking the build

### 2.1 Prisma Client was never generated → cascading type errors

`prisma generate` downloads its query/schema engines from `binaries.prisma.sh`,
which is unreachable in this environment (TLS connection refused). Without
generation, `@prisma/client` exports no models, so **every** file touching the
database failed to typecheck — `src/http/server.ts` alone produced 38 errors of
the form `Property 'Permission' does not exist on type ...`.

**Fix:** `scripts/prisma-generate-offline.sh` (`pnpm db:generate:offline`).
It points Prisma at placeholder engine paths and runs `generate --no-engine`,
which emits the full TypeScript client without the native binaries.

> The no-engine client is for **typecheck/build only** — it cannot open a direct
> DB connection. For deployment run `pnpm db:generate` on a network that can
> reach `binaries.prisma.sh`.

Result: **416 → 381 errors**, and all of `server.ts` went clean.

### 2.2 `@windels/shared` was not built → 131 phantom errors in web

`apps/web` resolves `@windels/shared` through `dist/`, which did not exist.
That produced 131 `TS2307 Cannot find module` errors that had nothing to do with
the web source. Building shared first cleared them.

Result: web **259 → 0 errors**.

### 2.3 379 errors lived in code nothing loads

A module-graph walk from `src/index.ts` **plus every test file** (following
side-effect imports, dynamic `import()`, and `require`) shows:

```
source files : 682
reachable    : 415
orphans      : 267
```

Every remaining error sat in those **267 orphaned files** — bulk-generated
service scaffolds from earlier sessions (`aiCostOptimization.service.ts`,
`modelCatalog.service.ts`, …) that are never imported by the server or by tests.

**Fix:** they are **excluded from the build gate, not deleted.** The exclusion
list is generated, not hand-maintained:

```bash
pnpm orphans          # report reachable vs orphaned
pnpm orphans:write    # regenerate apps/api/tsconfig.orphans.json
```

`apps/api/tsconfig.json` extends the generated `tsconfig.orphans.json`. To
revive an orphan: fix its types, import it from live code, re-run
`pnpm orphans:write`, and it re-enters the gate automatically.

---

## 3. Real bugs found and fixed

Only **3 defects existed in code the app actually runs.** They were previously
hidden behind the Prisma failure.

| # | File | Defect | Fix |
|---|---|---|---|
| 1 | `src/services/agentSkills.service.ts` | `addSkillFromTemplate` passed a readonly `as const` template straight to `createSkill`, which requires the `enabled` field. Every template-based skill creation was a type error. | Parse through `CreateSkillSchema` so defaults are applied and the object is mutable. |
| 2 | `src/services/tools/builtin/index.ts` | Two implicit-`any` params in the `random` tool (`pick` / `shuffle`). **This file is live** — it registers all five agent tools via a side-effect import from `agentRuntime.service.ts`. | Annotated `(s: string)`. |
| 3 | `packages/shared/src/opex.ts` + `src/opex/opex.service.ts` | The shared `OpexDashboard` type disagreed with the service, which was papered over with `as OpexDashboard`. `SafetyAlert.status` was declared `open\|investigating\|mitigated\|accepted` while the service writes `open\|acknowledged\|resolved`, and `benchmarks` demanded all 12 safety categories while the service returns `{}`. | Made the **type honest** instead of casting: `status` now matches the real lifecycle and carries `acknowledgedBy`/`resolvedBy`/`note`; `benchmarks` is `Partial<Record<...>>` so an unevaluated category is absent rather than silently reported as passing. Unsafe cast removed so the compiler verifies the shape. |

---

## 4. Test suite repairs

`pnpm test` previously reported **10 of 13 files failing**. None were real
product failures:

- **Missing `.env`** — `src/config/env.ts` calls `process.exit(1)` on invalid
  env, which vitest surfaces as a hard crash. Created a local `.env` from
  `.env.example` with generated `JWT_SECRET` / `WINDELS_ENCRYPTION_KEY`
  (git-ignored). → 44 → 83 passing.
  > ⚠️ **Superseded — this fix did not survive a clone.** The `.env` was
  > git-ignored, so the repair existed only on that one machine. Replaced by
  > `apps/api/vitest.config.ts`, which is tracked. See §7.
- **`lecturer.test.ts`** required live Redis and a live AI provider; it took
  ~20 s and failed without them. Now mocks Redis with the repo's existing
  `FakeKv` and stubs the AI registry, so it deterministically exercises the
  structured-fallback path. → **20 s → 8 ms**, no infra needed.
  (`FakeKv` gained `sadd`/`smembers`/`srem`/`scard`/`exists` to support this.)
- **`chat-e2e` / `ai-runtime` / `core-platform`** are integration suites needing
  a server on `:4000`. Their tests skipped correctly, but a `beforeAll` login
  threw `ECONNREFUSED` and marked the whole file failed. Added
  `src/testUtils/liveApi.ts` + `describe.skipIf(!LIVE)` so they **skip cleanly**
  and still run in full when a server is up (`TEST_API_URL`).

---

## 5. Environment caveats (not code defects)

These are sandbox limits; the code is unaffected.

1. **`binaries.prisma.sh` is unreachable** — hence the offline generate script.
   The API boots, registers all tools, and initialises the AI registry, but stops
   at `prisma connect failed (P6001)` because a no-engine client cannot dial a
   database directly. Use `pnpm db:generate` where the host is reachable.
2. **No Postgres / Redis / Docker available** — Debian mirrors and the Redis
   binary hosts are also blocked, so a live end-to-end run could not be performed
   here. Everything that does not require live infra is verified green.

---

## 6. Reproducing

```bash
npm i -g pnpm@10.34.5
pnpm install
make verify                  # db:generate:offline + build + typecheck + test
```

Equivalent long form:

```bash
pnpm db:generate:offline     # or `pnpm db:generate` with network access
pnpm build && pnpm typecheck && pnpm test
```

---

## 7. Fresh-clone repair (2026-07-31, later pass)

The gates above were reported green, but a clean checkout of the merged `main`
reproduced only the build and typecheck. `pnpm test` failed: **21 of 44 test
files, 5 failing assertions, only 246 of 441 tests reached.** Two independent
causes, both now fixed in tracked files.

### 7.1 Env validation killed the test runner at import time

`src/config/env.ts` validates `process.env` at module scope and calls
`process.exit(1)` when `DATABASE_URL` / `REDIS_URL` / `JWT_SECRET` are absent.
Correct for a server — it must refuse to boot half-configured — but any test
whose import graph reaches it (directly, or via `db/redis.ts`,
`security/encryption.ts`, `config/demoData.ts`, …) died during collection with
`process.exit unexpectedly called with "1"`. The earlier remedy was a local
`.env`, which is git-ignored and therefore never reached anyone else.

**Fix:** `apps/api/vitest.config.ts` supplies the minimum viable configuration
through vitest's `test.env`. Deliberately *not* done by relaxing the schema:
`config/demoData.test.ts` asserts that an ambiguous value (`WINDELS_DEMO_DATA=1`)
still triggers `process.exit(1)`, so the production guard has to stay strict.
The values are inert placeholders — every suite touching Redis or Prisma already
substitutes `vi.mock("ioredis")`, `FakeKv`, or `testUtils/fakePrisma.ts`, so
nothing is ever dialled. The three live-integration suites still self-skip via
`testUtils/liveApi.ts`.

### 7.2 A pure unit test required a real Prisma engine

`services/ai/registry.test.ts` injects fake AI providers and never touches the
database, but the registry imports `aiMonitoring.service.ts` → `db/client.ts`,
which constructs a `PrismaClient` at module scope. Against the no-engine client
that throws `PrismaClientValidationError` before any test is collected, so the
file could only run where a full Prisma engine had been downloaded.

**Fix:** mock `db/client.js` with the repo's existing `FakePrisma`, matching the
pattern already used by the agents / conversations / attachments / publicApi
suites. The telemetry path stays exercised — `recordAiRequest` really is called
and really does write — without an engine. Recovers **5 tests** that had never
executed in this environment.

### Result

| | Before | After |
|---|---|---|
| Test files | 21 failed, 20 passed, 3 skipped | **41 passed, 3 skipped, 0 failed** |
| Tests | 5 failed, 246 passed | **390 passed, 51 skipped, 0 failed** |
| Reproducible on a fresh clone | ❌ needed a git-ignored `.env` | ✅ `make verify` |

Neither fix touches production code paths: one adds a test-runner config, the
other changes a single test file. Build and typecheck are unaffected (still
4/4 and 5/5).
