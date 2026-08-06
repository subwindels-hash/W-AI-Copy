# SESSION 101 SPECIFICATION — ADMIN CONSOLE COMPLETION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S100, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Platform Administration
```

## 1. Objective

The existing Admin Utilities surface has working Prisma-backed RBAC helpers,
but the audit classified it as `PARTIAL`: its API/client contracts were
hand-copied and inconsistent, user pagination metadata was not aligned with
the client, the directory had no detail endpoint or role/status filters, there
was no dedicated admin page, and no service-level tests covered the isolation
and mutation guards.

Session 101 completes that surface without changing the underlying RBAC model:

1. shared `Adm` API contracts and Zod query/action schemas;
2. organization-scoped directory reads for admins and platform-wide reads for
   super admins;
3. real user detail, search, role and status filters with stable pagination;
4. audited suspension/reactivation and super-admin-only role changes;
5. self-protection: an actor cannot suspend or change their own role, and
   super-admin accounts cannot be suspended;
6. a dedicated Admin Console page with real loading/error/empty states, search,
   filters, pagination and guarded actions;
7. FakePrisma service tests proving the access-control rules without requiring
   a live Postgres instance.

The existing `/api/v1/admin/stats`, `/api/v1/admin/users`, suspension and role
routes remain compatible; the new user-detail route and optional filters are
additive.

## 2. Data contracts

`packages/shared/src/admin.ts` owns:

- `AdmStats`: `totalUsers`, `activeUsers`, `suspendedUsers`, `organizations`;
- `AdmUserRow`: id, email, lowercase public role, active/suspended state,
  created timestamp and nullable display-name profile;
- `AdmUserList`: user rows plus `{ page, perPage, total, totalPages }`;
- `AdmUserListQuerySchema`: search, role, status (`all | active | suspended |
  inactive`), page and per-page limits;
- `AdmSuspensionSchema` and `AdmRoleChangeSchema`.

## 3. API surface (`/api/v1/admin`, authenticated + admin RBAC)

| Method | Path | Purpose |
|---|---|---|
| GET | `/stats` | scoped user and organization counts |
| GET | `/users` | searchable, role/status-filtered paginated directory |
| GET | `/users/:id` | read one user only when visible in the actor's scope |
| POST | `/users/:id/suspension` | suspend/reactivate an in-scope non-self user |
| PATCH | `/users/:id/role` | super-admin-only role change |

Organization admins are restricted by `Membership`; super admins see the
platform scope. Mutations write real `AuditLog` records and continue to use
server-side authorization even when the UI disables unsafe controls.

## 4. UI surface

`/app` admin navigation now exposes `/admin` as **Admin Console**. The
protected `/admin` index renders `pages/admin/AdminPage.tsx`, which uses the
shared-typed `adminApi` client and provides:

- live stats cards;
- search, role/status filters and pagination;
- real user status and role badges;
- suspend/reactivate actions and super-admin role selection;
- honest loading, error and empty states;
- explicit audit/RBAC and self-action safety messaging.

The prior `AdminDashboard` component is retained additively for compatibility
with existing imports and historical dashboard references.

## 5. Verification gate

- `admin.test.ts` covers scoped stats, platform stats, directory pagination and
  filtering, cross-tenant read/mutation rejection, suspension audit rows,
  self/super-admin guards, role authorization/audit, and Zod contracts.
- `make verify` must pass with the offline Prisma generator; live Postgres,
  migration and end-to-end authorization checks remain runtime gates.
- The inventory may mark the module `COMPLETE` only after shared contracts,
  service, routes, client, dedicated page, tests and integration all exist.
