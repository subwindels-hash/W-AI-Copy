# Session 194 — Runtime Validation Checklist

**Scope:** the new `hybridExec` completion (per-org keys, hardcoded
dashboard figures removed) and the Tier 4 console page.

This checklist is the Phase 6 step for Session 194. It can only be
executed against a live target environment with PostgreSQL 17 + Redis 8
+ a generated Prisma client — the sandbox does not have any of these.

## Pre-flight

- [ ] Postgres 17 reachable
- [ ] Redis 8 reachable
- [ ] `prisma generate` succeeded
- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `pnpm --filter @windels/api exec tsc --noEmit` clean (excluding
      the Prisma env-only generated errors)
- [ ] `pnpm --filter @windels/web exec tsc --noEmit` clean
- [ ] `pnpm --filter @windels/web exec vite build` clean
- [ ] `node audit/build-inventory.mjs` shows `hybridExec` COMPLETE
      with `web.pages: ["apps/web/src/pages/hybridExec/ (1 file)"]`

## API

- [ ] `GET /api/v1/hybrid-execution/dashboard/rollup` returns 200 with
      the expected shape and 401/403 without a token. A fresh org
      gets `modelsRegistered: 0`, `gpuNodes: 0`,
      `costOptimization: false`, `vendorNeutral: false`,
      `routedThroughKernel: false`, `activeMode: "self-hosted"`.
- [ ] `PUT /api/v1/hybrid-execution/mode` with `{ "mode": "hybrid" }`
      changes the dashboard's `activeMode` to `"hybrid"`. The
      pre-S194 service asserted "hybrid" without any PUT.
- [ ] `PUT /api/v1/hybrid-execution/flags` with
      `{ "key": "costOptimization", "enabled": true }` flips
      `costOptimization: true`. The pre-S194 service asserted true
      without any PUT.
- [ ] `GET /api/v1/hybrid-execution/models` returns the calling org's
      models only.
- [ ] `GET /api/v1/hybrid-execution/nodes` returns the calling org's
      nodes only.
- [ ] `POST /api/v1/hybrid-execution/route` increments
      `hx:m:req:<org>`, not the global `hx:m:req`.
- [ ] `POST /api/v1/hybrid-execution/models/:id/rollback` on a model
      id belonging to another org returns 404 (the read returns null,
      so the service throws). The pre-S194 service would mutate the
      other org's model.
- [ ] Every route returns 403 when the caller's user has no
      organization (`req.user.organizationId` is null).

## Web

- [ ] Visiting `/app/hybrid-execution` as a non-authenticated user
      redirects to `/auth/login`.
- [ ] As a fresh authenticated member, the page renders the amber
      "no hybrid execution telemetry yet" banner plus four zero-count
      cards (`Models registered: 0`, `GPU nodes: 0`,
      `Canary active: No`, `Rollbacks (24h): 0`).
- [ ] After `PUT /hybrid-execution/mode` with `hybrid`, the page
      shows the `Hybrid` badge as the current mode. After
      `PUT /flags` with `costOptimization: true`, the page shows
      `Cost optimization: On`.
- [ ] After `POST /hybrid-execution/models` for a new model, the
      registry list shows the new row.

## Inventory

- [ ] `audit/module-inventory.json` records the new console page.
- [ ] The 12 new `hx:*` key prefixes are present in
      `TI_NAMESPACE_CATALOG` (`hx:models`, `hx:model`, `hx:nodes`,
      `hx:node`, `hx:routes`, `hx:route`, `hx:m:req`, `hx:m:rb`,
      `hx:mode`, `hx:flags`, `hx:imported`, `hx:notes`).
- [ ] `web.pages` field is populated for at least 89 modules.

## Regression

- [ ] The S43 `hx:*` global keys (the legacy catalogue) are left in
      place on existing installs; the new service adopts them once
      into the org namespace and the marker is set. **No data is
      rewritten or removed.**
- [ ] `make verify` still reports 3325 passing / 65 skipped.
- [ ] The router has no new `404` for the existing routes.
- [ ] The new `hybridExec.completion.test.ts` (6 tests) passes both
      in isolation and in the full Vitest suite.
