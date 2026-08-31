/**
 * PHP runtime parity spec — Module Runtime (Node routes/moduleRuntime.ts).
 *
 * Exercises the registration surface and the guarded module gateway:
 *
 *   GET  /api/v1/module-runtime/health
 *   GET  /api/v1/module-runtime/modules
 *   GET  /api/v1/module-runtime/registrations
 *   ANY  /api/v1/module-runtime/:moduleKey/<path...>
 *
 * Run:
 *   node tests/php-api/moduleRuntime.spec.mjs http://localhost:8082 \
 *        owner@windels.example 'Owner!Pass#2026' \
 *        <dbUser> <dbPass> <dbName> [dbHost] [dbPort]
 *
 * These routes are open to any authenticated user — what restricts them is the
 * module's own manifest (accessRoles, backend.routes and the platform
 * permission each route names). The spec seeds ACTIVE module fixtures through
 * SQL, because reaching that state through the real pipeline needs the isolated
 * Module Runner.
 *
 * What this spec CANNOT prove here, and why
 * -----------------------------------------
 * PHP inside the test harness cannot open outbound sockets — not even to
 * loopback — so a module backend can never actually answer. The gateway's
 * transport path is therefore asserted one step short of the wire: with a
 * signing secret configured and a registered serviceUrl, a permitted call
 * reaches the transport and reports 502 MODULE_RUNTIME_UNREACHABLE instead of
 * inventing a response. Every gate in front of that (active, enabled, role,
 * declared route, held permission, complete registration) is real and asserted.
 */
import { createRequire } from "node:module";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const mysql = require("mysql2/promise");

const base   = (process.argv[2] || "http://localhost:8082").replace(/\/$/, "");
const ident  = process.argv[3] || "owner@windels.example";
const pass   = process.argv[4] || "Owner!Pass#2026";
const dbUser = process.argv[5] || "windels";
const dbPass = process.argv[6] || "windels";
const dbName = process.argv[7] || "wnd_final_a";
const dbHost = process.argv[8] || "127.0.0.1";
const dbPort = Number(process.argv[9] || 3306);

let passed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name + (detail ? ` — ${detail}` : "")); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function call(method, path, { token, json } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(base + path, { method, headers, body: json !== undefined ? JSON.stringify(json) : undefined, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: response.status, body, text, data: body?.data, error: body?.error };
}

const uuid = () => crypto.randomUUID();

function manifest(key, version, routes, accessRoles) {
  return {
    schemaVersion: 1, id: key, name: "Runtime Fixture", version, platform: "windels-ai-os", packageType: "plugin",
    description: "Module Runtime parity fixture: long enough to satisfy the minimum length.",
    author: "Windels", vendor: "Windels", license: "MIT", minimumVersion: "0.1.0", apiVersion: "v1",
    dependencies: [], permissions: ["files.upload"], accessRoles,
    capabilities: [],
    backend: { enabled: true, mode: "external_service", routes, webhooks: [], backgroundJobs: [], eventHandlers: [] },
    frontend: { enabled: false, mode: "declarative", navigation: [], pages: [] },
    database: { migrations: [], mode: "none", rollbackFiles: [], backupRequired: true },
    agents: { definitions: [] }, workflows: { definitions: [] }, configuration: {}, documentation: [],
    tests: { categories: ["unit"] },
    healthChecks: [{ name: "startup", type: "http", path: "/health" }],
    resources: { memoryMb: 128, cpuMillicores: 200, storageMb: 32, networkAccess: true },
    lifecycle: { reloadSupported: true, removable: true },
    upgrade: { from: [], rollbackSupported: true, allowDowngrade: false, requiresDowntime: false },
    conflicts: { moduleIds: [], capabilities: [] },
  };
}

function registration(key, version, accessRoles, serviceUrl, routes, permissions) {
  return {
    moduleId: key, name: "Runtime Fixture", version, packageType: "plugin",
    permissions, accessRoles, capabilities: [],
    backend: { enabled: true, mode: "external_service", routes, webhooks: [], backgroundJobs: [], eventHandlers: [] },
    frontend: { enabled: false, mode: "declarative", navigation: [], pages: [] },
    health: "HEALTHY",
    ...(serviceUrl ? { serviceUrl } : {}),
  };
}

async function seed(db, { id, key, enabled = 1, status = "ACTIVE", accessRoles = ["super_admin"], serviceUrl = "http://127.0.0.1:9/", routes, permissions = ["files.upload"] }) {
  const version = "1.0.0";
  const mf = manifest(key, version, routes, accessRoles);
  await db.query(
    `INSERT INTO platform_modules (id, module_key, name, package_type, description, vendor, status, health, enabled,
       current_version, active_release_id, manifest, dependencies, permissions, runtime_registration, created_at, updated_at)
     VALUES (?, ?, 'Runtime Fixture', 'plugin', 'Seeded by the module runtime parity spec.', 'Windels',
       ?, 'HEALTHY', ?, '1.0.0', ?, ?, '[]', ?, ?, NOW(), NOW())`,
    [id, key, status, enabled, uuid(), JSON.stringify(mf), JSON.stringify(permissions), JSON.stringify(registration(key, version, accessRoles, serviceUrl, routes, permissions))]
  );
}

async function main() {
  const db = await mysql.createConnection({ host: dbHost, port: dbPort, user: dbUser, password: dbPass, database: dbName });

  // Durable state is reset first: this spec asserts on counts and on who can
  // see which registration.
  await db.query("DELETE FROM platform_module_operations");
  await db.query("DELETE FROM platform_module_uploads");
  await db.query("DELETE FROM platform_module_releases");
  await db.query("DELETE FROM platform_modules");
  await db.query("DELETE FROM audit_events WHERE event_type LIKE 'module.runtime%'");

  console.log(`\nmodule runtime parity — ${base}\n`);

  const login = await call("POST", "/api/v1/auth/login", { json: { email: ident, password: pass } });
  const token = login.data?.token;
  check("super admin can sign in", !!token, JSON.stringify(login.body?.error));
  if (!token) { await db.end(); process.exit(1); }

  const memberEmail = `rt-member-${Date.now()}@windels.example`;
  await call("POST", "/api/v1/auth/register", { json: { email: memberEmail, password: "Member!Pass#2026", displayName: "Runtime Member", organizationName: "Member Org" } });
  const firstLogin = await call("POST", "/api/v1/auth/login", { json: { email: memberEmail, password: "Member!Pass#2026" } });
  check("a second account can be registered", !!firstLogin.data?.token, JSON.stringify(firstLogin.body?.error));
  // Self-registration makes you the ADMIN of a brand-new organization, so the
  // spec demotes the fixture to USER: the interesting case for a module gateway
  // is a caller whose role is allowed but whose permissions are not.
  await db.query("UPDATE users SET role = 'USER' WHERE id = ?", [firstLogin.data.user.id]);
  const memberLogin = await call("POST", "/api/v1/auth/login", { json: { email: memberEmail, password: "Member!Pass#2026" } });
  const memberToken = memberLogin.data?.token;
  const memberRole = memberLogin.data?.user?.role;
  check("the fixture member signs in as a plain USER", memberRole === "user", `role ${memberRole}`);

  const [missingRows] = await db.query(
    `SELECT p.code FROM permissions p WHERE p.code NOT IN (
       SELECT p2.code FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p2 ON p2.id = rp.permission_id WHERE r.code = 'USER'
     ) ORDER BY p.code LIMIT 1`
  );
  const missingPermission = missingRows[0]?.code;
  check("the catalog has a permission the USER role does not hold", !!missingPermission, JSON.stringify(missingRows));

  // --- authentication -------------------------------------------------------
  for (const path of ["/api/v1/module-runtime/health", "/api/v1/module-runtime/modules", "/api/v1/module-runtime/registrations", "/api/v1/module-runtime/anything/here"]) {
    const r = await call("GET", path);
    check(`GET ${path} without a token → 401`, r.status === 401, `status ${r.status}`);
  }

  // --- empty registration surface -------------------------------------------
  const emptyHealth = await call("GET", "/api/v1/module-runtime/health", { token });
  check("health → 200", emptyHealth.status === 200, `status ${emptyHealth.status}`);
  check("health reports status ok", emptyHealth.data?.status === "ok", JSON.stringify(emptyHealth.data));
  check("health reports zero registrations before any module is active", emptyHealth.data?.registrations === 0, JSON.stringify(emptyHealth.data));

  const empty = await call("GET", "/api/v1/module-runtime/registrations", { token });
  check("registrations → 200 and empty", empty.status === 200 && Array.isArray(empty.data) && empty.data.length === 0, `status ${empty.status}`);

  // --- fixtures -------------------------------------------------------------
  const routes = [
    { method: "GET", path: "/items/:id", permission: "files.upload" },
    { method: "GET", path: "/files/*", permission: "files.upload" },
    { method: "POST", path: "/items", permission: "users.manage" },
    { method: "GET", path: "/unknown-permission", permission: "not.a.real.permission" },
  ];
  const fixtures = {
    open:     { id: uuid(), key: `spec.rt.open.${Date.now().toString(36)}` },
    member:   { id: uuid(), key: `spec.rt.member.${Date.now().toString(36)}` },
    noUrl:    { id: uuid(), key: `spec.rt.nourl.${Date.now().toString(36)}` },
    disabled: { id: uuid(), key: `spec.rt.disabled.${Date.now().toString(36)}` },
  };
  await seed(db, { ...fixtures.open, routes });
  await seed(db, { ...fixtures.member, accessRoles: [memberRole], permissions: ["files.upload"], routes: [{ method: "GET", path: "/items/:id", permission: missingPermission }] });
  await seed(db, { ...fixtures.noUrl, serviceUrl: null, routes });
  await seed(db, { ...fixtures.disabled, enabled: 0, routes });

  // --- registration surface with fixtures -----------------------------------
  const health = await call("GET", "/api/v1/module-runtime/health", { token });
  check("health counts the registrations visible to this role", health.data?.registrations === 2, JSON.stringify(health.data));

  const registrations = await call("GET", "/api/v1/module-runtime/registrations", { token });
  check("registrations → 200", registrations.status === 200, `status ${registrations.status}`);
  check("registrations lists the active module", (registrations.data || []).some((row) => row.moduleId === fixtures.open.key), JSON.stringify((registrations.data || []).map((r) => r.moduleId)));
  check("registrations omit the disabled module", !(registrations.data || []).some((row) => row.moduleId === fixtures.disabled.key), JSON.stringify((registrations.data || []).map((r) => r.moduleId)));
  check("registrations do not leak the internal serviceUrl", !(registrations.data || []).some((row) => "serviceUrl" in row), JSON.stringify(Object.keys((registrations.data || [])[0] || {})));
  check("registrations do not leak instanceId or imageDigest", !(registrations.data || []).some((row) => "instanceId" in row || "imageDigest" in row), JSON.stringify(Object.keys((registrations.data || [])[0] || {})));

  const shape = (registrations.data || [])[0] || {};
  for (const key of ["moduleId", "name", "version", "packageType", "permissions", "accessRoles", "capabilities", "backend", "frontend", "health"]) {
    check(`registration carries ${key}`, Object.prototype.hasOwnProperty.call(shape, key), Object.keys(shape).join(","));
  }

  const modules = await call("GET", "/api/v1/module-runtime/modules", { token });
  check("modules and registrations return the same surface", JSON.stringify(modules.data) === JSON.stringify(registrations.data), `${JSON.stringify(modules.data)?.slice(0, 120)}`);

  const memberRegistrations = await call("GET", "/api/v1/module-runtime/registrations", { token: memberToken });
  check("a member sees only the registrations their role is allowed", (memberRegistrations.data || []).every((row) => (row.accessRoles || []).includes(memberRole)), JSON.stringify(memberRegistrations.data?.map((r) => r.moduleId)));
  check("a member sees the user-role module", (memberRegistrations.data || []).some((row) => row.moduleId === fixtures.member.key), JSON.stringify(memberRegistrations.data?.map((r) => r.moduleId)));
  check("a member does not see the super-admin-only module", !(memberRegistrations.data || []).some((row) => row.moduleId === fixtures.open.key), JSON.stringify(memberRegistrations.data?.map((r) => r.moduleId)));

  // --- gateway guard rails --------------------------------------------------
  const unknownModule = await call("GET", "/api/v1/module-runtime/does-not-exist/items/1", { token });
  check("proxy for an unknown module → 404", unknownModule.status === 404, `status ${unknownModule.status}`);
  check("404 carries NOT_FOUND", unknownModule.error?.code === "NOT_FOUND", JSON.stringify(unknownModule.error));

  const disabledModule = await call("GET", `/api/v1/module-runtime/${fixtures.disabled.key}/items/1`, { token });
  check("proxy for a disabled module → 404", disabledModule.status === 404, `status ${disabledModule.status}`);

  const roleDenied = await call("GET", `/api/v1/module-runtime/${fixtures.open.key}/items/1`, { token: memberToken });
  check("proxy for a role outside accessRoles → 403", roleDenied.status === 403, `status ${roleDenied.status}`);
  check("403 explains the role is not allowed", /role is not allowed/i.test(roleDenied.error?.message || ""), JSON.stringify(roleDenied.error));

  const undeclared = await call("GET", `/api/v1/module-runtime/${fixtures.open.key}/nowhere`, { token });
  check("proxy for an undeclared path → 404", undeclared.status === 404, `status ${undeclared.status}`);
  check("404 carries MODULE_ROUTE_NOT_DECLARED", undeclared.error?.code === "MODULE_ROUTE_NOT_DECLARED", JSON.stringify(undeclared.error));

  const wrongMethod = await call("DELETE", `/api/v1/module-runtime/${fixtures.open.key}/items/1`, { token });
  check("proxy for an undeclared method → 404", wrongMethod.status === 404, `status ${wrongMethod.status}`);
  check("the wrong method is also MODULE_ROUTE_NOT_DECLARED", wrongMethod.error?.code === "MODULE_ROUTE_NOT_DECLARED", JSON.stringify(wrongMethod.error));

  const wrongArity = await call("GET", `/api/v1/module-runtime/${fixtures.open.key}/items`, { token });
  check("a :param route does not match a shorter path", wrongArity.status === 404 && wrongArity.error?.code === "MODULE_ROUTE_NOT_DECLARED", `status ${wrongArity.status}`);

  const unknownPermission = await call("GET", `/api/v1/module-runtime/${fixtures.open.key}/unknown-permission`, { token });
  check("a route naming a permission the platform does not define → 403", unknownPermission.status === 403, `status ${unknownPermission.status}`);
  check("403 names the invented permission", /not define/i.test(unknownPermission.error?.message || ""), JSON.stringify(unknownPermission.error));

  const denyPermission = await call("GET", `/api/v1/module-runtime/${fixtures.member.key}/items/1`, { token: memberToken });
  check(`a caller without the route permission (${missingPermission}) → 403`, denyPermission.status === 403, `status ${denyPermission.status}`);
  check("403 names the missing permission", /Missing module route permission/i.test(denyPermission.error?.message || ""), JSON.stringify(denyPermission.error));

  // --- the transport boundary ------------------------------------------------
  // Everything above is decided before the gateway dials out. These two reach
  // the wire: one has no usable registration, the other has one but no module
  // backend can answer from inside this harness.
  const noUrl = await call("GET", `/api/v1/module-runtime/${fixtures.noUrl.key}/items/1`, { token });
  check("a module with no serviceUrl → 503", noUrl.status === 503, `status ${noUrl.status}`);
  check("503 carries MODULE_RUNTIME_UNAVAILABLE", noUrl.error?.code === "MODULE_RUNTIME_UNAVAILABLE", JSON.stringify(noUrl.error));

  const transport = await call("GET", `/api/v1/module-runtime/${fixtures.open.key}/items/42`, { token });
  const reachable = transport.status === 502 && transport.error?.code === "MODULE_RUNTIME_UNREACHABLE";
  const answered = transport.status >= 200 && transport.status < 300;
  check("a permitted call reaches the module transport (502 here: no backend can answer from the harness)", reachable || answered, `status ${transport.status} ${JSON.stringify(transport.error)?.slice(0, 200)}`);

  const wildcard = await call("GET", `/api/v1/module-runtime/${fixtures.open.key}/files/a/b/c`, { token });
  check("a trailing * route matches a nested path", wildcard.status !== 404 || wildcard.error?.code !== "MODULE_ROUTE_NOT_DECLARED", `status ${wildcard.status} ${JSON.stringify(wildcard.error)}`);

  // --- nothing is fabricated -------------------------------------------------
  const [auditRows] = await db.query("SELECT COUNT(*) AS total FROM audit_events WHERE event_type LIKE 'module.runtime%'");
  check("rejected gateway calls write no runtime audit entries", Number(auditRows[0].total) === 0, `rows ${auditRows[0].total}`);

  // --- method guards ---------------------------------------------------------
  for (const path of ["/api/v1/module-runtime/health", "/api/v1/module-runtime/modules", "/api/v1/module-runtime/registrations"]) {
    const r = await call("POST", path, { token, json: {} });
    check(`POST ${path} → 405`, r.status === 405, `status ${r.status}`);
  }

  // --- cleanup ---------------------------------------------------------------
  await db.query("DELETE FROM platform_modules WHERE id IN (?, ?, ?, ?)", [fixtures.open.id, fixtures.member.id, fixtures.noUrl.id, fixtures.disabled.id]);
  await db.query("DELETE FROM audit_events WHERE event_type LIKE 'module.runtime%'");
  await db.end();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nfailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  console.log("module runtime: parity verified against the PHP runtime.");
}

main().catch((error) => { console.error(error); process.exit(1); });
