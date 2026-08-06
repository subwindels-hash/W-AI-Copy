# Session 102 Runtime Validation Checklist — Agent Framework

> **Status:** 🟡 pending target-environment execution. Run with live
> PostgreSQL 17, Redis 8 and a reachable Prisma runtime engine.

- [ ] Authenticated users from two organizations can list only their own AI
      employees; cross-tenant detail, update, delete, event, skill, memory and
      knowledge requests return `404`/authorization failure.
- [ ] `GET /api/v1/agents` returns `{ items, pagination }` and search/status
      filters produce correct totals and page counts.
- [ ] Creating an agent with a registered model succeeds; an unavailable model
      is rejected honestly rather than silently selecting a fabricated model.
- [ ] Built-in agents cannot be deleted; custom agents can be deleted only by
      a member of their owning organization.
- [ ] Suspend/lifecycle transitions follow the allowed state graph and invalid
      transitions fail without changing Prisma state.
- [ ] Lifecycle state/history persist under
      `agent:lifecycle:<org>:<agentId>` and
      `agent:lifecycle:history:<org>:<agentId>`; no new unscoped lifecycle keys
      are written.
- [ ] Run the Session 89 namespace audit and confirm both lifecycle namespaces
      are conforming for every organization.
- [ ] Memory, knowledge and skill actions create real rows/events and enforce
      the parent agent's organization scope.
- [ ] `/app/workforce` and `/m/agents` render persisted data after refresh;
      mobile empty-state actions navigate to the real Workforce Hub.
- [ ] Capture request IDs, authorization results, Redis audit output and this
      checklist before marking Session 102 🟢.

**Operator:** ____________________  **Environment:** ____________________

**Executed at (UTC):** ___________  **Release/commit:** ____________________
