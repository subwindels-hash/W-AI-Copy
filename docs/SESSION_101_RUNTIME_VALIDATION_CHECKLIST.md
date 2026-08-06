# Session 101 Runtime Validation Checklist — Admin Console

> **Status:** 🟡 pending target-environment execution. Run with live
> PostgreSQL 17, Redis 8 and a reachable Prisma runtime engine.

- [ ] An unauthenticated request to `/api/v1/admin/stats` returns `401`.
- [ ] A normal user cannot access `/api/v1/admin/*` and is redirected away from
      `/admin` by the web route guard.
- [ ] An organization admin sees only users with a membership in the active
      organization; a user from a second organization is absent from list and
      detail endpoints.
- [ ] A super admin sees platform-wide counts and can read users across
      organizations.
- [ ] Search, role/status filters and pagination return matching real rows and
      correct `totalPages` metadata.
- [ ] Organization admin suspension/reactivation changes `isSuspended` and
      `isActive`, creates the corresponding `AuditLog`, and cannot suspend
      themselves or a super admin.
- [ ] Only a super admin can change a role; self-role changes are rejected and
      the role-change audit record is written.
- [ ] Refreshing the Admin Console reflects the persisted state; loading,
      empty, authorization-error and failed-action states are visible honestly.
- [ ] Run the Session 89 tenant/RBAC audit and attach request IDs, audit rows
      and screenshots to the release record before marking Session 101 🟢.

**Operator:** ____________________  **Environment:** ____________________

**Executed at (UTC):** ___________  **Release/commit:** ____________________
