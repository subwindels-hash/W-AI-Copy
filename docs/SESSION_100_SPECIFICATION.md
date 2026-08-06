# SESSION 100 SPECIFICATION — ENTERPRISE FINOPS DEPTH: BUDGETS, CHARGEBACKS & COST ALLOCATION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-06
Status: AUTHORITATIVE (additive session — extends S1–S99, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: CFO / FinOps Platform
```

---

## 1. OBJECTIVES & ARCHITECTURE

The existing Session 31 Enterprise Foundation FinOps service provides a
useful platform-wide provider/anomaly/optimization dashboard. It is not an
organization-scoped accounting layer and cannot answer the operational
questions required for enterprise showback:

- Which internal cost center owns a real cloud or platform cost?
- What budget was approved for that center and period?
- How much of a shared cost was allocated to each owner, and by which driver?
- What is the live budget variance, utilization and unallocated amount?

Session 100 adds that missing depth as a new additive module. It does not
rewrite the historical global FinOps service. The new module is mounted at
`/api/v1/finops` and has its own `efo:*` org-scoped namespaces.

1. **Cost centers** — org-owned chargeback destinations with a unique code,
   owner, status and locked accounting currency.
2. **Budget register** — period-bounded budgets linked to a cost center;
   integer minor currency units preserve accounting precision.
3. **Actual cost ledger** — provider/meter observations stored once with a
   real amount, service, category, source, occurrence time and tags. A cost
   is not silently treated as a chargeback.
4. **Allocation ledger** — immutable rows link a real cost to one or more
   centers (`direct`, `shared`, `usage`, or `proportional`). The service
   rejects allocations whose sum exceeds the source cost and rejects
   cross-organization or cross-currency references.
5. **Computed chargebacks** — per-center statements are derived on every read
   from the cost, allocation and budget ledgers. They include actuals,
   budget, variance, utilization, status, cost count and method totals.
6. **Computed rollup** — counts and totals are derived per read, including
   unallocated actual cost by currency. No rollup or chargeback is stored as a
   second source of truth.
7. **Tenant isolation by construction** — every record key includes the
   organization segment, every read re-checks ownership, and all four
   namespaces are registered in the Session 89 audit catalog.

```
                       ENTERPRISE FINOPS DEPTH
                       ------------------------
   [cost centers] -> efo:center:i:<org>:<id>
   [budgets]      -> efo:budget:i:<org>:<id>
   [cost ledger]  -> efo:cost:i:<org>:<id>
   [allocations]  -> efo:allocation:i:<org>:<id>
   [chargebacks]  -> computed from the four ledgers; never persisted
```

## 2. DATA MODEL

All shared types and Zod request contracts live in
`packages/shared/src/enterpriseFinOps.ts` and are prefixed `Efo`.

### 2.1 Cost center

`EfoCostCenter` is `{ id: efc-*, organizationId, name, code, owner,
currency, status, createdAt, updatedAt }`. `code` is unique within the
organization. `status` is `active | archived`. Once a center has budgets or
allocations, its currency cannot be changed; this prevents silent
cross-currency accounting.

### 2.2 Budget

`EfoBudget` is linked to one cost center and contains `period`
(`monthly | quarterly | annual | custom`), an explicit `periodStart` and
`periodEnd`, `amountMinor` (non-negative integer), currency, status
(`active | closed`) and optional notes. The service validates that the end is
after the start and that the currency matches the center.

### 2.3 Actual cost

`EfoCostEntry` is `{ id: efcost-*, organizationId, provider, category,
service, amountMinor, currency, occurredAt, source, description, tags,
createdAt }`. Providers include AWS, GCP, Azure, WINDELS, on-premises and
other. Sources are `manual | provider_import | metered | adjustment`.
`amountMinor` is an integer: for USD, `1050` means `$10.50`.

The create API accepts an optional `costCenterId` convenience field. When it
is present, the service creates a full direct allocation row; the stored cost
record remains the provider observation, not a duplicated chargeback.

### 2.4 Allocation ledger row

`EfoAllocation` is `{ id: efa-*, organizationId, costId, costCenterId,
amountMinor, currency, method, driver, createdBy, createdAt }`. A cost may be
split across centers, but the sum of its allocation rows may never exceed its
real amount. A cost can remain partially or entirely unallocated until a
shared-cost driver is recorded.

### 2.5 Computed chargeback and rollup

`EfoChargeback` is computed per center and currency:

- `budgetMinor`, `actualMinor`, `varianceMinor` (`budget - actual`)
- `utilizationPct` (rounded to two decimals)
- `status`: `no_budget | on_track | warning (>=80%) | over (>100%)`
- `costCount`, `allocationCount`, and `byMethod`

`EfoRollup` contains counts, `totalsByCurrency` (`costMinor`,
`allocatedMinor`, `unallocatedMinor`, `budgetMinor`), chargebacks, up to eight
recent costs and `lastUpdatedAt`. All values are recomputed from live Redis
records on every read.

## 3. HONESTY, PRECISION & ISOLATION RULES

- No `Math.random` is used. IDs come from `node:crypto` CSPRNG UUIDs.
- No floating-point money is persisted. Amounts are bounded integer minor
  units and currencies are explicit three-letter codes.
- Chargeback and budget status are deterministic projections, not fabricated
  verdicts. A fresh org returns empty lists and zero counts.
- Shared/demo records are synthetic only when `WINDELS_DEMO_DATA=true`; the
  demo org is `org-demo-efo` and the seed is idempotent.
- `readOwned` returns null when an org-scoped record is absent or its stored
  organization does not match the requested org. References (center,
  budget, cost, allocation) are checked in the same organization.
- Currency mismatches, invalid periods and over-allocation fail closed with
  explicit service errors. No automatic FX conversion is implied.

## 4. API SURFACE (`/api/v1/finops`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/rollup` | computed counts, currency totals and chargebacks |
| GET/POST | `/cost-centers` | list / create cost centers |
| GET/PATCH/DELETE | `/cost-centers/:id` | read / update / delete an unused center |
| GET/POST | `/budgets` | list / create budgets |
| GET/PATCH/DELETE | `/budgets/:id` | read / update / delete a budget |
| GET/POST | `/costs` | list / record actual cost entries |
| GET/DELETE | `/costs/:id` | read / delete a cost and its allocations |
| GET/POST | `/allocations` | list / add allocation ledger rows |
| DELETE | `/allocations/:id` | remove an allocation ledger row |
| GET | `/chargebacks` | computed statements; optional `costCenterId`, `from`, `to` filters |

## 5. DEMO DATA POLICY

Production and fresh organizations start empty. With
`WINDELS_DEMO_DATA=true`, `apps/api/src/enterpriseFinOps/bootstrap.ts` seeds
`org-demo-efo` once with three centers, three monthly budgets, three actual
cost entries, and four allocation rows (including a shared proportional
allocation). The demo values are explicitly synthetic and do not populate a
real customer organization.

## 6. DELIVERY SLICE

1. `docs/SESSION_100_SPECIFICATION.md`
2. `packages/shared/src/enterpriseFinOps.ts` (+ index export)
3. `apps/api/src/enterpriseFinOps/enterpriseFinOps.service.ts` and gated bootstrap
4. `apps/api/src/http/routes/enterpriseFinOps.ts` + `/finops` server wiring + index bootstrap
5. `tenantIsolation.service.ts` — register `efo:center`, `efo:budget`, `efo:cost`, `efo:allocation`
6. `apps/web/src/lib/enterpriseFinOps.ts` + `pages/finops/EnterpriseFinOpsPage.tsx` + router + sidebar
7. `apps/api/src/enterpriseFinOps/enterpriseFinOps.test.ts`
8. Decision log, `PROGRESS.md`, `docs/CHANGELOG.md`, `README.md`,
   `project-understanding.md`, and regenerated module inventory

## 7. DEFINITION OF DONE

- [ ] `make verify` passes in the repository's offline Prisma environment.
- [ ] Cost center, budget, cost and allocation CRUD paths are org-scoped and
      cross-tenant tests prove org B cannot read org A's ledgers.
- [ ] Allocation conservation, currency checks and budget period validation
      are tested.
- [ ] Chargebacks and rollups are recomputed from real records with stable
      numeric values; no read-path random data or fake verdicts.
- [ ] Demo seed is gated and idempotent.
- [ ] Web UI renders live API data, shows minor-unit precision honestly, and
      labels the computed chargeback projection.
- [ ] Runtime validation with live Postgres 17 + Redis remains pending in this
      sandbox, so the session is recorded as 🟡 VERIFIED (partial).
