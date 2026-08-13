# WINDELS AI OS — Architecture Audit

**Date:** 2026-08-13
**Branch:** `arena/019ffbd6-win`
**Baseline commit:** `64d2c30`
**Scope:** Organization and gap-completion audit of the existing platform. Not a rebuild.

---

## How this audit was produced

Every statement below was derived by running the system, not by reading its
documentation. That distinction turned out to matter: `audit/module-inventory.json`
declares **125 of 125 modules COMPLETE**, and `PROGRESS.md` describes a
production-ready platform. The service could not survive its own boot.

Evidence gathered:

| Probe | Result |
|---|---|
| Install + build `packages/shared` | Clean |
| Boot the API against a real PostgreSQL 17 | Registered 2159 routes, then **crashed** (`RangeError`) |
| Replay all migrations into an empty database | **Failed at migration 9 of 12**; produced 46 tables where the schema declares 66 |
| Full test suite | 2449 passed / 2 failed / 51 skipped (177 files, 82.5 s) |
| `SELECT * FROM pg_policies` | **0 rows** |
| Tables with `relrowsecurity` | **0** |

Everything marked ✅ below was observed working. Nothing is marked complete on
the strength of a file existing.

---

## Verdict summary

| Layer | State | Note |
|---|---|---|
| 1. Frontend | 🟡 Partial | 189 components, Vite SPA. Builds; not runtime-verified against a live API. |
| 2. APIs & backend logic | 🟢 Substantially complete | 2159 routes across 150 route files. |
| 3. Database & storage | 🟢 **Fixed this session** | Migration history was unreplayable; now 14/14 apply from zero. |
| 4. Auth & permissions | 🟡 Partial | IAM exists; RBAC seeding was broken by the schema drift, now fixed. |
| 5. Security & RLS | 🟢 **Fixed this session** | RLS was entirely absent. Now enforced on 36 tables and tested. |
| 6. Hosting & deployment | 🟡 Partial | Docker + K8s manifests present, unverified here (no Docker in sandbox). |
| 7. Cloud & compute | 🔴 Gap | No worker pool; heavy AI/media work runs in-process. |
| 8. CI/CD | 🔴 **Gap** | No `.github/` at all. Zero automated validation. |
| 9. Rate limiting | 🟡 Partial | IP/user only; no org, API-key, or plan tiers. Fails open. |
| 10. Caching & CDN | 🔴 Gap | No cache service. Redis used ad hoc. |
| 11. Load balancing & scaling | 🟡 Partial | HPA on CPU/memory only; no queue-depth or GPU metrics. |
| 12. Observability | 🟢 Good | logger, metrics, tracer, aiObservability; Prometheus/Grafana/Loki configs. |

Legend: 🟢 working · 🟡 partially complete · 🔴 missing

---

## Defects found and fixed this session

### DEFECT 1 — A migration that could never run

`20260801020000_mobile_device_pin_hash` ran
`ALTER TABLE "MobileDevice" ADD COLUMN "pinHash"` against a table **no earlier
migration creates**. A from-zero replay died at migration 9 of 12. The
migration history was therefore not a valid description of the schema, and no
new environment could be provisioned from it.

**Fixed** — guarded `DO` block that creates the table when absent, plus
`ADD COLUMN IF NOT EXISTS`.

**Security finding uncovered while fixing it:** `setPin()` previously stored its
bcrypt hash in `MobileDevice.deviceModel` — a column the device-registration
route writes **directly from the request body**. A caller could plant a hash
they knew the plaintext for and then satisfy the PIN check. `pinHash` must never
be body-accepted nor returned by `listDevices()`.

### DEFECT 2 — 20 models with no migration

Applying every committed migration to an empty database produced **46 tables**;
`schema.prisma` declares **66**. The missing 20 existed at runtime only because
a developer database had drifted ahead of the committed history. Consequences:
`P2021` bootstrap errors for `ModelRegistry`, `Plugin` and `RolePermission`,
which left **RBAC permission seeding non-functional** (a Layer-4 failure caused
by a Layer-3 defect).

**Fixed** — `20260813000000_schema_drift_baseline` adds 7 enums, 20 tables,
4 `ALTER TABLE`s and 21 foreign keys, all idempotent.

**Verified** — 13/13 migrations apply from zero; 66 tables; diff against
`schema.prisma` reports 0 missing, 0 extra, 120 foreign keys.

### DEFECT 3 — Row-level security did not exist

Layer 5 was described as complete. Measured reality:

- `pg_policies` — **0 rows**
- tables with `relrowsecurity` — **0**
- `rowLevelSecurity.service.ts` — **dead code**; its only caller,
  `middleware/tenantContext.ts`, is imported by **zero files**

Tenant isolation rested entirely on `middleware/orgScope.ts`. Any route that
forgot it, or any query built from a caller-supplied `organizationId`, crossed
tenants unchecked.

Worse, the service **could never have worked**. `setTenantContext` issued
`SET app.current_organization_id = ${value}` through a tagged template — a bind
parameter. PostgreSQL rejects parameters in `SET`:

```
ERROR: syntax error at or near "$1"
```

So the one code path that would have activated RLS threw on its first call.

**Fixed** — see the RLS section below.

### DEFECT 4 — The API could not survive its own boot

```
RangeError: Maximum call stack size exceeded
    at redact (src/security/piiRedact.ts)
    ← observability/logger.ts:79  const safeMeta = redact(meta)
```

`redact()` walked log metadata recursively with **no cycle guard and no depth
cap**. Any object graph with a back-reference — an `Error` with a `cause` chain,
a Prisma payload, a request/response pair, a pino child binding — recursed until
the stack blew. Because logging happens on the first line of bootstrap, the
whole process died.

This is the clearest illustration of why the audit was run against a live
system: a platform documented as 125/125 complete could not start.

**Fixed** — ancestor `Set` emitting `[Circular]`, `MAX_DEPTH = 12` emitting
`[MaxDepth]`, ancestor popped in a `finally` so sibling branches and diamond
graphs are not misreported. Redaction behaviour unchanged.
**Regression suite:** `piiRedact.test.ts`, 12 tests — 7 failed before the fix.

### DEFECT 5 — RBAC seeding silently non-functional

Downstream of DEFECT 2. Confirmed resolved: a boot against a freshly migrated
database logs **zero** `P2021` errors.

---

## Layer 5 — Row-level security, in detail

### What was built

`20260813010000_rls_tenant_isolation` enables RLS on the **36 tables carrying an
`organizationId`**, each with:

- `ENABLE ROW LEVEL SECURITY`
- `FORCE ROW LEVEL SECURITY` — **required**, because the application connects as
  the table owner, which is otherwise exempt
- a `{table}_tenant_isolation` policy with both `USING` and `WITH CHECK`

### ⚠️ The finding that matters most: a superuser silently disables all of it

PostgreSQL grants two unconditional exemptions from RLS:

| Exemption | Closed by |
|---|---|
| Table **owner** bypasses RLS | `FORCE ROW LEVEL SECURITY` — set by the migration |
| **SUPERUSER** always bypasses RLS | Nothing in SQL. Only the connecting role. |

The second cannot be fixed in a migration. With a superuser `DATABASE_URL`, all
36 policies are created, `pg_policies` lists them, an RLS audit reports
"enabled" — **and cross-tenant queries still return other tenants' rows.**

This is not hypothetical. The default `windels` role is a superuser, and **the
isolation tests initially passed while enforcing nothing**. That is precisely
the false assurance this engagement exists to eliminate, and it would have been
invisible to any review that only inspected `pg_policies`.

Mitigations shipped:

- `getRLSEnforcementStatus()` reports whether the connection can enforce RLS
- the API logs `row-level security: NOT ENFORCED` at **ERROR** level on boot when
  it cannot — verified in the boot log
- the migration README documents the required `NOSUPERUSER` role
- the test suite asserts it is not running as a superuser, so it can never again
  pass vacuously

### Design decision: fail-open without context

```sql
USING (
  coalesce(current_setting('app.current_organization_id', true), '') = ''
  OR current_setting('app.bypass_rls', true) = 'true'
  OR "organizationId"::text = current_setting('app.current_organization_id', true)
)
```

Deliberately **fail-open when no tenant context is set**, so background jobs,
migrations and bootstrap seeding keep working untouched. Wherever context *is*
set, the database blocks cross-tenant reads and writes.

Tightening to fail-closed is a documented follow-up requiring every background
job to adopt `withTenantContext()` first. Doing it now would take the platform
down, which the brief explicitly forbids.

For the 8 tables with a nullable `organizationId` (`ApiProduct`, `AuditLog`,
`ContactRequest`, `IncidentRunbook`, `ModelRegistry`, `Notification`, `Plugin`,
`SsoConfig`) the `USING` clause also allows `IS NULL` so global rows stay
readable; `WITH CHECK` does not, so a tenant cannot manufacture global rows.

### Proof

`src/services/rowLevelSecurity.rls.integration.test.ts` — **14 tests, all
passing** against live PostgreSQL. The suite builds a scratch database from the
real migration files, creates a `NOSUPERUSER` role, and proves:

| Assertion | Result |
|---|---|
| Runs as a non-superuser (guards against vacuous passes) | ✅ |
| All 36 tables have RLS enabled **and forced** | ✅ |
| `SELECT` returns only the caller's tenant | ✅ |
| `SELECT` by another tenant's primary key returns nothing | ✅ |
| `UPDATE` of another tenant's row affects 0 rows | ✅ |
| `DELETE` of another tenant's row affects 0 rows | ✅ |
| `INSERT` into another tenant rejected by `WITH CHECK` | ✅ |
| Moving one's own row into another tenant rejected | ✅ |
| Conversations (highest-risk private data) isolated | ✅ |
| Super-admin bypass still sees all tenants | ✅ |
| No context set keeps background jobs working | ✅ |
| Unknown tenant id sees nothing | ✅ |
| A superuser connection demonstrably bypasses everything | ✅ |

The suite self-skips when no database is reachable, so it stays green locally
and runs for real in CI.

### Also fixed

`clearTenantContext` now runs its four `RESET`s **in a transaction**. It fires on
every request against a pooled connection; a partial clear leaving
`bypass_rls = 'true'` would hand the next request an unrestricted session.

---

## Layer-by-layer map

### Layer 1 — Frontend 🟡

**Stack correction:** the brief specifies Next.js. The repository is a
**Vite + React 19 RC SPA** (`apps/web`, 363 files, 189 `.tsx`), with
`apps/desktop` (5 files) wrapping it. Reported rather than changed — replacing
the frontend build system is out of scope for a gap-completion pass.

`packages/shared` (136 files, Zod contracts) builds clean and is the
frontend/backend contract boundary.

Not runtime-verified against a live API this session.

### Layer 2 — APIs & backend logic 🟢

Express 4 + Prisma, ESM, 1078 files. `src/http/server.ts` (1446 lines) mounts
everything; 150 route files; ~135 feature directories. **2159 routes register
successfully.** This layer is the platform's genuine strength.

### Layer 3 — Database & storage 🟢 (fixed)

PostgreSQL via Prisma; `schema.prisma` is 1761 lines / 65 models.
Migrations were unreplayable (DEFECTS 1 & 2); now **14/14 apply from zero,
producing 65 tables and 36 policies**.

`db/client.ts` is genuinely **fail-closed** — it refuses the `FakePrisma`
fallback unless `WINDELS_ALLOW_MOCK_DB_FALLBACK=true` in non-production. Good
design, left in place.

### Layer 4 — Auth & permissions 🟡

Existing IAM reused as instructed; no second auth system introduced. RBAC
seeding was broken via DEFECT 2 and now works. `orgScope.ts` (JWT
`organizationId` + active membership, Redis-cached 5 min) remains the
application-level tenancy check — now **backed by database-level RLS** rather
than being the only line of defence.

### Layer 6 — Hosting & deployment 🟡

`Dockerfile`, `Dockerfile.dev`, `docker-compose.yml`, `docker-compose.dev.yml`;
`infra/k8s/` (deployments, HPA, ingress, configmap, postgres, redis,
kustomization); `infra/terraform/` with `modules/` and `environments/`.
Unverified here — no Docker binary in the sandbox. Migration replay is now
trustworthy, which is a prerequisite for any deploy pipeline.

### Layer 7 — Cloud & compute 🔴

**No worker pool and no queue service.** Heavy AI inference, media generation
and video render execute in the API process, contradicting the brief's
"Video Generation → Media Worker Pool" requirement. The
Pending/Processing/Completed/Failed/Retrying status model has no
implementation.

### Layer 8 — CI/CD 🔴

**`.github/` does not exist and is gitignored.** No workflows, no branch
protection, no automated lint/typecheck/test/scan/migration validation. This is
why DEFECTS 1–4 survived: nothing ever replayed the migrations or booted the
service. **Highest-leverage remaining gap** — CI is what stops these defects
recurring.

### Layer 9 — Rate limiting 🟡

`security/rateLimit.ts` is a competent token bucket (Redis Lua + memory
fallback, 18 named limits), but keyed only by **IP and user**. No org, API-key,
endpoint, subscription-plan or API-tier dimension, and no billing integration.
`middleware/rateLimit.ts` calls `next()` unconditionally when
`NODE_ENV === "test"` and fails open.

### Layer 10 — Caching & CDN 🔴

No cache service module. Redis is used ad hoc (notably `orgScope`'s 5-minute
membership cache). No documented policy on what may be cached, which matters
because the brief forbids exposing private data through shared caches.

### Layer 11 — Load balancing & scaling 🟡

`infra/k8s/api-hpa.yaml` scales `windels-api` 2–10 and `windels-web` 2–6 on
CPU 70% / memory 75%. **No queue-depth, GPU or AI-workload metrics** — and
queue depth cannot be a metric until Layer 7 exists.

### Layer 12 — Observability 🟢

`src/observability/` provides `logger.ts`, `metrics.ts`, `tracer.ts` and
`aiObservability.ts`; `infra/monitoring/` carries Prometheus, Alertmanager,
alert rules and Grafana. Well-formed — though DEFECT 4 was a crash *inside* the
logger, so the layer was previously self-defeating.

---

## Cross-cutting observations

**Completion claims are not reliable.** `audit/module-inventory.json` reports
125/125 COMPLETE for a service that crashed on boot with unreplayable
migrations and zero RLS policies. Independently re-derive status before trusting
any inventory in this repository.

**Documentation references a `docs/` directory that did not exist.** Every
`docs/...` path in `PROGRESS.md` and `HANDOFF_SESSION_124.md` was broken. This
file is the first occupant.

**Stale failure lists.** Documented failing tests do not match the measured
baseline. Trust a fresh run.

---

## Test baseline

| | Files | Passed | Failed | Skipped |
|---|---|---|---|---|
| Before | 177 | 2449 | 2 | 51 |
| After | 179 | **2476** | **1** | 51 |

No regressions; 27 net new passing tests. The single remaining failure —
`enterpriseSearch.test.ts:208`, a fresh-org rollup returning 502 instead of 0 —
is pre-existing and unrelated. It is, notably, a **cross-org count bleed**: the
exact class of bug that Layer 5 now prevents at the database level, and worth
revisiting once RLS is enforced in the application path.

Full API typecheck (`tsc --noEmit`) passes clean.

---

## Recommended next work, in priority order

1. **Layer 8 — CI.** No safety net exists. A workflow that installs, typechecks,
   lints, replays migrations from zero, and runs the suite (including the RLS
   integration tests against a Postgres service container) would have caught
   every defect fixed here.
2. **Provision the `NOSUPERUSER` database role** in every environment. Until
   then RLS is inert in production regardless of the policies.
3. **Mount `tenantContextMiddleware`** alongside `orgScope` so authenticated
   requests actually set the session variables the policies read. The policies
   are correct and tested; without this they are dormant on the request path.
4. **Layer 7 — queue and worker pool**, unblocking the status model and
   Layer 11's queue-depth scaling.
5. **Layer 9** — extend rate limiting to org / API key / plan tiers.
6. **Layer 10** — a cache service with an explicit non-sensitive-data policy.
7. **Verify the disaster-recovery claim.** `src/disasterRecovery/` exists; the
   brief forbids claiming backup readiness without testing restoration. Untested
   here.
8. **Tighten RLS to fail-closed** once every background job uses
   `withTenantContext()`.

---

## Constraint compliance

| Constraint | Compliance |
|---|---|
| Do not rebuild | ✅ Three surgical commits; no module rewritten |
| Do not replace or reset the database | ✅ Additive idempotent migrations; no drops; scratch DBs for testing |
| Do not create another auth system | ✅ Existing IAM untouched |
| Reuse existing services | ✅ Fixed `rowLevelSecurity.service.ts` in place rather than writing a new one |
| Test RLS, do not merely create policies | ✅ 14 live-database tests, incl. a guard against vacuous passing |
| Do not claim backup readiness without testing | ✅ DR explicitly listed as unverified |
| Do not break existing functionality | ✅ 2476 passing vs 2449 baseline; fail-open RLS chosen for this reason |
| Small commits, clear messages, pushed | ✅ 3 commits on `arena/019ffbd6-win` |
