#!/usr/bin/env node
/**
 * Migration replay validator.
 *
 * Applies every migration in apps/api/prisma/migrations to a scratch database,
 * from zero, in order — then verifies the result actually matches
 * schema.prisma.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two defects shipped to main because nothing ever did this:
 *
 *   1. 20260801020000_mobile_device_pin_hash ran ALTER TABLE against a table no
 *      earlier migration created. A from-zero replay died at migration 9 of 12,
 *      so no new environment could be provisioned.
 *
 *   2. Twenty models in schema.prisma had no migration at all. Replaying
 *      everything produced 46 tables where the schema declares 66. Those tables
 *      existed at runtime only because a developer database had drifted ahead
 *      of the committed history — which meant the bootstrap logged P2021 and
 *      RBAC permission seeding silently did nothing.
 *
 * Both are invisible to a test suite that runs against an already-migrated
 * database, and invisible to `prisma migrate dev` on a machine whose database
 * has already drifted. Only a from-zero replay catches them.
 *
 * This deliberately does NOT use the Prisma CLI. `prisma migrate diff` needs
 * the schema engine binary, which is unavailable in restricted/air-gapped
 * environments (and ships as a stub in this repo's install). Raw SQL through
 * `pg` has no such dependency.
 *
 * Usage:
 *   node scripts/validate-migrations.mjs
 *   DATABASE_URL=postgresql://user:pass@host:5432/postgres node scripts/validate-migrations.mjs
 *
 * Exits non-zero on any failure, so it is safe to gate CI on.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// `pg` is a dependency of apps/api, not of the workspace root, so a bare
// import from scripts/ does not resolve under pnpm's strict layout.
const require = createRequire(pathToFileURL(join(ROOT, "apps/api/package.json")));
const pg = require("pg");
const MIGRATIONS = join(ROOT, "apps/api/prisma/migrations");
const SCHEMA = join(ROOT, "apps/api/prisma/schema.prisma");
const SCRATCH_DB = "windels_migration_validation";

const BASE =
  process.env.DATABASE_URL ?? "postgresql://windels:windels@127.0.0.1:5432/postgres";

function url(db) {
  const u = new URL(BASE);
  u.pathname = `/${db}`;
  u.search = "";
  return u.toString();
}

/**
 * Model names declared in schema.prisma, honouring @@map.
 * Views and enums are not tables and are excluded.
 */
function declaredTables() {
  const src = readFileSync(SCHEMA, "utf8");
  const names = [];
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = modelRe.exec(src)) !== null) {
    const [, name, body] = m;
    const mapped = /@@map\("([^"]+)"\)/.exec(body);
    names.push(mapped ? mapped[1] : name);
  }
  return names;
}

let failures = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

async function main() {
  const admin = new pg.Client({ connectionString: url("postgres") });
  try {
    await admin.connect();
  } catch (e) {
    console.error(`Cannot reach PostgreSQL at ${new URL(BASE).host}: ${e.message}`);
    console.error("Set DATABASE_URL to a reachable server. Exiting non-zero.");
    process.exit(1);
  }

  console.log(`\nReplaying migrations into scratch database "${SCRATCH_DB}"\n`);
  await admin.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB}`);
  await admin.query(`CREATE DATABASE ${SCRATCH_DB}`);
  await admin.end();

  const db = new pg.Client({ connectionString: url(SCRATCH_DB) });
  await db.connect();

  try {
    // ── 1. Every migration applies, in order, from zero ──────────────
    const dirs = readdirSync(MIGRATIONS)
      .filter((d) => existsSync(join(MIGRATIONS, d, "migration.sql")))
      .sort();

    if (dirs.length === 0) throw new Error("no migrations found");

    console.log(`Applying ${dirs.length} migrations:`);
    for (const d of dirs) {
      const sql = readFileSync(join(MIGRATIONS, d, "migration.sql"), "utf8");
      try {
        await db.query(sql);
        ok(d);
      } catch (e) {
        fail(`${d} — ${e.message}`);
        // A failed migration invalidates everything after it; stop here.
        throw new Error(`migration ${d} failed`);
      }
    }

    // ── 2. Migrations are idempotent (re-applying must not break) ────
    // Guards the pattern used by the drift-baseline migration, which must be
    // safe on databases that already drifted forward.
    console.log("\nRe-applying the two baseline migrations (idempotency):");
    for (const d of dirs.filter((x) => x.startsWith("20260813"))) {
      const sql = readFileSync(join(MIGRATIONS, d, "migration.sql"), "utf8");
      try {
        await db.query(sql);
        ok(`${d} is idempotent`);
      } catch (e) {
        fail(`${d} is NOT idempotent — ${e.message}`);
      }
    }

    // ── 3. The result matches schema.prisma ──────────────────────────
    console.log("\nComparing the migrated database against schema.prisma:");
    const { rows } = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const actual = new Set(rows.map((r) => r.table_name));
    const declared = declaredTables();

    const missing = declared.filter((t) => !actual.has(t));
    if (missing.length) {
      fail(`${missing.length} model(s) in schema.prisma have no table: ${missing.join(", ")}`);
    } else {
      ok(`all ${declared.length} models in schema.prisma exist as tables`);
    }

    // Extra tables are reported, not failed: _prisma_migrations and similar
    // bookkeeping tables are legitimate.
    const extra = [...actual].filter(
      (t) => !declared.includes(t) && !t.startsWith("_"),
    );
    if (extra.length) console.log(`  · ${extra.length} table(s) not in schema.prisma: ${extra.join(", ")}`);

    // ── 4. Row-level security is actually enabled ────────────────────
    console.log("\nVerifying row-level security:");
    const orgTables = await db.query(
      `SELECT c.relname AS t, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND EXISTS (
           SELECT 1 FROM information_schema.columns col
           WHERE col.table_schema = 'public'
             AND col.table_name = c.relname
             AND col.column_name = 'organizationId')
       ORDER BY c.relname`,
    );

    const unprotected = orgTables.rows.filter((r) => !r.enabled);
    if (unprotected.length) {
      fail(`${unprotected.length} org-scoped table(s) without RLS: ${unprotected.map((r) => r.t).join(", ")}`);
    } else {
      ok(`all ${orgTables.rowCount} org-scoped tables have RLS enabled`);
    }

    // Without FORCE, the table owner — which the application connects as —
    // bypasses RLS entirely and the policies are decorative.
    const unforced = orgTables.rows.filter((r) => r.enabled && !r.forced);
    if (unforced.length) {
      fail(`${unforced.length} table(s) have RLS but not FORCE: ${unforced.map((r) => r.t).join(", ")}`);
    } else {
      ok(`all ${orgTables.rowCount} org-scoped tables have FORCE ROW LEVEL SECURITY`);
    }

    const policies = await db.query(
      `SELECT tablename FROM pg_policies WHERE schemaname = 'public'`,
    );
    const withPolicy = new Set(policies.rows.map((r) => r.tablename));
    const noPolicy = orgTables.rows.filter((r) => !withPolicy.has(r.t));
    if (noPolicy.length) {
      fail(`${noPolicy.length} org-scoped table(s) have no policy: ${noPolicy.map((r) => r.t).join(", ")}`);
    } else {
      ok(`all ${orgTables.rowCount} org-scoped tables carry an isolation policy`);
    }
  } finally {
    await db.end();
    const cleanup = new pg.Client({ connectionString: url("postgres") });
    await cleanup.connect();
    await cleanup.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB}`);
    await cleanup.end();
  }

  if (failures) {
    console.error(`\n${failures} check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll migration checks passed.\n");
}

main().catch((e) => {
  console.error(`\nValidation aborted: ${e.message}\n`);
  process.exit(1);
});
