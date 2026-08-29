# Session 180 — Benchmarks — Runtime Validation Checklist

> Target: live PostgreSQL 17 + Redis 8 + `prisma generate`. This sandbox cannot reach Postgres/Redis or download Prisma engine, so all rows are 🟡 VERIFIED (partial) pending target-environment execution.

## Boot

- [ ] `prisma generate` clean
- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (Prisma-only errors excluded)
- [ ] `make verify` — vitest green (new `benchmarks.completion.test.ts` + preserved suite)

## API — auth

- [ ] `GET /api/v1/benchmarks/dashboard/rollup` without bearer → 401 (via `authenticate`)
- [ ] `GET /api/v1/benchmarks/dashboard/rollup` with valid user but `organizationId: null` → 403 `FORBIDDEN` (via `orgOf`)
- [ ] `POST /api/v1/benchmarks/run` without org in token → 403, not house-org write

## API — empty org honesty (fresh org, `WINDELS_DEMO_DATA=false`)

- [ ] `GET /api/v1/benchmarks/dashboard/rollup` → `ok:true`
  - `data.totalRuns === 0`, `data.completed24h === 0`, `data.avgScore === 0`, `data.passRate === 0`
  - `data.areaScores` all `0` per area (14 entries)
  - `data.leaderboard === []`, `data.recentRuns === []`
  - `data.feedbackToModelFactory === { optimizedModels: 0, pendingRecommendations: 0 }` (honest 0, not seeded)
- [ ] Redis diff before/after `GET /benchmarks/dashboard/rollup` on fresh org — no `bm:*` keys created (`SCAN bm:*` unchanged; `bm:m:<org>` must still be absent)

## API — result-registry lifecycle (recorded, not seeded)

- [ ] `POST /api/v1/benchmarks/run` `{area:"latency", overallScore:85, passed:true, evaluator:"harness", evidence:"ticket", metrics:[{key:"p95", label:"p95", value:120, unit:"ms", higherIsBetter:false}]}` → 201, `metadata.evaluator:"harness"`, `metadata.evidence:"ticket"`
- [ ] Second run with `overallScore:60` → `dashboard` shows `feedbackToModelFactory.pendingRecommendations === 1` (was 0), `optimizedModels` still 0 or 1 depending on threshold
- [ ] `GET /api/v1/benchmarks/runs` → contains the new runs
- [ ] `POST /api/v1/benchmarks/schedule` → 201, `GET /benchmarks/dashboard/rollup` not affected (schedule does not invent a run)

## Tenant isolation

- [ ] Orgs A and B: as A `POST /benchmarks/run` → in B `GET /benchmarks/runs` does not contain it
- [ ] As B `GET /benchmarks/dashboard/rollup` still shows `totalRuns:0` and `feedbackToModelFactory: {0,0}`
- [ ] `TI_NAMESPACE_CATALOG` contains `bm:run/runs/m/area/sched/scheds/notes` as `org_scoped` — audit reports 0 leaked for `bm:*` (benchmarks) and `bm:img/...` (biomedical) separately

## Demo gating

- [ ] With `WINDELS_DEMO_DATA=false`, `bootstrapBenchmarks` creates only `bm:m:<org>` = `0,0` for the default org at server start, but a fresh org that was never bootstrapped stays with no `bm:*` keys after 5 dashboard reads (no topology)
- [ ] With `WINDELS_DEMO_DATA=true`, no synthetic runs are invented (already removed in S50) — only the flag topology above

## Web

- [ ] Platform `Benchmarks` tab and/or dedicated benchmarks page on fresh org shows `0` for totalRuns/avgScore/passRate/leaderboard empty and `0/0` for `feedbackToModelFactory` — honest empty, not “0% measured” misreading

## Audit

- [ ] No `oid = "org-windels"` or `organizationId || "org-windels"` default remains in `benchmarks.service.ts`
- [ ] No read path calls `ensureBootstrapped` in `benchmarks.service.ts`
- [ ] No `Math.random` in `benchmarks.service.ts` outside `demoDataEnabled()` (grep clean)
- [ ] `audit/module-inventory.json` regenerated — `benchmarks` still COMPLETE, service LOC updated
- [ ] `docs/UNFINISHED_MODULES.md` row 15 struck as DONE — `docs/UNFINISHED_MODULES.md` Tier 2 now fully DONE (rows 9–15 all struck)
