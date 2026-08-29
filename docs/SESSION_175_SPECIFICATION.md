# Session 175 — `healthEcosystem` completion (unfinished-module track, 10/N — Tier 2 #2)

**Module:** `healthEcosystem` (Session 75 — Health, Wellness & Digital Healthcare Ecosystem V10.0)  
**Track:** unfinished-module completion (Tier 2, Module #10) — `docs/UNFINISHED_MODULES.md`  
**Rule under test:** *a read path must never be a seeder; seeds gated behind `WINDELS_DEMO_DATA`; tenant required on every call*

---

## 1. What was unfinished

`healthEcosystem` was reported COMPLETE by `audit/build-inventory.json` (29 routes, shared contract 1372 LOC, web client 2015 LOC, 2 unit suites) and had already been fixed in Session 75 to remove all synthetic health fabrication (seeded profiles, vitals, meds, wearables, insights) — that fix is preserved. What remained violated the track's own discipline:

| # | Defect | Location | Consequence |
|---|--------|----------|-------------|
| H1 | **Read-path bootstrap per user** — `dashboard(oid,userId)` calls `ensureBootstrapped` when `K.meta(oid)` is missing | `healthEcosystem.service.ts:314` | Any GET on a fresh organisation (any user) performs a Redis write. A cold `GET /health-ecosystem/dashboard/rollup` is not a read — it mutates. Same S156 defect as biomedical, now per-user because the endpoint is user-scoped (`hec:profile:org:uid`). |
| H2 | **Tenant/user-isolation defaults** — all 22 handlers use `const oid=(req.user as any).organizationId` and `const uid=(req.user as any).id` without null guard; service defaults `oid="org-windels"` and `userId ?? "anon"` | `routes/healthEcosystem.ts:5–45` + `service:276,313` | Null-org token silently reads `org-windels`; missing user reads the `anon` bucket — every unauthenticated user shares the same fallback, and a null user reads another user's fallback. Cross-tenant + cross-user leak by default. |
| H3 | **Uncatalogued Redis namespaces** — `hec:*` never appears in `TI_NAMESPACE_CATALOG` | `tenantIsolation.service.ts` | Audit cannot verify the 11 health prefixes (`hec:meta/profile/metrics/sessions/meds/notes/alerts/wearables/devices/vaccines/screenings`). |
| H4 | **No dedicated console page** — `apps/web/src/pages` contains no `health-ecosystem` page; only `PlatformPage.tsx` tab | `audit/build-inventory.mjs → web.pages:[]` | Track defines COMPLETE as including a dedicated `/app/health-ecosystem` console. Platform tab exists but is not a standalone console. |
| H5 | **Web client incomplete** — `lib/healthEcosystem.ts` exposes only 12 of 22 API methods (missing profile, wearables, medical-devices, vaccinations, screenings, modules typed) | `web/lib/healthEcosystem.ts` | Operators cannot manage profile/devices/preventive care from a typed client. |

`DailyHealth` zero aggregates (`today.score:0` etc.) are intentionally retained — the service already returns `hasData:false` and the UI renders an honest empty banner (“No health data recorded yet”) rather than implying measurements exist. Honest `hasData` + labeled buckets already satisfy the S160 `null` rule via an explicit empty signal, unlike biomedical where no such flag existed.

---

## 2. What this session builds (additive-only)

### 2.1 Shared contract (`packages/shared/src/healthEcosystem.ts`)

No type widening needed — `HealthDashboard.hasData` already conveys emptiness, and `DailyHealth` zeros are documented as “0 when nothing recorded”. Addition is a `HealthProvenance` note interface (optional) and a `HEALTH_ECOSYSTEM_ROUTES` constant for TI catalog reference, if needed. Otherwise unchanged.

### 2.2 Service (`apps/api/src/healthEcosystem/healthEcosystem.service.ts`)

* **Delete the read-path seeding** on `dashboard` L314 — make `dashboard(oid: string, userId: string)` a pure read. Fresh org/user returns `hasData:false`, empty lists, zeroed `DailyHealth` + `hasData:false` provenance (no Redis write). `ensureBootstrapped` stays as an org-level `K.meta` setter, called only from `bootstrapHealthEcosystem` at server start (already the case via `index.ts:???` — verify, else gate behind `demoDataEnabled` if it ever seeded demo data).
* **Remove defaults** — `ensureBootstrapped(logger, oid: string)` requires `oid` (no `"org-windels"`), `dashboard(oid: string, userId: string)` requires both. All other CRUD methods already require `oid`+`userId` but the `userId ?? "anon"` fallback inside `dashboard` is deleted. Every caller must supply a real userId.
* **Add `assertOrg`/`assertUser` helpers** (same as biomedical) throwing on empty.
* Preserve record-only guarantees — `labelForSource`/`label` provenance gates remain; no synthetic metrics/sessions.

### 2.3 Routes (`apps/api/src/http/routes/healthEcosystem.ts`)

* Add `authenticate` at router level — unauthenticated → 401.
* Add `orgOf(req,res): string | null` and `userOf(req,res): string | null` helpers (403 `FORBIDDEN` when `organizationId` or `id` missing). Mirror `industry.ts:14–21` and `biomedical` pattern.
* Guard **all 22** handlers with `orgOf`/`userOf`; replace bare `oid(req)`/`uid(req)` getters. No `organizationId || "org-windels"` fallback.
* Keep all 22 existing paths, bodies, shapes, status codes; only org/user resolution changes.

### 2.4 Tenant isolation (`apps/api/src/tenantIsolation/tenantIsolation.service.ts`)

Register the 11 health prefixes as `org_scoped` (shape `hec:<kind>:<org>:<uid>` — org at index 1 after `hec`, or more precisely prefix `hec:profile` → org at index 2? For `hec:profile:org:uid` split → ["hec","profile","org","uid"] prefix "hec:profile" length 2 → org at 2 correct. Bare `hec` deliberately never added):

```
hec:meta       → org_scoped  (hec:meta:org)
hec:profile    → org_scoped  (hec:profile:org:uid)
hec:metrics    → org_scoped
hec:sessions   → org_scoped
hec:meds       → org_scoped
hec:notes      → org_scoped
hec:alerts     → org_scoped
hec:wearables  → org_scoped
hec:devices    → org_scoped
hec:vaccines   → org_scoped
hec:screenings → org_scoped
```

Also catalog `hec:modules` if needed? Actually modules is not a Redis key; skip.

### 2.5 Web (`apps/web/src/`)

* **Expand `lib/healthEcosystem.ts`** from 12 to 22+ typed methods: `getProfile, upsertProfile, listMetrics, addMetric, listSessions, addSession, listMedications, addMedication, deleteMedication, listNotes, addNote, listAlerts, addAlert, ackAlert, listInsights, listWearables, addWearable, listMedicalDevices, addMedicalDevice, listVaccinations, addVaccination, listScreenings, addScreening, modules, disclaimer` — all via typed `api`.
* **New console** `pages/healthEcosystem/HealthEcosystemPage.tsx` at `/app/health-ecosystem` — 7 tabs reusing PlatformPage's honest empty banner (Fifth Standing Rule three-bucket labels, `hasData:false` banner, `labelBreakdown`):
  * *Overview* — today/weekly/monthly scores, `hasData` provenance, disclaimer
  * *Metrics* — add/list metrics with source/label gate note
  * *Fitness* — sessions with coaching badge
  * *Medications* — adherence, prescriber-gated label
  * *Alerts* — emergency alerts + acknowledge
  * *Devices* — wearables & medical devices
  * *Preventive* — vaccinations & screenings
  Uses design system; no invented vitals.
* Register `/app/health-ecosystem` in `router.tsx` + `Sidebar.tsx` (“Health Ecosystem” under Health, HeartPulse icon, alongside Biomedical).

### 2.6 Tests

* `healthEcosystem.completion.test.ts` — **new**, 14 cases with `FakeKv`:
  - dashboard on empty org/user → `hasData:false`, empty lists, no Redis write (fails on H1)
  - two consecutive dashboard reads identical (no randomness)
  - second-user isolation — metric written in org A / user A not visible from org B / same user, nor from same org / other user (fails on H2)
  - dashboard/getProfile requires org+user (throws on empty)
  - addMetric with `source:manual, label:clinically_validated` → downgraded to `wellness_estimate` (Fifth Standing Rule still enforced after refactor)
  - ensureBootstrapped idempotent, does not create profile/metrics
* **Existing** `healthEcosystem.test.ts` preserved — its zero-aggregate assertion (`score:0`) stays, because `hasData:false` already marks it as unmeasured (unlike biomedical where no flag existed).
* `tests/e2e/healthEcosystem.spec.ts` — **new**, 9 Playwright cases: 401 without token, 403 when org missing, empty dashboard `hasData:false`, metric CRUD + label gate, medication delete, note/alert flow, profile upsert, second-org/user isolation (write in A, read in B → 0).

### 2.7 Order of work

1. Shared (no break) → tsc.
2. Service — delete read-path seed, remove defaults + anon fallback, add asserts.
3. Routes — `authenticate` + `orgOf`/`userOf` on all 22 handlers.
4. Tenant-isolation catalog (`hec:*`).
5. Web lib + console page + router/sidebar.
6. Tests (unit + e2e) — mutation-verify the no-write and isolation cases.
7. `PROGRESS.md` 🟡 · `CONVENTIONS.md` · `docs/UNFINISHED_MODULES.md` strike row 10 · inventory · verify.

---

## 3. Acceptance

* No read path calls `ensureBootstrapped` in `healthEcosystem`.
* No `|| "org-windels"` or `?? "anon"` default on any service method / route.
* `hec:*` appears in `TI_NAMESPACE_CATALOG` as `org_scoped` with correct org-segment derivation.
* `GET /app/health-ecosystem` renders; `GET /health-ecosystem/dashboard/rollup` on empty org/user returns `hasData:false` and creates no `hec:*` keys.
* `apps/web` tsc 0; `apps/api` vitest ≥ +14 passing, existing `healthEcosystem.test.ts` stays green.
* `PROGRESS.md` row is 🟡 — runtime validation not possible in this sandbox.

---

## 4. Non-goals

* No `DailyHealth` null widening — `hasData` already provides the honest empty signal (zeros are scoped by the flag, not presented as measurements). Changing `score: number` → `number|null` would break 8 consumers and the PlatformPage tab that already handles the empty banner correctly.
* No synthetic health data — record-only guarantee preserved.
* No EHR/pharmacy marketplace integration — those are separate modules (S65/S79-80) and remain integrations, not emulations.
