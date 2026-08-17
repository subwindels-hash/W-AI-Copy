# Session 175 — HealthEcosystem — Runtime Validation Checklist

> Target environment: live PostgreSQL 17 + Redis 8 + `prisma generate` + `WINDELS_DEMO_DATA` toggling. This sandbox reaches no Postgres/Redis and cannot download the Prisma engine, so no row is certifiable here — all are 🟡 VERIFIED (partial) pending target-environment execution.

## Boot

- [ ] `prisma generate` clean
- [ ] `pnpm --filter @windels/shared build` clean
- [ ] `apps/web` `tsc --noEmit` clean (0 errors)
- [ ] `apps/api` `tsc --noEmit` clean (ignoring Prisma-engine-only errors)
- [ ] `make verify` — vitest green (new `healthEcosystem.completion.test.ts` + preserved `healthEcosystem.test.ts`)

## API — unauthenticated / unauthorised

- [ ] `GET /api/v1/health-ecosystem/dashboard/rollup` without bearer → 401
- [ ] `GET /api/v1/health-ecosystem/dashboard/rollup` with valid user but `organizationId: null` → 403 `FORBIDDEN`
- [ ] `GET /api/v1/health-ecosystem/dashboard/rollup` with valid org but missing `user.id` in token → 403 `FORBIDDEN` (no anon fallback)

## API — empty organisation/user honesty (fresh org, fresh user, `WINDELS_DEMO_DATA=false`)

- [ ] `GET /api/v1/health-ecosystem/dashboard/rollup` → `ok:true` `data.hasData: false`
  - `data.profile` absent / `undefined`
  - `data.recentMetrics: []`, `data.recentSessions: []`, `data.medications: []`, `data.notesRecent: []`, `data.emergencyAlerts30d: []`, `data.insights: []`
  - `data.wearables: []`, `data.medicalDevices: []`, `data.vaccinations: []`, `data.screenings: []`
  - `data.today.score === 0` **and** `data.hasData === false` (UI shows “No health data recorded yet” banner — zeros are scoped by the flag)
  - `data.labelBreakdown` all zeros, `data.disclaimer` present
  - `data.modules` length 25 (or 26) with `enabled` reflecting empty `subscribedModules`
- [ ] Re-`GET /health-ecosystem/dashboard/rollup` again → identical JSON (no randomness, no new keys)
- [ ] Redis diff before/after the two reads — no `hec:*` keys were created by the reads (use `SCAN hec:*` count unchanged; `hec:meta:<org>` must still be absent)

## API — record-only invariants

- [ ] `POST /api/v1/health-ecosystem/metrics` `{kind:"bp_systolic", value:120, unit:"mmHg", source:"manual", label:"clinically_validated"}` → 200 but stored `label:"wellness_estimate"` (Fifth Standing Rule: manual cannot claim clinical)
- [ ] `POST /api/v1/health-ecosystem/metrics` `{kind:"bp_systolic", value:118, source:"bp_monitor", label:"clinically_validated"}` → stored `label:"clinically_validated"` (device may carry clinical)
- [ ] `POST /api/v1/health-ecosystem/fitness-sessions` `{kind:"run", durationMin:30, calories:300, avgHr:140, peakHr:165, label:"clinically_validated"}` → stored `label:"wellness_estimate"` (sessions always wellness)
- [ ] `POST /api/v1/health-ecosystem/medications` `{name:"Vitamin D3", dose:"2000 IU", frequency:"daily"}` → `label:"wellness_estimate"`, `adherencePct:0`
- [ ] `POST /api/v1/health-ecosystem/medications` with `prescriber:"Dr A"` → `label:"clinically_validated"` (or requested label if device-sourced)
- [ ] After 5 `POST /metrics` with `kind:"sleep" value:420` → `GET /dashboard/rollup` → `hasData:true`, `weeklyAvg.sleepQuality >0 && <=100`, `insights` contains sleep insight with `label:"wellness_estimate"` and text `7.0 h`
- [ ] `POST /health-ecosystem/metrics` with `kind:"bp_systolic" value:150 source:"bp_monitor" label:"clinically_validated"` → `GET /dashboard/rollup` → `today.riskFlags` contains `recorded_systolic_at_or_above_140`

## API — CRUD lifecycles

- [ ] `POST /health-ecosystem/profile` → 200, `GET /profile` reflects it; second `POST /profile` with partial patch merges
- [ ] `POST /health-ecosystem/wearables` → 201, `GET /wearables` lists it
- [ ] `POST /health-ecosystem/medical-devices` → 201, `GET /medical-devices` lists it
- [ ] `POST /health-ecosystem/vaccinations` → 201, `GET /vaccinations` lists it
- [ ] `POST /health-ecosystem/screenings` → 201, `GET /screenings` lists it
- [ ] `POST /health-ecosystem/notes` → 201, `GET /notes` lists it
- [ ] `POST /health-ecosystem/emergency-alerts` → 201, `GET /emergency-alerts` lists it; `POST /emergency-alerts/:id/acknowledge` → acknowledged flag

## Tenant / user isolation

- [ ] Create org A / user A and org B / user B (two organisations, three tokens: A:u1, A:u2, B:u1)
- [ ] As A:u1 `POST /health-ecosystem/metrics` `{kind:"steps", value:5000, source:"wearable"}` → `hasData:true` for A:u1
- [ ] As A:u2 `GET /health-ecosystem/dashboard/rollup` → `recentMetrics:[]`, `hasData:false` (same org, other user → isolated)
- [ ] As B:u1 `GET /health-ecosystem/dashboard/rollup` → `hasData:false`, `recentMetrics:[]` (other org → isolated)
- [ ] As B:u1 `GET /health-ecosystem/metrics` → `[]`
- [ ] `TI_NAMESPACE_CATALOG` contains `hec:*` (11 prefixes) as `org_scoped` — tenant-isolation audit `GET /admin/tenant-isolation/audit` shows 0 leaked for `hec:*`

## Demo gating

- [ ] With `WINDELS_DEMO_DATA=false`, `bootstrapHealthEcosystem` creates only `hec:meta:<org>` (no profile/metrics/sessions), and a fresh org/user remains empty after 5 dashboard reads
- [ ] With `WINDELS_DEMO_DATA=true`, bootstrap still creates no synthetic health data (record-only guarantee) — only meta flag, if any

## Web

- [ ] `GET /app/health-ecosystem` renders without console error (sidebar “Health Ecosystem” entry visible, HeartPulse icon)
- [ ] Empty org/user shows “No health data recorded yet” azure banner + crimson Fifth Standing Rule disclaimer with three-bucket counts (all 0)
- [ ] Metrics tab: add `steps` 8000 via form → table shows it with `wellness_estimate` badge (and `clinically_validated` when `bp_monitor` source used)
- [ ] Medications tab: add without prescriber → badge `wellness_estimate`; add with prescriber → `clinically_validated`
- [ ] Devices / Preventive tabs reflect writes via API
- [ ] `apps/web` tsc 0, production build clean

## Provenance & audit

- [ ] No `Math.random` / `_rng` in `healthEcosystem.service.ts` or `routes/healthEcosystem.ts` outside a `demoDataEnabled()` guard (grep clean)
- [ ] `audit/module-inventory.json` regenerated — `healthEcosystem` remains COMPLETE, `web.pages` includes the new page, service LOC updated
- [ ] `docs/UNFINISHED_MODULES.md` row 10 struck as DONE

## Production readiness

- [ ] No health data appears without an explicit `POST /metrics` / `POST /fitness-sessions` / etc.
- [ ] Fifth Standing Rule enforced on every write boundary (manual/phone cannot upgrade label)
- [ ] `hasData:false` + empty lists is the only state for a fresh user — no assumed wearables, devices, vaccinations or screenings
