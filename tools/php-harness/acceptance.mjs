/**
 * cPanel deployment — acceptance checks.
 *
 *   node acceptance.mjs <baseUrl> <email> <password> <docroot>
 *
 * Runs the acceptance checklist from php/DEPLOYMENT_VERIFICATION.md against a
 * deployment that was produced with nothing but File Manager, MySQL Databases,
 * phpMyAdmin and a `.env` edit — no Terminal, SSH, Composer, Node, npm, Docker
 * or CLI PHP.
 *
 * The docroot argument lets the checks that are about the *files on disk*
 * (no vendor/, no package.json, no install/, uploads really written, reference
 * data really imported) inspect the deployment directly.
 */
import fs from "node:fs";
import path from "node:path";

const base = (process.argv[2] || "http://localhost:8082").replace(/\/$/, "");
const ident = process.argv[3] || "owner@windels.example";
const pass = process.argv[4] || "Owner!Pass#2026";
const docroot = (process.argv[5] || "/home/user/deploy-test/final-a").replace(/\/$/, "");

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name + (detail ? ` — ${detail}` : "")); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function call(method, p, { token, json, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(base + p, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) , signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body, text, headers: res.headers };
}

async function main() {
  console.log(`acceptance checks against ${base}\n  docroot ${docroot}\n`);

  // ═══════════════════════════════════════════════════════════════ homepage
  console.log("\n[homepage]");
  const home = await call("GET", "/");
  check("GET / → 200", home.status === 200, `status ${home.status}`);
  check("the homepage serves the application shell, not a directory listing",
    /<div id="root"|<html/i.test(home.text) && !home.text.includes("Index of /"), home.text.slice(0, 80));
  const assetMatch = home.text.match(/(?:src|href)="([^"]*assets\/[^"]+\.(?:js|css))"/);
  const assetPath = assetMatch ? assetMatch[1].replace(/^\.?\//, "/") : null;
  if (assetPath) {
    const asset = await call("GET", assetPath);
    check(`the bundled asset is served (${assetPath})`, asset.status === 200, `status ${asset.status}`);
  } else {
    check("the bundled asset is served", false, "no assets/*.js reference found in the homepage");
  }

  // ════════════════════════════════════════════════════════ package contents
  console.log("\n[package contents]");
  check("no vendor/ directory (Composer was never run)", !fs.existsSync(path.join(docroot, "vendor")));
  check("no package.json in the deployment (npm/pnpm were never run)", !fs.existsSync(path.join(docroot, "package.json")));
  check("no install/ directory (no installer command exists)", !fs.existsSync(path.join(docroot, "install")));
  check("no application/config/.secrets.php (all configuration comes from .env)",
    !fs.existsSync(path.join(docroot, "application/config/.secrets.php")));
  check("the CodeIgniter framework ships in system/", fs.existsSync(path.join(docroot, "system/core/CodeIgniter.php")));
  const dbCfg = fs.readFileSync(path.join(docroot, "application/config/database.php"), "utf8");
  check("database credentials come from the environment, not from a committed file",
    dbCfg.includes("getenv('VP_DB_USER')") && !/password'\s*=>\s*'[^']+'/.test(dbCfg), "database.php hardcodes a password");
  check("the deployment ships a .env example to fill in",
    fs.existsSync(path.join(docroot, ".env.example")));

  // ═════════════════════════════════════════════════════════════ db + health
  console.log("\n[database]");
  const health = await call("GET", "/api/v1/health");
  check("GET /api/v1/health → 200", health.status === 200, `status ${health.status}`);
  check("the database connects", health.body?.data?.checks?.db === "ok", JSON.stringify(health.body?.data?.checks));
  check("bootstrap is complete (an administrator exists)", health.body?.data?.bootstrap === "complete",
    String(health.body?.data?.bootstrap));
  check("the pretty URL /healthz also routes (front-controller rewrite)",
    (await call("GET", "/healthz")).status === 200);
  check("health reports no error field", health.body?.data?.error === undefined, JSON.stringify(health.body?.data?.error));

  // ════════════════════════════════════════════════════════════ authentication
  console.log("\n[authentication]");
  const login = await call("POST", "/api/v1/auth/login", { json: { identifier: ident, password: pass } });
  check("POST /api/v1/auth/login → 200", login.status === 200, `status ${login.status}`);
  const token = login.body?.data?.token;
  check("a bearer token is issued", typeof token === "string" && token.split(".").length === 3);
  const claims = token ? JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) : {};
  // A super administrator is an administrator: the module specs promote the
  // harness account to SUPER_ADMIN, and refusing that here would be a false alarm.
  check("the account is an administrator on the live database", claims.role === "admin" || claims.role === "super_admin", JSON.stringify(claims.role));
  check("an anonymous request to a protected endpoint → 401",
    (await call("GET", "/api/v1/auth/me")).status === 401);
  check("a wrong password → 401",
    (await call("POST", "/api/v1/auth/login", { json: { identifier: ident, password: "definitely-wrong" } })).status === 401);
  check("a tampered token → 401",
    (await call("GET", "/api/v1/auth/me", { token: token ? token.slice(0, -3) + "aaa" : "x" })).status === 401);
  const me = await call("GET", "/api/v1/auth/me", { token });
  check("GET /api/v1/auth/me → 200 with the signed-in identity",
    me.status === 200 && me.body?.data?.email === ident, `status ${me.status}`);

  // ═════════════════════════════════════════════════════════════════ sessions
  console.log("\n[sessions]");
  const refresh = login.body?.data?.refreshToken;
  const refreshed = refresh ? await call("POST", "/api/v1/auth/refresh", { json: { refreshToken: refresh } }) : { status: 0 };
  check("a refresh token mints a new access token",
    refreshed.status === 200 && typeof refreshed.body?.data?.token === "string", `status ${refreshed.status}`);
  check("the refreshed token is accepted",
    (await call("GET", "/api/v1/auth/me", { token: refreshed.body?.data?.token })).status === 200);

  const logout = await call("POST", "/api/v1/auth/logout", { token, json: { refreshToken: refresh } });
  check("POST /api/v1/auth/logout → 200", logout.status === 200, `status ${logout.status}`);
  const reuse = refresh ? await call("POST", "/api/v1/auth/refresh", { json: { refreshToken: refresh } }) : { status: 0 };
  check("the refresh token is rejected once logged out", reuse.status === 401, `status ${reuse.status}`);
  const preflight = await fetch(base + "/api/v1/auth/login", {
    method: "OPTIONS", headers: { Origin: "https://windels.test", "Access-Control-Request-Method": "POST" },
      signal: AbortSignal.timeout(30000),
  });
  check("a CORS preflight is answered", preflight.status === 200 || preflight.status === 204, `status ${preflight.status}`);

  // ═══════════════════════════════════════════════════════════════ encryption
  console.log("\n[encryption]");
  const rotated = await call("POST", "/api/v1/account/pin/rotate", { token, json: {} });
  check("a PIN can be sealed with VP_ENCRYPTION_KEY",
    rotated.status === 200 && /^\d{4}$/.test(String(rotated.body?.data?.issuedPin ?? "")), `status ${rotated.status}`);
  const issued = await call("POST", "/api/v1/account/pin/issued", { token, json: {} });
  check("the sealed PIN decrypts back to the value that was sealed",
    issued.body?.data?.issuedPin === rotated.body?.data?.issuedPin,
    `${issued.body?.data?.issuedPin} vs ${rotated.body?.data?.issuedPin}`);
  const dbPin = fs.readFileSync(path.join(docroot, ".env"), "utf8").match(/VP_ENCRYPTION_KEY=(.+)/)?.[1]?.trim();
  check("VP_ENCRYPTION_KEY is configured (the seal depends on it)",
    typeof dbPin === "string" && dbPin.length >= 32, `len=${dbPin?.length}`);

  // ══════════════════════════════════════════════════════════════════ uploads
  console.log("\n[uploads]");
  const uploadDirs = ["uploads", "assets/uploads", "application/storage/uploads"].filter(d => fs.existsSync(path.join(docroot, d)));
  check("at least one writable upload directory exists in the package", uploadDirs.length > 0, uploadDirs.join(","));
  const form = new FormData();
  form.append("file", new Blob([Buffer.from("acceptance probe file")], { type: "text/plain" }), "acceptance-probe.txt");
  const uploadRes = await fetch(base + "/api/v1/files", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(30000) });
  let upload = { status: uploadRes.status, body: null };
  try { upload.body = await uploadRes.json(); } catch { /* not JSON */ }
  check("POST /api/v1/files → 201", upload.status === 201, `status ${upload.status} ${JSON.stringify(upload.body).slice(0, 160)}`);
  const fileId = upload.body?.data?.id;
  let bytesOnDisk = false;
  for (const d of uploadDirs) {
    const found = fs.readdirSync(path.join(docroot, d)).some(f => f.includes("acceptance-probe") || (fileId && f.startsWith(fileId)));
    bytesOnDisk = bytesOnDisk || found;
  }
  check("the uploaded bytes are on disk inside the document root", bytesOnDisk, `searched ${uploadDirs.join(",")}`);
  if (fileId) {
    const readBack = await call("GET", `/api/v1/files/${fileId}`, { token });
    check("the id the upload returned can be fetched back through the API",
      readBack.status === 200 && readBack.text.includes("acceptance probe file"), `status ${readBack.status}`);
  } else {
    check("the id the upload returned can be fetched back through the API", false, "no file id returned");
  }
  const staticUrl = upload.body?.data?.url ? new URL(upload.body.data.url).pathname : null;
  if (staticUrl) {
    const served = await call("GET", staticUrl);
    check("the uploaded file is served from the document root", served.status === 200, `status ${served.status}`);
  } else {
    check("the uploaded file is served from the document root", false, "no url returned");
  }

  // ══════════════════════════════════════════════════════════ settings + data
  console.log("\n[settings and reference data]");
  for (const p of ["/api/v1/settings", "/api/v1/settings/public", "/api/v1/permissions/catalog", "/api/v1/workspace/dashboard"]) {
    const r = await call("GET", p, { token });
    check(`GET ${p} → 200`, r.status === 200, `status ${r.status}`);
  }

  // ═══════════════════════════════════════════════════════════ .htaccess rules
  console.log("\n[host-level protections]");
  for (const p of ["/.env", "/application/config/database.php", "/system/core/CodeIgniter.php", "/database/production.sql", "/composer.json"]) {
    const r = await call("GET", p);
    check(`GET ${p} is refused by the host (→ 403)`, r.status === 403, `status ${r.status}`);
  }

  // ══════════════════════════════════════════════════════ first-run behaviour
  console.log("\n[first-run setup]");
  const setupNow = await call("GET", "/setup?key=acceptance-wrong-key");
  check("/setup refuses a wrong key when an administrator already exists",
    setupNow.status === 403, `status ${setupNow.status}`);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nfailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  console.log("deployment acceptance: all checks passed.");
}

main().catch(e => { console.error(e); process.exit(1); });
