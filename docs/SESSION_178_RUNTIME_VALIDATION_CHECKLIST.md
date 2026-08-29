# Session 178 — Command — Runtime Validation Checklist

> Target: live PostgreSQL 17 + Redis 8 + `prisma generate`. This sandbox cannot reach Postgres/Redis or download Prisma engine, so all rows are 🟡 VERIFIED (partial) pending target-environment execution.

## Boot

- [ ] `prisma generate` clean
- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (Prisma-only errors excluded)
- [ ] `make verify` — vitest green (new `command.completion.test.ts` + preserved `operations.test.ts`)

## API — auth

- [ ] `GET /api/v1/command/dashboard/rollup` without bearer → 401 (via `authenticate`)
- [ ] `GET /api/v1/command/dashboard/rollup` with valid user but `organizationId: null` → 403 `FORBIDDEN` (via `orgOf`)

## API — empty org honesty (fresh org, `WINDELS_DEMO_DATA=false`)

- [ ] `GET /api/v1/command/dashboard/rollup` → `ok:true`
  - `data.enterpriseHealth` is a number (0–100, derived from real `prisma.task` + incident register, 0 is honest when no tasks)
  - `data.incidentsOpen === 0`, `data.incidentsCritical === 0`, `data.regions === []` (empty, not synthetic)
  - `data.operations.mttrKind === "none"` and `data.operations.meanTimeToResolveMinutes == null` (or `mttrMinutes === 0` with `mttrKind === "none"` marks no sample)
  - `data.operations.note` present
  - `data.strategicInitiatives === []`, `data.briefings === []`
- [ ] Redis diff before/after `GET /command/dashboard/rollup` on fresh org — no `cmd:*` keys created (`SCAN cmd:*` unchanged; `cmd:meta:<org>` must still be absent)

## API — operations register (record-only)

- [ ] `POST /api/v1/command/incidents` `{title:"E2E incident", severity:"warning", service:"api"}` → 201 (requires admin)
- [ ] `GET /api/v1/command/incidents` → contains the new incident
- [ ] `POST /api/v1/command/regions` `{code:"e2e-west", name:"E2E West", servicesTotal:10}` → 201; `GET /command/regions` lists it
- [ ] `POST /api/v1/command/regions/:id/status` `{servicesUp:8, latencyMs:120, activeUsers:100}` → 200; subsequent `GET /command/dashboard/rollup` includes the region with `health` derived (not `unreported`)
- [ ] `POST /api/v1/command/briefings` → 201; `GET /briefings` lists it

## Tenant isolation

- [ ] Orgs A and B: as A `POST /command/incidents` → in B `GET /command/incidents` does not contain it
- [ ] As B `GET /command/dashboard/rollup` does not show A's `incidentsOpen` or `operations.openIncidents`
- [ ] `TI_NAMESPACE_CATALOG` still contains `cmd:meta/incident/region/briefing/initiative/dir` as `org_scoped` — audit reports 0 leaked

## Demo gating

- [ ] With `WINDELS_DEMO_DATA=false`, `bootstrapCommand` creates only `cmd:meta:<org>` (if called for that org), no incidents/regions; a fresh org stays empty after 5 dashboard reads
- [ ] With `WINDELS_DEMO_DATA=true`, no synthetic incidents/regions/briefings are invented (operations register stays empty until real `POST`s)

## Web

- [ ] `GET /app/command` renders (Global Command Center) without error; `MTTR` shows “—” when `operations.mttrKind === "none"`, `unreported` regions render as “never reported”, not healthy
- [ ] PlatformPage `CommandCenterTab` similarly shows “—” for MTTR and `unreported` handling

## Audit

- [ ] No `oid = "org-windels"` default remains in `command.service.ts`
- [ ] No read path in `CommandService` calls `ensureBootstrapped`
- [ ] `audit/module-inventory.json` regenerated — `command` still COMPLETE, service LOC updated
- [ ] `docs/UNFINISHED_MODULES.md` row 13 struck as DONE
