/**
 * Row-Level Security — real cross-tenant integration tests.
 *
 * These run actual SQL against a real PostgreSQL instance. They are the
 * evidence that the policies added in
 * prisma/migrations/20260813010000_rls_tenant_isolation ACTUALLY isolate
 * tenants, rather than merely existing in pg_policies.
 *
 * The suite skips itself (rather than failing) when no PostgreSQL is
 * reachable, so it stays green in environments without a database while still
 * running in CI, where a postgres service container is provided.
 *
 * Run against a scratch database — never a real one:
 *   RLS_TEST_DATABASE_URL=postgresql://user:pass@host:5432/scratch
 *   (falls back to DATABASE_URL with the database name suffixed _rls_test)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const BASE_URL =
  process.env.RLS_TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://windels:windels@127.0.0.1:5432/windels";

const TEST_DB = "windels_rls_test";

// PostgreSQL grants two unconditional RLS exemptions:
//   * SUPERUSER  — always bypasses RLS, FORCE or not.
//   * table OWNER — bypasses RLS unless FORCE ROW LEVEL SECURITY is set.
// The migration sets FORCE, which closes the owner hole. The superuser hole
// can only be closed by connecting as a non-superuser, so these tests create a
// dedicated unprivileged role and run every isolation assertion through it —
// otherwise the suite would "pass" against a superuser session that silently
// ignored all 36 policies, which is exactly the false assurance this work
// exists to eliminate.
const APP_ROLE = "windels_rls_app";
const APP_PASSWORD = "rls_test_only_password";

function adminUrl(): string {
  const u = new URL(BASE_URL);
  u.pathname = "/postgres";
  u.search = "";
  return u.toString();
}
function testUrl(): string {
  const u = new URL(BASE_URL);
  u.pathname = `/${TEST_DB}`;
  u.search = "";
  return u.toString();
}
/** Connection as the unprivileged application role — RLS actually applies. */
function appUrl(): string {
  const u = new URL(BASE_URL);
  u.pathname = `/${TEST_DB}`;
  u.search = "";
  u.username = APP_ROLE;
  u.password = APP_PASSWORD;
  return u.toString();
}

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

/** Owner connection: builds the schema and seeds fixtures. */
let owner: pg.Client | null = null;
/** Unprivileged connection: everything RLS is asserted against. */
let client: pg.Client | null = null;

const ORG_A = "org-rls-a";
const ORG_B = "org-rls-b";

async function canConnect(): Promise<boolean> {
  const c = new pg.Client({ connectionString: adminUrl(), connectionTimeoutMillis: 3000 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
}

// Probed at COLLECTION time, not in beforeAll: describe.skip is decided while
// the file is being collected, so a flag set inside beforeAll would always
// still be false here and the suite would silently skip even with a database
// present.
const available = await canConnect();

beforeAll(async () => {
  if (!available) return;

  // Build a scratch database from the real migration files, so what we test is
  // exactly what deploys — not a hand-written approximation.
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  owner = new pg.Client({ connectionString: testUrl() });
  await owner.connect();

  const names = readdirSync(MIGRATIONS_DIR)
    .filter((n) => existsSync(join(MIGRATIONS_DIR, n, "migration.sql")))
    .sort();
  for (const n of names) {
    const sql = readFileSync(join(MIGRATIONS_DIR, n, "migration.sql"), "utf8");
    await owner.query(sql);
  }

  // Two tenants with one workspace each. Inserted with no tenant context set,
  // which the policy permits (the documented escape hatch for jobs/seeding).
  for (const org of [ORG_A, ORG_B]) {
    await owner.query(
      `INSERT INTO "Organization" ("id","name","slug","createdAt","updatedAt")
       VALUES ($1,$2,$3,now(),now())`,
      [org, `Org ${org}`, org],
    );
    await owner.query(
      `INSERT INTO "Workspace" ("id","organizationId","name","slug","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,now(),now())`,
      [`ws-${org}`, org, `Workspace ${org}`, `ws-${org}`],
    );
    await owner.query(
      `INSERT INTO "User" ("id","email","passwordHash","createdAt","updatedAt")
       VALUES ($1,$2,$3,now(),now())`,
      [`user-${org}`, `${org}@rls.test`, "not-a-real-hash"],
    );
  }

  // Unprivileged application role — NOSUPERUSER is the whole point.
  await owner.query(`DROP ROLE IF EXISTS ${APP_ROLE}`).catch(() => {});
  await owner.query(
    `DO $$ BEGIN
       CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  );
  await owner.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
  await owner.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`,
  );
  await owner.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);

  client = new pg.Client({ connectionString: appUrl() });
  await client.connect();
}, 120_000);

afterAll(async () => {
  if (client) await client.end();
  if (owner) {
    await owner.query(`DROP OWNED BY ${APP_ROLE}`).catch(() => {});
    await owner.query(`DROP ROLE IF EXISTS ${APP_ROLE}`).catch(() => {});
    await owner.end();
  }
});

/** Bind the session to a tenant, the way tenantContext middleware does. */
async function setContext(orgId: string | null, bypass = false) {
  const c = client!;
  await c.query(`SELECT set_config('app.current_organization_id', $1, false)`, [orgId ?? ""]);
  await c.query(`SELECT set_config('app.bypass_rls', $1, false)`, [bypass ? "true" : "false"]);
}

// Skipping is a convenience for laptops without PostgreSQL. In CI it would be
// a silent hole: the job would go green having asserted nothing about tenant
// isolation. RLS_TEST_REQUIRE_DB=true (set by the CI workflow, which provides a
// postgres service container) turns an unreachable database into a hard
// failure instead.
const requireDb = process.env.RLS_TEST_REQUIRE_DB === "true";
if (requireDb && !available) {
  throw new Error(
    `RLS_TEST_REQUIRE_DB=true but no PostgreSQL is reachable at ${adminUrl()}. ` +
      `Refusing to skip: these tests are the only proof that tenant isolation is enforced.`,
  );
}

const maybe = () => (available ? describe : describe.skip);

maybe()("RLS tenant isolation (live PostgreSQL)", () => {
  it("runs as a NON-superuser, otherwise every assertion below is vacuous", async () => {
    const r = await client!.query<{ usesuper: boolean; current_user: string }>(
      `SELECT current_user, usesuper FROM pg_user WHERE usename = current_user`,
    );
    expect(r.rows[0].current_user).toBe(APP_ROLE);
    // A superuser bypasses RLS unconditionally. If this ever flips to true the
    // isolation tests would pass while enforcing nothing.
    expect(r.rows[0].usesuper).toBe(false);
  });

  it("applies every migration and enables RLS on the org-scoped tables", async () => {
    const r = await client!.query<{ n: string }>(
      `SELECT count(*) n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
       WHERE ns.nspname='public' AND c.relkind='r' AND c.relrowsecurity`,
    );
    // 36 tables carry organizationId; every one must be protected.
    expect(Number(r.rows[0].n)).toBeGreaterThanOrEqual(36);

    const forced = await client!.query<{ n: string }>(
      `SELECT count(*) n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
       WHERE ns.nspname='public' AND c.relkind='r' AND c.relrowsecurity AND NOT c.relforcerowsecurity`,
    );
    // Without FORCE, the table owner (which the app connects as) bypasses RLS
    // and the policies would be decorative.
    expect(Number(forced.rows[0].n)).toBe(0);
  });

  it("SELECT: a tenant sees only its own rows", async () => {
    await setContext(ORG_A);
    const a = await client!.query(`SELECT id FROM "Workspace"`);
    expect(a.rows.map((r) => r.id)).toEqual([`ws-${ORG_A}`]);

    await setContext(ORG_B);
    const b = await client!.query(`SELECT id FROM "Workspace"`);
    expect(b.rows.map((r) => r.id)).toEqual([`ws-${ORG_B}`]);
  });

  it("SELECT: targeting another tenant's row by primary key returns nothing", async () => {
    await setContext(ORG_A);
    const r = await client!.query(`SELECT id FROM "Workspace" WHERE id = $1`, [`ws-${ORG_B}`]);
    expect(r.rowCount).toBe(0);
  });

  it("UPDATE: cannot modify another tenant's row", async () => {
    await setContext(ORG_A);
    const upd = await client!.query(
      `UPDATE "Workspace" SET "name" = 'hijacked' WHERE id = $1`,
      [`ws-${ORG_B}`],
    );
    expect(upd.rowCount).toBe(0);

    await setContext(null);
    const check = await client!.query(`SELECT "name" FROM "Workspace" WHERE id = $1`, [`ws-${ORG_B}`]);
    expect(check.rows[0].name).toBe(`Workspace ${ORG_B}`);
  });

  it("DELETE: cannot remove another tenant's row", async () => {
    await setContext(ORG_A);
    const del = await client!.query(`DELETE FROM "Workspace" WHERE id = $1`, [`ws-${ORG_B}`]);
    expect(del.rowCount).toBe(0);

    await setContext(null);
    const check = await client!.query(`SELECT count(*) n FROM "Workspace" WHERE id = $1`, [`ws-${ORG_B}`]);
    expect(Number(check.rows[0].n)).toBe(1);
  });

  it("INSERT: WITH CHECK blocks writing a row into another tenant", async () => {
    await setContext(ORG_A);
    await expect(
      client!.query(
        `INSERT INTO "Workspace" ("id","organizationId","name","slug","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,now(),now())`,
        ["ws-smuggled", ORG_B, "smuggled", "ws-smuggled"],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("UPDATE: cannot move one's own row into another tenant", async () => {
    await setContext(ORG_A);
    await expect(
      client!.query(`UPDATE "Workspace" SET "organizationId" = $1 WHERE id = $2`, [
        ORG_B,
        `ws-${ORG_A}`,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it("isolates conversations, the highest-risk private data", async () => {
    for (const org of [ORG_A, ORG_B]) {
      await owner!.query(
        `INSERT INTO "Conversation"
           ("id","organizationId","workspaceId","createdById","title","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,now(),now())`,
        [`conv-${org}`, org, `ws-${org}`, `user-${org}`, `private ${org}`],
      );
    }

    await setContext(ORG_A);
    const seen = await client!.query(`SELECT id, title FROM "Conversation"`);
    expect(seen.rows.map((r) => r.id)).toEqual([`conv-${ORG_A}`]);
    expect(JSON.stringify(seen.rows)).not.toContain(ORG_B);
  });

  it("super-admin bypass still sees every tenant", async () => {
    await setContext(ORG_A, true);
    const r = await client!.query(`SELECT id FROM "Workspace" ORDER BY id`);
    expect(r.rows.map((x) => x.id)).toEqual([`ws-${ORG_A}`, `ws-${ORG_B}`]);
  });

  it("no context set keeps background jobs working (documented escape hatch)", async () => {
    await setContext(null);
    const r = await client!.query(`SELECT id FROM "Workspace" ORDER BY id`);
    expect(r.rows.map((x) => x.id)).toEqual([`ws-${ORG_A}`, `ws-${ORG_B}`]);
  });

  it("an unknown tenant id sees nothing at all", async () => {
    await setContext("org-does-not-exist");
    const r = await client!.query(`SELECT id FROM "Workspace"`);
    expect(r.rowCount).toBe(0);
  });

  // Regression guard for the silent-failure mode this suite uncovered: with a
  // superuser DATABASE_URL, all 36 policies exist and are ignored.
  it("a superuser connection bypasses every policy — the silent failure mode", async () => {
    const su = owner!; // the owner connection is the superuser 'windels'
    await su.query(`SELECT set_config('app.current_organization_id', $1, false)`, [ORG_A]);
    await su.query(`SELECT set_config('app.bypass_rls', 'false', false)`);

    const r = await su.query(`SELECT id FROM "Workspace" ORDER BY id`);
    // Sees BOTH tenants despite context pinned to org A and bypass off.
    expect(r.rows.map((x) => x.id)).toEqual([`ws-${ORG_A}`, `ws-${ORG_B}`]);

    const su2 = await su.query<{ usesuper: boolean }>(
      `SELECT usesuper FROM pg_user WHERE usename = current_user`,
    );
    expect(su2.rows[0].usesuper).toBe(true);

    await su.query(`RESET app.current_organization_id`);
    await su.query(`RESET app.bypass_rls`);
  });

  it("getRLSEnforcementStatus distinguishes an enforcing from an inert connection", async () => {
    const check = async (c: pg.Client) => {
      const rows = await c.query<{ role: string; is_superuser: boolean }>(
        `SELECT current_user::text AS role,
                (SELECT usesuper FROM pg_user WHERE usename = current_user) AS is_superuser`,
      );
      return { enforced: !rows.rows[0].is_superuser, role: rows.rows[0].role };
    };

    // Mirrors getRLSEnforcementStatus() in rowLevelSecurity.service.ts.
    expect(await check(client!)).toEqual({ enforced: true, role: APP_ROLE });
    const asOwner = await check(owner!);
    expect(asOwner.enforced).toBe(false);
  });
});
