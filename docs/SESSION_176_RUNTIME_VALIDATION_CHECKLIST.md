# Session 176 — Opex — Runtime Validation Checklist

> Target: live PostgreSQL 17 + Redis 8 + `prisma generate`. This sandbox cannot reach Postgres/Redis or download Prisma engine, so all rows are 🟡 VERIFIED (partial) pending target-environment execution.

## Boot

- [ ] `prisma generate` clean
- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (Prisma-only errors excluded)
- [ ] `make verify` — vitest green (new `opex.completion.test.ts` + preserved `opexAssurance.test.ts`)

## API — auth

- [ ] `GET /api/v1/opex/dashboard/rollup` without bearer → 401 (via `opexRouter.use(authenticate)`)
- [ ] `POST /api/v1/opex/safety-alerts` without bearer → 401
- [ ] `GET /api/v1/opex/dashboard/rollup` with valid user but `organizationId: null` → 403 `FORBIDDEN` (via `orgOf`)

## API — empty org honesty (fresh org, `WINDELS_DEMO_DATA=false`)

- [ ] `GET /api/v1/opex/dashboard/rollup` → `ok:true`
  - `trust.reliability` etc. may be `0` but `provenance` marks them `not_assessed`
  - `GET /api/v1/opex/trust` reports same dimensions as `null` with `basis:"not_assessed"`
  - `recentAlerts: []`, `safety.alertsOpen: 0`
- [ ] Redis diff before/after `GET /opex/dashboard/rollup` on fresh org — no `opex:*` or `opx:*` keys created (use `SCAN opex:*` / `SCAN opx:*`)
- [ ] `POST /api/v1/opex/safety-alerts` on fresh org → 201 but does **not** create `opex:<org>:meta` via the write path itself (meta is only set by `bootstrapOpex` at server start). If the org was just bootstrapped at server start, `opex:<org>:meta` already exists — verify by using a brand-new org that was never bootstrapped: the alert write should succeed and the dashboard read that follows should still report no `opex:*` meta creation from the read.

## API — safety register lifecycle (record-only)

- [ ] `POST /api/v1/opex/safety-alerts` `{category:"alignment", severity:"warning", source:"e2e", message:"E2E finding"}` → 201 `status:"open"`
- [ ] `GET /api/v1/opex/register/alerts?status=open` → contains the new finding
- [ ] `POST /api/v1/opex/register/alerts/:id/reopen` on a resolved alert → increments `reopenCount`
- [ ] `GET /api/v1/opex/dashboard/rollup` → `safety.alertsOpen` increments, `safety.mitigations24h` counts only resolved-with-time (not filing time)

## Tenant isolation

- [ ] Orgs A and B: as A `POST /opex/safety-alerts` → in B `GET /opex/register/alerts` does not contain it
- [ ] As B `GET /opex/dashboard/rollup` does not show A's `alertsOpen`
- [ ] `TI_NAMESPACE_CATALOG` still contains `opex` + `opx:alert/idx/assess/policy/event/imported` as `org_scoped` — audit `GET /admin/tenant-isolation/audit` reports 0 leaked for `opex*`/`opx*`

## Demo gating

- [ ] With `WINDELS_DEMO_DATA=false`, `bootstrapOpex` creates only `opex:meta:<org>` (if called for that org), no alerts; a fresh org stays empty after 5 dashboard reads
- [ ] With `WINDELS_DEMO_DATA=true`, no synthetic alerts are invented (record-only guarantee)

## Web

- [ ] `GET /app/opex` renders (assurance console) without error
- [ ] PlatformPage `OpexTab` shows `provenance` block, no `||0` lie on nullable measures (assurance `GET /opex/trust` already null-aware)

## Audit

- [ ] No `Math.random` / `_rng` outside `demoDataEnabled()` in `opex.service.ts` (grep clean)
- [ ] No `oid = "org-windels"` default remains in `opex.service.ts`
- [ ] `audit/module-inventory.json` regenerated — `opex` still COMPLETE, service LOC updated
- [ ] `docs/UNFINISHED_MODULES.md` row 11 struck as DONE
