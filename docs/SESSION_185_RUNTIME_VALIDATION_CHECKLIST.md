# Session 185 — Tier 4 mediaGen alias — Runtime Validation Checklist

> No Postgres/Redis needed — alias only, no service change.

## Boot

- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (Prisma-only errors excluded)

## Filesystem

- [ ] `ls apps/web/src/pages/mediaGen/` → `MediaGenPage.tsx` exists
- [ ] `cat apps/web/src/pages/mediaGen/MediaGenPage.tsx` imports from `lib/mediaGen` and renders `mgApi.dashboard()`
- [ ] `ls apps/web/src/pages/media/` still has `MediaFactoryPage.tsx`
- [ ] `node audit/build-inventory.mjs` — `mediaGen` remains `COMPLETE`; `docs/UNFINISHED_MODULES.md` Tier 4 list can strike `mediaGen` (71 → 70)

## Web

- [ ] `GET /app/media` still renders Media Factory console
- [ ] `GET /app/mediaGen` (alias route) renders Universal Media Generation dashboard (capabilities/jobs) without error
- [ ] No new synthetic data, no route change in `apps/api`

## Audit

- [ ] `docs/UNFINISHED_MODULES.md` §Tier 4 — `mediaGen` removed from the “no page” list (70 remaining)
- [ ] `audit/module-inventory.json` regenerated — `mediaGen` still `COMPLETE`
