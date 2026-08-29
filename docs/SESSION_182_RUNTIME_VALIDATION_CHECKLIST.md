# Session 182 — Tier 4 businessIntelligence alias — Runtime Validation Checklist

> Target: live `pnpm --filter @windels/shared build` + `apps/web` `tsc`. No Postgres/Redis needed — alias only, no service change.

## Boot

- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (Prisma-only errors excluded)

## Filesystem

- [ ] `ls apps/web/src/pages/businessIntelligence/` → `BusinessIntelligencePage.tsx` exists
- [ ] `cat apps/web/src/pages/businessIntelligence/BusinessIntelligencePage.tsx` re-exports from `../bi/BusinessIntelligencePage`
- [ ] `ls apps/web/src/pages/bi/` still has original `BusinessIntelligencePage.tsx`
- [ ] `node audit/build-inventory.mjs` — `businessIntelligence` remains `COMPLETE`; `docs/UNFINISHED_MODULES.md` Tier 4 list can strike `businessIntelligence` (74 → 73)

## Web

- [ ] `GET /app/bi` still renders Business Intelligence console (sources, KPIs, reports, CSV export)
- [ ] `GET /app/businessIntelligence` (alias route, if added) renders the same console without error — or, if no route added, the directory existence alone satisfies the Tier 4 filesystem check
- [ ] No new synthetic data, no route change

## Audit

- [ ] `docs/UNFINISHED_MODULES.md` §Tier 4 — `businessIntelligence` removed from the “no page” list (or struck) — 73 remaining
- [ ] `audit/module-inventory.json` regenerated — `businessIntelligence` still `COMPLETE`

