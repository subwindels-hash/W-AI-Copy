# Session 103 Runtime Validation Checklist — AI Economy & GPU Capacity

> **Status:** 🟡 pending target-environment execution. Run with live
> PostgreSQL 17, Redis 8 and a reachable Prisma runtime engine.

- [ ] Authenticated non-admin users can read the dashboard, offers, usage and
      allocation records but receive `403` on all write/delete endpoints.
- [ ] Two organizations record usage, allocations and offers with identical
      provider/GPU values; each organization reads only its own rows.
- [ ] New records persist under `eco:usage:i:<org>:<id>`,
      `eco:allocation:i:<org>:<id>`, `eco:offer:i:<org>:<id>` and their org
      indexes. Run the Session 89 namespace audit and confirm all `eco:*`
      namespaces conform.
- [ ] If a pre-upgrade legacy blob exists, it migrates to individual records
      once and is removed; subsequent reads do not duplicate rows.
- [ ] Usage cost totals, department spend, observed credits, offer capacity,
      allocation utilization and run-rate forecast match the actual ledger
      rows after an API restart.
- [ ] Revenue, margin, credit earnings and marketplace volume remain visibly
      zero when no real billing/marketplace ledger is connected.
- [ ] Invalid resource/provider values, negative amounts, invalid utilization
      and malformed offer data are rejected by shared Zod validation.
- [ ] `/app/ai-economy` shows real data, labels the forecast as observed
      run-rate, and renders a read-only notice for non-admin users.
- [ ] Capture request IDs, RBAC results, Redis audit output and screenshots
      before marking Session 103 🟢.

**Operator:** ____________________  **Environment:** ____________________

**Executed at (UTC):** ___________  **Release/commit:** ____________________
