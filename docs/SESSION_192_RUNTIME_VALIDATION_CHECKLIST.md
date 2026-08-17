# Session 192 — Runtime Validation Checklist

**Scope:** the new `uxIntelligence` completion (per-org keys, honest
dashboard) and the Tier 4 console page.

This checklist is the Phase 6 step for Session 192. It can only be
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
- [ ] `node audit/build-inventory.mjs` shows `uxIntelligence` COMPLETE
      with `web.pages: ["apps/web/src/pages/uxIntelligence/ (1 file)"]`

## API

- [ ] `GET /api/v1/ux-intelligence/dashboard/rollup` returns 200 with
      the expected shape (`components`, `tokens`, `brands`,
      `agentsOnline`, `accessibilityOpen`, `deviceClasses`,
      `designGateActive`) and 401/403 without a token.
- [ ] A fresh org on first call has `components: 0`, `tokens: 0`,
      `brands: 0`, `agentsOnline: 0`, `accessibilityOpen: 0`,
      `designGateActive: false`, `deviceClasses: 9`. **No `ux:*` keys
      are written by this read other than `ux:imported:<org>` and
      `ux:gate:<org>` (the latter is only set if explicitly enabled).**
- [ ] With `WINDELS_DEMO_DATA=true` and a fresh `org-A`, after
      `ensureBootstrapped()` the dashboard reports non-zero counts
      (one token, one component, etc.) for `org-A` only. A second
      `org-B` separately bootstrapped reports its own counts and
      does not see `org-A`'s tokens.
- [ ] `POST /api/v1/ux-intelligence/qa/run` increments
      `ux:r24:<org>` by 1, never `ux:r24` (the global).
- [ ] Every route returns 403 when the caller's user has no
      organization (`req.user.organizationId` is null).

## Web

- [ ] Visiting `/app/ux-intelligence` as a non-authenticated user
      redirects to `/auth/login`.
- [ ] As a fresh authenticated member, the page renders the amber
      "no UX telemetry yet" banner plus four zero-count cards
      (`Components: 0`, `Design tokens: 0`, `Brand profiles: 0`,
      `Open findings: 0`) and `AI agents online: 0`,
      `Design gate: Inactive`. The "Run design QA" button is visible
      and a click increments the per-org counter.
- [ ] As an admin, after running "Run design QA" once, the dashboard
      reflects the per-org counter (the design-gate panel and the
      agents panel do not invent new state from a single QA run).

## Inventory

- [ ] `audit/module-inventory.json` records the new console page.
- [ ] The 14 new `ux:*` key prefixes are present in
      `TI_NAMESPACE_CATALOG` (`ux:tokens`, `ux:tok`, `ux:components`,
      `ux:comp`, `ux:findings`, `ux:find`, `ux:agents`, `ux:agent`,
      `ux:brands`, `ux:brand`, `ux:meta`, `ux:r24`, `ux:gate`,
      `ux:imported`).
- [ ] `web.pages` field is populated for at least 87 modules
      (was 86 with `disasterRecovery` S191; +1 for `uxIntelligence`).

## Regression

- [ ] The S78 `ux:*` global keys (the legacy catalogue) are left in
      place on existing installs; the new service adopts them once
      into the org namespace and the marker is set. **No data is
      rewritten or removed.**
- [ ] `make verify` still reports 3314 passing / 65 skipped.
- [ ] The router has no new `404` for the existing routes.
- [ ] The pre-S192 `uxIntelligence.completion.test.ts` (5 new unit
      tests) passes both in isolation and in the full Vitest suite.
