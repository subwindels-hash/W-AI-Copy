# Session 188 — Tier 4 memoryEvolution dedicated console — Runtime Validation Checklist

> No Postgres/Redis needed — dedicated page only, no service change.

## Boot

- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (Prisma-only errors excluded)

## Filesystem

- [ ] `ls apps/web/src/pages/memoryEvolution/` → `MemoryEvolutionPage.tsx` exists
- [ ] `cat apps/web/src/pages/memoryEvolution/MemoryEvolutionPage.tsx` imports from `@/lib/memoryEvolution` (`meApi`)
- [ ] `node audit/build-inventory.mjs` — `memoryEvolution` remains `COMPLETE`; `docs/UNFINISHED_MODULES.md` Tier 4 list can strike `memoryEvolution` (69 → 68)

## Web

- [ ] `GET /app/memoryEvolution` renders Memory Evolution console (dashboard counts, Add memory form, Recent memories) without error
- [ ] `GET /app/modelFactory` still renders Model Factory console (S187)
- [ ] Sidebar shows “Memory Evolution” at `/app/memoryEvolution`
- [ ] No new synthetic data, no route change in `apps/api`

## Audit

- [ ] `docs/UNFINISHED_MODULES.md` §Tier 4 — `memoryEvolution` removed from the “no page” list (68 remaining)
- [ ] `audit/module-inventory.json` regenerated — `memoryEvolution` still `COMPLETE`

