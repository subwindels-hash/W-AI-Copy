# SESSION 103 SPECIFICATION — AI ECONOMY & GPU CAPACITY LEDGER COMPLETION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S102, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: AI Infrastructure & FinOps
```

## 1. Objective

The Session 71 AI Economy surface had a useful empty-safe dashboard and two
write endpoints, but its records lived in organization JSON blobs, compute
offers were always empty, there was no dedicated UI, no shared request
contracts, and no service-level tests. Session 103 completes it as a real
org-scoped capacity and usage ledger without fabricating a billing economy.

1. **Usage ledger** — individual resource observations for GPU, CPU, RAM,
   storage, bandwidth or tokens, with quantity, unit, integer cost cents,
   department and recorded time.
2. **GPU allocation ledger** — individual cluster/GPU allocation observations
   with utilization, VRAM, job, owner and hourly cost.
3. **Compute offers** — administrator-recorded provider capacity observations;
   the platform never invents provider offers or availability.
4. **Computed dashboard** — spend, observed resource credits, department
   aggregation, capacity availability, allocation utilization and a clearly
   labeled observed 30-day run-rate projection.
5. **Honest missing economics** — revenue, credit earnings, margin and
   marketplace volume remain zero until real billing/marketplace ledgers are
   integrated. They are not inferred from cost or usage.
6. **Tenant isolation** — all new records use fail-closed org-scoped keys and
   are registered in the Session 89 namespace catalog. Existing legacy blobs
   are migrated only after their organization-qualified key is read.

## 2. Storage model

Keys follow the monorepo convention:

- `eco:meta:i:<org>:ledger`
- `eco:usage:i:<org>:<id>` + `eco:usage:idx:<org>`
- `eco:allocation:i:<org>:<id>` + `eco:allocation:idx:<org>`
- `eco:offer:i:<org>:<id>` + `eco:offer:idx:<org>`

Each record stores `organizationId` and reads re-check ownership. IDs use
`node:crypto` UUIDs. The previous `eco:<org>:usage` and
`eco:<org>:allocations` blobs are read once for migration, converted into
individual records and removed; new writes never use those blobs.

## 3. Shared contracts and API

`packages/shared/src/aiEconomy.ts` owns the `AiEconomy*` Zod contracts and
shared `AiUsageEntry`, `ComputeOffer`, `GpuAllocation`, `ResourceUsage` and
`EconomyDashboard` types.

The authenticated `/api/v1/ai-economy` surface is:

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/rollup` | computed org dashboard |
| GET/POST/DELETE | `/usage` and `/usage/:id` | list, administrator-record and delete usage observations |
| GET/POST/DELETE | `/allocations` and `/allocations/:id` | list, administrator-record and delete GPU allocations |
| GET/POST/PATCH/DELETE | `/offers` and `/offers/:id` | list and administrator-manage real capacity offers |

Dashboard/GET paths require authentication; writes require admin RBAC.

## 4. UI

`/app/ai-economy` renders the dedicated AI Economy & GPU Cloud page. It
provides:

- observed resource/cost/capacity/allocation cards;
- honest revenue/margin/marketplace-zero explanations;
- real observed run-rate forecast labeling;
- capacity offer, usage and allocation forms for administrators;
- read-only notices for non-admin users;
- department usage and allocation ledger views.

The existing PlatformPage AI Economy tab remains additive and consumes the
same `ecoApi.dashboard()` data.

## 5. Verification gate

- `apps/api/src/aiEconomy/aiEconomy.test.ts` covers 12 cases: record keys,
  cross-tenant reads, allocations/offers CRUD, empty honesty, dashboard math,
  deterministic values, no fabricated revenue, legacy migration, deletion and
  Zod contracts.
- Existing `usage/rollups.test.ts` remains green.
- `make verify` must pass with offline Prisma generation; live Postgres/Redis
  and provider capacity validation remain runtime gates.
- The inventory may mark AI Economy `COMPLETE` only after shared contracts,
  ledger service/routes, typed client, dedicated UI, tests and isolation
  registration are present.
