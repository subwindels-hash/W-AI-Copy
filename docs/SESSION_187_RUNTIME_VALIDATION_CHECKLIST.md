# Session 187 — Tier 4 modelFactory dedicated console — Runtime Validation Checklist

> No Postgres/Redis needed — dedicated page only, no service change.

## Boot

- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (Prisma-only errors excluded)

## Filesystem

- [ ] `ls apps/web/src/pages/modelFactory/` → `ModelFactoryPage.tsx` exists
- [ ] `cat apps/web/src/pages/modelFactory/ModelFactoryPage.tsx` imports from `@/lib/modelFactory` (`mf2Api`)
- [ ] `ls apps/web/src/pages/softwareFactory/` still has `StudiosPage.tsx` (S99)
- [ ] `node audit/build-inventory.mjs` — `modelFactory` remains `COMPLETE`; `docs/UNFINISHED_MODULES.md` Tier 4 list can strike `modelFactory` (70 → 69)

## Web

- [ ] `GET /app/modelFactory` renders Model Factory console (dashboard counts, stage breakdown, Create model form) without error
- [ ] `GET /app/software-factory` still renders Studios console (S99)
- [ ] Sidebar shows “Model Factory” at `/app/modelFactory` alongside “Factory Studios”
- [ ] No new synthetic data, no route change in `apps/api`

## Audit

- [ ] `docs/UNFINISHED_MODULES.md` §Tier 4 — `modelFactory` removed from the “no page” list (69 remaining)
- [ ] `audit/module-inventory.json` regenerated — `modelFactory` still `COMPLETE`

