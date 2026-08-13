# Row-Level Security — tenant isolation

This migration enables PostgreSQL row-level security on the **36 tables that
carry an `organizationId`** and attaches a `{table}_tenant_isolation` policy to
each one.

## ⚠️ Deployment requirement: the app must NOT connect as a superuser

PostgreSQL grants two unconditional exemptions from RLS:

| Exemption | Closed by |
|---|---|
| The table **owner** bypasses RLS | `FORCE ROW LEVEL SECURITY` — **set by this migration** |
| A **SUPERUSER** always bypasses RLS | Nothing in SQL. Only the connecting role matters. |

The second one cannot be fixed in a migration. If `DATABASE_URL` points at a
superuser, all 36 policies are created, `pg_policies` lists them, an RLS audit
reports "enabled" — **and cross-tenant queries still return other tenants' rows.**
The failure is completely silent, which is the most dangerous property a
security control can have.

This was observed in this repository: the default `windels` role is a superuser,
and the isolation tests initially "passed" while enforcing nothing.

### Required setup

```sql
CREATE ROLE windels_app LOGIN PASSWORD '<secret>' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA public TO windels_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO windels_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO windels_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO windels_app;
```

Then point the application's `DATABASE_URL` at `windels_app`. Keep migrations
running as the owner/superuser — DDL needs those rights, and migrations must be
able to bypass RLS.

The API checks this at boot via `getRLSEnforcementStatus()` and logs
`row-level security: NOT ENFORCED` at ERROR level when the connection role is a
superuser. Treat that log line as a production incident.

## The policy predicate

```sql
USING (
  coalesce(current_setting('app.current_organization_id', true), '') = ''
  OR current_setting('app.bypass_rls', true) = 'true'
  OR "organizationId"::text = current_setting('app.current_organization_id', true)
)
```

It is deliberately **fail-open when no tenant context is set**. Rationale:
background jobs, migrations and bootstrap seeding run without context, so this
migration cannot break existing functionality. Wherever context *is* set — every
authenticated request that passes through the tenant-context middleware — the
database blocks cross-tenant reads *and* writes.

Tightening this to fail-closed is a deliberate follow-up: every background job
must first adopt `withTenantContext()`. Doing it now would take the platform
down.

For the 8 tables whose `organizationId` is nullable (`ApiProduct`, `AuditLog`,
`ContactRequest`, `IncidentRunbook`, `ModelRegistry`, `Notification`, `Plugin`,
`SsoConfig`) the `USING` clause additionally allows `"organizationId" IS NULL`
so global/system rows stay readable. The `WITH CHECK` clause does **not**, so a
tenant cannot create global rows.

## Tests

`src/services/rowLevelSecurity.rls.integration.test.ts` — 14 tests against a
real PostgreSQL instance. It builds a scratch database from these migration
files, creates a `NOSUPERUSER` role, and asserts that cross-tenant `SELECT`,
`INSERT`, `UPDATE` and `DELETE` are all blocked, that super-admin bypass still
works, and that a superuser connection demonstrably bypasses everything.

```bash
RLS_TEST_DATABASE_URL=postgresql://user:pass@host:5432/postgres \
  npx vitest run src/services/rowLevelSecurity.rls.integration.test.ts
```

The suite self-skips when no database is reachable.
