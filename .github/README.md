# CI — read this first

The pipeline is at **`.github/workflows-staged/ci.yml`**, not
`.github/workflows/ci.yml`. It is therefore **not running yet**.

Activate it with:

```bash
bash .github/install-workflows.sh
git commit -m "ci: activate CI workflows"
git push
```

## Why it is staged instead of active

This repository previously had no CI at all. `.gitignore` contained:

```
# Exclude GitHub workflows due to API permissions
.github/
```

The underlying constraint is real. The automation account is a GitHub App
without `workflows` permission, and GitHub rejects any push that creates or
updates a file under `.github/workflows/` from such a token:

```
! [remote rejected] refusing to allow a GitHub App to create or update
  workflow `.github/workflows/ci.yml` without `workflows` permission
```

The rejection is **atomic** — it fails the whole push, so a single workflow file
blocks every unrelated commit alongside it.

Ignoring the entire directory made that error go away, at the cost of making CI
impossible. That is the wrong trade: the missing CI is precisely why a broken
migration, twenty tables of schema drift, inert RLS policies and a
crash-on-boot logger all reached `main` unnoticed. Staging the file one
directory across keeps the work reviewable and one command away from active,
without silently dropping it.

## What the pipeline checks

| Job | Checks | The failure it would have caught |
|---|---|---|
| `build` | `pnpm lint`, API typecheck, full `pnpm build` | Vite/tsc breakage that `--noEmit` misses |
| `test` | full vitest suite | general regressions |
| `migrations` | replays every migration from zero against a `postgres:17` service container, compares the result to `schema.prisma`, then runs the RLS integration suite | a migration altering a table nothing created; 20 models with no migration; RLS policies that isolate nothing |
| `security` | dependency audit (advisory), committed-credential scan (blocking) | a leaked key |

The `migrations` job is the one that matters most. A suite running against an
already-migrated database cannot see schema drift, and rows in `pg_policies`
prove nothing about whether tenant isolation actually holds. It is the only
check that builds a database purely from committed history and then proves
cross-tenant reads and writes are refused.

It sets `RLS_TEST_REQUIRE_DB=true`. Without that the RLS suite skips itself when
no database is reachable, and the job would report success having asserted
nothing.

## Local equivalents

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm --filter @windels/api typecheck
pnpm build
pnpm --filter @windels/api test

# from-zero migration replay + schema/RLS comparison
node scripts/validate-migrations.mjs

# prove tenant isolation against a real PostgreSQL
cd apps/api && RLS_TEST_DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/postgres' \
  RLS_TEST_REQUIRE_DB=true \
  npx vitest run src/services/rowLevelSecurity.rls.integration.test.ts
```

## Recommended branch protection

Not configurable from here — it needs repository admin. Once CI is active,
require `build`, `test`, `migrations` and `security` to pass before merging to
`main`.
