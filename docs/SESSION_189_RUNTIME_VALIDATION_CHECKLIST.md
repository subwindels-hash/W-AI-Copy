# Session 189 — Tier 4 promptTemplates alias — Runtime Validation Checklist

> No Postgres/Redis needed — alias only, no service change.

## Boot

- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (Prisma-only errors excluded)

## Filesystem

- [ ] `ls apps/web/src/pages/promptTemplates/` → `PromptTemplatesPage.tsx` exists
- [ ] `cat apps/web/src/pages/promptTemplates/PromptTemplatesPage.tsx` re-exports from `../admin/PromptTemplatesPage`
- [ ] `ls apps/web/src/pages/admin/` still has `PromptTemplatesPage.tsx`
- [ ] `node audit/build-inventory.mjs` — `promptTemplates` remains `COMPLETE`; `docs/UNFINISHED_MODULES.md` Tier 4 list can strike `promptTemplates` (67 → 66)

## Web

- [ ] `GET /app/prompt-templates` still renders Prompt Templates console
- [ ] `GET /app/promptTemplates` (alias route) renders the same console without error
- [ ] No new synthetic data, no route change in `apps/api`

## Audit

- [ ] `docs/UNFINISHED_MODULES.md` §Tier 4 — `promptTemplates` removed from the “no page” list (66 remaining)
- [ ] `audit/module-inventory.json` regenerated — `promptTemplates` still `COMPLETE`

