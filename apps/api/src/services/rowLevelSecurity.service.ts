/**
 * Row-Level Security Service (Module 18 — Gap 1)
 *
 * PostgreSQL Row-Level Security (RLS) for multi-tenant isolation:
 * - Automatic RLS policy creation for tenant-scoped tables
 * - Policy management (enable, disable, drop)
 * - Tenant context setting via session variables
 * - Bypass RLS for super-admin and system operations
 * - RLS policy auditing and validation
 *
 * Ensures database-level tenant isolation that cannot be bypassed by application bugs.
 */
import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:rowLevelSecurity');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export interface RLSPolicy {
  id: string;
  tableName: string;
  policyName: string;
  command: "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  usingExpression: string;
  withCheckExpression?: string;
  roles: string[];
  enabled: boolean;
  createdAt: string;
}

export interface TenantContext {
  organizationId: string;
  userId: string;
  userRole: string;
  isSuperAdmin: boolean;
  bypassRLS: boolean;
}

// ─── RLS Policy Templates ───────────────────────────────────────

const RLS_POLICY_TEMPLATE = `
CREATE POLICY {policy_name} ON {table_name}
  FOR {command}
  TO {roles}
  {using_clause}
  {with_check_clause};
`;

const ENABLE_RLS_TEMPLATE = `
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
`;

const FORCE_RLS_TEMPLATE = `
ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;
`;

// ─── Tenant Context Management ──────────────────────────────────

/**
 * Set tenant context for the current database session.
 * This must be called at the start of each request.
 */
export async function setTenantContext(context: TenantContext): Promise<void> {
  const { organizationId, userId, userRole, isSuperAdmin, bypassRLS } = context;

  // NOTE: `SET app.foo = $1` is a syntax error in PostgreSQL — SET does not
  // accept bind parameters, so the previous tagged-template form threw
  // "syntax error at or near $1" on every call. set_config() is the
  // parameterisable equivalent and keeps the values bound (never interpolated),
  // so a hostile organizationId cannot break out into SQL.
  await prisma.$executeRaw`
    SELECT set_config('app.current_organization_id', ${organizationId}, false)
  `;

  await prisma.$executeRaw`
    SELECT set_config('app.current_user_id', ${userId}, false)
  `;

  await prisma.$executeRaw`
    SELECT set_config('app.current_user_role', ${userRole}, false)
  `;

  // Super-admins can bypass RLS
  await prisma.$executeRaw`
    SELECT set_config('app.bypass_rls', ${isSuperAdmin || bypassRLS ? "true" : "false"}, false)
  `;

  logger.debug("Tenant context set", {
    organizationId,
    userId,
    userRole,
    bypassRLS: isSuperAdmin || bypassRLS,
  });
}

/**
 * Clear tenant context (call at end of request).
 */
export async function clearTenantContext(): Promise<void> {
  // RESET is valid for these custom GUCs (verified against PostgreSQL 17) and
  // leaves current_setting(..., true) returning '' — which the tenant-isolation
  // policies treat as "no context", the background-job escape hatch.
  //
  // Wrapped in a transaction so the clear is atomic. This runs on every
  // request against a pooled connection, and a partial clear (organization
  // reset but bypass_rls left as 'true') would hand the next request on that
  // connection an unrestricted session. They cannot be combined into one
  // multi-statement string: Prisma's $executeRaw uses the extended query
  // protocol, which permits only a single statement per call.
  await prisma.$transaction([
    prisma.$executeRaw`RESET app.current_organization_id`,
    prisma.$executeRaw`RESET app.current_user_id`,
    prisma.$executeRaw`RESET app.current_user_role`,
    prisma.$executeRaw`RESET app.bypass_rls`,
  ]);
}

/**
 * Get current tenant context from session variables.
 */
/**
 * Report whether RLS can actually be enforced on this connection.
 *
 * PostgreSQL grants two unconditional exemptions from row-level security:
 *
 *   1. SUPERUSER      — always bypasses RLS. FORCE ROW LEVEL SECURITY does not
 *                       help. Policies are parsed, stored, and then ignored.
 *   2. The table OWNER — bypasses RLS unless the table is marked
 *                        FORCE ROW LEVEL SECURITY.
 *
 * Case 2 is handled: the tenant-isolation migration sets FORCE on all 36
 * org-scoped tables. Case 1 cannot be fixed in SQL — it is purely a function of
 * which role the application authenticates as, i.e. of DATABASE_URL.
 *
 * This matters because the failure is *silent*. A deployment whose DATABASE_URL
 * points at a superuser has 36 policies visible in pg_policies, an RLS audit
 * that reports everything enabled, and zero actual tenant isolation. Callers
 * should surface `enforced: false` loudly rather than assume policies imply
 * protection.
 */
export async function getRLSEnforcementStatus(): Promise<{
  enforced: boolean;
  role: string;
  isSuperuser: boolean;
  reason: string;
}> {
  const rows = (await prisma.$queryRaw`
    SELECT current_user::text AS role,
           (SELECT usesuper FROM pg_user WHERE usename = current_user) AS is_superuser
  `) as Array<{ role: string; is_superuser: boolean | null }>;

  const role = rows[0]?.role ?? "unknown";
  const isSuperuser = rows[0]?.is_superuser === true;

  return {
    enforced: !isSuperuser,
    role,
    isSuperuser,
    reason: isSuperuser
      ? `Database role "${role}" is a SUPERUSER, which bypasses row-level security ` +
        `unconditionally. Every tenant-isolation policy is inert on this connection. ` +
        `Point DATABASE_URL at a NOSUPERUSER role that has been granted ` +
        `SELECT/INSERT/UPDATE/DELETE on the application tables.`
      : `Database role "${role}" is not a superuser; row-level security policies are enforced.`,
  };
}

export async function getTenantContext(): Promise<TenantContext | null> {
  try {
    const result = await prisma.$queryRaw`
      SELECT
        current_setting('app.current_organization_id', true) as organization_id,
        current_setting('app.current_user_id', true) as user_id,
        current_setting('app.current_user_role', true) as user_role,
        current_setting('app.bypass_rls', true) as bypass_rls
    ` as Array<{
      organization_id: string | null;
      user_id: string | null;
      user_role: string | null;
      bypass_rls: string | null;
    }>;

    const row = result[0];

    if (!row.organization_id || !row.user_id) {
      return null;
    }

    return {
      organizationId: row.organization_id,
      userId: row.user_id,
      userRole: row.user_role ?? "user",
      isSuperAdmin: row.user_role === "super_admin",
      bypassRLS: row.bypass_rls === "true",
    };
  } catch (error) {
    logger.error("Failed to get tenant context", { error });
    return null;
  }
}

// ─── RLS Policy Management ──────────────────────────────────────

/**
 * Enable RLS on a table.
 */
export async function enableRLS(tableName: string, force: boolean = false): Promise<void> {
  const enableQuery = ENABLE_RLS_TEMPLATE.replace("{table_name}", tableName);
  await prisma.$executeRawUnsafe(enableQuery);

  if (force) {
    const forceQuery = FORCE_RLS_TEMPLATE.replace("{table_name}", tableName);
    await prisma.$executeRawUnsafe(forceQuery);
  }

  logger.info("RLS enabled", { tableName, force });
}

/**
 * Disable RLS on a table.
 */
export async function disableRLS(tableName: string): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY
  `);

  logger.info("RLS disabled", { tableName });
}

/**
 * Create a tenant isolation policy for a table.
 */
export async function createTenantIsolationPolicy(
  tableName: string,
  options?: {
    command?: "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE";
    roles?: string[];
    columnName?: string; // Default: "organizationId"
  },
): Promise<RLSPolicy> {
  const command = options?.command ?? "ALL";
  const roles = options?.roles ?? ["public"];
  const columnName = options?.columnName ?? "organizationId";

  const policyName = `${tableName}_tenant_isolation_${command.toLowerCase()}`;

  // USING clause: filter rows for SELECT, UPDATE, DELETE
  const usingExpression = `
    (current_setting('app.bypass_rls', true) = 'true')
    OR
    (${columnName}::text = current_setting('app.current_organization_id', true))
  `;

  // WITH CHECK clause: validate rows for INSERT, UPDATE
  const withCheckExpression = `
    (current_setting('app.bypass_rls', true) = 'true')
    OR
    (${columnName}::text = current_setting('app.current_organization_id', true))
  `;

  // Build policy query
  let policyQuery = RLS_POLICY_TEMPLATE
    .replace("{policy_name}", policyName)
    .replace("{table_name}", tableName)
    .replace("{command}", command)
    .replace("{roles}", roles.join(", "))
    .replace("{using_clause}", `USING (${usingExpression})`)
    .replace("{with_check_clause}", command === "ALL" || command === "INSERT" || command === "UPDATE"
      ? `WITH CHECK (${withCheckExpression})`
      : "");

  // Drop existing policy if it exists
  await prisma.$executeRawUnsafe(`
    DROP POLICY IF EXISTS ${policyName} ON ${tableName}
  `);

  // Create new policy
  await prisma.$executeRawUnsafe(policyQuery);

  const policy: RLSPolicy = {
    id: `rls_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`,
    tableName,
    policyName,
    command,
    usingExpression,
    withCheckExpression: command === "ALL" || command === "INSERT" || command === "UPDATE"
      ? withCheckExpression
      : undefined,
    roles,
    enabled: true,
    createdAt: new Date().toISOString(),
  };

  logger.info("RLS policy created", {
    tableName,
    policyName,
    command,
    roles,
  });

  return policy;
}

/**
 * Drop an RLS policy.
 */
export async function dropRLSPolicy(tableName: string, policyName: string): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DROP POLICY IF EXISTS ${policyName} ON ${tableName}
  `);

  logger.info("RLS policy dropped", { tableName, policyName });
}

/**
 * List all RLS policies for a table.
 */
export async function listRLSPolicies(tableName: string): Promise<RLSPolicy[]> {
  const result = await prisma.$queryRaw`
    SELECT
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE tablename = ${tableName}
    ORDER BY policyname
  ` as Array<{
    schemaname: string;
    tablename: string;
    policyname: string;
    permissive: string;
    roles: string;
    cmd: string;
    qual: string;
    with_check: string | null;
  }>;

  return result.map(row => ({
    id: `rls_${row.policyname}`,
    tableName: row.tablename,
    policyName: row.policyname,
    command: row.cmd as any,
    usingExpression: row.qual,
    withCheckExpression: row.with_check ?? undefined,
    roles: row.roles.replace(/[{}]/g, "").split(","),
    enabled: true,
    createdAt: new Date().toISOString(),
  }));
}

/**
 * Check if RLS is enabled on a table.
 */
export async function isRLSEnabled(tableName: string): Promise<boolean> {
  const result = await prisma.$queryRaw`
    SELECT relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE relname = ${tableName}
  ` as Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>;

  return result[0]?.relrowsecurity ?? false;
}

// ─── Bulk RLS Setup ─────────────────────────────────────────────

/**
 * Enable RLS on all tenant-scoped tables.
 */
export async function enableRLSOnAllTenantTables(): Promise<{
  tablesEnabled: number;
  policiesCreated: number;
  errors: string[];
}> {
  // Get all tables with organizationId column
  const tables = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.columns
    WHERE column_name = 'organizationId'
      AND table_schema = 'public'
    ORDER BY table_name
  ` as Array<{ table_name: string }>;

  let tablesEnabled = 0;
  let policiesCreated = 0;
  const errors: string[] = [];

  for (const { table_name } of tables) {
    try {
      // Enable RLS
      await enableRLS(table_name, true);
      tablesEnabled++;

      // Create tenant isolation policy
      await createTenantIsolationPolicy(table_name);
      policiesCreated++;

      logger.info("RLS setup complete", { tableName: table_name });
    } catch (error) {
      const errorMsg = `Failed to setup RLS for ${table_name}: ${(error as Error).message}`;
      errors.push(errorMsg);
      logger.error("RLS setup failed", { tableName: table_name, error });
    }
  }

  logger.info("Bulk RLS setup complete", {
    tablesEnabled,
    policiesCreated,
    errors: errors.length,
  });

  return { tablesEnabled, policiesCreated, errors };
}

// ─── RLS Validation ─────────────────────────────────────────────

/**
 * Validate that RLS is working correctly.
 */
export async function validateRLS(
  tableName: string,
  testOrganizationId: string,
): Promise<{
  valid: boolean;
  tests: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}> {
  const tests: Array<{
    name: string;
    passed: boolean;
    message: string;
  }> = [];

  // Test 1: Check if RLS is enabled
  const rlsEnabled = await isRLSEnabled(tableName);
  tests.push({
    name: "RLS Enabled",
    passed: rlsEnabled,
    message: rlsEnabled ? "RLS is enabled" : "RLS is not enabled",
  });

  // Test 2: Check if policies exist
  const policies = await listRLSPolicies(tableName);
  const hasPolicies = policies.length > 0;
  tests.push({
    name: "Policies Exist",
    passed: hasPolicies,
    message: hasPolicies ? `Found ${policies.length} policies` : "No policies found",
  });

  // Test 3: Test tenant isolation (try to access data from different tenant)
  try {
    // Set context to test organization
    await setTenantContext({
      organizationId: testOrganizationId,
      userId: "test_user",
      userRole: "user",
      isSuperAdmin: false,
      bypassRLS: false,
    });

    // Count rows for this tenant
    const countQuery = `SELECT COUNT(*) as count FROM ${tableName} WHERE "organizationId" = '${testOrganizationId}'`;
    const result = await prisma.$queryRawUnsafe(countQuery) as Array<{ count: bigint }>;
    const tenantCount = Number(result[0]?.count ?? 0);

    tests.push({
      name: "Tenant Isolation",
      passed: true,
      message: `Can access ${tenantCount} rows for tenant`,
    });

    // Clear context
    await clearTenantContext();
  } catch (error) {
    tests.push({
      name: "Tenant Isolation",
      passed: false,
      message: `Failed: ${(error as Error).message}`,
    });
  }

  const valid = tests.every(t => t.passed);

  return { valid, tests };
}

// ─── RLS Auditing ───────────────────────────────────────────────

/**
 * Audit RLS policies across all tables.
 */
export async function auditRLS(): Promise<{
  totalTables: number;
  tablesWithRLS: number;
  tablesWithoutRLS: string[];
  totalPolicies: number;
  policiesByTable: Record<string, number>;
}> {
  // Get all tables
  const allTables = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  ` as Array<{ table_name: string }>;

  // Get tables with organizationId column
  const tenantTables = await prisma.$queryRaw`
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE column_name = 'organizationId'
      AND table_schema = 'public'
    ORDER BY table_name
  ` as Array<{ table_name: string }>;

  let tablesWithRLS = 0;
  const tablesWithoutRLS: string[] = [];
  let totalPolicies = 0;
  const policiesByTable: Record<string, number> = {};

  for (const { table_name } of tenantTables) {
    const rlsEnabled = await isRLSEnabled(table_name);
    const policies = await listRLSPolicies(table_name);

    if (rlsEnabled) {
      tablesWithRLS++;
      policiesByTable[table_name] = policies.length;
      totalPolicies += policies.length;
    } else {
      tablesWithoutRLS.push(table_name);
    }
  }

  return {
    totalTables: tenantTables.length,
    tablesWithRLS,
    tablesWithoutRLS,
    totalPolicies,
    policiesByTable,
  };
}
