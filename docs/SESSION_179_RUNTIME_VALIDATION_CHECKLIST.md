# Session 179 — DisasterRecovery — Runtime Validation Checklist

> Target: live PostgreSQL 17 + Redis 8 + `prisma generate`. This sandbox cannot reach Postgres/Redis or download Prisma engine, so all rows are 🟡 VERIFIED (partial) pending target-environment execution.

## Boot

- [ ] `prisma generate` clean
- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (Prisma-only errors excluded)
- [ ] `make verify` — vitest green (new `disasterRecovery.completion.test.ts` + preserved suite)

## API — auth

- [ ] `GET /api/v1/disaster-recovery/dashboard/rollup` without bearer → 401 (via `authenticate`)
- [ ] `GET /api/v1/disaster-recovery/dashboard/rollup` with valid user but `organizationId: null` → 403 `FORBIDDEN`

## API — empty org honesty (fresh org, `WINDELS_DEMO_DATA=false`)

- [ ] `GET /api/v1/disaster-recovery/dashboard/rollup` → `ok:true`
  - `data.activeRegion === null` (not `"na-east"`)
  - `data.standbyRegions === []`
  - `data.components === []` (not 12 seeded statuses)
  - `data.replicationLagMs === null` (not `0`)
  - `data.overallHealthy === false`
  - `data.failovers30d === 0`
  - `data.upcomingDrills === []`
  - `data.provenance` (if present) marks topology as unconfigured
- [ ] Redis diff before/after `GET /disaster-recovery/dashboard/rollup` on fresh org — no `dr:*` keys created (`SCAN dr:*` unchanged; `dr:active:<org>` must still be absent)

## API — topology lifecycle (recorded, not seeded)

- [ ] `POST /api/v1/disaster-recovery/drills` `{component:"ai_cluster", scheduledAt:"<future ISO>"}` → 201
- [ ] `POST /api/v1/disaster-recovery/drills/:id/run` → 200 `status:"running"`
- [ ] `POST /api/v1/disaster-recovery/drills/:id/result` `{passed:true, rtoAchievedMs:5000, rpoAchievedMs:1000}` → `status:"passed"`, component `healthy:true` now appears in `GET /disaster-recovery/status` and influences `overallHealthy`
- [ ] `POST /api/v1/disaster-recovery/failover` `{component:"ai_cluster", toRegion:"eu-west", reason:"E2E"}` → `activeRegion` becomes `"eu-west"` on next `GET /dashboard/rollup`

## Tenant isolation

- [ ] Orgs A and B: as A `POST /disaster-recovery/failover` → in B `GET /disaster-recovery/dashboard/rollup` still shows `activeRegion:null` and no failover event in `GET /disaster-recovery/events`
- [ ] As A `POST /disaster-recovery/drills` → in B `GET /disaster-recovery/drills` does not contain it
- [ ] `TI_NAMESPACE_CATALOG` contains `dr:active/status/ev/drill/drills/em/m/notes` as `org_scoped` — audit reports 0 leaked

## Demo gating

- [ ] With `WINDELS_DEMO_DATA=false`, `bootstrapDisasterRecovery` creates only `dr:active:<org>` + 12 `dr:status` + `dr:m` (if called for that org), but a fresh org that was never bootstrapped stays empty after 5 dashboard reads (no topology)
- [ ] With `WINDELS_DEMO_DATA=true`, no synthetic “passed” drill is invented (already removed in S51) — only the flag topology above

## Web

- [ ] Platform `DR` tab and/or dedicated disaster-recovery page on fresh org shows “— no topology configured” for `activeRegion`, `—` for `replicationLagMs`, `0` is not shown as `na-east`/`0ms`
- [ ] After a successful drill, the component turns healthy and `replicationLagMs` shows measured value when reported

## Audit

- [ ] No `oid = "org-windels"` default remains in `disasterRecovery.service.ts`
- [ ] No read path calls `ensureBootstrapped` in `disasterRecovery.service.ts`
- [ ] No `Math.random` in `disasterRecovery.service.ts` outside `demoDataEnabled()` (grep clean)
- [ ] `audit/module-inventory.json` regenerated — `disasterRecovery` still COMPLETE, service LOC updated
- [ ] `docs/UNFINISHED_MODULES.md` row 14 struck as DONE
