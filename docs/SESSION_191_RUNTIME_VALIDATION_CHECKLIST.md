# Session 191 — Runtime Validation Checklist

**Scope:** the new `disasterRecovery` console page (Tier 4) and the fixed
`audit/build-inventory.mjs` `web.pages` detection.

This checklist is the Phase 6 step for Session 191. It can only be
executed against a live target environment with PostgreSQL 17 + Redis 8
+ a generated Prisma client — the sandbox does not have any of these.

## Pre-flight

- [ ] Postgres 17 reachable
- [ ] Redis 8 reachable
- [ ] `prisma generate` succeeded (engine download is blocked from the
      sandbox)
- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `pnpm --filter @windels/api exec tsc --noEmit` clean (excluding the
      Prisma env-only generated errors)
- [ ] `pnpm --filter @windels/web exec tsc --noEmit` clean
- [ ] `pnpm --filter @windels/web exec vite build` clean
- [ ] `node audit/build-inventory.mjs` shows `disasterRecovery` COMPLETE
      with `web.pages: ["apps/web/src/pages/disasterRecovery/ (1 file)"]`
- [ ] `node audit/build-inventory.mjs` total `web.pages > 0` modules is
      ≥ 85 (was 86 with `disasterRecovery`; counts will vary as modules
      gain/lose pages)

## API

- [ ] `GET /api/v1/disaster-recovery/dashboard/rollup` returns 200 with the
      expected shape (`components`, `activeRegion`, `standbyRegions`,
      `failovers30d`, `replicationLagMs`, `provenance`) and 401/403
      without a token.
- [ ] A fresh org on first call has `activeRegion: null`,
      `components: []`, `standbyRegions: []`, `replicationLagMs: null`,
      `provenance.topology: "unconfigured"`. **No `dr:*` keys are written
      by this read.**
- [ ] `POST /disaster-recovery/failover` writes a single `dr:ev:<org>`
      entry with `triggeredBy: "manual"` and `status: "completed"`.
- [ ] `POST /disaster-recovery/drills` writes a `dr:drill:<org>:<id>`
      entry with `status: "scheduled"`; `POST /drills/:id/run` moves it to
      `running`; `recordDrillResult` moves it to `passed`/`failed` and
      updates the component's `healthy` flag.
- [ ] `POST /disaster-recovery/emergency` flips `dr:em:<org>` between
      `0` and `1`; the dashboard reflects it within one read.

## Web

- [ ] Visiting `/app/disaster-recovery` as a non-authenticated user
      redirects to `/auth/login` (via the existing ProtectedRoute).
- [ ] As an authenticated member, the page renders the dashboard
      correctly. A fresh org shows the "no topology configured" amber
      banner and "—" for `replicationLagMs` and `activeRegion`.
- [ ] The provenance card is visible and names the
      `configured`/`unconfigured` topology state and the "components
      become healthy only after a passing drill" caveat.
- [ ] As an admin, the failover form is visible and refuses to submit
      without a `reason`; with a reason, the call hits the API and the
      event appears in the failover feed.
- [ ] As a non-admin, the failover form and the emergency toggle are
      hidden.
- [ ] The drill-scheduling form writes a scheduled drill; starting a
      drill via the "Start" button transitions the row to `running`.

## Inventory

- [ ] `audit/module-inventory.json` records the new console page.
- [ ] No module that has a real `pages/<modKey>/` directory shows
      `web.pages: []` (this was the pre-S191 defect).
- [ ] The alias modules (`businessIntelligence`, `enterpriseFinOps`,
      `enterpriseSearch`, `mediaFactory`, `mediaGen`, `voiceStudio`,
      `moduleRuntime`, `cloudAndroidPublic`, `nfcPublic`,
      `promptTemplates`) all report at least one entry in `web.pages`.

## Regression

- [ ] The four pre-existing S181/S182/S183/S184/S186/S187 console
      aliases still load at their original paths
      (`/app/bi`, `/app/finops`, `/app/search`, `/app/media`,
      `/app/voiceStudio`, `/app/moduleRuntime`, `/app/cloud-android-public`,
      `/app/nfc-public`, `/app/promptTemplates`).
- [ ] `make verify` still reports 3309 passing / 65 skipped.
- [ ] The router has no new `404` for the existing routes.
