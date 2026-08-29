# Session 177 — Cognitive — Runtime Validation Checklist

> Target: live PostgreSQL 17 + Redis 8 + `prisma generate`. This sandbox cannot reach Postgres/Redis or download Prisma engine, so all rows are 🟡 VERIFIED (partial) pending target-environment execution.

## Boot

- [ ] `prisma generate` clean
- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (Prisma-only errors excluded)
- [ ] `make verify` — vitest green (new `cognitive.completion.test.ts` + preserved `worldModel.test.ts`)

## API — auth

- [ ] `GET /api/v1/cognitive/dashboard/rollup` without bearer → 401

## API — empty org honesty (fresh org, `WINDELS_DEMO_DATA=false`)

- [ ] `GET /api/v1/cognitive/dashboard/rollup` → `ok:true`
  - `data.selfEvolutionHealth === null` (not `0`)
  - `data.autoFixes30d === null`
  - `data.dnaCompleteness === null`
  - `data.marketplaceUnifiedAssets === null`
  - `data.federationPartners === null`
  - `data.innovationProposalsOpen === null`
  - `data.innovationPipelineValueUsd === null`
  - `data.civilizationEntities === null`
  - `data.worldScenariosTracked === null`
  - `data.provenance` marks those nine as `structural_null` or `not_implemented`
  - Measured aggregates remain numbers: `data.activeBottlenecks` (maybe 0), `data.observatoryHealthyPct` (0–100), `data.globalMemoryEntries`, `data.predictionsMade30d`
  - `data.worldModel` (delegate) returns honest rollup via `worldModel.service.ts`
- [ ] Redis diff before/after `GET /cognitive/dashboard/rollup` on fresh org — no `cog:*:meta` keys created

## API — measured aggregates still honest

- [ ] With no agents/workflows, `activeBottlenecks: 0` (measured 0, not structural) and `observabilityNodes: 0`
- [ ] After creating an agent/workflow, dashboard increments `globalMemoryEntries` / `observatoryHealthyPct` accordingly

## Tenant isolation

- [ ] Orgs A and B: as A `GET /cognitive/dashboard/rollup` vs B — B does not show A's `globalMemoryEntries` or `predictionsMade30d`
- [ ] `TI_NAMESPACE_CATALOG` still contains `cog:meta/entity/obs/hypothesis` as `org_scoped` — audit reports 0 leaked

## Web

- [ ] `GET /app/cognitive` renders — nine structural fields show “—”, not “0%” / “$0M”
- [ ] `PlatformPage` `CognitiveTab` similarly shows “—” for those nine
- [ ] `apps/web` tsc 0, production build clean

## Audit

- [ ] No `oid = "org-windels"` default remains in `cognitive.service.ts`
- [ ] No read path calls `ensureBootstrapped` in `cognitive.service.ts`
- [ ] `audit/module-inventory.json` regenerated — `cognitive` still COMPLETE, service LOC updated
- [ ] `docs/UNFINISHED_MODULES.md` row 12 struck as DONE
