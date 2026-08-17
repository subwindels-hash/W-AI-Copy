# Session 193 — Runtime Validation Checklist

**Scope:** the new `architecture` completion (per-org keys, hardcoded
`"org-windels"` removed from `EsiAggregationService.portfolioReport`)
and the Tier 4 console page.

This checklist is the Phase 6 step for Session 193. It can only be
executed against a live target environment with PostgreSQL 17 + Redis 8
+ a generated Prisma client — the sandbox does not have any of these.

## Pre-flight

- [ ] Postgres 17 reachable
- [ ] Redis 8 reachable
- [ ] `prisma generate` succeeded
- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `pnpm --filter @windels/api exec tsc --noEmit` clean (excluding the
      Prisma env-only generated errors)
- [ ] `pnpm --filter @windels/web exec tsc --noEmit` clean
- [ ] `pnpm --filter @windels/web exec vite build` clean
- [ ] `node audit/build-inventory.mjs` shows `architecture` COMPLETE
      with `web.pages: ["apps/web/src/pages/architecture/ (1 file)"]`

## API

- [ ] `GET /api/v1/architecture/dashboard/rollup` returns 200 with the
      expected shape and 401/403 without a token. A fresh org gets
      `modules: []` and the `monorepo` / `deploymentTargets` static
      fields.
- [ ] `GET /api/v1/architecture/modules` returns the calling org's
      modules only.
- [ ] `POST /api/v1/architecture/esi/signals` writes a signal under
      `arch:esi:<org>` (never `arch:esi`).
- [ ] `GET /api/v1/architecture/esi` returns the calling org's
      signals only.
- [ ] `GET /api/v1/architecture/esi/report` reads the calling org's
      sections; benchmarks and mediaGen sections are the calling
      org's own, not org-windels'. Two orgs each get a different
      `totalSignals`.
- [ ] Every route returns 403 when the caller's user has no
      organization (`req.user.organizationId` is null).

## Web

- [ ] Visiting `/app/architecture` as a non-authenticated user
      redirects to `/auth/login`.
- [ ] As a fresh authenticated member, the page renders the amber
      "no architecture records yet" banner plus three zero-count
      cards (`Modules registered: 0`, `ESI signals (this org): 0`,
      `Monitored domains: 3`).
- [ ] After `POST /architecture/esi/signals` is called twice for the
      org, the ESI feed shows two signals; a second org's feed is
      empty.

## Inventory

- [ ] `audit/module-inventory.json` records the new console page.
- [ ] The 4 new `arch:*` key prefixes are present in
      `TI_NAMESPACE_CATALOG` (`arch:modules`, `arch:esi`,
      `arch:imported`, `arch:notes`).
- [ ] `web.pages` field is populated for at least 88 modules.

## Regression

- [ ] The S37 `arch:*` global keys (the legacy catalogue) are left in
      place on existing installs; the new service adopts them once
      into the org namespace and the marker is set. **No data is
      rewritten or removed.**
- [ ] `make verify` still reports 3319 passing / 65 skipped.
- [ ] The router has no new `404` for the existing routes.
- [ ] The pre-S193 `esiAggregation.test.ts` (3 tests) passes both in
      isolation and in the full Vitest suite.
- [ ] The new `architecture.completion.test.ts` (5 tests) passes
      both in isolation and in the full Vitest suite.
