# Session 181 — Heuristic inventory gap closure — Runtime Validation Checklist

> Target: live PostgreSQL 17 + Redis 8 + `prisma generate`. This sandbox cannot reach Postgres/Redis or download Prisma engine, so all rows are 🟡 VERIFIED (partial) pending target-environment execution.

## Boot

- [ ] `prisma generate` clean
- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (Prisma-only errors excluded)
- [ ] `make verify` — vitest green

## Inventory

- [ ] `node audit/build-inventory.mjs` → `143 COMPLETE / 1 STUB` (was `139 / 4 / 1` before 181; `cloudAndroidPublic`, `moduleRuntime`, `nativeAiApi`, `nfcPublic` now COMPLETE)
- [ ] `nativeAi` remains `STUB` (0 routes, legacy superseded by `nativeAiApi` — documented as intentional)
- [ ] `audit/module-inventory.json` `web.client` for the four is now `"<key>.ts"` instead of `None`
- [ ] `moduleRuntime` `routes.total` is `5` (was `3`) — two new `GET` reads added

## API — moduleRuntime new routes (authenticated)

- [ ] `GET /api/v1/module-runtime/health` without bearer → 401
- [ ] `GET /api/v1/module-runtime/health` with bearer → 200 `{ok:true, data:{status:"ok", registrations: <number>}}`
- [ ] `GET /api/v1/module-runtime/modules` with bearer → 200 `{ok:true, data: <registrations[]>}` (same as `GET /registrations`)
- [ ] Existing `GET /api/v1/module-runtime/registrations` and `ALL /:moduleKey/*` proxy still work (HMAC, RBAC, audit)

## Web — alias clients/pages

- [ ] `GET /app/cloud-android-public` renders (re-exports CloudAndroidPage, no console error, sidebar “Cloud Android (Public API)” visible)
- [ ] `GET /app/module-runtime` renders (re-exports ModuleRuntimePage, sidebar “Module Runtime”)
- [ ] `GET /app/native-ai-api` renders (minimal playground, model `windels-native`, health-gated, links to `docs/NATIVE_AI_API.md`)
- [ ] `GET /app/nfc-public` renders (re-exports NfcCardManagerPage)
- [ ] `GET /app/native-ai` renders (stub notice + link to `/app/native-ai-api`)
- [ ] `apps/web` `tsc --noEmit` 0, production build clean
- [ ] No new synthetic data, no existing route behavior changed beyond the two `GET` reads

## Docs

- [ ] `docs/SESSION_181_SPECIFICATION.md` exists and is linked from `PROGRESS.md` if applicable (heuristic session, so PROGRESS may not add a row — inventory is heuristic)
- [ ] `docs/UNFINISHED_MODULES.md` Tier 2 is fully struck (rows 9–15 DONE); heuristic `143/144` noted
