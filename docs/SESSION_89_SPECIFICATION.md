# SESSION 89 SPECIFICATION — TENANT ISOLATION & CROSS-TENANT DATA GOVERNANCE

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S88, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Chief Information Security Officer
```

---

## 1. OBJECTIVES & ARCHITECTURE

WINDELS AI OS hosts many organizations (tenants) on a single cluster, so the
single highest-severity failure mode is one tenant reading or exporting another
tenant's data. Session 89 adds a first-class, observable governance surface for
that guarantee:

1. **Per-org isolation policies** — real, Redis-backed, stored under
   org-scoped keys (`ti:policy:<orgId>`), so the store itself obeys the rule it
   enforces.
2. **Live namespace audit** — scans real Redis namespaces and flags any
   org-scoped namespace whose keys are missing the org segment (a leak risk).
3. **Real cross-tenant self-tests** — write a sentinel under org A and prove org
   B cannot read it. Verdicts are measured, never fabricated.
4. **Export gate** — a callable check that blocks moving data outside the tenant
   boundary unless the org policy opts in.

```
                    TENANT ISOLATION GOVERNANCE
                    ----------------------------
   [org policy]  ->  ti:policy:<orgId>   (org-scoped store)
   [namespace audit] -> SCAN redis keys -> flag missing org segment
   [self-tests]  ->  write sentinel in org A -> assert org B blind -> delete
   [export gate] ->  allowCrossTenantExport ? allow : block  (+ Kernel event)
```

---

## 2. ISOLATION POLICY

### 2.1 Fields (all real, all persisted per org)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `allowCrossTenantExport` | boolean | `false` | Whether data may leave the tenant |
| `allowExternalSharing` | boolean | `false` | Whether data may be shared externally |
| `piiRedactionLevel` | `none\|basic\|strict` | `basic` | Required PII handling |
| `retentionDays` | int (1..3650) | `365` | Data retention period |
| `regionPin` | string \| optional | — | Optional regional data residency |

Defaults are **isolated-by-default**: an org that never sets a policy is already
denied cross-tenant export and external sharing.

### 2.2 Storage

- Write/read through `ti:policy:<orgId>`. The org id is a key segment, so a
  policy for org A is never addressable as org B's policy.

---

## 3. NAMESPACE AUDIT (REAL)

The audit walks a catalog of known Redis namespaces (`cam:*`, `etl:*`, `ti:*`,
`org:membership`, …). For each `org_scoped` namespace it fetches its keys and
counts how many carry the org segment. Keys that are missing it are reported as
`leakedKeys` and produce a **high** finding. `shared`/`infra` namespaces are
reported but expected to be global. The audit only counts what is really in
Redis — it never invents key counts.

## 4. CROSS-TENANT SELF-TESTS (MEASURED, NOT FABRICATED)

| Probe | What it does | Passes when |
|---|---|---|
| `org-scoped redis key isolation` | writes a sentinel under `cam:feed:<orgA>:probe` | org B's slot reads empty |
| `cross-tenant policy isolation` | sets a distinctive policy for org A | org B still reads its default |

Both probes clean up their sentinel keys on completion and record a measured
`durationMs`. Any failed probe fails the run and emits a **high** finding.

## 5. EXPORT GATE

`POST /api/v1/tenant-isolation/export-check` evaluates `allowCrossTenantExport`.
On allow it returns 200 and emits `tenant-isolation.export.allowed`; on block it
returns 403 and emits `tenant-isolation.export.blocked`. Other modules should
call this before moving data out of the tenant boundary.

## 6. COMPLIANCE SCORE & VERDICT (REAL)

- Score starts at 100 and is reduced per real finding (high −25, medium −10,
  low −5), clamped to 0..100.
- Verdict: `compliant` if no high findings and all probes pass; `review_required`
  if any medium finding; `failed` if any high finding or probe failure.
- Runs are stored (`ti:run:<orgId>:<id>`, capped at 50/org) and surfaced in
  the UI history.

## 7. DELIVERY CHECKLIST (IMPLEMENTED → BUILT → TESTED → VERIFIED → INTEGRATED)

| Stage | Evidence |
|---|---|
| IMPLEMENTED | `packages/shared/src/tenantIsolation.ts` types + Zod schemas |
| BUILT | `apps/api/src/tenantIsolation/tenantIsolation.service.ts` + route `apps/api/src/http/routes/tenantIsolation.ts` mounted at `/api/v1/tenant-isolation` |
| TESTED | `apps/api/src/tenantIsolation/tenantIsolation.test.ts` (policy round-trip, namespace audit leak detection, cross-tenant probes, export gate) |
| VERIFIED | `pnpm typecheck` / `pnpm test` green for affected packages |
| INTEGRATED | Web client `apps/web/src/lib/tenantIsolation.ts`, dashboard `apps/web/src/pages/admin/TenantIsolationPage.tsx`, route `/app/tenant-isolation`, sidebar entry |

## 8. HONESTY GUARDRAILS

- No `Math.random()` in live code paths (uses `node:crypto` `randomUUID` for ids).
- No fabricated verdicts: every score/verdict derives from measured probes and
  real Redis scans.
- Sentinel probe keys use the `__probe_*` org namespace and are deleted on
  completion, so audits don't self-pollute.
