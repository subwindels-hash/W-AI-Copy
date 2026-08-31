/**
 * PHP runtime parity spec — Autonomous Organization (Node routes/autonomous.ts).
 *
 * Exercises the board-decision approval register, all six routes:
 *
 *   GET    /api/v1/autonomous/dashboard/rollup
 *   GET    /api/v1/autonomous/decisions
 *   POST   /api/v1/autonomous/decisions                 (admin)
 *   GET    /api/v1/autonomous/decisions/:id
 *   POST   /api/v1/autonomous/decisions/:id/resolve     (admin)
 *   DELETE /api/v1/autonomous/decisions/:id             (admin)
 *
 * Run:
 *   node tests/php-api/autonomous.spec.mjs http://localhost:8082 \
 *        owner@windels.example 'Owner!Pass#2026' \
 *        <dbUser> <dbPass> <dbName> [dbHost] [dbPort]
 *
 * The register is organization-scoped, so the spec does its arithmetic in a
 * throwaway organization it owns outright: a registered account is the ADMIN
 * of a brand-new org, which makes every count below exact instead of
 * "whatever else happens to be in the database". A second account is demoted
 * to USER to exercise the admin gate, and the harness super admin stays in its
 * own organization for the cross-tenant checks.
 *
 * What this spec deliberately asserts as ZERO
 * -------------------------------------------
 * budgetsTotalUsd, budgetsSpentYtdPct, boardSeats, aiExecutives, plans and the
 * per-department budgetUsd/spendYtdUsd/headcount/aiAgents are literal zeros in
 * the Node service because no ledger backs them. The port keeps them as zeros
 * rather than adding columns that would make invented figures look retrieved —
 * so they are asserted, not skipped. autonomousSavings30dUsd is the one number
 * derived from real rows and it is labelled by impactKind as an approved
 * estimate, never as realized savings.
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
  const response = await fetch(base + path, { method, headers, body: json !== undefined ? JSON.stringify(json) : undefined });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: response.status, body, text, data: body?.data, error: body?.error };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const stamp = Date.now();
const pad = (field, length) => field.repeat(Math.ceil(length / field.length)).slice(0, length);

const proposal = (over = {}) => ({
  title: "Consolidate the Abuja logistics hub",
  department: "Finance",
  recommendation: "Move regional distribution to a single hub and renegotiate the haulage contract.",
  confidence: 0.82,
  riskLevel: "med",
  estimatedImpactUsd: 125000,
  reasoning: "Three overlapping contracts expire within the quarter; consolidating removes duplicated standing charges.",
  ...over,
});

async function registerAccount(db, label, organization) {
  const email = `aut-${label}-${stamp}@windels.example`;
  const created = await call("POST", "/api/v1/auth/register", { json: { email, password: "Autonomous!Pass#2026", displayName: `Autonomous ${label}`, organizationName: organization } });
  if (!created.data?.token) throw new Error(`register ${label} failed: ${JSON.stringify(created.body)}`);
  return email;
}

async function main() {
  const db = await mysql.createConnection({ host: dbHost, port: dbPort, user: dbUser, password: dbPass, database: dbName });

  console.log(`\nautonomous parity — ${base}\n`);

  // ── super admin (its own organization) ───────────────────────────────────
  const login = await call("POST", "/api/v1/auth/login", { json: { email: ident, password: pass } });
  const token = login.data?.token;
  check("super admin can sign in", !!token, JSON.stringify(login.body?.error));
  if (!token) { await db.end(); process.exit(1); }

  // ── a board-level account whose organization only this spec writes to ────
  const boardEmail = await registerAccount(db, "board", "Autonomous Board Org");
  const boardLogin = await call("POST", "/api/v1/auth/login", { json: { email: boardEmail, password: "Autonomous!Pass#2026" } });
  const boardToken = boardLogin.data?.token;
  const boardOrg = boardLogin.data?.user?.organizationId;
  check("the board fixture signs in as an administrator of its own organization",
    !!boardToken && !!boardOrg && boardLogin.data.user.role === "admin",
    JSON.stringify(boardLogin.data?.user));
  if (!boardToken || !boardOrg) { await db.end(); process.exit(1); }

  // ── a plain member for the admin gate ────────────────────────────────────
  const memberEmail = await registerAccount(db, "member", "Autonomous Member Org");
  const firstLogin = await call("POST", "/api/v1/auth/login", { json: { email: memberEmail, password: "Autonomous!Pass#2026" } });
  await db.query("UPDATE users SET role = 'USER' WHERE id = ?", [firstLogin.data.user.id]);
  const memberLogin = await call("POST", "/api/v1/auth/login", { json: { email: memberEmail, password: "Autonomous!Pass#2026" } });
  const memberToken = memberLogin.data?.token;
  check("the member fixture signs in as a plain user", !!memberToken && memberLogin.data.user.role === "user", JSON.stringify(memberLogin.data?.user));

  // ═══════════════════════════════════════════════════════ authentication
  console.log("\n[authentication]");
  for (const [method, path] of [
    ["GET", "/api/v1/autonomous/dashboard/rollup"],
    ["GET", "/api/v1/autonomous/decisions"],
    ["POST", "/api/v1/autonomous/decisions"],
    ["GET", "/api/v1/autonomous/decisions/decision-x"],
    ["POST", "/api/v1/autonomous/decisions/decision-x/resolve"],
    ["DELETE", "/api/v1/autonomous/decisions/decision-x"],
  ]) {
    const r = await call(method, path, { json: method === "GET" ? undefined : {} });
    check(`${method} ${path} without a token → 401`, r.status === 401, `status ${r.status}`);
  }
  const badToken = await call("GET", "/api/v1/autonomous/decisions", { token: "not-a-jwt" });
  check("a malformed token → 401", badToken.status === 401, `status ${badToken.status}`);

  // ═══════════════════════════════════════════════════════ empty register
  console.log("\n[empty register]");
  const emptyList = await call("GET", "/api/v1/autonomous/decisions", { token: boardToken });
  check("GET /decisions on a fresh organization → 200 []", emptyList.status === 200 && Array.isArray(emptyList.data) && emptyList.data.length === 0, JSON.stringify(emptyList.body));

  const empty = await call("GET", "/api/v1/autonomous/dashboard/rollup", { token: boardToken });
  const e = empty.data ?? {};
  check("GET /dashboard/rollup → 200", empty.status === 200, `status ${empty.status}`);
  check("empty dashboard: autonomyIndex 0", e.autonomyIndex === 0, String(e.autonomyIndex));
  check("empty dashboard: decisionsToday 0", e.decisionsToday === 0, String(e.decisionsToday));
  check("empty dashboard: humanOverrideRatePct 0", e.humanOverrideRatePct === 0, String(e.humanOverrideRatePct));
  check("empty dashboard: governanceCompliancePct 0 (nothing filed yet)", e.governanceCompliancePct === 0, String(e.governanceCompliancePct));
  check("empty dashboard: budgetsTotalUsd 0 — no budget ledger exists", e.budgetsTotalUsd === 0, String(e.budgetsTotalUsd));
  check("empty dashboard: budgetsSpentYtdPct 0", e.budgetsSpentYtdPct === 0, String(e.budgetsSpentYtdPct));
  check("empty dashboard: boardSeats 0 — no board ledger exists", e.boardSeats === 0, String(e.boardSeats));
  check("empty dashboard: aiExecutives 0 — no executive registry exists", e.aiExecutives === 0, String(e.aiExecutives));
  check("empty dashboard: departments []", Array.isArray(e.departments) && e.departments.length === 0, JSON.stringify(e.departments));
  check("empty dashboard: plans [] — no strategy store exists", Array.isArray(e.plans) && e.plans.length === 0, JSON.stringify(e.plans));
  check("empty dashboard: openApprovals 0", e.openApprovals === 0, String(e.openApprovals));
  check("empty dashboard: constitutionEnforced 0", e.constitutionEnforced === 0, String(e.constitutionEnforced));
  check("empty dashboard: autonomousSavings30dUsd 0", e.autonomousSavings30dUsd === 0, String(e.autonomousSavings30dUsd));
  check("empty dashboard: impactKind 'none'", e.impactKind === "none", String(e.impactKind));
  check("empty dashboard: the human-approval guardrail is stated",
    e.guardrails?.[0]?.id === "human-approval-required" && /requires an authenticated human decision/.test(e.guardrails[0].policy || ""),
    JSON.stringify(e.guardrails?.[0]));
  check("empty dashboard: nothing is blocked because nothing is pending", e.guardrails?.[0]?.blockedActions30d === 0, String(e.guardrails?.[0]?.blockedActions30d));
  check("empty dashboard: no violations are reported", e.guardrails?.[0]?.violations30d === 0, String(e.guardrails?.[0]?.violations30d));

  // ═══════════════════════════════════════════════════════ admin gate
  console.log("\n[admin gate]");
  const memberPropose = await call("POST", "/api/v1/autonomous/decisions", { token: memberToken, json: proposal() });
  check("POST /decisions as a plain user → 403", memberPropose.status === 403, `status ${memberPropose.status}`);
  check("403 explains administrator access is required", /administrator/i.test(memberPropose.error?.message || ""), JSON.stringify(memberPropose.error));
  check("the rejected proposal is NOT written", (await call("GET", "/api/v1/autonomous/decisions", { token: memberToken })).data.length === 0);
  const memberResolve = await call("POST", "/api/v1/autonomous/decisions/decision-x/resolve", { token: memberToken, json: { approved: true } });
  check("POST /decisions/:id/resolve as a plain user → 403", memberResolve.status === 403, `status ${memberResolve.status}`);
  const memberDelete = await call("DELETE", "/api/v1/autonomous/decisions/decision-x", { token: memberToken });
  check("DELETE /decisions/:id as a plain user → 403", memberDelete.status === 403, `status ${memberDelete.status}`);
  const memberDashboard = await call("GET", "/api/v1/autonomous/dashboard/rollup", { token: memberToken });
  check("GET /dashboard/rollup is readable by a plain user → 200", memberDashboard.status === 200, `status ${memberDashboard.status}`);
  check("GET /decisions is readable by a plain user → 200", (await call("GET", "/api/v1/autonomous/decisions", { token: memberToken })).status === 200);

  // ═══════════════════════════════════════════════════════ propose: validation
  console.log("\n[propose — validation]");
  const cases = [
    ["no body at all", {}],
    ["empty title", proposal({ title: "" })],
    ["whitespace-only title", proposal({ title: "   " })],
    ["title over 200 characters", proposal({ title: pad("t", 201) })],
    ["missing department", proposal({ department: undefined })],
    ["department over 64 characters", proposal({ department: pad("d", 65) })],
    ["missing recommendation", proposal({ recommendation: undefined })],
    ["recommendation over 10000 characters", proposal({ recommendation: pad("r", 10001) })],
    ["missing reasoning", proposal({ reasoning: undefined })],
    ["reasoning over 20000 characters", proposal({ reasoning: pad("g", 20001) })],
    ["confidence above 1", proposal({ confidence: 1.5 })],
    ["confidence below 0", proposal({ confidence: -0.1 })],
    ["confidence not numeric", proposal({ confidence: "high" })],
    ["missing confidence", proposal({ confidence: undefined })],
    ["unknown riskLevel", proposal({ riskLevel: "severe" })],
    ["missing riskLevel", proposal({ riskLevel: undefined })],
    ["missing estimatedImpactUsd", proposal({ estimatedImpactUsd: undefined })],
    ["estimatedImpactUsd not numeric", proposal({ estimatedImpactUsd: "lots" })],
    ["estimatedImpactUsd not finite", proposal({ estimatedImpactUsd: 1e999 })],
  ];
  for (const [name, body] of cases) {
    const r = await call("POST", "/api/v1/autonomous/decisions", { token: boardToken, json: body });
    check(`POST /decisions with ${name} → 422`, r.status === 422, `status ${r.status}`);
  }
  check("no proposal was written by any rejected create",
    (await call("GET", "/api/v1/autonomous/decisions", { token: boardToken })).data.length === 0);

  // ═══════════════════════════════════════════════════════ propose: success
  console.log("\n[propose — success]");
  const created = await call("POST", "/api/v1/autonomous/decisions", { token: boardToken, json: proposal({ title: "  Consolidate the Abuja logistics hub  " }) });
  check("POST /decisions → 201", created.status === 201, `status ${created.status} ${JSON.stringify(created.body?.error)}`);
  const d0 = created.data ?? {};
  check("the id is a decision-<uuid>", /^decision-[0-9a-f-]{36}$/.test(String(d0.id)), String(d0.id));
  check("the title is trimmed", d0.title === "Consolidate the Abuja logistics hub", String(d0.title));
  check("the department is stored", d0.department === "Finance", String(d0.department));
  check("a new proposal is awaiting_human", d0.status === "awaiting_human", String(d0.status));
  check("confidence is a JSON number, not a string", typeof d0.confidence === "number" && d0.confidence === 0.82, `${typeof d0.confidence} ${d0.confidence}`);
  check("estimatedImpactUsd is a JSON number", typeof d0.estimatedImpactUsd === "number" && d0.estimatedImpactUsd === 125000, `${typeof d0.estimatedImpactUsd} ${d0.estimatedImpactUsd}`);
  check("riskLevel is stored", d0.riskLevel === "med", String(d0.riskLevel));
  check("no human approver yet", d0.humanApprover === null, JSON.stringify(d0.humanApprover));
  check("not decided yet", d0.decidedAt === null, JSON.stringify(d0.decidedAt));
  check("no decision note yet", d0.decisionNote === null, JSON.stringify(d0.decisionNote));
  check("createdAt is an ISO timestamp", ISO.test(String(d0.createdAt)), String(d0.createdAt));
  check("the proposal is readable by id", (await call("GET", `/api/v1/autonomous/decisions/${d0.id}`, { token: boardToken })).data?.id === d0.id);
  const rowStored = (await db.query("SELECT organization_id FROM autonomous_decisions WHERE id = ?", [d0.id]))[0];
  check("the row is stamped with the caller's organization", rowStored?.[0]?.organization_id === boardOrg, `${rowStored?.[0]?.organization_id} vs ${boardOrg}`);

  // boundary values Node accepts
  const edge = await call("POST", "/api/v1/autonomous/decisions", { token: boardToken, json: proposal({ title: "z", department: "Q", recommendation: "r", reasoning: "g", confidence: 1, riskLevel: "critical", estimatedImpactUsd: -500.75 }) });
  check("confidence 1 and a negative impact are accepted (Node allows any finite number)", edge.status === 201, `status ${edge.status} ${JSON.stringify(edge.body?.error)}`);
  check("confidence 1 is stored as 1", edge.data?.confidence === 1, String(edge.data?.confidence));
  check("a negative impact round-trips", edge.data?.estimatedImpactUsd === -500.75, String(edge.data?.estimatedImpactUsd));
  await call("DELETE", `/api/v1/autonomous/decisions/${edge.data.id}`, { token: boardToken });

  // ═══════════════════════════════════════════════════════ organization scope
  console.log("\n[organization scope]");
  const crossGet = await call("GET", `/api/v1/autonomous/decisions/${d0.id}`, { token: memberToken });
  check("a decision from another organization → 404 (not 403)", crossGet.status === 404, `status ${crossGet.status}`);
  check("404 names the resource once", crossGet.error?.code === "NOT_FOUND", JSON.stringify(crossGet.error));
  const crossSuper = await call("GET", `/api/v1/autonomous/decisions/${d0.id}`, { token });
  check("the harness admin cannot read it either → 404", crossSuper.status === 404, `status ${crossSuper.status}`);
  const crossResolve = await call("POST", `/api/v1/autonomous/decisions/${d0.id}/resolve`, { token, json: { approved: true } });
  check("resolving another organization's decision → 404, not 200", crossResolve.status === 404, `status ${crossResolve.status}`);
  const crossDelete = await call("DELETE", `/api/v1/autonomous/decisions/${d0.id}`, { token });
  check("deleting another organization's decision → 404, not 200", crossDelete.status === 404, `status ${crossDelete.status}`);
  check("the cross-tenant delete did not remove the row",
    (await db.query("SELECT COUNT(*) n FROM autonomous_decisions WHERE id = ?", [d0.id]))[0][0].n === 1);
  check("the member's own list stays empty", (await call("GET", "/api/v1/autonomous/decisions", { token: memberToken })).data.length === 0);

  // ═══════════════════════════════════════════════════════ list + filters
  console.log("\n[list and filters]");
  const finance = await call("POST", "/api/v1/autonomous/decisions", {
    token: boardToken,
    json: proposal({ title: "Renegotiate the haulage contract", department: "Finance", estimatedImpactUsd: 1000, confidence: 0.9, riskLevel: "low" }),
  });
  const financeReject = await call("POST", "/api/v1/autonomous/decisions", {
    token: boardToken,
    json: proposal({ title: "Close the Enugu depot", department: "Finance", estimatedImpactUsd: 2500.5, confidence: 0.4, riskLevel: "high" }),
  });
  const operations = await call("POST", "/api/v1/autonomous/decisions", {
    token: boardToken,
    json: proposal({ title: "Second-shift picking robots", department: "Operations", estimatedImpactUsd: 750.25, confidence: 0.5, riskLevel: "med" }),
  });
  const logistics = await call("POST", "/api/v1/autonomous/decisions", {
    token: boardToken,
    json: proposal({ title: "Outbound freight pooling", department: "Ops & Logistics", estimatedImpactUsd: 100, confidence: 0.7, riskLevel: "low" }),
  });

  const all = await call("GET", "/api/v1/autonomous/decisions", { token: boardToken });
  check("GET /decisions returns every proposal in the organization", all.data.length === 5, `count ${all.data.length}`);
  check("decisions are newest first", (() => {
    const stamps = all.data.map((d) => d.createdAt);
    return stamps.every((s, i) => i === 0 || stamps[i - 1] >= s);
  })(), JSON.stringify(all.data.map((d) => d.createdAt)));

  const byStatus = await call("GET", "/api/v1/autonomous/decisions?status=awaiting_human", { token: boardToken });
  check("filter status=awaiting_human → all five are still pending", byStatus.data.length === 5, `count ${byStatus.data.length}`);
  const byDepartment = await call("GET", "/api/v1/autonomous/decisions?department=Finance", { token: boardToken });
  check("filter department=Finance → 3 rows", byDepartment.data.length === 3, `count ${byDepartment.data.length}`);
  check("the department filter is exact, not a prefix match",
    (await call("GET", "/api/v1/autonomous/decisions?department=Ops", { token: boardToken })).data.length === 0);
  const byLimit = await call("GET", "/api/v1/autonomous/decisions?limit=2", { token: boardToken });
  check("limit=2 → 2 rows", byLimit.data.length === 2, `count ${byLimit.data.length}`);
  check("limit=1 → 1 row", (await call("GET", "/api/v1/autonomous/decisions?limit=1", { token: boardToken })).data.length === 1);
  check("limit=0 → 422", (await call("GET", "/api/v1/autonomous/decisions?limit=0", { token: boardToken })).status === 422);
  check("limit=101 → 422", (await call("GET", "/api/v1/autonomous/decisions?limit=101", { token: boardToken })).status === 422);
  check("limit=abc → 422", (await call("GET", "/api/v1/autonomous/decisions?limit=abc", { token: boardToken })).status === 422);
  check("an unknown status → 422", (await call("GET", "/api/v1/autonomous/decisions?status=maybe", { token: boardToken })).status === 422);
  check("a valid but unused status → 200 []", (await call("GET", "/api/v1/autonomous/decisions?status=executed", { token: boardToken })).data.length === 0);
  check("a department over 64 characters → 422", (await call("GET", `/api/v1/autonomous/decisions?department=${pad("d", 65)}`, { token: boardToken })).status === 422);

  // ═══════════════════════════════════════════════════════ resolve
  console.log("\n[resolve]");
  check("POST /decisions/:id/resolve with no body → 422", (await call("POST", `/api/v1/autonomous/decisions/${finance.data.id}/resolve`, { token: boardToken, json: {} })).status === 422);
  check("approved as the string 'yes' → 422", (await call("POST", `/api/v1/autonomous/decisions/${finance.data.id}/resolve`, { token: boardToken, json: { approved: "yes" } })).status === 422);
  check("a note over 2000 characters → 422", (await call("POST", `/api/v1/autonomous/decisions/${finance.data.id}/resolve`, { token: boardToken, json: { approved: true, note: pad("n", 2001) } })).status === 422);

  const approved = await call("POST", `/api/v1/autonomous/decisions/${finance.data.id}/resolve`, { token: boardToken, json: { approved: true, note: "Board approved at the Monday session." } });
  check("POST /decisions/:id/resolve → 200", approved.status === 200, `status ${approved.status} ${JSON.stringify(approved.body?.error)}`);
  check("the decision is approved", approved.data?.status === "approved", String(approved.data?.status));
  check("the note is stored", approved.data?.decisionNote === "Board approved at the Monday session.", String(approved.data?.decisionNote));
  check("decidedAt is an ISO timestamp", ISO.test(String(approved.data?.decidedAt)), String(approved.data?.decidedAt));
  check("the human approver is the signed-in administrator", approved.data?.humanApprover === boardLogin.data.user.id, `${approved.data?.humanApprover} vs ${boardLogin.data.user.id}`);
  check("createdAt is unchanged by the decision", approved.data?.createdAt === finance.data.createdAt, `${approved.data?.createdAt} vs ${finance.data.createdAt}`);

  const again = await call("POST", `/api/v1/autonomous/decisions/${finance.data.id}/resolve`, { token: boardToken, json: { approved: false } });
  check("resolving the same decision twice → 409", again.status === 409, `status ${again.status}`);
  check("409 explains the decision is already resolved", /already been resolved/i.test(again.error?.message || ""), JSON.stringify(again.error));
  check("the second resolve did not flip the status", (await call("GET", `/api/v1/autonomous/decisions/${finance.data.id}`, { token: boardToken })).data.status === "approved");
  check("resolving an unknown id → 404", (await call("POST", "/api/v1/autonomous/decisions/decision-does-not-exist/resolve", { token: boardToken, json: { approved: true } })).status === 404);

  const rejected = await call("POST", `/api/v1/autonomous/decisions/${financeReject.data.id}/resolve`, { token: boardToken, json: { approved: false } });
  check("approved:false records a rejection", rejected.data?.status === "rejected", String(rejected.data?.status));
  check("a rejection with no note leaves the note empty", rejected.data?.decisionNote === null, JSON.stringify(rejected.data?.decisionNote));
  const blank = await call("POST", `/api/v1/autonomous/decisions/${logistics.data.id}/resolve`, { token: boardToken, json: { approved: true, note: "   " } });
  check("an all-whitespace note is stored as an empty string, as Node's trim does", blank.data?.decisionNote === "", JSON.stringify(blank.data?.decisionNote));

  // ═══════════════════════════════════════════════════════ dashboard maths
  console.log("\n[dashboard maths]");
  const dash = await call("GET", "/api/v1/autonomous/dashboard/rollup", { token: boardToken });
  const d = dash.data ?? {};
  check("GET /dashboard/rollup → 200", dash.status === 200, `status ${dash.status}`);
  check("autonomyIndex = round(resolved / total * 100) = round(3/5*100) = 60", d.autonomyIndex === 60, String(d.autonomyIndex));
  check("decisionsToday counts everything filed today = 5", d.decisionsToday === 5, String(d.decisionsToday));
  check("humanOverrideRatePct = round(rejected / resolved * 100) = round(1/3*100) = 33", d.humanOverrideRatePct === 33, String(d.humanOverrideRatePct));
  check("governanceCompliancePct is 100 once anything is filed", d.governanceCompliancePct === 100, String(d.governanceCompliancePct));
  check("departmentsCount counts distinct departments = 3", d.departmentsCount === 3, String(d.departmentsCount));
  check("openApprovals counts what is still pending = 2", d.openApprovals === 2, String(d.openApprovals));
  check("constitutionEnforced is 1 once the register holds rows", d.constitutionEnforced === 1, String(d.constitutionEnforced));
  check("autonomousSavings30dUsd sums the recent APPROVED impact = round(1000 + 100) = 1100", d.autonomousSavings30dUsd === 1100, String(d.autonomousSavings30dUsd));
  check("impactKind marks that figure as an approved estimate, not realized savings", d.impactKind === "approved_estimate", String(d.impactKind));
  check("the rejected proposal contributes no savings",
    d.autonomousSavings30dUsd === 1100 && d.decisions.find((x) => x.id === financeReject.data.id)?.status === "rejected");
  check("the unfunded figures stay zero: budgetsTotalUsd", d.budgetsTotalUsd === 0, String(d.budgetsTotalUsd));
  check("the unfunded figures stay zero: budgetsSpentYtdPct", d.budgetsSpentYtdPct === 0, String(d.budgetsSpentYtdPct));
  check("the unfunded figures stay zero: boardSeats", d.boardSeats === 0, String(d.boardSeats));
  check("the unfunded figures stay zero: aiExecutives", d.aiExecutives === 0, String(d.aiExecutives));
  check("plans stay empty — nothing backs a strategic plan", Array.isArray(d.plans) && d.plans.length === 0, JSON.stringify(d.plans));
  check("the guardrail blocks what is still awaiting a human", d.guardrails?.[0]?.blockedActions30d === 2, String(d.guardrails?.[0]?.blockedActions30d));
  check("the dashboard embeds the decisions themselves", Array.isArray(d.decisions) && d.decisions.length === 5, `count ${d.decisions?.length}`);

  const byName = Object.fromEntries((d.departments || []).map((x) => [x.name, x]));
  check("departments are one row per distinct department", (d.departments || []).length === 3, JSON.stringify(d.departments?.map((x) => x.name)));
  check("Finance: 3 proposals, 1 approved → health 33", byName.Finance?.health === 33, JSON.stringify(byName.Finance));
  // d0 is the still-pending Finance proposal from the validation section.
  check("Finance: the untouched proposal is still pending", byName.Finance?.decisionsPending === 1, JSON.stringify(byName.Finance));
  check("Finance: one executed decision in the window", byName.Finance?.decisionsExecuted30d === 1, JSON.stringify(byName.Finance));
  check("Operations: still pending → pending 1, executed 0, health 0",
    byName.Operations?.decisionsPending === 1 && byName.Operations?.decisionsExecuted30d === 0 && byName.Operations?.health === 0, JSON.stringify(byName.Operations));
  check("Ops & Logistics: 1 proposal, 1 approved → health 100", byName["Ops & Logistics"]?.health === 100, JSON.stringify(byName["Ops & Logistics"]));
  check("department ids slug the name", byName["Ops & Logistics"]?.id === "dept-ops-logistics", String(byName["Ops & Logistics"]?.id));
  check("every department reports the zeroed ledger fields",
    (d.departments || []).every((x) => x.budgetUsd === 0 && x.spendYtdUsd === 0 && x.headcount === 0 && x.aiAgents === 0),
    JSON.stringify(d.departments));
  check("every department is recommend-level: this module never executes on its own",
    (d.departments || []).every((x) => x.autonomyLevel === "recommend"), JSON.stringify(d.departments?.map((x) => x.autonomyLevel)));
  check("departments are ordered by executed decisions, then name",
    (d.departments || []).map((x) => x.name).join("|") === "Finance|Ops & Logistics|Operations",
    (d.departments || []).map((x) => x.name).join("|"));

  // ═══════════════════════════════════════════════════════ delete
  console.log("\n[delete]");
  check("deleting a resolved decision → 409", (await call("DELETE", `/api/v1/autonomous/decisions/${finance.data.id}`, { token: boardToken })).status === 409);
  check("409 explains resolved decisions are immutable", /cannot be deleted/i.test((await call("DELETE", `/api/v1/autonomous/decisions/${finance.data.id}`, { token: boardToken })).error?.message || ""));
  check("deleting a rejected decision → 409", (await call("DELETE", `/api/v1/autonomous/decisions/${financeReject.data.id}`, { token: boardToken })).status === 409);
  check("resolving a decision does not delete it",
    (await db.query("SELECT COUNT(*) n FROM autonomous_decisions WHERE id = ?", [finance.data.id]))[0][0].n === 1);

  const pending = await call("POST", "/api/v1/autonomous/decisions", { token: boardToken, json: proposal({ title: "Disposal of the old fleet" }) });
  const removed = await call("DELETE", `/api/v1/autonomous/decisions/${pending.data.id}`, { token: boardToken });
  check("DELETE a pending decision → 200", removed.status === 200, `status ${removed.status} ${JSON.stringify(removed.body?.error)}`);
  check("DELETE echoes {deleted:true,id}", removed.data?.deleted === true && removed.data?.id === pending.data.id, JSON.stringify(removed.data));
  check("the row is gone", (await db.query("SELECT COUNT(*) n FROM autonomous_decisions WHERE id = ?", [pending.data.id]))[0][0].n === 0);
  check("deleting it again → 404", (await call("DELETE", `/api/v1/autonomous/decisions/${pending.data.id}`, { token: boardToken })).status === 404);
  check("the deleted proposal is no longer listed",
    !(await call("GET", "/api/v1/autonomous/decisions", { token: boardToken })).data.some((x) => x.id === pending.data.id));

  // ═══════════════════════════════════════════════════════ method + id guards
  console.log("\n[method and id guards]");
  check("DELETE /decisions without an id → 405", (await call("DELETE", "/api/v1/autonomous/decisions", { token: boardToken })).status === 405);
  check("PUT /decisions → 405", (await call("PUT", "/api/v1/autonomous/decisions", { token: boardToken, json: {} })).status === 405);
  check("POST /dashboard/rollup → 405", (await call("POST", "/api/v1/autonomous/dashboard/rollup", { token: boardToken, json: {} })).status === 405);
  check("POST /decisions/:id (no /resolve) → 405", (await call("POST", `/api/v1/autonomous/decisions/${d0.id}`, { token: boardToken, json: {} })).status === 405);
  check("DELETE /decisions/:id/resolve → 405", (await call("DELETE", `/api/v1/autonomous/decisions/${d0.id}/resolve`, { token: boardToken })).status === 405);
  check("an id over 100 characters → 422", (await call("GET", `/api/v1/autonomous/decisions/${pad("i", 101)}`, { token: boardToken })).status === 422);
  check("an unknown but well-formed id → 404", (await call("GET", "/api/v1/autonomous/decisions/decision-00000000-0000-4000-8000-000000000000", { token: boardToken })).status === 404);
  check("404 carries the NOT_FOUND code", (await call("GET", "/api/v1/autonomous/decisions/decision-nope", { token: boardToken })).error?.code === "NOT_FOUND");

  // ═══════════════════════════════════════════════════════ durability
  console.log("\n[durability]");
  const rows = (await db.query("SELECT id, status, human_approver, decision_note, decided_at FROM autonomous_decisions WHERE organization_id = ? ORDER BY id", [boardOrg]))[0];
  // d0 + the three filter fixtures + the resolved logistics proposal; the
  // edge-case row and the disposal proposal were both deleted above.
  check("the register is ordinary MySQL rows, not process memory", rows.length === 5, `rows ${rows.length}`);
  check("the approver is persisted as the acting user id", rows.every((r) => r.decided_at === null || r.human_approver === boardLogin.data.user.id));
  check("statuses are persisted in the enum, not rebuilt on read",
    rows.filter((r) => r.status === "approved").length === 2 && rows.filter((r) => r.status === "rejected").length === 1 && rows.filter((r) => r.status === "awaiting_human").length === 2,
    JSON.stringify(rows.map((r) => r.status)));

  // ── cleanup ────────────────────────────────────────────────────────────
  await db.query("DELETE FROM autonomous_decisions WHERE organization_id = ?", [boardOrg]);
  await db.query("DELETE FROM autonomous_decisions WHERE organization_id = ?", [memberLogin.data.user.organizationId]);
  await db.query("DELETE FROM users WHERE email IN (?, ?)", [boardEmail, memberEmail]);
  await db.end();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nfailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  console.log("autonomous: parity verified against the PHP runtime.");
}

main().catch((error) => { console.error(error); process.exit(1); });
