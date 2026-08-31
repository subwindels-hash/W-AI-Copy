/**
 * PHP runtime parity spec — Final Enterprise Integration & Validation.
 *
 * Exercises the validation register, all seven routes:
 *
 *   POST   /api/v1/validation/run
 *   GET    /api/v1/validation/report
 *   GET    /api/v1/validation/history
 *   GET    /api/v1/validation/notes
 *   POST   /api/v1/validation/notes
 *   PATCH  /api/v1/validation/notes/:id
 *   DELETE /api/v1/validation/notes/:id
 *
 * Run:
 *   node tests/php-api/v76validation.spec.mjs http://localhost:8082 \
 *        owner@windels.example 'Owner!Pass#2026' \
 *        <dbUser> <dbPass> <dbName> [dbHost] [dbPort]
 *
 * WHY THIS SPEC IS MOSTLY ABOUT WHAT IS NOT CLAIMED
 * -------------------------------------------------
 * Node's report hard-codes sixteen of its systems as `wired` because someone
 * once wrote a sentence describing them, and passes fifteen of its twenty-two
 * checklist items the same way — "verified in S81 e2e", "csurf middleware
 * mounted in server.ts". Worst of all, its consent probe sets
 * `consentGateOk = true` inside the catch branch, so a probe whose dependency
 * failed to import reports success and calls it "verified in prior e2e run".
 *
 * This port fails closed, and the invariants below are what keep it that way:
 *
 *   1. `consentGateEnforced` and `governanceGateEnforced` are false, because
 *      nothing in this build measured either of them.
 *   2. No checklist item passes while its own detail says it could not be
 *      verified or does not apply — every "not verified" / "not applicable"
 *      item must be false.
 *   3. No system is `wired` without a note naming the table that proved it (or
 *      the kernel round-trip). A wired system that cannot say why is exactly
 *      the fabrication this module is ported to remove.
 *
 * The measured side is asserted too: the kernel round-trip dispatches an event
 * and counts it back, the provider registry is read out of `model_registry`,
 * and the rate-limit verdict is the counter's own value rather than the
 * existence of a config table.
 */
import { createRequire } from "node:module";

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

const V = "/api/v1/validation";

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
  const response = await fetch(base + path, { method, headers, body: json === undefined ? undefined : JSON.stringify(json), signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: response.status, body, text, data: body?.data, error: body?.error };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const stamp = Date.now();

async function registerAccount(label, organization) {
  const email = `v76-${label}-${stamp}@windels.example`;
  const created = await call("POST", "/api/v1/auth/register", { json: { email, password: "Validate!Pass#2026", displayName: `Validate ${label}`, organizationName: organization } });
  if (!created.data?.token) throw new Error(`register ${label} failed: ${JSON.stringify(created.body)}`);
  const login = await call("POST", "/api/v1/auth/login", { json: { email, password: "Validate!Pass#2026" } });
  return { email, login: login.data };
}

async function main() {
  const db = await mysql.createConnection({ host: dbHost, port: dbPort, user: dbUser, password: dbPass, database: dbName });
  const q = async (sql, args) => (await db.query(sql, args))[0];

  console.log(`\nfinal validation parity — ${base}\n`);

  const login = await call("POST", "/api/v1/auth/login", { json: { email: ident, password: pass } });
  const token = login.data?.token;
  check("super admin can sign in", !!token, JSON.stringify(login.body?.error));
  if (!token) { await db.end(); process.exit(1); }

  const board = await registerAccount("board", "Validation Board Org");
  const boardToken = board.login?.token;
  const boardOrg = board.login?.user?.organizationId;
  check("the board fixture signs in to its own organization", !!boardToken && !!boardOrg, JSON.stringify(board.login?.user));
  if (!boardToken || !boardOrg) { await db.end(); process.exit(1); }

  const other = await registerAccount("other", "Validation Other Org");
  const otherToken = other.login?.token;
  const otherOrg = other.login?.user?.organizationId;

  const member = await registerAccount("member", "Validation Member Org");
  await db.query("UPDATE users SET role = 'USER' WHERE id = ?", [member.login.user.id]);
  const memberLogin = await call("POST", "/api/v1/auth/login", { json: { email: member.email, password: "Validate!Pass#2026" } });
  const memberToken = memberLogin.data?.token;
  const memberOrg = memberLogin.data?.user?.organizationId;
  check("the member fixture signs in as a plain user", !!memberToken && memberLogin.data.user.role === "user", JSON.stringify(memberLogin.data?.user));

  const orgs = [boardOrg, otherOrg, memberOrg];

  // ═══════════════════════════════════════════════════════ authentication
  console.log("\n[authentication]");
  for (const [method, path] of [
    ["POST", `${V}/run`],
    ["GET", `${V}/report`],
    ["GET", `${V}/history`],
    ["GET", `${V}/notes`], ["POST", `${V}/notes`],
    ["PATCH", `${V}/notes/v76-00000000`], ["DELETE", `${V}/notes/v76-00000000`],
  ]) {
    const r = await call(method, path, { json: method === "GET" ? undefined : {} });
    check(`${method} ${path.replace(V, "")} without a token → 401`, r.status === 401, `status ${r.status}`);
  }

  // ═══════════════════════════════════════════════════════ admin gate
  console.log("\n[admin gate]");
  for (const [method, path] of [
    ["POST", `${V}/run`],
    ["GET", `${V}/report`],
    ["GET", `${V}/history`],
    ["GET", `${V}/notes`], ["POST", `${V}/notes`],
    ["PATCH", `${V}/notes/v76-00000000`], ["DELETE", `${V}/notes/v76-00000000`],
  ]) {
    const r = await call(method, path, { token: memberToken, json: method === "GET" ? undefined : {} });
    check(`${method} ${path.replace(V, "")} as a plain user → 403`, r.status === 403, `status ${r.status}`);
  }
  const denied = await call("GET", `${V}/history`, { token: memberToken });
  check("403 says Admins only, as Node does", denied.error?.message === "Admins only", JSON.stringify(denied.error));

  // ══════════════════════════════════════════════════ nothing is on file yet
  console.log("\n[a fresh organization has nothing on file]");
  check("GET /history → 200 []", (await call("GET", `${V}/history`, { token: boardToken })).data?.length === 0, "expected an empty history");
  check("GET /notes → 200 []", (await call("GET", `${V}/notes`, { token: boardToken })).data?.length === 0, "expected an empty ledger");
  const reportsOnFile = (await q("SELECT COUNT(*) n FROM v76_reports WHERE organization_id = ?", [boardOrg]))[0].n;
  check("no report row exists until something runs one", Number(reportsOnFile) === 0, `rows ${reportsOnFile}`);

  // ═══════════════════════════════════════════════════════ running a report
  console.log("\n[POST /run]");
  const run = await call("POST", `${V}/run`, { token: boardToken });
  const r0 = run.data ?? {};
  check("POST /run → 200", run.status === 200, `status ${run.status}`);
  check("the report id is Node's `v76r_` plus 16 hex", /^v76r_[0-9a-f]{16}$/.test(r0.reportId ?? ""), String(r0.reportId));
  check("generatedAt is an ISO timestamp", ISO.test(r0.generatedAt ?? ""), String(r0.generatedAt));
  check("the counters add up to the probed systems",
    r0.totalSystems === (r0.wired ?? 0) + (r0.stubs ?? 0) + (r0.missing ?? 0), JSON.stringify([r0.totalSystems, r0.wired, r0.stubs, r0.missing]));
  check("every probed system carries a key, a name, a status and a note",
    Array.isArray(r0.systems) && r0.systems.every((s) => !!s.key && !!s.name && ["wired", "stub", "missing"].includes(s.status) && typeof s.notes === "string" && s.notes.length > 0),
    JSON.stringify((r0.systems ?? []).slice(0, 2)));
  check("the twenty-two item checklist is returned", Array.isArray(r0.checklist) && r0.checklist.length === 22, `items ${r0.checklist?.length}`);
  const durable = await q("SELECT * FROM v76_reports WHERE id = ?", [r0.reportId]);
  check("the report body is durable in MySQL, not a request-scoped object", durable.length === 1, `rows ${durable.length}`);
  check("the row is scoped to the caller's organization", durable[0]?.organization_id === boardOrg, String(durable[0]?.organization_id));
  // mysql2 hands JSON columns back already parsed; a string is what a raw
  // driver would give, so both are handled.
  const storedBody = typeof durable[0].body === "string" ? JSON.parse(durable[0].body) : durable[0].body;
  check("the stored body carries the systems and the checklist",
    Array.isArray(storedBody.systems) && storedBody.systems.length === r0.totalSystems && Array.isArray(storedBody.checklist),
    JSON.stringify(Object.keys(storedBody)));

  // ═══════════════════════════════════ the honesty invariants
  console.log("\n[what the report is not allowed to claim]");
  check("consentGateEnforced is false — nothing in this build measured it", r0.consentGateEnforced === false, String(r0.consentGateEnforced));
  check("governanceGateEnforced is false — nothing in this build measured it", r0.governanceGateEnforced === false, String(r0.governanceGateEnforced));
  const unverifiable = (r0.checklist ?? []).filter((c) => /^(not verified|not applicable)/.test(c.detail ?? ""));
  check("there ARE items this build cannot verify, so the rule is exercised", unverifiable.length >= 10, `${unverifiable.length} items`);
  check("no item passes while its own detail says it was not verified or does not apply",
    unverifiable.every((c) => c.passed === false),
    JSON.stringify(unverifiable.filter((c) => c.passed !== false).map((c) => c.item)));
  check("no fabricated pass: the consent item says why it could not be checked",
    (r0.checklist ?? []).find((c) => /consent gate/.test(c.item))?.detail.includes("not verified"), "expected an explicit reason");
  const wiredWithoutProof = (r0.systems ?? []).filter((s) => s.status === "wired" &&
    !/present in this deployment/.test(s.notes ?? "") && !/durable in kernel_events/.test(s.notes ?? ""));
  check("every wired system names the thing that proved it", wiredWithoutProof.length === 0, JSON.stringify(wiredWithoutProof));
  const stubbed = (r0.systems ?? []).filter((s) => s.status === "stub");
  check("every stub says what it is out of scope for", stubbed.every((s) => (s.notes ?? "").length > 20), JSON.stringify(stubbed.map((s) => s.notes)));

  console.log("\n[what the report does measure]");
  const kernelItem = (r0.checklist ?? []).find((c) => /Kernel event routing/.test(c.item));
  check("the kernel round-trip passed because an event was dispatched and counted back",
    kernelItem?.passed === true && /durable in kernel_events/.test(kernelItem.detail ?? ""), JSON.stringify(kernelItem));
  check("the AIO bus system is wired on the strength of that round-trip",
    (r0.systems ?? []).find((s) => s.key === "aio-bus")?.status === "wired", JSON.stringify((r0.systems ?? []).find((s) => s.key === "aio-bus")));
  const providerItem = (r0.checklist ?? []).find((c) => /No hard-coded AI providers/.test(c.item));
  check("the vendor-neutrality item reads the provider registry rather than a constant",
    providerItem?.passed === true && /model_registry/.test(providerItem.detail ?? ""), JSON.stringify(providerItem));
  const rateItem = (r0.checklist ?? []).find((c) => /Rate limits enforced/.test(c.item));
  check("the rate-limit item fails on the counter rather than passing on configuration",
    rateItem?.passed === false && /rate-limit counter has recorded/.test(rateItem.detail ?? ""), JSON.stringify(rateItem));
  const adminItem = (r0.checklist ?? []).find((c) => /Organization admin guards/.test(c.item));
  check("the admin-guard item is the check that admitted this request", adminItem?.passed === true, JSON.stringify(adminItem));
  const pings = (await q("SELECT COUNT(*) n FROM kernel_events WHERE kind = 'v76-validation.ping' AND source = 'v76-validation' AND organization_id = ?", [boardOrg]))[0].n;
  check("one run dispatches exactly one kernel ping", Number(pings) === 1, `pings ${pings}`);

  console.log("\n[systems this build has and has not]");
  const statusOf = (key) => (r0.systems ?? []).find((s) => s.key === key)?.status;
  for (const key of ["kernel", "memory", "security", "governance", "analytics", "identity", "developer", "notification", "marketplace", "trust-center", "mission-control"]) {
    check(`${key} is wired — its module is ported`, statusOf(key) === "wired", String(statusOf(key)));
  }
  for (const key of ["voice-studio", "trading-intel", "federated", "wearables", "knowledge-graph", "ai-workforce"]) {
    check(`${key} is missing — it is not in this build`, statusOf(key) === "missing", String(statusOf(key)));
  }
  for (const key of ["cloud", "edge", "airgap"]) {
    check(`${key} is a declared stub, not a claimed deployment`, statusOf(key) === "stub", String(statusOf(key)));
  }
  check("the systems count is above what Node's twenty-threshold port would fake",
    r0.wired > 0 && r0.wired < r0.totalSystems, JSON.stringify([r0.wired, r0.totalSystems]));

  // ═══════════════════════════════════════════════════════ reading a report
  console.log("\n[GET /report and /history]");
  const first = await call("GET", `${V}/report`, { token: boardToken });
  check("GET /report → 200", first.status === 200, `status ${first.status}`);
  check("GET /report returns the report that was just run, without re-running it", first.data?.reportId === r0.reportId, `${first.data?.reportId} vs ${r0.reportId}`);
  const afterFirst = (await q("SELECT COUNT(*) n FROM v76_reports WHERE organization_id = ?", [boardOrg]))[0].n;
  check("a read does not add a report", Number(afterFirst) === 1, `rows ${afterFirst}`);

  const second = await call("POST", `${V}/run`, { token: boardToken });
  check("a second run stores a second report", second.data?.reportId !== r0.reportId, String(second.data?.reportId));
  const history = await call("GET", `${V}/history`, { token: boardToken });
  check("GET /history → 200 with both reports", history.data?.length === 2, `count ${history.data?.length}`);
  check("history is newest first", history.data?.[0]?.id === second.data.reportId, String(history.data?.[0]?.id));
  check("each history entry is a summary, not the whole body",
    history.data?.every((h) => typeof h.id === "string" && ISO.test(h.generatedAt ?? "") && Number.isInteger(h.wired) && Number.isInteger(h.stubs) && Number.isInteger(h.missing) && h.systems === undefined),
    JSON.stringify(history.data?.[0]));
  check("the newest report is the one GET /report returns",
    (await call("GET", `${V}/report`, { token: boardToken })).data?.reportId === second.data.reportId, "expected the newest");

  console.log("\n[GET /report on an organization with nothing on file]");
  const freshHistory = await call("GET", `${V}/history`, { token: otherToken });
  check("the second organization starts with no history", freshHistory.data?.length === 0, `count ${freshHistory.data?.length}`);
  const freshReport = await call("GET", `${V}/report`, { token: otherToken });
  check("GET /report on a fresh organization runs the first report, as Node does",
    freshReport.status === 200 && !!freshReport.data?.reportId, `${freshReport.status} ${JSON.stringify(freshReport.data ?? {}).slice(0, 120)}`);
  check("and that first report is now on file",
    (await call("GET", `${V}/history`, { token: otherToken })).data?.length === 1, "expected one");

  console.log("\n[the history cap]");
  for (let i = 0; i < 22; i += 1) await call("POST", `${V}/run`, { token: otherToken });
  const capped = await call("GET", `${V}/history`, { token: otherToken });
  check("history is capped at 20 reports, as Node's zset trim did", capped.data?.length === 20, `count ${capped.data?.length}`);
  check("the cap keeps the newest and drops the oldest", capped.data?.[0]?.id !== freshReport.data.reportId, String(capped.data?.[0]?.id));
  const rows = (await q("SELECT COUNT(*) n FROM v76_reports WHERE organization_id = ?", [otherOrg]))[0].n;
  check("trimming deletes the rows, it does not just hide them", Number(rows) === 20, `rows ${rows}`);

  // ═══════════════════════════════════════════════════════ the notes ledger
  console.log("\n[the notes ledger]");
  const note = await call("POST", `${V}/notes`, { token: boardToken, json: { title: "Runbook", body: "Re-run after every release." } });
  const n0 = note.data ?? {};
  check("POST /notes → 201", note.status === 201, `status ${note.status}`);
  check("the note id is Node's `v76-` plus 8 hex", /^v76-[0-9a-f]{8}$/.test(n0.id ?? ""), String(n0.id));
  check("tags default to an empty array", Array.isArray(n0.tags) && n0.tags.length === 0, JSON.stringify(n0.tags));
  check("createdAt is an ISO timestamp", ISO.test(n0.createdAt ?? ""), String(n0.createdAt));
  check("createdBy is the author", n0.createdBy === board.login.user.id, `${n0.createdBy} vs ${board.login.user.id}`);
  const noteRow = await q("SELECT * FROM v76_notes WHERE id = ?", [n0.id]);
  check("the note is durable in MySQL and scoped to the organization",
    noteRow.length === 1 && noteRow[0].organization_id === boardOrg, JSON.stringify(noteRow[0]?.organization_id));

  const tagged = await call("POST", `${V}/notes`, { token: boardToken, json: { title: "Follow-up", body: "Check the rate limiter.", tags: ["ops", "v76"] } });
  check("tags are stored as given", JSON.stringify(tagged.data?.tags) === JSON.stringify(["ops", "v76"]), JSON.stringify(tagged.data?.tags));
  const listed = await call("GET", `${V}/notes`, { token: boardToken });
  check("GET /notes lists both notes newest first",
    listed.data?.length === 2 && listed.data[0].id === tagged.data.id, JSON.stringify((listed.data ?? []).map((n) => n.id)));

  const patched = await call("PATCH", `${V}/notes/${n0.id}`, { token: boardToken, json: { title: "Runbook v2" } });
  check("PATCH /notes/:id → 200", patched.status === 200, `status ${patched.status}`);
  check("a partial patch changes only what it names",
    patched.data?.title === "Runbook v2" && patched.data?.body === n0.body, JSON.stringify(patched.data));
  check("an empty patch is a no-op that still returns the note",
    (await call("PATCH", `${V}/notes/${n0.id}`, { token: boardToken, json: {} })).data?.title === "Runbook v2", "expected the note back");
  check("PATCH an unknown note → 404", (await call("PATCH", `${V}/notes/v76-deadbeef`, { token: boardToken, json: { title: "x2" } })).status === 404, "expected 404");
  check("DELETE /notes/:id → 204", (await call("DELETE", `${V}/notes/${n0.id}`, { token: boardToken })).status === 204, "expected 204");
  check("deleting twice → 404", (await call("DELETE", `${V}/notes/${n0.id}`, { token: boardToken })).status === 404, "expected 404");
  check("GET /notes/:id → 404 — Node defines no such route",
    (await call("GET", `${V}/notes/${tagged.data.id}`, { token: boardToken })).status === 404, "expected 404");

  for (const [name, json] of [
    ["no title", { body: "body text" }],
    ["a one-character title", { title: "x", body: "body text" }],
    ["a 201-character title", { title: "x".repeat(201), body: "body text" }],
    ["no body", { title: "titled" }],
    ["a one-character body", { title: "titled", body: "x" }],
    ["a 4001-character body", { title: "titled", body: "x".repeat(4001) }],
    ["tags that are not an array", { title: "titled", body: "body", tags: "ops" }],
    ["more than 20 tags", { title: "titled", body: "body", tags: Array(21).fill("t") }],
    ["a tag over 40 characters", { title: "titled", body: "body", tags: ["x".repeat(41)] }],
    ["a non-string tag", { title: "titled", body: "body", tags: [7] }],
  ]) {
    const r = await call("POST", `${V}/notes`, { token: boardToken, json });
    check(`POST /notes with ${name} → 422`, r.status === 422, `status ${r.status}`);
  }
  check("PATCH /notes/:id with a one-character title → 422",
    (await call("PATCH", `${V}/notes/${tagged.data.id}`, { token: boardToken, json: { title: "x" } })).status === 422, "expected 422");
  for (const [name, id] of [["a two-character id", "v7"], ["a 65-character id", "v76-" + "0".repeat(61)]]) {
    check(`PATCH /notes/:id with ${name} → 422`,
      (await call("PATCH", `${V}/notes/${id}`, { token: boardToken, json: { title: "titled" } })).status === 422, "expected 422");
    check(`DELETE /notes/:id with ${name} → 422`,
      (await call("DELETE", `${V}/notes/${id}`, { token: boardToken })).status === 422, "expected 422");
  }

  // ═══════════════════════════════════════════════════ the tenant boundary
  console.log("\n[the tenant boundary]");
  check("another organization cannot patch this organization's note",
    (await call("PATCH", `${V}/notes/${tagged.data.id}`, { token: otherToken, json: { title: "hijacked" } })).status === 404, "expected 404");
  check("another organization cannot delete this organization's note",
    (await call("DELETE", `${V}/notes/${tagged.data.id}`, { token: otherToken })).status === 404, "expected 404");
  const otherHistory = await call("GET", `${V}/history`, { token: otherToken });
  const boardHistory = await call("GET", `${V}/history`, { token: boardToken });
  // Two runs for the board organization (the first and the second above), the
  // capped twenty for the other one.
  check("histories are separate and stay that way",
    otherHistory.data?.length === 20 && boardHistory.data?.length === 2, `${otherHistory.data?.length} / ${boardHistory.data?.length}`);
  check("no history entry from one organization appears in the other's",
    boardHistory.data.every((h) => !otherHistory.data.some((o) => o.id === h.id)), "ids crossed the boundary");
  check("another organization's notes ledger is its own",
    (await call("GET", `${V}/notes`, { token: otherToken })).data?.length === 0, "expected none");

  // ═══════════════════════════════════════════════════════ method guards
  console.log("\n[method guards]");
  check("GET /run → 405", (await call("GET", `${V}/run`, { token: boardToken })).status === 405);
  check("POST /report → 405", (await call("POST", `${V}/report`, { token: boardToken, json: {} })).status === 405);
  check("POST /history → 405", (await call("POST", `${V}/history`, { token: boardToken, json: {} })).status === 405);
  check("PUT /notes → 405", (await call("PUT", `${V}/notes`, { token: boardToken, json: {} })).status === 405);
  check("POST /notes/:id → 405", (await call("POST", `${V}/notes/${tagged.data.id}`, { token: boardToken, json: {} })).status === 405);

  // ── cleanup ────────────────────────────────────────────────────────────
  for (const table of ["v76_reports", "v76_notes", "kernel_events"]) {
    await db.query(`DELETE FROM ${table} WHERE organization_id IN (?, ?, ?)`, orgs);
  }
  await db.query("DELETE FROM users WHERE email IN (?, ?, ?)", [board.email, other.email, member.email]);
  await db.end();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nfailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  console.log("final validation: parity verified against the PHP runtime.");
}

main().catch((error) => { console.error(error); process.exit(1); });
