# Session 174 — Biomedical — Runtime Validation Checklist

> Target environment: live PostgreSQL 17 + Redis 8 + `prisma generate` + `WINDELS_DEMO_DATA` toggling. This sandbox reaches no Postgres/Redis and cannot download the Prisma engine, so no row is certifiable here — all are 🟡 VERIFIED (partial) pending target-environment execution.

## Boot

- [ ] `prisma generate` clean
- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (ignoring Prisma-engine-only errors)
- [ ] `make verify` — vitest green (new `biomedical.completion.test.ts` + updated `biomedical.test.ts`)

## API — unauthenticated / unauthorised

- [ ] `GET /api/v1/biomedical/dashboard/rollup` without bearer → 401
- [ ] `GET /api/v1/biomedical/dashboard/rollup` with malformed token → 401
- [ ] `GET /api/v1/biomedical/dashboard/rollup` with valid user but `organizationId: null` → 403 `FORBIDDEN` `organization context required`

## API — empty organisation honesty (fresh org, `WINDELS_DEMO_DATA=false`)

- [ ] `GET /api/v1/biomedical/dashboard/rollup` → `ok:true`
  - `imaging.studies24h === 0`
  - `imaging.aiAssisted === 0`
  - `imaging.pendingReview === 0`
  - `imaging.avgTurnaroundMin === null`  (not `0`)
  - `ops === []`  (empty array, not synthetic metrics)
  - `pharmacyAlerts === []`
  - `telemetryActive === 0`
  - `complianceStatus` every entry === `"gap"`
  - `provenance.avgTurnaroundMin === "unmeasured_no_completed"`  (or equivalent `unmeasured` tag)
  - `provenance.studiesMeasured === false`
- [ ] Re-`GET /biomedical/studies` → `[]`
- [ ] Redis diff before/after the two reads — no `bm:*` keys were created by the reads (use `SCAN bm:*` count unchanged)

## API — registry-only invariant (real workflow)

- [ ] `POST /api/v1/biomedical/studies` `{modality:"xray", bodyPart:"chest"}` → 201 `status:"queued"`, `aiFindings:[]`, `radiologistReviewed:false`, `completedAt` absent
- [ ] `GET /api/v1/biomedical/studies/:id` → same document
- [ ] Wait 3 s → `GET /api/v1/biomedical/studies/:id` again → still `status:"queued"`, `aiFindings:[]` (no timer-based fabrication)
- [ ] `GET /api/v1/biomedical/dashboard/rollup` → `studies24h:1`, `aiAssisted:0`, `pendingReview:1`, `avgTurnaroundMin:null` (queued study has no completion yet)
- [ ] `POST /api/v1/biomedical/studies/:id/findings` as non-admin → 403 (clinical action is admin-gated)
- [ ] `POST /api/v1/biomedical/studies/:id/findings` as admin `{findings:[{finding:"No acute abnormality", confidence:0.88, severity:"low", priority:false}], reviewedByRadiologist:true}` → 200 `status:"signed_off"`, `completedAt` stamped, `radiologistReviewed:true`
- [ ] Subsequent `GET /biomedical/dashboard/rollup` → `pendingReview:0`, `avgTurnaroundMin` is now a `number` (≥0), `provenance.avgTurnaroundMin:"measured"`
- [ ] `POST /api/v1/biomedical/studies/:id/findings` with `{priority:true}` → `status:"escalated"` and `pharmacy` escalation not conflated

## API — pharmacy / telemed / ops

- [ ] `POST /api/v1/biomedical/pharmacy-alerts` as non-admin → 403
- [ ] `POST /api/v1/biomedical/pharmacy-alerts` as admin → 201
- [ ] `POST /api/v1/biomedical/telemedicine/sessions` → 201 `summaryGenerated:false`
- [ ] `POST /api/v1/biomedical/telemedicine/sessions/:id/end` → 200 `endedAt` stamped
- [ ] `POST /api/v1/biomedical/ops-metrics` as non-admin → 403; as admin → 200 and subsequent dashboard `ops` reflects it
- [ ] `GET /api/v1/biomedical/studies?limit=500` → clamped to 200 (or 500 handling is documented)

## Tenant isolation

- [ ] Create org A + org B (two `organizationId`s, two bearer tokens)
- [ ] As A: `POST /biomedical/studies` → id `img-A`
- [ ] As B: `GET /biomedical/studies/img-A` → 404 (not 200)
- [ ] As B: `GET /biomedical/dashboard/rollup` → `recentStudies` does not contain `img-A`; counts are unaffected by A's study
- [ ] As B with token missing `organizationId` → 403, no read of org A
- [ ] `TI_NAMESPACE_CATALOG` contains `bm:img`, `bm:imgs`, `bm:ph`, `bm:phs`, `bm:tl`, `bm:tls`, `bm:ops`, `bm:meta` as `org_scoped` — tenant-isolation audit `GET /admin/tenant-isolation/audit` reports no findings for `bm:*`
- [ ] Direct Redis write: `SET bm:img:org-A:evil …` → cross-tenant read audit flags it if catalog is correct (manual check via sweep)

## Demo gating

- [ ] With `WINDELS_DEMO_DATA=false`, `bootstrapBiomedical` creates only `bm:meta:<org>` (no studies/alerts/sessions), and a fresh org remains empty after 5 dashboard reads
- [ ] With `WINDELS_DEMO_DATA=true`, bootstrap still creates no synthetic radiology findings (registry-only guarantee) — the flag is present for future demo fixtures but currently no-ops beyond the meta flag

## Web

- [ ] `GET /app/biomedical` renders without console error (sidebar “Biomedical” entry visible)
- [ ] Dashboard tab on fresh org shows “— not measured” for Avg Turnaround (not `0 min`)
- [ ] Imaging tab: empty state → submit chest X-ray → row appears as `queued` → findings action prompts for admin → after admin records finding, row shows `signed_off`/`escalated`
- [ ] Pharmacy Alerts tab and Telemedicine tab reflect writes performed via API
- [ ] `apps/web` tsc 0, production build clean

## Provenance & audit

- [ ] No `Math.random` / `_rng` in `biomedical.service.ts` or `routes/biomedical.ts` outside a `demoDataEnabled()` guard (grep clean)
- [ ] `audit/module-inventory.json` regenerated — `biomedical` remains COMPLETE, `web.pages` includes the new page, service LOC updated
- [ ] `docs/UNFINISHED_MODULES.md` row 9 struck as DONE

## Production readiness

- [ ] No synthetic `aiFindings` ever appear without an explicit `POST /studies/:id/findings`
- [ ] Patient identifier is always `pt-<hash>` pseudonym, no PHI in logs
- [ ] RLS policies (if biomedical ever gains a Prisma table) — not applicable now (Redis-only module), documented as such

