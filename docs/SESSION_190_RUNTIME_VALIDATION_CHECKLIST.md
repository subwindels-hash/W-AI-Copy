# Session 190 — Tier 4 marketplace dedicated console — Runtime Validation Checklist

> No Postgres/Redis needed — dedicated page only, no service change.

## Boot

- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (Prisma-only errors excluded)

## Filesystem

- [ ] `ls apps/web/src/pages/marketplace/` → `MarketplacePage.tsx` exists
- [ ] `cat apps/web/src/pages/marketplace/MarketplacePage.tsx` imports from `@/lib/marketplace` (`marketplaceApi`)
- [ ] `node audit/build-inventory.mjs` — `marketplace` remains `COMPLETE`; `docs/UNFINISHED_MODULES.md` Tier 4 list can strike `marketplace` (67 → 66)

## Web

- [ ] `GET /app/marketplace` renders Marketplace console (dashboard counts, skills, twins) without error
- [ ] Sidebar shows “Marketplace” at `/app/marketplace` (already existed)
- [ ] No new synthetic data, no route change in `apps/api`

## Audit

- [ ] `docs/UNFINISHED_MODULES.md` §Tier 4 — `marketplace` removed from the “no page” list (66 remaining)
- [ ] `audit/module-inventory.json` regenerated — `marketplace` still `COMPLETE`

