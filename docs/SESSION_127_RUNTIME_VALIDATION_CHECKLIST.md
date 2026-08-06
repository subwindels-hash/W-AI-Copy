# Session 127 Runtime Validation Checklist — Quantum Computing (`quantum`) & 100% Module Completion

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 127 stays 🟡 VERIFIED (partial).

The unit suites and guard tests prove that `quantum` generates zero synthetic data when `WINDELS_DEMO_DATA` is unset, and that all 108 modules in the repository are **COMPLETE**; only a live deployment proves the `q:*` Redis keyspace, quantum cloud backend connectors, and live Postgres database migrations behave as assumed.

---

## 1. Quantum Readiness & Connector Gating (`quantum`)

- [ ] With `WINDELS_DEMO_DATA` unset, a new organization querying `GET /api/v1/quantum/dashboard/rollup` receives an honest empty inventory (`cryptoInventory: 0`, `vulnerableCount: 0`, `migratedCount: 0`, `readiness: null`/unmeasured) without auto-generating random vulnerable systems.
- [ ] With `WINDELS_DEMO_DATA` unset, `GET /api/v1/quantum/connectors` returns unconfigured vendor connectors with static status `"disconnected"`, `queueDepth: 0`, and `qubitsAvailable: 0`.
- [ ] With `WINDELS_DEMO_DATA=true` explicitly set, `GET /api/v1/quantum/dashboard/rollup` seeds demo inventory and reports `synthetic: true` / `demoData: true`.
- [ ] Submitting a hybrid optimization job via `POST /api/v1/quantum/jobs` records the job in `q:j:<org>:<id>` and `q:js:<org>` without inventing fabricated objective values before execution.
- [ ] All nine `/api/v1/quantum/*` endpoints refuse anonymous callers (`401 Unauthorized`) and enforce organization scoping (`403 Forbidden` if no org scope).

---

## 2. 100% Module Completion Audit (108/108 COMPLETE)

- [ ] Run `node audit/build-inventory.mjs` against the production build artifact and confirm:
  - `COMPLETE`: **108**
  - `PARTIAL`: **0**
  - `STUB`: **0**
  - `DEMO DATA`: **0**
  - `TOTAL`: **108**
- [ ] Verify no module reports `mathRandom: true`, `ungatedSeed: true`, or `liveRng: true` in `audit/module-inventory.json`.
- [ ] Verify every module in the inventory has:
  - `routeCount >= 5` (except singular utility/gateway rollups where designed)
  - Dedicated service file / directory
  - Shared TypeScript types / Zod contract (`@windels/shared`)
  - Web client integration (`@windels/web`)
  - Co-located unit tests and/or E2E spec

---

## 3. Full Runtime-Validation Sequence (Sessions 1–127)

- [ ] Verify native Prisma Client binaries generate successfully using `pnpm db:generate` against `binaries.prisma.sh` (or internal mirror).
- [ ] Run `npx prisma migrate status` against live PostgreSQL 17 to ensure 0 pending migrations and 0 schema drift.
- [ ] Execute the Session 89 tenant isolation sweep (`TenantIsolationService.runCompliance`) against Redis 8 and assert 0 leaked keys across all 108 catalogued namespaces.
- [ ] Run the complete E2E Playwright test suite against the booted production server and confirm all integration tests pass.
- [ ] Sign and archive this checklist to upgrade repository certification state from 🟡 **VERIFIED (partial)** to 🟢 **PRODUCTION COMPLETE**.
