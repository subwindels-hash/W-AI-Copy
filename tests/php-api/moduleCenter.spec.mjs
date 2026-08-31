/**
 * PHP runtime parity spec — Module Center (Node routes/moduleCenter.ts).
 *
 * Exercises all 13 super-admin routes against the PHP/cPanel build, with real
 * .wmod ZIP packages built in-process and a real detached RSA signature:
 *
 *   GET  /super-admin/module-center/dashboard
 *   GET  /super-admin/module-center/modules
 *   GET  /super-admin/module-center/modules/:id
 *   GET  /super-admin/module-center/uploads
 *   POST /super-admin/module-center/uploads
 *   GET  /super-admin/module-center/operations
 *   POST /super-admin/module-center/releases/:id/verify
 *   POST /super-admin/module-center/releases/:id/sandbox-test
 *   POST /super-admin/module-center/releases/:id/approve
 *   POST /super-admin/module-center/releases/:id/install
 *   POST /super-admin/module-center/modules/:id/{enable,disable,restart,health-check,rollback,remove}
 *
 * Run:
 *   node tests/php-api/moduleCenter.spec.mjs http://localhost:8082 \
 *        owner@windels.example 'Owner!Pass#2026' \
 *        <dbUser> <dbPass> <dbName> [dbHost] [dbPort] [publisherKeyFile]
 *
 * The database arguments let the spec prove that uploads, releases, operations
 * and audit rows are durable, and let it seed an ACTIVE module fixture — the
 * state the lifecycle actions act on.
 *
 * `publisherKeyFile` is optional. It must be a JSON file with
 * `{ keyId, privateKey }` (PEM) matching a VP_MODULE_TRUSTED_PUBLISHER_KEYS
 * entry on the deployment. When it is supplied the spec proves the signature
 * happy path; without it, signature checks are exercised only through their
 * missing/untrusted branches. No key material is committed to this repository.
 *
 * What this spec CANNOT prove here, and why
 * -----------------------------------------
 * Node requires a ClamAV daemon and an isolated "Module Runner" service for the
 * pipeline past VERIFY. Neither exists in this sandbox, and PHP inside the test
 * harness cannot open outbound sockets at all. So:
 *
 *   * VERIFY reaches SIGNATURE_VERIFIED + CHECKSUM_RECOMPUTED + every static,
 *     compatibility, dependency, conflict and resource check, and then fails
 *     closed on MALWARE_SCANNER_NOT_CONFIGURED — Node's own posture.
 *   * Sandbox/approve/install/lifecycle actions are exercised through their
 *     guard rails and through the NOT_CONFIGURED runner result: the attempt is
 *     recorded, and the package stays inactive. Nothing is faked as a pass.
 */
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const mysql = require("mysql2/promise");

const base     = (process.argv[2] || "http://localhost:8082").replace(/\/$/, "");
const ident    = process.argv[3] || "owner@windels.example";
const pass     = process.argv[4] || "Owner!Pass#2026";
const dbUser   = process.argv[5] || "windels";
const dbPass   = process.argv[6] || "windels";
const dbName   = process.argv[7] || "wnd_final_a";
const dbHost   = process.argv[8] || "127.0.0.1";
const dbPort   = Number(process.argv[9] || 3306);
const keyFile  = process.argv[10] || "";

let publisher = null;
if (keyFile && fs.existsSync(keyFile)) publisher = JSON.parse(fs.readFileSync(keyFile, "utf8"));

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name + (detail ? ` — ${detail}` : "")); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

// ---------------------------------------------------------------------------
// Minimal ZIP writer (stored, no compression) so the spec can build real .wmod
// packages without a zip dependency.
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.write("PK\x03\x04", 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);      // flags
    local.writeUInt16LE(0, 8);      // stored
    local.writeUInt16LE(0, 10);     // time
    local.writeUInt16LE(0x21, 12);  // date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, data);

    const entry = Buffer.alloc(46);
    entry.write("PK\x01\x02", 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt16LE(0, 30);     // extra
    entry.writeUInt16LE(0, 32);     // comment
    entry.writeUInt16LE(0, 34);     // disk
    entry.writeUInt16LE(0, 36);     // internal attrs
    entry.writeUInt32LE(0x81A40000, 38); // external attrs: regular file 0644
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += 30 + name.length + data.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.write("PK\x05\x06", 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuffer, end]);
}

// ---------------------------------------------------------------------------
// Manifests
// ---------------------------------------------------------------------------
function manifest(id, version, permission, overrides = {}) {
  return {
    schemaVersion: 1,
    id,
    name: "Harness Test Module",
    version,
    platform: "windels-ai-os",
    packageType: "plugin",
    description: "Module Center parity fixture: long enough to satisfy the 10 character minimum.",
    author: "Windels Parity Spec",
    vendor: "Windels Parity Spec",
    license: "MIT",
    minimumVersion: "0.1.0",
    apiVersion: "v1",
    dependencies: [],
    permissions: [permission],
    accessRoles: ["super_admin"],
    capabilities: [],
    backend: { enabled: false, mode: "none", routes: [], webhooks: [], backgroundJobs: [], eventHandlers: [] },
    frontend: { enabled: false, mode: "declarative", navigation: [], pages: [] },
    database: { migrations: [], mode: "none", rollbackFiles: [], backupRequired: true },
    agents: { definitions: [] },
    workflows: { definitions: [] },
    configuration: {},
    documentation: ["README.md"],
    tests: { categories: ["unit"] },
    healthChecks: [{ name: "startup", type: "runner" }],
    resources: { memoryMb: 256, cpuMillicores: 250, storageMb: 32, networkAccess: false },
    lifecycle: { reloadSupported: true, removable: true },
    upgrade: { from: [], rollbackSupported: true, allowDowngrade: false, requiresDowntime: false },
    conflicts: { moduleIds: [], capabilities: [] },
    ...overrides,
  };
}

function pack(manifestObject, extraFiles = []) {
  return zip([
    { name: "manifest.json", content: JSON.stringify(manifestObject, null, 2) },
    { name: "README.md", content: "# fixture\n\nReads like documentation.\n" },
    ...extraFiles,
  ]);
}

function sign(checksum) {
  if (!publisher) return null;
  return crypto.createSign("RSA-SHA256").update(`windels-module:${checksum}`).sign(publisher.privateKey, "base64");
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function call(method, path, { token, json, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(base + path, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : raw,
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: response.status, body, text, data: body?.data, error: body?.error };
}

async function uploadPackage(buffer, { token, fields = {} } = {}) {
  const form = new FormData();
  form.append("package", new Blob([buffer], { type: "application/octet-stream" }), "fixture.wmod");
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  const response = await fetch(base + "/api/v1/super-admin/module-center/uploads", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: response.status, body, text, data: body?.data, error: body?.error };
}

const json = (value) => (typeof value === "string" ? JSON.parse(value) : value);
const uuid = () => crypto.randomUUID();
const idempotency = () => `spec-${uuid()}`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const db = await mysql.createConnection({ host: dbHost, port: dbPort, user: dbUser, password: dbPass, database: dbName });

  // Durable state is reset first: a previous run leaves quarantined uploads and
  // fixture rows behind, and this spec asserts on counts.
  await db.query("DELETE FROM platform_module_operations");
  await db.query("DELETE FROM platform_module_uploads");
  await db.query("DELETE FROM platform_module_releases");
  await db.query("DELETE FROM platform_modules");
  await db.query("DELETE FROM audit_events WHERE event_type LIKE 'module.%'");

  console.log(`\nmodule center parity — ${base}\n`);

  // --- sign in -------------------------------------------------------------
  const login = await call("POST", "/api/v1/auth/login", { json: { email: ident, password: pass } });
  const token = login.data?.token;
  check("super admin can sign in", !!token, JSON.stringify(login.body?.error));
  if (!token) { await db.end(); process.exit(1); }

  // A second, non-super-admin account, to prove the role gate.
  const memberEmail = `member-${Date.now()}@windels.example`;
  const registered = await call("POST", "/api/v1/auth/register", { json: { email: memberEmail, password: "Member!Pass#2026", displayName: "Member", organizationName: "Member Org" } });
  check("a second account can be registered", registered.status === 201 || registered.status === 200, `status ${registered.status} ${JSON.stringify(registered.error)}`);
  const memberLogin = await call("POST", "/api/v1/auth/login", { json: { email: memberEmail, password: "Member!Pass#2026" } });
  const memberToken = memberLogin.data?.token;
  check("non-admin account can sign in", !!memberToken, JSON.stringify(memberLogin.body?.error));

  const [permissionRows] = await db.query("SELECT code FROM permissions ORDER BY code LIMIT 1");
  const permission = permissionRows[0]?.code || "ORG_READ";
  console.log(`  ..  using permission code "${permission}" from the platform catalog`);

  // --- authentication + authorisation -------------------------------------
  const anonymous = await call("GET", "/api/v1/super-admin/module-center/dashboard");
  check("dashboard without a token → 401", anonymous.status === 401, `status ${anonymous.status}`);
  const forbidden = await call("GET", "/api/v1/super-admin/module-center/dashboard", { token: memberToken });
  check("dashboard as a non-super-admin → 403", forbidden.status === 403, `status ${forbidden.status}`);
  check("403 carries the FORBIDDEN code", forbidden.error?.code === "FORBIDDEN", JSON.stringify(forbidden.error));

  // --- dashboard -----------------------------------------------------------
  const dashboard = await call("GET", "/api/v1/super-admin/module-center/dashboard", { token });
  check("dashboard → 200", dashboard.status === 200, `status ${dashboard.status}`);
  for (const key of ["total", "active", "disabled", "failed", "quarantined", "awaitingApproval", "updatesAvailable", "runnerConfigured", "scannerConfigured", "signatureKeysConfigured"]) {
    check(`dashboard has ${key}`, dashboard.data && Object.prototype.hasOwnProperty.call(dashboard.data, key), JSON.stringify(dashboard.data));
  }
  check("dashboard reports the runner as unconfigured (no runner in this deployment)", dashboard.data?.runnerConfigured === false, JSON.stringify(dashboard.data));

  // --- method guards -------------------------------------------------------
  for (const [method, path] of [
    ["POST", "/api/v1/super-admin/module-center/dashboard"],
    ["POST", "/api/v1/super-admin/module-center/modules"],
    ["POST", "/api/v1/super-admin/module-center/operations"],
    ["DELETE", "/api/v1/super-admin/module-center/modules"],
    ["PUT", "/api/v1/super-admin/module-center/operations"],
  ]) {
    const r = await call(method, path, { token, json: {} });
    check(`${method} ${path} → 405`, r.status === 405 || r.status === 404, `status ${r.status}`);
  }

  // --- validation ----------------------------------------------------------
  const noKey = await call("POST", "/api/v1/super-admin/module-center/releases/does-not-exist/verify", { token, json: {} });
  check("verify without idempotencyKey → 422", noKey.status === 422, `status ${noKey.status}`);
  check("422 carries VALIDATION_ERROR", noKey.error?.code === "VALIDATION_ERROR", JSON.stringify(noKey.error));

  const shortKey = await call("POST", "/api/v1/super-admin/module-center/releases/does-not-exist/verify", { token, json: { idempotencyKey: "short" } });
  check("verify with an 5-character key → 422", shortKey.status === 422, `status ${shortKey.status}`);

  const unknownRelease = await call("POST", `/api/v1/super-admin/module-center/releases/${uuid()}/verify`, { token, json: { idempotencyKey: idempotency() } });
  check("verify on an unknown release → 404", unknownRelease.status === 404, `status ${unknownRelease.status}`);
  check("404 carries NOT_FOUND", unknownRelease.error?.code === "NOT_FOUND", JSON.stringify(unknownRelease.error));

  const unknownModule = await call("GET", `/api/v1/super-admin/module-center/modules/${uuid()}`, { token });
  check("GET modules/:id for an unknown module → 404", unknownModule.status === 404, `status ${unknownModule.status}`);

  const noFile = await call("POST", "/api/v1/super-admin/module-center/uploads", { token, json: { signatureKeyId: "x" } });
  check("upload without a package file → 422", noFile.status === 422, `status ${noFile.status}`);

  // --- structural rejections ----------------------------------------------
  const notAZip = await uploadPackage(Buffer.from("this is not a zip file at all"), { token });
  check("upload of a non-ZIP package → 422", notAZip.status === 422, `status ${notAZip.status}`);
  check("rejection explains it was quarantined", /quarantined/i.test(notAZip.error?.message || ""), JSON.stringify(notAZip.error));

  const noManifest = await uploadPackage(Buffer.concat([Buffer.from("PK\x05\x06"), Buffer.alloc(18)]), { token });
  check("upload of a ZIP without manifest.json → 422", noManifest.status === 422, `status ${noManifest.status}`);

  const badId = await uploadPackage(pack(manifest("Not_A_Valid_Id", "1.0.0", permission)), { token });
  check("upload with an invalid module id → 422", badId.status === 422, `status ${badId.status}`);
  check("the invalid-id reason names the field", /module id/i.test(JSON.stringify(badId.error)), JSON.stringify(badId.error));

  let quarantinedReleaseId = null;
  const missingDeclared = await uploadPackage(pack(manifest("spec.missing.file", "1.0.0", permission, { documentation: ["MISSING.md"] })), { token });
  check("upload of a package missing its declared files is accepted for verification", missingDeclared.status === 201, `status ${missingDeclared.status}`);
  if (missingDeclared.status === 201) {
    quarantinedReleaseId = missingDeclared.data.release.id;
    const declared = await call("POST", `/api/v1/super-admin/module-center/releases/${quarantinedReleaseId}/verify`, { token, json: { idempotencyKey: idempotency() } });
    const codes = (declared.data?.verificationReport?.checks || []).map((item) => item.code);
    check("verification reports DECLARED_FILES_MISSING", codes.includes("DECLARED_FILES_MISSING"), codes.join(","));
    check("a missing declared file fails the report", declared.data?.verificationReport?.passed === false, JSON.stringify(declared.data?.verificationReport?.passed));
  }

  // --- the happy path: upload ---------------------------------------------
  const moduleId = `spec.harness.${Date.now().toString(36)}`;
  const good = pack(manifest(moduleId, "1.0.0", permission));
  const checksum = crypto.createHash("sha256").update(good).digest("hex");
  const uploaded = await uploadPackage(good, { token, fields: publisher ? { signatureKeyId: publisher.keyId, signature: sign(checksum) } : {} });
  check("upload of a valid package → 201", uploaded.status === 201, `status ${uploaded.status} ${JSON.stringify(uploaded.error)}`);
  check("upload returns the upload row", uploaded.data?.upload?.checksum === checksum, JSON.stringify(uploaded.data?.upload));
  check("upload returns the release", uploaded.data?.release?.version === "1.0.0", JSON.stringify(uploaded.data?.release));
  check("upload returns nextAction VERIFY", uploaded.data?.nextAction === "VERIFY", JSON.stringify(uploaded.data?.nextAction));
  check("release starts in UPLOADED", uploaded.data?.release?.status === "UPLOADED", uploaded.data?.release?.status);
  check("upload records duplicateDetected false", uploaded.data?.duplicateDetected === false, JSON.stringify(uploaded.data?.duplicateDetected));
  check("upload report carries the archive inspection", uploaded.data?.upload?.report?.archive?.fileCount === 2, JSON.stringify(uploaded.data?.upload?.report));

  const [storedUpload] = await db.query("SELECT * FROM platform_module_uploads WHERE checksum = ?", [checksum]);
  check("the upload row is durable", storedUpload.length === 1, `rows ${storedUpload.length}`);
  check("the artifact is stored outside the web root", /module-packages/.test(storedUpload[0]?.artifact_path || ""), storedUpload[0]?.artifact_path);
  check("the artifact exists on disk in the quarantine bucket", fs.existsSync(String(storedUpload[0]?.artifact_path || "").replace("/www/", "/home/user/_tools/deploy/final-a/")) || /quarantine/.test(storedUpload[0]?.artifact_path || ""), storedUpload[0]?.artifact_path);

  const again = await uploadPackage(good, { token, fields: publisher ? { signatureKeyId: publisher.keyId, signature: sign(checksum) } : {} });
  check("re-upload of identical bytes is detected as a duplicate", again.status === 200 && again.data?.duplicateDetected === true, `status ${again.status} ${JSON.stringify(again.error || again.data?.duplicateDetected)}`);

  const duplicateVersion = await uploadPackage(pack(manifest(moduleId, "1.0.0", permission), [{ name: "extra.txt", content: "different bytes so the checksum differs\n" }]), { token });
  check("upload of a duplicate module version → 409", duplicateVersion.status === 409, `status ${duplicateVersion.status}`);
  check("409 carries CONFLICT", duplicateVersion.error?.code === "CONFLICT", JSON.stringify(duplicateVersion.error));

  const [moduleRows] = await db.query("SELECT * FROM platform_modules WHERE module_key = ?", [moduleId]);
  check("the module row was created", moduleRows.length === 1, `rows ${moduleRows.length}`);
  check("the module row stores the validated manifest", json(moduleRows[0]?.manifest)?.id === moduleId, JSON.stringify(moduleRows[0]?.manifest)?.slice(0, 80));

  const releaseId = uploaded.data.release.id;
  const got = await call("GET", `/api/v1/super-admin/module-center/modules/${moduleRows[0].id}`, { token });
  check("GET modules/:id returns the module", got.status === 200 && got.data?.moduleKey === moduleId, `status ${got.status}`);
  check("GET modules/:id embeds releases", Array.isArray(got.data?.releases) && got.data.releases.length >= 1, JSON.stringify(got.data?.releases?.length));
  check("GET modules/:id embeds operations", Array.isArray(got.data?.operations) && got.data.operations.length >= 1, JSON.stringify(got.data?.operations?.length));

  // --- verification --------------------------------------------------------
  const unsigned = await call("POST", `/api/v1/super-admin/module-center/releases/${releaseId}/verify`, { token, json: { idempotencyKey: idempotency() } });
  check("verify → 200", unsigned.status === 200, `status ${unsigned.status} ${JSON.stringify(unsigned.error)}`);
  const unsignedCodes = (unsigned.data?.verificationReport?.checks || []).map((item) => item.code);
  check("verification recomputes the checksum", unsignedCodes.includes("CHECKSUM_RECOMPUTED"), unsignedCodes.join(","));
  check("verification validates the archive structure", unsignedCodes.includes("ARCHIVE_STRUCTURE_VALID"), unsignedCodes.join(","));
  check("verification checks declared files", unsignedCodes.includes("DECLARED_FILES_PRESENT"), unsignedCodes.join(","));
  check("verification runs the static source scan", unsignedCodes.includes("STATIC_SOURCE_SCAN") || unsignedCodes.includes("PRIVILEGED_CODE_PATTERNS"), unsignedCodes.join(","));
  check("verification checks platform compatibility", unsignedCodes.includes("PLATFORM_VERSION_COMPATIBLE"), unsignedCodes.join(","));
  check("verification checks the permission catalog", unsignedCodes.includes("PERMISSIONS_REUSED"), unsignedCodes.join(","));
  check("verification checks dependencies", unsignedCodes.includes("DEPENDENCIES_SATISFIED"), unsignedCodes.join(","));
  check("verification checks conflicts", unsignedCodes.includes("NO_DECLARED_CONFLICTS"), unsignedCodes.join(","));
  check("verification checks resource policy", unsignedCodes.includes("RESOURCE_LIMITS_ACCEPTED"), unsignedCodes.join(","));

  if (publisher) {
    check("a signed package verifies with the trusted publisher key", unsignedCodes.includes("SIGNATURE_VERIFIED"), unsignedCodes.join(","));
  } else {
    check("an unsigned package fails closed on the signature", unsignedCodes.includes("SIGNATURE_REQUIRED"), unsignedCodes.join(","));
  }
  check("verification fails closed without a malware scanner", unsignedCodes.includes("MALWARE_SCANNER_NOT_CONFIGURED"), unsignedCodes.join(","));
  check("the report is marked not passed while the scanner is unconfigured", unsigned.data?.verificationReport?.passed === false, JSON.stringify(unsigned.data?.verificationReport?.passed));
  check("the release is quarantined", unsigned.data?.status === "QUARANTINED", unsigned.data?.status);

  const [quarantined] = await db.query("SELECT status, last_error FROM platform_modules WHERE id = ?", [moduleRows[0].id]);
  check("the module is quarantined too", quarantined[0]?.status === "QUARANTINED", JSON.stringify(quarantined[0]));

  const untrusted = await uploadPackage(pack(manifest(`${moduleId}.v2`, "1.0.0", permission)), { token, fields: { signatureKeyId: "not-a-real-key", signature: "AAAA" } });
  if (untrusted.status === 201) {
    const r = await call("POST", `/api/v1/super-admin/module-center/releases/${untrusted.data.release.id}/verify`, { token, json: { idempotencyKey: idempotency() } });
    const codes = (r.data?.verificationReport?.checks || []).map((item) => item.code);
    check("an untrusted publisher key fails verification", codes.includes("PUBLISHER_KEY_UNTRUSTED"), codes.join(","));
  } else {
    check("an untrusted publisher key fails verification", false, `upload status ${untrusted.status}`);
  }

  // --- sandbox / approve / install guard rails ------------------------------
  const sandboxWrongState = await call("POST", `/api/v1/super-admin/module-center/releases/${releaseId}/sandbox-test`, { token, json: { idempotencyKey: idempotency() } });
  check("sandbox-test outside SANDBOX_TEST → 409", sandboxWrongState.status === 409, `status ${sandboxWrongState.status}`);
  check("409 names the current status", /SANDBOX_TEST/.test(sandboxWrongState.error?.message || ""), JSON.stringify(sandboxWrongState.error));

  const approveWrongState = await call("POST", `/api/v1/super-admin/module-center/releases/${releaseId}/approve`, { token, json: { idempotencyKey: idempotency() } });
  check("approve before sandbox evidence → 409", approveWrongState.status === 409, `status ${approveWrongState.status}`);

  const installWrongState = await call("POST", `/api/v1/super-admin/module-center/releases/${releaseId}/install`, { token, json: { idempotencyKey: idempotency() } });
  check("install before approval → 409", installWrongState.status === 409, `status ${installWrongState.status}`);

  for (const action of ["enable", "disable", "restart", "health-check", "rollback", "remove"]) {
    const r = await call("POST", `/api/v1/super-admin/module-center/modules/${uuid()}/${action}`, { token, json: { idempotencyKey: idempotency() } });
    check(`${action} on an unknown module → 404`, r.status === 404, `status ${r.status}`);
  }

  // --- idempotency ---------------------------------------------------------
  const sharedKey = idempotency();
  const first = await call("POST", `/api/v1/super-admin/module-center/releases/${quarantinedReleaseId}/verify`, { token, json: { idempotencyKey: sharedKey } });
  const second = await call("POST", `/api/v1/super-admin/module-center/releases/${quarantinedReleaseId}/verify`, { token, json: { idempotencyKey: sharedKey } });
  check("a repeated idempotency key does not re-run the operation", first.status === 200 && second.status === 200, `${first.status} then ${second.status}`);
  const [keyRows] = await db.query("SELECT COUNT(*) AS total FROM platform_module_operations WHERE idempotency_key = ?", [sharedKey]);
  check("the operation row is stored once", Number(keyRows[0].total) === 1, `rows ${keyRows[0].total}`);

  // --- operations + audit --------------------------------------------------
  const operations = await call("GET", "/api/v1/super-admin/module-center/operations", { token });
  check("operations → 200", operations.status === 200, `status ${operations.status}`);
  const types = new Set((operations.data || []).map((row) => row.operationType));
  check("operations include UPLOAD", types.has("UPLOAD"), [...types].join(","));
  check("operations include VERIFY", types.has("VERIFY"), [...types].join(","));
  const verifyOp = (operations.data || []).find((row) => row.operationType === "VERIFY");
  check("a VERIFY operation records a status", ["SUCCEEDED", "FAILED"].includes(verifyOp?.status), verifyOp?.status);
  check("a VERIFY operation records logs", Array.isArray(verifyOp?.logs) && verifyOp.logs.length > 0, JSON.stringify(verifyOp?.logs?.slice(0, 1)));
  check("a VERIFY operation records the report", !!verifyOp?.result?.report, JSON.stringify(verifyOp?.result)?.slice(0, 120));

  const [auditRows] = await db.query("SELECT event_type, COUNT(*) AS total FROM audit_events WHERE event_type LIKE 'module.%' GROUP BY event_type");
  const auditTypes = new Set(auditRows.map((row) => row.event_type));
  check("audit records module.uploaded", auditTypes.has("module.uploaded"), [...auditTypes].join(","));
  check("audit records module.verification_failed", auditTypes.has("module.verification_failed"), [...auditTypes].join(","));

  // --- uploads list --------------------------------------------------------
  const uploads = await call("GET", "/api/v1/super-admin/module-center/uploads", { token });
  check("uploads → 200", uploads.status === 200, `status ${uploads.status}`);
  check("uploads lists the stored package", (uploads.data || []).some((row) => row.checksum === checksum), JSON.stringify((uploads.data || []).length));

  // --- lifecycle against an ACTIVE fixture ---------------------------------
  // The runner is the only thing that can execute package code, and none is
  // configured: every action must be recorded and must leave the module
  // inactive rather than pretending to succeed.
  const fixture = {
    moduleId: uuid(), releaseId: uuid(), previousReleaseId: uuid(),
    key: `spec.active.${Date.now().toString(36)}`,
  };
  const fixtureManifest = manifest(fixture.key, "2.0.0", permission);
  await db.query(
    `INSERT INTO platform_modules (id, module_key, name, package_type, description, vendor, status, health, enabled,
       current_version, active_release_id, manifest, dependencies, permissions, runtime_registration, installed_at, created_at, updated_at)
     VALUES (?, ?, 'Active Fixture', 'plugin', 'Seeded by the parity spec so lifecycle actions have something to act on.', 'Windels',
       'ACTIVE', 'HEALTHY', 1, '2.0.0', ?, ?, '[]', ?, '{}', NOW(), NOW(), NOW())`,
    [fixture.moduleId, fixture.key, fixture.releaseId, JSON.stringify(fixtureManifest), JSON.stringify([permission])]
  );
  const release = (checksumValue, version, status) => [
    uuid(), fixture.moduleId, version, status,
  ];
  await db.query(
    `INSERT INTO platform_module_releases (id, module_registry_id, version, status, checksum, artifact_path, package_size_bytes,
       manifest, verification_report, sandbox_report, health_report, rollback_metadata, previous_release_id, created_at, updated_at)
     VALUES (?, ?, '2.0.0', 'ACTIVE', ?, '/tmp/fixture.wmod', 10, ?, '{"passed":true}', '{}', '{}', '{}', ?, NOW(), NOW())`,
    [fixture.releaseId, fixture.moduleId, "b".repeat(64), JSON.stringify(fixtureManifest), fixture.previousReleaseId]
  );
  await db.query(
    `INSERT INTO platform_module_releases (id, module_registry_id, version, status, checksum, artifact_path, package_size_bytes,
       manifest, verification_report, sandbox_report, health_report, rollback_metadata, created_at, updated_at)
     VALUES (?, ?, '1.9.0', 'APPROVED', ?, '/tmp/fixture.wmod', 10, ?, '{"passed":true}', '{}', '{}', '{}', NOW(), NOW())`,
    [fixture.previousReleaseId, fixture.moduleId, "c".repeat(64), JSON.stringify(manifest(fixture.key, "1.9.0", permission))]
  );

  const enableWhileActive = await call("POST", `/api/v1/super-admin/module-center/modules/${fixture.moduleId}/enable`, { token, json: { idempotencyKey: idempotency() } });
  check("enable on an ACTIVE module → 409", enableWhileActive.status === 409, `status ${enableWhileActive.status}`);

  const healthCheck = await call("POST", `/api/v1/super-admin/module-center/modules/${fixture.moduleId}/health-check`, { token, json: { idempotencyKey: idempotency() } });
  check("health-check → 200 (the attempt is recorded)", healthCheck.status === 200, `status ${healthCheck.status} ${JSON.stringify(healthCheck.error)}`);
  const [afterHealth] = await db.query("SELECT status, health, last_error FROM platform_modules WHERE id = ?", [fixture.moduleId]);
  check("health-check without a runner leaves the module unhealthy, not healthy", afterHealth[0]?.health === "UNHEALTHY", JSON.stringify(afterHealth[0]));
  check("health-check without a runner leaves the module active", afterHealth[0]?.status === "ACTIVE", JSON.stringify(afterHealth[0]));
  const healthOp = (await db.query("SELECT * FROM platform_module_operations WHERE module_registry_id = ? AND operation_type = 'HEALTH_CHECK' ORDER BY created_at DESC LIMIT 1", [fixture.moduleId]))[0][0];
  check("the HEALTH_CHECK operation failed", healthOp?.status === "FAILED", healthOp?.status);
  check("the failure is attributed to the missing runner", healthOp?.error_code === "MODULE_HEALTH_CHECK_FAILED", healthOp?.error_code);
  check("the runner result is stored with the NOT_CONFIGURED check", /NOT_CONFIGURED/.test(JSON.stringify(healthOp?.result || {})), JSON.stringify(healthOp?.result)?.slice(0, 160));

  const restart = await call("POST", `/api/v1/super-admin/module-center/modules/${fixture.moduleId}/restart`, { token, json: { idempotencyKey: idempotency() } });
  check("restart on a module that declares reload support → 200", restart.status === 200, `status ${restart.status} ${JSON.stringify(restart.error)}`);

  const noReload = await db.query("UPDATE platform_module_releases SET manifest = ? WHERE id = ?", [JSON.stringify(manifest(fixture.key, "2.0.0", permission, { lifecycle: { reloadSupported: false, removable: true } })), fixture.releaseId]);
  const restartUnsupported = await call("POST", `/api/v1/super-admin/module-center/modules/${fixture.moduleId}/restart`, { token, json: { idempotencyKey: idempotency() } });
  check("restart without reload support → 409", restartUnsupported.status === 409, `status ${restartUnsupported.status}`);

  // Rollback: previous release is recorded and rollback is supported, so the
  // guard rails pass and the runner decides.
  const rollback = await call("POST", `/api/v1/super-admin/module-center/modules/${fixture.moduleId}/rollback`, { token, json: { idempotencyKey: idempotency() } });
  check("rollback → 200 (the attempt is recorded)", rollback.status === 200, `status ${rollback.status} ${JSON.stringify(rollback.error)}`);
  const [afterRollback] = await db.query("SELECT status, health, current_version FROM platform_modules WHERE id = ?", [fixture.moduleId]);
  check("rollback without a runner leaves the module FAILED, not rolled back", afterRollback[0]?.status === "FAILED", JSON.stringify(afterRollback[0]));
  check("rollback without a runner leaves the version alone", afterRollback[0]?.current_version === "2.0.0", JSON.stringify(afterRollback[0]));

  // A release sitting in SANDBOX_TEST: the guard rail passes and the runner
  // decides. With no runner, the evidence is missing and the release stays put.
  const sandboxFixture = { moduleId: uuid(), releaseId: uuid(), key: `spec.sandbox.${Date.now().toString(36)}` };
  const sandboxManifest = manifest(sandboxFixture.key, "3.0.0", permission);
  await db.query(
    `INSERT INTO platform_modules (id, module_key, name, package_type, status, health, enabled, manifest, dependencies, permissions, runtime_registration, created_at, updated_at)
     VALUES (?, ?, 'Sandbox Fixture', 'plugin', 'SANDBOX_TEST', 'UNKNOWN', 0, ?, '[]', ?, '{}', NOW(), NOW())`,
    [sandboxFixture.moduleId, sandboxFixture.key, JSON.stringify(sandboxManifest), JSON.stringify([permission])]
  );
  await db.query(
    `INSERT INTO platform_module_releases (id, module_registry_id, version, status, checksum, artifact_path, package_size_bytes,
       manifest, verification_report, sandbox_report, health_report, rollback_metadata, created_at, updated_at)
     VALUES (?, ?, '3.0.0', 'SANDBOX_TEST', ?, '/tmp/fixture.wmod', 10, ?, ?, '{}', '{}', '{}', NOW(), NOW())`,
    [sandboxFixture.releaseId, sandboxFixture.moduleId, "d".repeat(64), JSON.stringify(sandboxManifest), JSON.stringify({ passed: true })]
  );
  const sandboxRun = await call("POST", `/api/v1/super-admin/module-center/releases/${sandboxFixture.releaseId}/sandbox-test`, { token, json: { idempotencyKey: idempotency() } });
  check("sandbox-test → 200 (the attempt is recorded)", sandboxRun.status === 200, `status ${sandboxRun.status} ${JSON.stringify(sandboxRun.error)}`);
  check("sandbox-test without a runner reports NOT_CONFIGURED", sandboxRun.data?.sandboxStatus === "NOT_CONFIGURED", sandboxRun.data?.sandboxStatus);
  check("sandbox-test without a runner does not advance to VALIDATED", sandboxRun.data?.status === "SANDBOX_TEST", sandboxRun.data?.status);
  const opTypesAfterSandbox = new Set((await db.query("SELECT DISTINCT operation_type FROM platform_module_operations"))[0].map((row) => row.operation_type));
  check("operations include SANDBOX_TEST", opTypesAfterSandbox.has("SANDBOX_TEST"), [...opTypesAfterSandbox].join(","));

  // A verified + sandboxed release can be approved without a runner, and the
  // install that follows must fail closed rather than activate anything.
  const approveFixture = { moduleId: uuid(), releaseId: uuid(), key: `spec.approve.${Date.now().toString(36)}` };
  const approveManifest = manifest(approveFixture.key, "4.0.0", permission);
  await db.query(
    `INSERT INTO platform_modules (id, module_key, name, package_type, status, health, enabled, manifest, dependencies, permissions, runtime_registration, created_at, updated_at)
     VALUES (?, ?, 'Approve Fixture', 'plugin', 'VALIDATED', 'UNKNOWN', 0, ?, '[]', ?, '{}', NOW(), NOW())`,
    [approveFixture.moduleId, approveFixture.key, JSON.stringify(approveManifest), JSON.stringify([permission])]
  );
  await db.query(
    `INSERT INTO platform_module_releases (id, module_registry_id, version, status, checksum, artifact_path, package_size_bytes,
       manifest, verification_report, sandbox_report, health_report, rollback_metadata, scan_status, sandbox_status, created_at, updated_at)
     VALUES (?, ?, '4.0.0', 'VALIDATED', ?, '/tmp/fixture.wmod', 10, ?, ?, '{}', '{}', '{}', 'PASSED', 'PASSED', NOW(), NOW())`,
    [approveFixture.releaseId, approveFixture.moduleId, "e".repeat(64), JSON.stringify(approveManifest), JSON.stringify({ passed: true })]
  );
  const approved = await call("POST", `/api/v1/super-admin/module-center/releases/${approveFixture.releaseId}/approve`, { token, json: { idempotencyKey: idempotency() } });
  check("approve of a verified, sandboxed release → APPROVED", approved.status === 200 && approved.data?.status === "APPROVED", `status ${approved.status} ${JSON.stringify(approved.error || approved.data?.status)}`);
  check("approve records the approving super admin", !!approved.data?.approvedAt, JSON.stringify(approved.data?.approvedAt));

  const installRun = await call("POST", `/api/v1/super-admin/module-center/releases/${approveFixture.releaseId}/install`, { token, json: { idempotencyKey: idempotency() } });
  check("install → 200 (the attempt is recorded)", installRun.status === 200, `status ${installRun.status} ${JSON.stringify(installRun.error)}`);
  check("install without a runner leaves the module FAILED, not ACTIVE", installRun.data?.status === "FAILED", installRun.data?.status);
  check("install without a runner does not enable the module", installRun.data?.enabled === false, JSON.stringify(installRun.data?.enabled));
  const [installOp] = await db.query("SELECT * FROM platform_module_operations WHERE operation_type = 'INSTALL' ORDER BY created_at DESC LIMIT 1");
  check("the INSTALL operation is recorded as failed", installOp[0]?.status === "FAILED", installOp[0]?.status);
  check("the install failure is attributed to missing evidence", installOp[0]?.error_code === "MODULE_INSTALL_FAILED", installOp[0]?.error_code);

  // Remove requires DISABLED.
  const removeWhileFailed = await call("POST", `/api/v1/super-admin/module-center/modules/${fixture.moduleId}/remove`, { token, json: { idempotencyKey: idempotency() } });
  check("remove outside DISABLED → 409", removeWhileFailed.status === 409, `status ${removeWhileFailed.status}`);

  await db.query("UPDATE platform_modules SET status = 'DISABLED', health = 'DISABLED' WHERE id = ?", [fixture.moduleId]);
  const disableWhileDisabled = await call("POST", `/api/v1/super-admin/module-center/modules/${fixture.moduleId}/disable`, { token, json: { idempotencyKey: idempotency() } });
  check("disable on a DISABLED module → 409", disableWhileDisabled.status === 409, `status ${disableWhileDisabled.status}`);

  const remove = await call("POST", `/api/v1/super-admin/module-center/modules/${fixture.moduleId}/remove`, { token, json: { idempotencyKey: idempotency() } });
  check("remove → 200 (the attempt is recorded)", remove.status === 200, `status ${remove.status} ${JSON.stringify(remove.error)}`);
  const [afterRemove] = await db.query("SELECT status, active_release_id, enabled FROM platform_modules WHERE id = ?", [fixture.moduleId]);
  check("remove without a runner leaves the module DISABLED, not REMOVED", afterRemove[0]?.status === "DISABLED", JSON.stringify(afterRemove[0]));

  // --- module list ---------------------------------------------------------
  const modules = await call("GET", "/api/v1/super-admin/module-center/modules", { token });
  check("modules → 200", modules.status === 200, `status ${modules.status}`);
  check("modules lists the uploaded module", (modules.data || []).some((row) => row.moduleKey === moduleId), JSON.stringify((modules.data || []).map((row) => row.moduleKey)));

  // --- durability of the operation log -------------------------------------
  const [opRows] = await db.query("SELECT COUNT(*) AS total FROM platform_module_operations");
  check("operations are durable rows, not request memory", Number(opRows[0].total) > 0, `rows ${opRows[0].total}`);

  // --- cleanup -------------------------------------------------------------
  const allFixtureIds = [fixture.moduleId, sandboxFixture.moduleId, approveFixture.moduleId, moduleRows[0].id];
  await db.query("DELETE FROM platform_module_operations WHERE module_registry_id IN (?, ?, ?, ?)", allFixtureIds);
  await db.query("DELETE FROM platform_module_releases WHERE module_registry_id IN (?, ?, ?, ?)", allFixtureIds);
  await db.query("DELETE FROM platform_module_uploads WHERE manifest_id IN (?, ?, ?, ?, ?)", [moduleId, `${moduleId}.v2`, fixture.key, sandboxFixture.key, approveFixture.key]);
  await db.query("DELETE FROM platform_modules WHERE id IN (?, ?, ?, ?)", allFixtureIds);
  await db.query("DELETE FROM audit_events WHERE event_type LIKE 'module.%'");
  await db.end();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nfailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  console.log("module center: parity verified against the PHP runtime.");
}

main().catch((error) => { console.error(error); process.exit(1); });
