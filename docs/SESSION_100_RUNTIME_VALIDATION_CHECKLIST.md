# Session 100 Runtime Validation Checklist — Enterprise FinOps Depth

> **Status:** 🟡 pending target-environment execution. This sandbox has no live
> PostgreSQL/Redis and cannot download the Prisma runtime engine.
>
> Run against the deployed API with PostgreSQL 17, Redis 8 and a reachable
> Prisma engine. Do not mark Session 100 🟢 until every required check passes.

## 1. Environment and startup

- [ ] `NODE_ENV=production`, `WINDELS_DEMO_DATA=false` and production secrets
      are set; no demo records are created at startup.
- [ ] `prisma generate` completes with a runtime engine and migrations are
      applied without schema drift.
- [ ] API starts with live Postgres and Redis; `/healthz` reports both
      dependencies healthy.
- [ ] Authenticated user has an organization context; unauthenticated calls to
      `/api/v1/finops/*` return `401`.

## 2. Cost center and budget ledger

- [ ] Create a cost center through `POST /api/v1/finops/cost-centers`; verify
      the returned `efc-*` record persists after an API restart.
- [ ] Duplicate `code` within the same organization is rejected; the same code
      in a second organization is allowed.
- [ ] Create a budget through `POST /api/v1/finops/budgets`; verify period end
      must be after period start and the budget currency matches its center.
- [ ] Archive the center; new budgets/costs/allocations for it are rejected,
      while historical rows remain readable.

## 3. Actual cost and allocation ledger

- [ ] Record a provider-import cost with integer `amountMinor`; verify the
      source observation is stored once and no allocation appears unless a
      center was explicitly supplied.
- [ ] Record a direct cost with `costCenterId`; verify exactly one direct
      allocation row is created for the actual amount.
- [ ] Split a shared cost across two centers with proportional/usage drivers;
      verify `sum(allocation.amountMinor) <= cost.amountMinor` is enforced.
- [ ] Attempt an over-allocation, cross-currency allocation and cross-tenant
      cost/center reference; each fails with a non-success response and leaves
      no invalid ledger row.
- [ ] Delete a cost and verify its allocation rows are removed; deleting a
      center with budgets or allocations is rejected.

## 4. Computed chargebacks and tenant isolation

- [ ] `GET /api/v1/finops/chargebacks` shows actual, budget, variance,
      utilization, status and method totals computed from the ledger.
- [ ] Verify status thresholds: `no_budget`, `on_track`, `warning` at 80% or
      above, and `over` above 100%.
- [ ] Verify `from`/`to` chargeback filters use `occurredAt` and exclude costs
      outside the requested window.
- [ ] `GET /api/v1/finops/dashboard/rollup` reports cost, allocated,
      unallocated and active-budget totals per currency; repeated reads with
      unchanged records have identical numeric values.
- [ ] Authenticate as organization B and prove it cannot read, update, delete,
      allocate or include organization A's cost centers, budgets, costs or
      allocations. Run the Session 89 tenant-isolation audit and confirm all
      `efo:*` namespaces are conforming.

## 5. Demo gate and closeout

- [ ] With `WINDELS_DEMO_DATA=false`, `org-demo-efo` remains empty.
- [ ] In an isolated demo environment only, set `WINDELS_DEMO_DATA=true`; verify
      the seed creates 3 centers, 3 budgets, 3 costs and 4 allocations once and
      the second bootstrap is a no-op.
- [ ] Capture API request IDs, Redis namespace audit output, migration result,
      screenshots of the FinOps page and this checklist in the release record.
- [ ] Only after all checks pass, change the Session 100 row in `PROGRESS.md`
      from 🟡 VERIFIED (partial) to 🟢 PRODUCTION COMPLETE.

**Runtime operator:** ____________________  **Environment:** ____________________

**Executed at (UTC):** __________________  **Release/commit:** ____________________

**Result / incident links:** ______________________________________________________
