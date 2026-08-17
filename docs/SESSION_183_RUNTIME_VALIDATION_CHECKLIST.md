# Session 183 — Tier 4 enterpriseSearch alias — Runtime Validation Checklist

> No Postgres/Redis needed — alias only, no service change.

## Boot

- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (Prisma-only errors excluded)

## Filesystem

- [ ] `ls apps/web/src/pages/enterpriseSearch/` → `EnterpriseSearchPage.tsx` exists
- [ ] `cat apps/web/src/pages/enterpriseSearch/EnterpriseSearchPage.tsx` re-exports from `../search/EnterpriseSearchPage`
- [ ] `ls apps/web/src/pages/search/` still has original `EnterpriseSearchPage.tsx`
- [ ] `node audit/build-inventory.mjs` — `enterpriseSearch` remains `COMPLETE`; `docs/UNFINISHED_MODULES.md` Tier 4 list can strike `enterpriseSearch` (73 → 72)

## Web

- [ ] `GET /app/search` still renders Enterprise Search console (unified search, facets, history)
- [ ] `GET /app/enterpriseSearch` (alias route) renders the same console without error
- [ ] No new synthetic data, no route change in `apps/api`

## Audit

- [ ] `docs/UNFINISHED_MODULES.md` §Tier 4 — `enterpriseSearch` removed from the “no page” list (72 remaining)
- [ ] `audit/module-inventory.json` regenerated — `enterpriseSearch` still `COMPLETE`
