/**
 * PHP runtime parity spec — Benchmark Center (Node routes/benchmarks.ts).
 *
 * Exercises the result registry, all eight routes:
 *
 *   GET    /api/v1/benchmarks/dashboard/rollup
 *   GET    /api/v1/benchmarks/runs
 *   POST   /api/v1/benchmarks/run
 *   POST   /api/v1/benchmarks/schedule
 *   GET    /api/v1/benchmarks/notes
 *   POST   /api/v1/benchmarks/notes
 *   PATCH  /api/v1/benchmarks/notes/:id
 *   DELETE /api/v1/benchmarks/notes/:id
 *
 * Run:
 *   node tests/php-api/benchmarks.spec.mjs http://localhost:8082 \
 *        owner@windels.example 'Owner!Pass#2026' \
 *        <dbUser> <dbPass> <dbName> [dbHost] [dbPort]
 *
 * The register is organization-scoped, so the arithmetic runs in a throwaway
 * organization this spec owns outright (a registered account is the ADMIN of a
 * brand-new org), which makes every count exact instead of "whatever else
 * happens to be in the database". A second account is demoted to USER — not to
 * test an admin gate (this module has none: Node puts `authenticate` on the
 * router and nothing else) but to prove that a plain member may record a
 * result in their own organization and cannot reach anyone else's.
 *
 * What this spec exists to protect
 * --------------------------------
 * An earlier version of the Node service seeded one random "completed" run per
 * area and reported those numbers as measurements. The rewrite made the module
 * a result registry: scores enter only through POST /run, with an evaluator
 * and an evidence reference, and an organization with nothing recorded reports
 * zeros. Every one of those properties is asserted here, because nothing in the
 * code prevents a future edit from reintroducing a fabricated baseline.
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

const BM_AREAS = [
  "ai_models", "ai_employees", "ai_workflows", "voice_models", "vision_models",
  "translation_quality", "coding_performance", "response_accuracy", "latency",
  "resource_consumption", "cost_efficiency", "safety_metrics", "reliability",
  "user_satisfaction",
];

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

const metric = (value = 42, over = {}) => ({ key: "accuracy", label: "Accuracy", value, unit: "%", higherIsBetter: true, ...over });

const runInput = (over = {}) => ({
  area: "latency",
  metrics: [metric(42)],
  overallScore: 42,
  passed: false,
  evaluator: "nightly-harness",
  evidence: "s3://reports/run-1.json",
  ...over,
});

async function registerAccount(db, label, organization) {
  const email = `bm-${label}-${stamp}@windels.example`;
  const created = await call("POST", "/api/v1/auth/register", { json: { email, password: "Benchmark!Pass#2026", displayName: `Benchmark ${label}`, organizationName: organization } });
  if (!created.data?.token) throw new Error(`register ${label} failed: ${JSON.stringify(created.body)}`);
  const login = await call("POST", "/api/v1/auth/login", { json: { email, password: "Benchmark!Pass#2026" } });
  return { email, login: login.data };
}

async function main() {
  const db = await mysql.createConnection({ host: dbHost, port: dbPort, user: dbUser, password: dbPass, database: dbName });

  console.log(`\nbenchmarks parity — ${base}\n`);

  const login = await call("POST", "/api/v1/auth/login", { json: { email: ident, password: pass } });
  const token = login.data?.token;
  check("super admin can sign in", !!token, JSON.stringify(login.body?.error));
  if (!token) { await db.end(); process.exit(1); }

  // A dedicated organization whose register only this spec writes to.
  const board = await registerAccount(db, "board", "Benchmark Board Org");
  const boardToken = board.login?.token;
  const boardOrg = board.login?.user?.organizationId;
  check("the board fixture signs in to its own organization", !!boardToken && !!boardOrg, JSON.stringify(board.login?.user));
  if (!boardToken || !boardOrg) { await db.end(); process.exit(1); }

  const member = await registerAccount(db, "member", "Benchmark Member Org");
  await db.query("UPDATE users SET role = 'USER' WHERE id = ?", [member.login.user.id]);
  const memberLogin = await call("POST", "/api/v1/auth/login", { json: { email: member.email, password: "Benchmark!Pass#2026" } });
  const memberToken = memberLogin.data?.token;
  const memberOrg = memberLogin.data?.user?.organizationId;
  check("the member fixture signs in as a plain user", !!memberToken && memberLogin.data.user.role === "user", JSON.stringify(memberLogin.data?.user));

  // ═══════════════════════════════════════════════════════ authentication
  console.log("\n[authentication]");
  for (const [method, path] of [
    ["GET", "/api/v1/benchmarks/dashboard/rollup"],
    ["GET", "/api/v1/benchmarks/runs"],
    ["POST", "/api/v1/benchmarks/run"],
    ["POST", "/api/v1/benchmarks/schedule"],
    ["GET", "/api/v1/benchmarks/notes"],
    ["POST", "/api/v1/benchmarks/notes"],
    ["PATCH", "/api/v1/benchmarks/notes/bm-12345678"],
    ["DELETE", "/api/v1/benchmarks/notes/bm-12345678"],
  ]) {
    const r = await call(method, path, { json: method === "GET" || method === "DELETE" ? undefined : {} });
    check(`${method} ${path} without a token → 401`, r.status === 401, `status ${r.status}`);
  }
  check("a malformed token → 401", (await call("GET", "/api/v1/benchmarks/runs", { token: "not-a-jwt" })).status === 401);

  // ═══════════════════════════════════════════════════════ empty registry
  console.log("\n[a fresh organization invents nothing]");
  const emptyRuns = await call("GET", "/api/v1/benchmarks/runs", { token: boardToken });
  check("GET /runs on a fresh organization → 200 []", emptyRuns.status === 200 && Array.isArray(emptyRuns.data) && emptyRuns.data.length === 0, JSON.stringify(emptyRuns.body));

  const empty = await call("GET", "/api/v1/benchmarks/dashboard/rollup", { token: boardToken });
  const e = empty.data ?? {};
  check("GET /dashboard/rollup → 200", empty.status === 200, `status ${empty.status}`);
  check("totalRuns 0", e.totalRuns === 0, String(e.totalRuns));
  check("completed24h 0", e.completed24h === 0, String(e.completed24h));
  check("avgScore 0 — not a plausible-looking baseline", e.avgScore === 0, String(e.avgScore));
  check("passRate 0", e.passRate === 0, String(e.passRate));
  check("leaderboard []", Array.isArray(e.leaderboard) && e.leaderboard.length === 0, JSON.stringify(e.leaderboard));
  check("recentRuns []", Array.isArray(e.recentRuns) && e.recentRuns.length === 0, JSON.stringify(e.recentRuns));
  check("all 14 areas report 0, not a random baseline",
    BM_AREAS.every((area) => e.areaScores?.[area] === 0), JSON.stringify(e.areaScores));
  check("feedback counters start at zero",
    e.feedbackToModelFactory?.optimizedModels === 0 && e.feedbackToModelFactory?.pendingRecommendations === 0,
    JSON.stringify(e.feedbackToModelFactory));
  check("re-reading the dashboard is idempotent",
    (await call("GET", "/api/v1/benchmarks/dashboard/rollup", { token: boardToken })).data.totalRuns === 0);

  // ═══════════════════════════════════════════════════════ POST /run
  console.log("\n[recording a result]");
  const created = await call("POST", "/api/v1/benchmarks/run", { token: boardToken, json: runInput({ targetName: "gpt-4o" }) });
  check("POST /run → 200", created.status === 200, `status ${created.status} ${JSON.stringify(created.body?.error)}`);
  const r0 = created.data ?? {};
  check("the id is a br-<8 hex> run id", /^br-[0-9a-f]{8}$/.test(String(r0.id)), String(r0.id));
  check("a recorded result is completed immediately", r0.status === "completed", String(r0.status));
  check("the score is stored exactly as supplied", r0.overallScore === 42, String(r0.overallScore));
  check("the verdict is stored exactly as supplied", r0.passed === false, String(r0.passed));
  check("metrics round-trip", Array.isArray(r0.metrics) && r0.metrics[0]?.value === 42 && r0.metrics[0]?.higherIsBetter === true, JSON.stringify(r0.metrics));
  check("durationMs is 0 — nothing was executed here", r0.durationMs === 0, String(r0.durationMs));
  check("startedAt and completedAt are ISO timestamps", ISO.test(String(r0.startedAt)) && ISO.test(String(r0.completedAt)), `${r0.startedAt} / ${r0.completedAt}`);
  check("the evaluator is retained as provenance", r0.metadata?.evaluator === "nightly-harness", JSON.stringify(r0.metadata));
  check("the evidence reference is retained", r0.metadata?.evidence === "s3://reports/run-1.json", JSON.stringify(r0.metadata));
  check("the result is flagged as imported, not measured here", r0.metadata?.imported === true, JSON.stringify(r0.metadata));
  check("the row is stamped with the caller's organization", r0.organizationId === boardOrg, `${r0.organizationId} vs ${boardOrg}`);
  const stored = (await db.query("SELECT organization_id, metrics, evaluator, evidence FROM benchmark_runs WHERE id = ?", [r0.id]))[0][0];
  check("the row really is in MySQL, not process memory", !!stored && stored.organization_id === boardOrg, JSON.stringify(stored));
  // mysql2 hands back JSON columns already parsed; PHP re-encodes them, so a
  // double escape would show up here as a quoted string instead of an array.
  const storedMetrics = typeof stored.metrics === "string" ? JSON.parse(stored.metrics) : stored.metrics;
  check("metrics are stored as a JSON array, not a doubly-escaped string",
    Array.isArray(storedMetrics) && storedMetrics[0].key === "accuracy", JSON.stringify(storedMetrics).slice(0, 80));

  const lowPass = await call("POST", "/api/v1/benchmarks/run", { token: boardToken, json: runInput({ area: "cost_efficiency", metrics: [metric(10)], overallScore: 10, passed: true, evaluator: "cost-model-v2", evidence: "ticket-4412" }) });
  check("a passing verdict is honoured even with a low score — the evaluator owns the criteria",
    lowPass.data?.passed === true && lowPass.data?.overallScore === 10, JSON.stringify({ passed: lowPass.data?.passed, score: lowPass.data?.overallScore }));

  const noTarget = await call("POST", "/api/v1/benchmarks/run", { token: boardToken, json: runInput({ area: "coding_performance", metrics: [metric(70)], overallScore: 70, passed: true }) });
  check("with no target the name falls back to the area, spelled out", noTarget.data?.targetName === "coding performance", String(noTarget.data?.targetName));
  check("and no targetId is invented", !noTarget.data?.targetId, JSON.stringify(noTarget.data?.targetId));

  const byId = await call("POST", "/api/v1/benchmarks/run", { token: boardToken, json: runInput({ area: "reliability", targetId: "model-7", metrics: [metric(88)], overallScore: 88, passed: true }) });
  check("targetId is used as the name when no name is given", byId.data?.targetName === "model-7" && byId.data?.targetId === "model-7", JSON.stringify({ n: byId.data?.targetName, i: byId.data?.targetId }));

  // ═══════════════════════════════════════════════════════ validation
  console.log("\n[POST /run — validation]");
  const badRuns = [
    ["no body at all", {}],
    ["a missing area", runInput({ area: undefined })],
    ["an unknown area", runInput({ area: "telepathy" })],
    ["an empty targetName", runInput({ targetName: "" })],
    ["a targetName over 200 characters", runInput({ targetName: pad("t", 201) })],
    ["notes over 1000 characters", runInput({ notes: pad("n", 1001) })],
    ["metrics missing", runInput({ metrics: undefined })],
    ["metrics empty", runInput({ metrics: [] })],
    ["more than 50 metrics", runInput({ metrics: Array.from({ length: 51 }, () => metric(1)) })],
    ["a metric missing higherIsBetter", runInput({ metrics: [{ key: "a", label: "A", value: 1, unit: "%" }] })],
    ["a metric whose key is too long", runInput({ metrics: [metric(1, { key: pad("k", 81) })] })],
    ["a metric whose label is too long", runInput({ metrics: [metric(1, { label: pad("l", 121) })] })],
    ["a metric whose unit is too long", runInput({ metrics: [metric(1, { unit: pad("u", 33) })] })],
    ["a non-numeric metric value", runInput({ metrics: [metric(1, { value: "fast" })] })],
    ["metrics given as an object", runInput({ metrics: { key: "a" } })],
    ["a missing overallScore", runInput({ overallScore: undefined })],
    ["overallScore above 100", runInput({ overallScore: 101 })],
    ["overallScore below 0", runInput({ overallScore: -1 })],
    ["a non-numeric overallScore", runInput({ overallScore: "ninety" })],
    ["a missing passed verdict", runInput({ passed: undefined })],
    ["passed as a string", runInput({ passed: "yes" })],
    ["a missing evaluator", runInput({ evaluator: undefined })],
    ["an empty evaluator", runInput({ evaluator: "" })],
    ["an evaluator over 200 characters", runInput({ evaluator: pad("e", 201) })],
    ["a missing evidence reference", runInput({ evidence: undefined })],
    ["evidence over 2000 characters", runInput({ evidence: pad("v", 2001) })],
  ];
  for (const [name, body] of badRuns) {
    const res = await call("POST", "/api/v1/benchmarks/run", { token: boardToken, json: body });
    check(`POST /run with ${name} → 422`, res.status === 422, `status ${res.status}`);
  }
  const afterBad = await call("GET", "/api/v1/benchmarks/runs", { token: boardToken });
  check("no rejected body recorded anything", afterBad.data.length === 4, `count ${afterBad.data.length}`);

  // ═══════════════════════════════════════════════════════ listing
  console.log("\n[listing runs]");
  check("GET /runs returns every recorded run", afterBad.data.length === 4, `count ${afterBad.data.length}`);
  check("runs are newest first", (() => {
    const ids = afterBad.data.map((r) => r.id);
    return ids[0] === byId.data.id && ids[ids.length - 1] === r0.id;
  })(), afterBad.data.map((r) => r.id).join(","));
  check("GET /runs is read-only", (await call("POST", "/api/v1/benchmarks/runs", { token: boardToken, json: {} })).status === 405);

  // ═══════════════════════════════════════════════════════ scheduling
  console.log("\n[scheduling]");
  const before = (await call("GET", "/api/v1/benchmarks/runs", { token: boardToken })).data.length;
  const scheduled = await call("POST", "/api/v1/benchmarks/schedule", { token: boardToken, json: { area: "ai_models", cron: "0 3 * * *", enabled: true } });
  check("POST /schedule → 200", scheduled.status === 200, `status ${scheduled.status} ${JSON.stringify(scheduled.body?.error)}`);
  const s0 = scheduled.data ?? {};
  check("the id is a sc-<8 hex> schedule id", /^sc-[0-9a-f]{8}$/.test(String(s0.id)), String(s0.id));
  check("the cron expression is stored", s0.cron === "0 3 * * *", String(s0.cron));
  check("the schedule is enabled", s0.enabled === true, String(s0.enabled));
  check("a next run time is projected", ISO.test(String(s0.nextRunAt)), String(s0.nextRunAt));
  const nextRunGap = (Date.parse(s0.nextRunAt) - Date.now()) / 3600000;
  check("nextRunAt is about an hour out, as Node projects", nextRunGap > 0.9 && nextRunGap < 1.1, `hours ${nextRunGap}`);
  check("scheduling manufactures no run", (await call("GET", "/api/v1/benchmarks/runs", { token: boardToken })).data.length === before);
  const scheduledCount = (await db.query("SELECT COUNT(*) n FROM benchmark_schedules WHERE organization_id = ?", [boardOrg]))[0][0].n;
  check("the schedule is persisted", scheduledCount === 1, `rows ${scheduledCount}`);

  const defaults = await call("POST", "/api/v1/benchmarks/schedule", { token: boardToken, json: { area: "reliability" } });
  check("cron defaults to daily at midnight", defaults.data?.cron === "0 0 * * *", String(defaults.data?.cron));
  check("enabled defaults to true", defaults.data?.enabled === true, String(defaults.data?.enabled));
  for (const [name, body] of [
    ["a missing area", { cron: "0 0 * * *" }],
    ["an unknown area", { area: "telepathy" }],
    ["a cron expression with a shell metacharacter", { area: "latency", cron: "0 0 * * *; rm -rf /" }],
    ["an empty cron expression", { area: "latency", cron: "" }],
    ["enabled as a string", { area: "latency", enabled: "yes" }],
  ]) {
    const res = await call("POST", "/api/v1/benchmarks/schedule", { token: boardToken, json: body });
    check(`POST /schedule with ${name} → 422`, res.status === 422, `status ${res.status}`);
  }

  // ═══════════════════════════════════════════════════════ dashboard maths
  console.log("\n[dashboard maths]");
  await db.query("DELETE FROM benchmark_runs WHERE organization_id = ?", [boardOrg]);
  await db.query("DELETE FROM kernel_events WHERE organization_id = ?", [boardOrg]);
  await call("POST", "/api/v1/benchmarks/run", { token: boardToken, json: runInput({ area: "latency", metrics: [metric(90)], overallScore: 90, passed: true, targetName: "fast" }) });
  await call("POST", "/api/v1/benchmarks/run", { token: boardToken, json: runInput({ area: "latency", metrics: [metric(70)], overallScore: 70, passed: false, targetName: "slow" }) });
  await call("POST", "/api/v1/benchmarks/run", { token: boardToken, json: runInput({ area: "reliability", metrics: [metric(80)], overallScore: 80, passed: true, targetName: "steady" }) });

  const dash = await call("GET", "/api/v1/benchmarks/dashboard/rollup", { token: boardToken });
  const d = dash.data ?? {};
  check("GET /dashboard/rollup → 200", dash.status === 200, `status ${dash.status}`);
  check("totalRuns counts the recorded runs = 3", d.totalRuns === 3, String(d.totalRuns));
  check("avgScore is the mean of the recorded scores = 80", d.avgScore === 80, String(d.avgScore));
  check("passRate is the fraction that passed = 2/3", Math.abs(d.passRate - 2 / 3) < 1e-9, String(d.passRate));
  check("completed24h counts today's completed runs = 3", d.completed24h === 3, String(d.completed24h));
  check("recentRuns is capped at 10 and newest first", d.recentRuns?.length === 3 && d.recentRuns[0].overallScore === 80, JSON.stringify(d.recentRuns?.map((r) => r.overallScore)));
  check("the leaderboard ranks by recorded score", d.leaderboard?.[0]?.overallScore === 90, JSON.stringify(d.leaderboard));
  check("the leaderboard keeps the target name", d.leaderboard?.[0]?.targetName === "fast", JSON.stringify(d.leaderboard?.[0]));
  check("the leaderboard reports one run per entry", (d.leaderboard || []).every((row) => row.runs === 1), JSON.stringify(d.leaderboard));
  check("an area score is the LAST recorded score for that area", d.areaScores?.latency === 70, String(d.areaScores?.latency));
  check("areas with a single run report that run", d.areaScores?.reliability === 80, String(d.areaScores?.reliability));
  check("unmeasured areas still report 0", d.areaScores?.safety_metrics === 0 && d.areaScores?.ai_models === 0, JSON.stringify({ s: d.areaScores?.safety_metrics, a: d.areaScores?.ai_models }));
  check("all 14 areas are present", Object.keys(d.areaScores || {}).length === 14, String(Object.keys(d.areaScores || {}).length));

  const under = await call("POST", "/api/v1/benchmarks/run", { token: boardToken, json: runInput({ area: "latency", metrics: [metric(50)], overallScore: 50, passed: false, targetName: "regressed" }) });
  check("a run below the threshold is recorded like any other", under.status === 200 && under.data.overallScore === 50);
  const dash2 = (await call("GET", "/api/v1/benchmarks/dashboard/rollup", { token: boardToken })).data;
  check("the area score follows the newest run", dash2.areaScores.latency === 50, String(dash2.areaScores.latency));
  check("a score of 80 or more counts as optimized", dash2.feedbackToModelFactory.optimizedModels === 2, String(dash2.feedbackToModelFactory.optimizedModels));
  check("a score under 80 counts as a pending recommendation", dash2.feedbackToModelFactory.pendingRecommendations === 2, String(dash2.feedbackToModelFactory.pendingRecommendations));
  const kernelEvents = (await db.query("SELECT COUNT(*) n FROM kernel_events WHERE kind = 'benchmarks.underperforming' AND organization_id = ?", [boardOrg]))[0][0].n;
  check("an underperforming run emits a kernel event", kernelEvents === 2, `events ${kernelEvents}`);

  // ═══════════════════════════════════════════════════════ tenancy
  console.log("\n[organization scope]");
  const memberDash = await call("GET", "/api/v1/benchmarks/dashboard/rollup", { token: memberToken });
  check("another organization sees an empty centre", memberDash.data?.totalRuns === 0 && memberDash.data?.avgScore === 0, JSON.stringify(memberDash.data?.feedbackToModelFactory));
  const memberRun = await call("POST", "/api/v1/benchmarks/run", { token: memberToken, json: runInput({ area: "voice_models", metrics: [metric(61)], overallScore: 61, passed: true }) });
  check("a plain user may record a result in their own organization", memberRun.status === 200, `status ${memberRun.status}`);
  check("their result lands in their organization", memberRun.data?.organizationId === memberOrg, `${memberRun.data?.organizationId} vs ${memberOrg}`);
  check("and the other organization's totals are untouched",
    (await call("GET", "/api/v1/benchmarks/dashboard/rollup", { token: boardToken })).data.totalRuns === 4);
  const crossSchedules = (await db.query("SELECT COUNT(*) n FROM benchmark_schedules WHERE organization_id = ?", [memberOrg]))[0][0].n;
  check("schedules do not leak between organizations", crossSchedules === 0, `rows ${crossSchedules}`);

  // ═══════════════════════════════════════════════════════ notes ledger
  console.log("\n[notes ledger]");
  const note = await call("POST", "/api/v1/benchmarks/notes", { token: boardToken, json: { title: "Latency regression", body: "p95 jumped after the model swap.", tags: ["latency", "p95"] } });
  check("POST /notes → 201", note.status === 201, `status ${note.status} ${JSON.stringify(note.body?.error)}`);
  const n0 = note.data ?? {};
  check("the id is a bm-<8 hex> note id", /^bm-[0-9a-f]{8}$/.test(String(n0.id)), String(n0.id));
  check("tags round-trip", Array.isArray(n0.tags) && n0.tags.join(",") === "latency,p95", JSON.stringify(n0.tags));
  check("the author is recorded", n0.createdBy === board.login.user.id, `${n0.createdBy} vs ${board.login.user.id}`);
  check("createdAt is an ISO timestamp", ISO.test(String(n0.createdAt)), String(n0.createdAt));

  const noTags = await call("POST", "/api/v1/benchmarks/notes", { token: boardToken, json: { title: "No tags here", body: "Body text." } });
  check("tags default to an empty array", Array.isArray(noTags.data?.tags) && noTags.data.tags.length === 0, JSON.stringify(noTags.data?.tags));

  for (const [name, body] of [
    ["a missing title", { body: "Body text." }],
    ["a one-character title", { title: "x", body: "Body text." }],
    ["a title over 200 characters", { title: pad("t", 201), body: "Body text." }],
    ["a missing body", { title: "A title" }],
    ["a body over 4000 characters", { title: "A title", body: pad("b", 4001) }],
    ["more than 20 tags", { title: "A title", body: "Body text.", tags: Array.from({ length: 21 }, () => "t") }],
    ["a tag over 40 characters", { title: "A title", body: "Body text.", tags: [pad("t", 41)] }],
    ["tags given as a string", { title: "A title", body: "Body text.", tags: "latency" }],
  ]) {
    const res = await call("POST", "/api/v1/benchmarks/notes", { token: boardToken, json: body });
    check(`POST /notes with ${name} → 422`, res.status === 422, `status ${res.status}`);
  }

  const listed = await call("GET", "/api/v1/benchmarks/notes", { token: boardToken });
  check("GET /notes lists the organization's notes newest first", listed.data.length === 2 && listed.data[0].id === noTags.data.id, JSON.stringify(listed.data?.map((n) => n.id)));
  check("notes carry their author and timestamp", ISO.test(String(listed.data[0].createdAt)) && !!listed.data[0].createdBy, JSON.stringify(listed.data[0]));

  const patched = await call("PATCH", `/api/v1/benchmarks/notes/${n0.id}`, { token: boardToken, json: { title: "Latency regression (resolved)" } });
  check("PATCH /notes/:id → 200", patched.status === 200, `status ${patched.status} ${JSON.stringify(patched.body?.error)}`);
  check("the title is updated", patched.data?.title === "Latency regression (resolved)", String(patched.data?.title));
  check("fields not supplied are left alone", patched.data?.body === "p95 jumped after the model swap." && patched.data?.tags.join(",") === "latency,p95", JSON.stringify(patched.data));
  const noop = await call("PATCH", `/api/v1/benchmarks/notes/${n0.id}`, { token: boardToken, json: {} });
  check("an empty patch is a no-op, not an error", noop.status === 200 && noop.data?.title === "Latency regression (resolved)", `status ${noop.status}`);
  const retagged = await call("PATCH", `/api/v1/benchmarks/notes/${n0.id}`, { token: boardToken, json: { tags: ["resolved"] } });
  check("tags can be replaced on their own", retagged.data?.tags.join(",") === "resolved", JSON.stringify(retagged.data?.tags));
  check("PATCH with an invalid field → 422", (await call("PATCH", `/api/v1/benchmarks/notes/${n0.id}`, { token: boardToken, json: { title: "x" } })).status === 422);
  check("PATCH an unknown note → 404", (await call("PATCH", "/api/v1/benchmarks/notes/bm-deadbeef", { token: boardToken, json: { title: "A title" } })).status === 404);
  check("PATCH a note from another organization → 404", (await call("PATCH", `/api/v1/benchmarks/notes/${n0.id}`, { token: memberToken, json: { title: "Hijacked" } })).status === 404);
  check("an id under 3 characters → 422", (await call("PATCH", "/api/v1/benchmarks/notes/ab", { token: boardToken, json: { title: "A title" } })).status === 422);
  check("an id over 64 characters → 422", (await call("DELETE", `/api/v1/benchmarks/notes/${pad("i", 65)}`, { token: boardToken })).status === 422);

  const removed = await call("DELETE", `/api/v1/benchmarks/notes/${n0.id}`, { token: boardToken });
  check("DELETE /notes/:id → 204", removed.status === 204, `status ${removed.status}`);
  check("a 204 carries no body", removed.text === "", JSON.stringify(removed.text.slice(0, 40)));
  check("the note is gone", (await db.query("SELECT COUNT(*) n FROM benchmark_notes WHERE id = ?", [n0.id]))[0][0].n === 0);
  check("deleting it again → 404", (await call("DELETE", `/api/v1/benchmarks/notes/${n0.id}`, { token: boardToken })).status === 404);
  check("a note from another organization → 404 on delete", (await call("DELETE", `/api/v1/benchmarks/notes/${noTags.data.id}`, { token: memberToken })).status === 404);
  check("GET /notes is not exposed for a single id, as in Node → 404", (await call("GET", `/api/v1/benchmarks/notes/${noTags.data.id}`, { token: boardToken })).status === 404);
  check("DELETE /notes without an id → 405", (await call("DELETE", "/api/v1/benchmarks/notes", { token: boardToken })).status === 405);
  check("PUT /notes/:id → 405", (await call("PUT", `/api/v1/benchmarks/notes/${noTags.data.id}`, { token: boardToken, json: {} })).status === 405);

  // ═══════════════════════════════════════════════════════ method guards
  console.log("\n[method guards]");
  check("POST /dashboard/rollup → 405", (await call("POST", "/api/v1/benchmarks/dashboard/rollup", { token: boardToken, json: {} })).status === 405);
  check("GET /run → 405", (await call("GET", "/api/v1/benchmarks/run", { token: boardToken })).status === 405);
  check("GET /schedule → 405", (await call("GET", "/api/v1/benchmarks/schedule", { token: boardToken })).status === 405);

  // ── cleanup ────────────────────────────────────────────────────────────
  await db.query("DELETE FROM benchmark_runs WHERE organization_id IN (?, ?)", [boardOrg, memberOrg]);
  await db.query("DELETE FROM benchmark_schedules WHERE organization_id IN (?, ?)", [boardOrg, memberOrg]);
  await db.query("DELETE FROM benchmark_notes WHERE organization_id IN (?, ?)", [boardOrg, memberOrg]);
  await db.query("DELETE FROM kernel_events WHERE organization_id IN (?, ?)", [boardOrg, memberOrg]);
  await db.query("DELETE FROM users WHERE email IN (?, ?)", [board.email, member.email]);
  await db.end();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nfailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  console.log("benchmarks: parity verified against the PHP runtime.");
}

main().catch((error) => { console.error(error); process.exit(1); });
