/**
 * PHP runtime parity spec — Enterprise AI Model Factory.
 *
 * Exercises the model lifecycle register, all thirteen routes:
 *
 *   GET    /api/v1/model-factory/dashboard/rollup
 *   GET    /api/v1/model-factory/models
 *   POST   /api/v1/model-factory/models
 *   POST   /api/v1/model-factory/models/:id/advance
 *   POST   /api/v1/model-factory/models/:id/benchmark
 *   POST   /api/v1/model-factory/models/:id/safety
 *   POST   /api/v1/model-factory/models/:id/governance-approve
 *   GET    /api/v1/model-factory/fine-tunes
 *   POST   /api/v1/model-factory/fine-tunes
 *   GET    /api/v1/model-factory/notes
 *   POST   /api/v1/model-factory/notes
 *   PATCH  /api/v1/model-factory/notes/:id
 *   DELETE /api/v1/model-factory/notes/:id
 *
 * Run:
 *   node tests/php-api/modelFactory.spec.mjs http://localhost:8082 \
 *        owner@windels.example 'Owner!Pass#2026' \
 *        <dbUser> <dbPass> <dbName> [dbHost] [dbPort]
 *
 * Two deliberate divergences from Node are asserted rather than hidden
 * ---------------------------------------------------------------
 *   * TENANCY. Node's `mf2:*` Redis keys carry no organization segment, so its
 *     model registry is global and the router's admin gate is the only thing
 *     in front of it — one organization's administrator can read, advance and
 *     retire another organization's models. This port scopes the register by
 *     organization_id. That is asserted here: models, fine-tunes, notes and
 *     benchmark percentages are invisible across the boundary, and an action
 *     taken with another organization's model id is a 404.
 *   * FINE-TUNE MODEL. Node's handler reads `req.body.modelId ??
 *     req.params.modelId` while its schema declares neither, so every
 *     fine-tune job Node records is stored with no model at all. This port
 *     records `modelId` when the client sends one and NULL when it does not —
 *     the same answer Node gives for a request that omits it.
 *
 * The third thing this spec exists to protect is that nothing is seeded: Node
 * guards its five sample models behind `demoDataEnabled()`, so a fresh
 * organization must report an empty factory rather than a plausible-looking
 * pipeline, and no route may invent a score, a verdict or a training run.
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

const B = "/api/v1/model-factory";
const STAGES = ["research", "benchmarking", "validation", "approval", "canary", "deployed", "monitoring", "retired"];
const BUILDERS = ["slm", "llm", "vision", "speech", "audio", "multimodal", "domain"];
const METHODS = ["supervised", "rlhf", "dpo", "lora", "qlora"];

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

const modelInput = (over = {}) => ({ name: "windels-slm-1b", builder: "slm", size: "1B", quant: "q8", vramMb: 2000, ...over });

async function registerAccount(label, organization) {
  const email = `mf-${label}-${stamp}@windels.example`;
  const created = await call("POST", "/api/v1/auth/register", { json: { email, password: "Factory!Pass#2026", displayName: `Factory ${label}`, organizationName: organization } });
  if (!created.data?.token) throw new Error(`register ${label} failed: ${JSON.stringify(created.body)}`);
  const login = await call("POST", "/api/v1/auth/login", { json: { email, password: "Factory!Pass#2026" } });
  return { email, login: login.data };
}

async function main() {
  const db = await mysql.createConnection({ host: dbHost, port: dbPort, user: dbUser, password: dbPass, database: dbName });
  const q = async (sql, args) => (await db.query(sql, args))[0];

  console.log(`\nmodel factory parity — ${base}\n`);

  const login = await call("POST", "/api/v1/auth/login", { json: { email: ident, password: pass } });
  const token = login.data?.token;
  check("super admin can sign in", !!token, JSON.stringify(login.body?.error));
  if (!token) { await db.end(); process.exit(1); }

  const board = await registerAccount("board", "Factory Board Org");
  const boardToken = board.login?.token;
  const boardOrg = board.login?.user?.organizationId;
  check("the board fixture signs in to its own organization", !!boardToken && !!boardOrg, JSON.stringify(board.login?.user));
  if (!boardToken || !boardOrg) { await db.end(); process.exit(1); }

  const other = await registerAccount("other", "Factory Other Org");
  const otherToken = other.login?.token;
  const otherOrg = other.login?.user?.organizationId;

  const member = await registerAccount("member", "Factory Member Org");
  await db.query("UPDATE users SET role = 'USER' WHERE id = ?", [member.login.user.id]);
  const memberLogin = await call("POST", "/api/v1/auth/login", { json: { email: member.email, password: "Factory!Pass#2026" } });
  const memberToken = memberLogin.data?.token;
  const memberOrg = memberLogin.data?.user?.organizationId;
  check("the member fixture signs in as a plain user", !!memberToken && memberLogin.data.user.role === "user", JSON.stringify(memberLogin.data?.user));

  const orgs = [boardOrg, otherOrg, memberOrg];

  // ═══════════════════════════════════════════════════════ authentication
  console.log("\n[authentication]");
  for (const [method, path] of [
    ["GET", `${B}/dashboard/rollup`],
    ["GET", `${B}/models`], ["POST", `${B}/models`],
    ["POST", `${B}/models/m2-00000000/advance`],
    ["POST", `${B}/models/m2-00000000/benchmark`],
    ["POST", `${B}/models/m2-00000000/safety`],
    ["POST", `${B}/models/m2-00000000/governance-approve`],
    ["GET", `${B}/fine-tunes`], ["POST", `${B}/fine-tunes`],
    ["GET", `${B}/notes`], ["POST", `${B}/notes`],
    ["PATCH", `${B}/notes/mf-00000000`], ["DELETE", `${B}/notes/mf-00000000`],
  ]) {
    const r = await call(method, path, { json: method === "GET" ? undefined : {} });
    check(`${method} ${path.replace(B, "")} without a token → 401`, r.status === 401, `status ${r.status}`);
  }

  // ═══════════════════════════════════════════════════════ admin gate
  console.log("\n[admin gate]");
  for (const [method, path] of [
    ["GET", `${B}/dashboard/rollup`],
    ["GET", `${B}/models`], ["POST", `${B}/models`],
    ["POST", `${B}/models/m2-00000000/advance`],
    ["POST", `${B}/models/m2-00000000/benchmark`],
    ["POST", `${B}/models/m2-00000000/safety`],
    ["POST", `${B}/models/m2-00000000/governance-approve`],
    ["GET", `${B}/fine-tunes`], ["POST", `${B}/fine-tunes`],
    ["GET", `${B}/notes`], ["POST", `${B}/notes`],
    ["PATCH", `${B}/notes/mf-00000000`], ["DELETE", `${B}/notes/mf-00000000`],
  ]) {
    const r = await call(method, path, { token: memberToken, json: method === "GET" ? undefined : {} });
    check(`${method} ${path.replace(B, "")} as a plain user → 403`, r.status === 403, `status ${r.status}`);
  }
  const denied = await call("GET", `${B}/dashboard/rollup`, { token: memberToken });
  check("403 says Admins only, as Node does", denied.error?.message === "Admins only", JSON.stringify(denied.error));

  // ═════════════════════════════════════════════════ a fresh factory is empty
  console.log("\n[a fresh organization starts empty]");
  const empty = await call("GET", `${B}/dashboard/rollup`, { token: boardToken });
  const e = empty.data ?? {};
  check("GET /dashboard/rollup → 200", empty.status === 200, `status ${empty.status}`);
  check("totalModels 0 — no sample models are seeded", e.totalModels === 0, String(e.totalModels));
  check("every one of the eight stages reports 0", STAGES.every((s) => e.byStage?.[s] === 0), JSON.stringify(e.byStage));
  check("activeFineTunes 0", e.activeFineTunes === 0, String(e.activeFineTunes));
  check("benchmarksPassedPct is 100 when nothing has been recorded, as Node answers", e.benchmarksPassedPct === 100, String(e.benchmarksPassedPct));
  check("canaryActive false", e.canaryActive === false, String(e.canaryActive));
  check("governanceBlocking 0", e.governanceBlocking === 0, String(e.governanceBlocking));
  check("safetyEvaluations 0", e.safetyEvaluations === 0, String(e.safetyEvaluations));
  check("the S43 registry lineage is reported", e.extendsS43Registry === true, String(e.extendsS43Registry));
  check("GET /models → 200 []", (await call("GET", `${B}/models`, { token: boardToken })).data?.length === 0);
  check("GET /fine-tunes → 200 []", (await call("GET", `${B}/fine-tunes`, { token: boardToken })).data?.length === 0);
  check("GET /notes → 200 []", (await call("GET", `${B}/notes`, { token: boardToken })).data?.length === 0);

  // ═══════════════════════════════════════════════════════ creating a model
  console.log("\n[registering a model]");
  const created = await call("POST", `${B}/models`, { token: boardToken, json: modelInput() });
  const m0 = created.data ?? {};
  check("POST /models → 200", created.status === 200, `status ${created.status}`);
  check("the id is Node's `m2-` plus 8 hex", /^m2-[0-9a-f]{8}$/.test(m0.id ?? ""), String(m0.id));
  check("a new model starts in research", m0.stage === "research", String(m0.stage));
  check("versions starts at 1", m0.versions === 1, String(m0.versions));
  check("vramMb is the integer that was sent", m0.vramMb === 2000, String(m0.vramMb));
  check("size and quant are carried", m0.size === "1B" && m0.quant === "q8", `${m0.size} ${m0.quant}`);
  check("createdAt is an ISO timestamp", ISO.test(m0.createdAt ?? ""), String(m0.createdAt));
  check("safetyPassed is absent until an evaluation is recorded", !("safetyPassed" in m0), JSON.stringify(m0));
  check("governanceApproved is absent until governance approves", !("governanceApproved" in m0), JSON.stringify(m0));
  check("baseModelId is absent when it was not sent", !("baseModelId" in m0), JSON.stringify(m0));
  check("canaryPct is absent — no route sets it", !("canaryPct" in m0), JSON.stringify(m0));
  const durable = await q("SELECT * FROM model_factory_models WHERE id = ?", [m0.id]);
  check("the model is durable in MySQL, not a request-scoped object", durable.length === 1, `rows ${durable.length}`);
  check("the row is scoped to the caller's organization", durable[0]?.organization_id === boardOrg, String(durable[0]?.organization_id));
  const createdEvents = (await q("SELECT COUNT(*) n FROM kernel_events WHERE kind = 'model-factory.created' AND organization_id = ?", [boardOrg]))[0].n;
  check("registering a model emits model-factory.created", Number(createdEvents) === 1, `events ${createdEvents}`);

  const withStage = await call("POST", `${B}/models`, { token: boardToken, json: modelInput({ name: "windels-tts", builder: "speech", stage: "monitoring", baseModelId: "m2-00000000", size: "large", quant: "fp16", vramMb: 3000 }) });
  check("an explicit stage is honoured", withStage.data?.stage === "monitoring", String(withStage.data?.stage));
  check("baseModelId is echoed back", withStage.data?.baseModelId === "m2-00000000", String(withStage.data?.baseModelId));
  check("every builder in Node's enum is accepted", await (async () => {
    for (const builder of BUILDERS) {
      const r = await call("POST", `${B}/models`, { token: boardToken, json: modelInput({ name: `b-${builder}`, builder }) });
      if (r.status !== 200 || r.data?.builder !== builder) return false;
    }
    return true;
  })(), "one of the builders was rejected");

  // ═══════════════════════════════════════════════════ create validation
  console.log("\n[POST /models validation]");
  const badModels = [
    ["name missing", { builder: "slm", size: "1B", quant: "q8", vramMb: 2000 }],
    ["builder missing", { name: "x", size: "1B", quant: "q8", vramMb: 2000 }],
    ["size missing", { name: "x", builder: "slm", quant: "q8", vramMb: 2000 }],
    ["quant missing", { name: "x", builder: "slm", size: "1B", vramMb: 2000 }],
    ["vramMb missing", { name: "x", builder: "slm", size: "1B", quant: "q8" }],
    ["builder outside the enum", modelInput({ builder: "quantum" })],
    ["vramMb zero", modelInput({ vramMb: 0 })],
    ["vramMb negative", modelInput({ vramMb: -1 })],
    ["vramMb fractional", modelInput({ vramMb: 1.5 })],
    ["vramMb a string", modelInput({ vramMb: "2000" })],
    ["vramMb a boolean", modelInput({ vramMb: true })],
    ["name not a string", modelInput({ name: 7 })],
    ["stage outside the enum", modelInput({ stage: "draft" })],
    ["baseModelId not a string", modelInput({ baseModelId: 7 })],
    ["an array body", [1, 2, 3]],
    ["a string body", "windels-slm"],
  ];
  for (const [name, json] of badModels) {
    const r = await call("POST", `${B}/models`, { token: boardToken, json });
    check(`POST /models with ${name} → 422`, r.status === 422, `status ${r.status}`);
  }
  const emptyName = await call("POST", `${B}/models`, { token: boardToken, json: modelInput({ name: "" }) });
  check("an empty name is accepted — z.string() sets no minimum", emptyName.status === 200, `status ${emptyName.status}`);
  const noBody = await call("POST", `${B}/models`, { token: boardToken });
  check("POST /models with no body → 422", noBody.status === 422, `status ${noBody.status}`);

  // ═══════════════════════════════════════════════════════ listing
  console.log("\n[listing models]");
  const all = await call("GET", `${B}/models`, { token: boardToken });
  check("GET /models returns every registered model", all.data?.length === 10, `count ${all.data?.length}`);
  check("models are ordered by id, which is how Node's score-0 zset orders them",
    all.data.map((m) => m.id).join() === [...all.data].map((m) => m.id).sort().join(), all.data.map((m) => m.id).join());
  check("GET /models?stage=monitoring filters to that stage",
    (await call("GET", `${B}/models?stage=monitoring`, { token: boardToken })).data?.length === 1, "count mismatch");
  check("GET /models?stage=bogus → 200 [] — Node validates no query schema",
    (await call("GET", `${B}/models?stage=bogus`, { token: boardToken })).data?.length === 0, "expected an empty list");
  check("GET /models?stage= (empty) applies no filter",
    (await call("GET", `${B}/models?stage=`, { token: boardToken })).data?.length === 10, "expected every model");

  // ═══════════════════════════════════════════════════════ the lifecycle
  console.log("\n[the lifecycle gates]");
  const adv1 = await call("POST", `${B}/models/${m0.id}/advance`, { token: boardToken, json: { to: "benchmarking" } });
  check("research → benchmarking is allowed and bumps versions", adv1.data?.stage === "benchmarking" && adv1.data?.versions === 2, `${adv1.data?.stage} v${adv1.data?.versions}`);
  const back = await call("POST", `${B}/models/${m0.id}/advance`, { token: boardToken, json: { to: "research" } });
  check("a backwards move → 400 Cannot advance backwards", back.status === 400 && back.error?.message === "Cannot advance backwards", `${back.status} ${back.error?.message}`);
  const sideways = await call("POST", `${B}/models/${m0.id}/advance`, { token: boardToken, json: { to: "benchmarking" } });
  check("advancing to the current stage → 400, not a silent no-op", sideways.status === 400, `status ${sideways.status}`);

  const safetyGate = await call("POST", `${B}/models/${m0.id}/advance`, { token: boardToken, json: { to: "validation" } });
  check("validation without a safety evaluation → 400", safetyGate.status === 400 && safetyGate.error?.message === "Safety evaluation required before advancing", `${safetyGate.status} ${safetyGate.error?.message}`);
  const failedSafety = await call("POST", `${B}/models/${m0.id}/safety`, { token: boardToken, json: { passed: false } });
  check("a failed safety evaluation is recorded as false", failedSafety.data?.safetyPassed === false, String(failedSafety.data?.safetyPassed));
  check("a failed safety evaluation still does not unlock validation",
    (await call("POST", `${B}/models/${m0.id}/advance`, { token: boardToken, json: { to: "validation" } })).status === 400, "expected 400");
  const passedSafety = await call("POST", `${B}/models/${m0.id}/safety`, { token: boardToken, json: { passed: true } });
  check("a passed safety evaluation is recorded as true", passedSafety.data?.safetyPassed === true, String(passedSafety.data?.safetyPassed));
  check("safetyPassed now appears on the model", (await call("GET", `${B}/models`, { token: boardToken })).data.find((m) => m.id === m0.id)?.safetyPassed === true, "missing safetyPassed");

  check("validation is allowed once safety has passed",
    (await call("POST", `${B}/models/${m0.id}/advance`, { token: boardToken, json: { to: "validation" } })).data?.stage === "validation", "expected validation");
  check("approval is allowed once safety has passed",
    (await call("POST", `${B}/models/${m0.id}/advance`, { token: boardToken, json: { to: "approval" } })).data?.stage === "approval", "expected approval");
  const govGate = await call("POST", `${B}/models/${m0.id}/advance`, { token: boardToken, json: { to: "canary" } });
  check("canary without governance approval → 400", govGate.status === 400 && govGate.error?.message === "Governance approval required before canary", `${govGate.status} ${govGate.error?.message}`);
  const approved = await call("POST", `${B}/models/${m0.id}/governance-approve`, { token: boardToken });
  check("governance approval sets governanceApproved", approved.data?.governanceApproved === true, String(approved.data?.governanceApproved));
  check("approving a model waiting in approval moves it to canary", approved.data?.stage === "canary", String(approved.data?.stage));
  check("governance approval does not bump versions — Node writes the stage directly",
    approved.data?.versions === (await call("GET", `${B}/models`, { token: boardToken })).data.find((m) => m.id === m0.id)?.versions, "versions changed");
  check("canary is now open", (await call("POST", `${B}/models/${m0.id}/advance`, { token: boardToken, json: { to: "deployed" } })).data?.stage === "deployed", "expected deployed");
  check("deployed → monitoring is not safety-gated, as Node's gate list stops at deployed",
    (await call("POST", `${B}/models/${m0.id}/advance`, { token: boardToken, json: { to: "monitoring" } })).data?.stage === "monitoring", "expected monitoring");
  check("monitoring → retired is allowed",
    (await call("POST", `${B}/models/${m0.id}/advance`, { token: boardToken, json: { to: "retired" } })).data?.stage === "retired", "expected retired");
  check("nothing advances past retired",
    (await call("POST", `${B}/models/${m0.id}/advance`, { token: boardToken, json: { to: "research" } })).status === 400, "expected 400");

  // Six successful advances: research → benchmarking, then validation,
  // approval, deployed, monitoring and retired after the gates open. The
  // blocked attempts emit nothing, and governance moving a model into canary
  // is a governance event rather than an advance.
  const advancedEvents = (await q("SELECT COUNT(*) n FROM kernel_events WHERE kind = 'model-factory.advanced' AND organization_id = ?", [boardOrg]))[0].n;
  check("every successful advance, and only those, emits model-factory.advanced", Number(advancedEvents) === 6, `events ${advancedEvents}`);
  const safetyEvents = (await q("SELECT COUNT(*) n FROM kernel_events WHERE kind = 'model-factory.safety' AND organization_id = ?", [boardOrg]))[0].n;
  check("each safety evaluation emits model-factory.safety", Number(safetyEvents) === 2, `events ${safetyEvents}`);
  const govEvents = (await q("SELECT COUNT(*) n FROM kernel_events WHERE kind = 'model-factory.governance-approved' AND organization_id = ?", [boardOrg]))[0].n;
  check("governance approval emits model-factory.governance-approved", Number(govEvents) === 1, `events ${govEvents}`);

  console.log("\n[unknown models and advance validation]");
  check("advancing a model that does not exist → 404",
    (await call("POST", `${B}/models/m2-deadbeef/advance`, { token: boardToken, json: { to: "canary" } })).status === 404, "expected 404");
  check("recording safety for a model that does not exist → 404",
    (await call("POST", `${B}/models/m2-deadbeef/safety`, { token: boardToken, json: { passed: true } })).status === 404, "expected 404");
  check("approving governance for a model that does not exist → 404",
    (await call("POST", `${B}/models/m2-deadbeef/governance-approve`, { token: boardToken })).status === 404, "expected 404");
  for (const [name, json] of [
    ["no `to`", {}],
    ["a `to` outside the lifecycle", { to: "shipping" }],
    ["a non-string `to`", { to: 4 }],
  ]) {
    const r = await call("POST", `${B}/models/${m0.id}/advance`, { token: boardToken, json });
    check(`POST /advance with ${name} → 422`, r.status === 422, `status ${r.status}`);
  }
  for (const [name, json] of [
    ["no `passed`", {}],
    ["a non-boolean `passed`", { passed: "yes" }],
  ]) {
    const r = await call("POST", `${B}/models/${m0.id}/safety`, { token: boardToken, json });
    check(`POST /safety with ${name} → 422`, r.status === 422, `status ${r.status}`);
  }

  // ═══════════════════════════════════════════════════════ benchmarks
  console.log("\n[benchmarks are recorded, never produced]");
  const bench = await call("POST", `${B}/models/${m0.id}/benchmark`, { token: boardToken, json: { benchmark: "mmlu", score: 71.5, pass: true } });
  const b0 = bench.data ?? {};
  check("POST /models/:id/benchmark → 200", bench.status === 200, `status ${bench.status}`);
  check("the result id is Node's `br-` plus 8 hex", /^br-[0-9a-f]{8}$/.test(b0.id ?? ""), String(b0.id));
  check("the score and verdict are stored exactly as supplied", b0.score === 71.5 && b0.pass === true, `${b0.score} ${b0.pass}`);
  check("the model id is carried", b0.modelId === m0.id, String(b0.modelId));
  check("`at` is an ISO timestamp", ISO.test(b0.at ?? ""), String(b0.at));
  const benchRow = await q("SELECT * FROM model_factory_benchmarks WHERE id = ?", [b0.id]);
  check("the result is durable in MySQL", benchRow.length === 1 && Number(benchRow[0].score) === 71.5, JSON.stringify(benchRow[0]));
  check("a score of 0 is accepted", (await call("POST", `${B}/models/${m0.id}/benchmark`, { token: boardToken, json: { benchmark: "hellaswag", score: 0, pass: false } })).status === 200, "expected 200");
  check("a score of 100 is accepted", (await call("POST", `${B}/models/${m0.id}/benchmark`, { token: boardToken, json: { benchmark: "arc", score: 100, pass: true } })).status === 200, "expected 200");
  check("a low score with pass true is stored as given — the evaluator owns the criteria", await (async () => {
    const r = await call("POST", `${B}/models/${m0.id}/benchmark`, { token: boardToken, json: { benchmark: "truthfulqa", score: 12, pass: true } });
    return r.status === 200 && r.data.score === 12 && r.data.pass === true;
  })(), "expected the verdict to be stored verbatim");
  for (const [name, json] of [
    ["no benchmark", { score: 10, pass: true }],
    ["an empty benchmark", { benchmark: "", score: 10, pass: true }],
    ["a benchmark over 120 characters", { benchmark: "x".repeat(121), score: 10, pass: true }],
    ["no score", { benchmark: "mmlu", pass: true }],
    ["a score above 100", { benchmark: "mmlu", score: 100.1, pass: true }],
    ["a negative score", { benchmark: "mmlu", score: -1, pass: true }],
    ["a non-numeric score", { benchmark: "mmlu", score: "90", pass: true }],
    ["no pass", { benchmark: "mmlu", score: 90 }],
    ["a non-boolean pass", { benchmark: "mmlu", score: 90, pass: "yes" }],
  ]) {
    const r = await call("POST", `${B}/models/${m0.id}/benchmark`, { token: boardToken, json });
    check(`POST /benchmark with ${name} → 422`, r.status === 422, `status ${r.status}`);
  }
  const unknownModel = await call("POST", `${B}/models/m2-deadbeef/benchmark`, { token: boardToken, json: { benchmark: "mmlu", score: 50, pass: false } });
  check("a benchmark for an unknown model id is still recorded, as Node does not check existence",
    unknownModel.status === 200 && unknownModel.data?.modelId === "m2-deadbeef", `${unknownModel.status} ${JSON.stringify(unknownModel.data)}`);

  // ═══════════════════════════════════════════════════════ fine-tunes
  console.log("\n[fine-tune jobs]");
  const tune = await call("POST", `${B}/fine-tunes`, { token: boardToken, json: { dataset: "sft-corpus-v3", method: "lora" } });
  const t0 = tune.data ?? {};
  check("POST /fine-tunes → 200", tune.status === 200, `status ${tune.status}`);
  check("the job id is Node's `ft-` plus 8 hex", /^ft-[0-9a-f]{8}$/.test(t0.id ?? ""), String(t0.id));
  check("a job starts at running and 0% — nothing here pretends to train", t0.status === "running" && t0.progressPct === 0, `${t0.status} ${t0.progressPct}%`);
  check("startedAt is an ISO timestamp", ISO.test(t0.startedAt ?? ""), String(t0.startedAt));
  check("a job started without a model records no model, as Node does", t0.modelId === null, JSON.stringify(t0.modelId));
  const withModel = await call("POST", `${B}/fine-tunes`, { token: boardToken, json: { dataset: "sft-corpus-v4", method: "qlora", modelId: m0.id } });
  check("a job started with a model keeps it — Node's schema drops it", withModel.data?.modelId === m0.id, String(withModel.data?.modelId));
  check("every method in Node's enum is accepted", await (async () => {
    for (const method of METHODS) {
      const r = await call("POST", `${B}/fine-tunes`, { token: boardToken, json: { dataset: `d-${method}`, method } });
      if (r.status !== 200 || r.data?.method !== method) return false;
    }
    return true;
  })(), "one of the methods was rejected");
  for (const [name, json] of [
    ["no dataset", { method: "lora" }],
    ["a non-string dataset", { dataset: 7, method: "lora" }],
    ["no method", { dataset: "d" }],
    ["a method outside the enum", { dataset: "d", method: "distillation" }],
    ["a modelId that is not a string", { dataset: "d", method: "lora", modelId: 7 }],
  ]) {
    const r = await call("POST", `${B}/fine-tunes`, { token: boardToken, json });
    check(`POST /fine-tunes with ${name} → 422`, r.status === 422, `status ${r.status}`);
  }
  const tunes = await call("GET", `${B}/fine-tunes`, { token: boardToken });
  check("GET /fine-tunes lists every job in the order they were started",
    tunes.data?.length === 7 && tunes.data[0].dataset === "sft-corpus-v3" && tunes.data[1].dataset === "sft-corpus-v4", `${tunes.data?.length} ${JSON.stringify((tunes.data ?? []).map((t) => t.dataset))}`);
  const tuneEvents = (await q("SELECT COUNT(*) n FROM kernel_events WHERE kind = 'model-factory.finetune-started' AND organization_id = ?", [boardOrg]))[0].n;
  check("every job emits model-factory.finetune-started", Number(tuneEvents) === 7, `events ${tuneEvents}`);

  // ═══════════════════════════════════════════════════════ the dashboard
  console.log("\n[the dashboard counts what the register holds]");
  const dash = await call("GET", `${B}/dashboard/rollup`, { token: boardToken });
  const d = dash.data ?? {};
  check("totalModels counts the register", d.totalModels === 10, String(d.totalModels));
  check("byStage adds up to the register", STAGES.reduce((sum, s) => sum + (d.byStage?.[s] ?? 0), 0) === d.totalModels, JSON.stringify(d.byStage));
  check("retired is counted", d.byStage?.retired === 1, String(d.byStage?.retired));
  check("activeFineTunes counts the jobs", d.activeFineTunes === 7, String(d.activeFineTunes));
  check("benchmarksPassedPct is 3 of 5 recorded results", d.benchmarksPassedPct === 60, String(d.benchmarksPassedPct));
  check("canaryActive is false with nothing in canary", d.canaryActive === false, String(d.canaryActive));
  check("safetyEvaluations counts models whose safety was actually evaluated", d.safetyEvaluations === 1, String(d.safetyEvaluations));
  check("governanceBlocking counts models waiting in approval", d.governanceBlocking === 0, String(d.governanceBlocking));
  const blocked = await call("POST", `${B}/models`, { token: boardToken, json: modelInput({ name: "awaiting-approval", stage: "approval" }) });
  check("a model waiting in approval is counted as governance-blocking",
    (await call("GET", `${B}/dashboard/rollup`, { token: boardToken })).data.governanceBlocking === 1, "expected 1");
  const canaryModel = await call("POST", `${B}/models`, { token: boardToken, json: modelInput({ name: "in-canary", stage: "canary" }) });
  check("a model in canary turns canaryActive on",
    (await call("GET", `${B}/dashboard/rollup`, { token: boardToken })).data.canaryActive === true, "expected true");

  // ═══════════════════════════════════════════════════════ the notes ledger
  console.log("\n[the notes ledger]");
  const note = await call("POST", `${B}/notes`, { token: boardToken, json: { title: "Canary plan", body: "Roll out at 10% for 24 hours." } });
  const n0 = note.data ?? {};
  check("POST /notes → 201", note.status === 201, `status ${note.status}`);
  check("the note id is Node's `mf-` plus 8 hex", /^mf-[0-9a-f]{8}$/.test(n0.id ?? ""), String(n0.id));
  check("tags default to an empty array", Array.isArray(n0.tags) && n0.tags.length === 0, JSON.stringify(n0.tags));
  check("createdAt is an ISO timestamp", ISO.test(n0.createdAt ?? ""), String(n0.createdAt));
  check("createdBy is the author", n0.createdBy === board.login.user.id, `${n0.createdBy} vs ${board.login.user.id}`);
  const noteRow = await q("SELECT * FROM model_factory_notes WHERE id = ?", [n0.id]);
  check("the note is durable in MySQL and scoped to the organization", noteRow.length === 1 && noteRow[0].organization_id === boardOrg, JSON.stringify(noteRow[0]?.organization_id));

  const second = await call("POST", `${B}/notes`, { token: boardToken, json: { title: "Rollback", body: "Roll back if p95 latency doubles.", tags: ["canary", "slo"] } });
  check("tags are stored as given", JSON.stringify(second.data?.tags) === JSON.stringify(["canary", "slo"]), JSON.stringify(second.data?.tags));
  const listed = await call("GET", `${B}/notes`, { token: boardToken });
  check("GET /notes → 200 with both notes", listed.data?.length === 2, `count ${listed.data?.length}`);
  check("notes are newest first, as Node's reversed zset returns them", listed.data?.[0]?.id === second.data.id, String(listed.data?.[0]?.id));

  const patched = await call("PATCH", `${B}/notes/${n0.id}`, { token: boardToken, json: { title: "Canary plan v2" } });
  check("PATCH /notes/:id → 200", patched.status === 200, `status ${patched.status}`);
  check("a partial patch changes only what it names", patched.data?.title === "Canary plan v2" && patched.data?.body === n0.body, JSON.stringify(patched.data));
  const noop = await call("PATCH", `${B}/notes/${n0.id}`, { token: boardToken, json: {} });
  check("an empty patch is a no-op that still returns the note", noop.status === 200 && noop.data?.title === "Canary plan v2", `${noop.status} ${JSON.stringify(noop.data)}`);
  check("PATCH an unknown note → 404", (await call("PATCH", `${B}/notes/mf-deadbeef`, { token: boardToken, json: { title: "x2" } })).status === 404, "expected 404");
  check("DELETE /notes/:id → 204", (await call("DELETE", `${B}/notes/${n0.id}`, { token: boardToken })).status === 204, "expected 204");
  check("deleting twice → 404", (await call("DELETE", `${B}/notes/${n0.id}`, { token: boardToken })).status === 404, "expected 404");
  check("GET /notes/:id → 404 — Node defines no such route", (await call("GET", `${B}/notes/${second.data.id}`, { token: boardToken })).status === 404, "expected 404");

  for (const [name, json] of [
    ["no title", { body: "body text" }],
    ["a one-character title", { title: "x", body: "body text" }],
    ["a 201-character title", { title: "x".repeat(201), body: "body text" }],
    ["no body", { title: "titled" }],
    ["a one-character body", { title: "titled", body: "x" }],
    ["a 4001-character body", { title: "titled", body: "x".repeat(4001) }],
    ["tags that are not an array", { title: "titled", body: "body", tags: "canary" }],
    ["more than 20 tags", { title: "titled", body: "body", tags: Array(21).fill("t") }],
    ["a tag over 40 characters", { title: "titled", body: "body", tags: ["x".repeat(41)] }],
    ["a non-string tag", { title: "titled", body: "body", tags: [7] }],
  ]) {
    const r = await call("POST", `${B}/notes`, { token: boardToken, json });
    check(`POST /notes with ${name} → 422`, r.status === 422, `status ${r.status}`);
  }
  check("PATCH /notes/:id with a one-character title → 422",
    (await call("PATCH", `${B}/notes/${second.data.id}`, { token: boardToken, json: { title: "x" } })).status === 422, "expected 422");
  for (const [name, id] of [["a two-character id", "mf"], ["a 65-character id", "mf-" + "0".repeat(62)]]) {
    check(`PATCH /notes/:id with ${name} → 422`,
      (await call("PATCH", `${B}/notes/${id}`, { token: boardToken, json: { title: "titled" } })).status === 422, "expected 422");
    check(`DELETE /notes/:id with ${name} → 422`,
      (await call("DELETE", `${B}/notes/${id}`, { token: boardToken })).status === 422, "expected 422");
  }

  // ═══════════════════════════════════════════════════ the tenant boundary
  console.log("\n[the tenant boundary]");
  const otherDash = await call("GET", `${B}/dashboard/rollup`, { token: otherToken });
  check("another organization's dashboard is empty", otherDash.data?.totalModels === 0 && otherDash.data?.activeFineTunes === 0 && otherDash.data?.benchmarksPassedPct === 100, JSON.stringify(otherDash.data));
  check("another organization sees no models", (await call("GET", `${B}/models`, { token: otherToken })).data?.length === 0, "expected none");
  check("another organization sees no fine-tune jobs", (await call("GET", `${B}/fine-tunes`, { token: otherToken })).data?.length === 0, "expected none");
  check("another organization sees no notes", (await call("GET", `${B}/notes`, { token: otherToken })).data?.length === 0, "expected none");
  check("another organization cannot advance this organization's model",
    (await call("POST", `${B}/models/${m0.id}/advance`, { token: otherToken, json: { to: "research" } })).status === 404, "expected 404");
  check("another organization cannot run a safety evaluation on it",
    (await call("POST", `${B}/models/${m0.id}/safety`, { token: otherToken, json: { passed: true } })).status === 404, "expected 404");
  check("another organization cannot approve governance for it",
    (await call("POST", `${B}/models/${m0.id}/governance-approve`, { token: otherToken })).status === 404, "expected 404");
  check("another organization cannot patch this organization's note",
    (await call("PATCH", `${B}/notes/${second.data.id}`, { token: otherToken, json: { title: "hijacked" } })).status === 404, "expected 404");
  check("another organization cannot delete this organization's note",
    (await call("DELETE", `${B}/notes/${second.data.id}`, { token: otherToken })).status === 404, "expected 404");
  const otherBench = await call("POST", `${B}/models/${m0.id}/benchmark`, { token: otherToken, json: { benchmark: "mmlu", score: 88, pass: true } });
  check("a result recorded against another organization's model id is kept in the caller's organization",
    otherBench.status === 200 && otherBench.data?.modelId === m0.id, `${otherBench.status} ${JSON.stringify(otherBench.data)}`);
  check("and it counts in the caller's dashboard alone",
    (await call("GET", `${B}/dashboard/rollup`, { token: otherToken })).data.benchmarksPassedPct === 100 &&
    (await call("GET", `${B}/dashboard/rollup`, { token: boardToken })).data.benchmarksPassedPct === 60, "the percentages crossed the boundary");
  const boardStillThere = await call("GET", `${B}/models`, { token: boardToken });
  check("this organization's register is untouched by the other's writes", boardStillThere.data?.length === 12, `count ${boardStillThere.data?.length}`);

  // ═══════════════════════════════════════════════════════ method guards
  console.log("\n[method guards]");
  check("POST /dashboard/rollup → 405", (await call("POST", `${B}/dashboard/rollup`, { token: boardToken, json: {} })).status === 405);
  check("DELETE /models → 405", (await call("DELETE", `${B}/models`, { token: boardToken })).status === 405);
  check("PUT /models → 405", (await call("PUT", `${B}/models`, { token: boardToken, json: {} })).status === 405);
  check("GET /models/:id/advance → 405", (await call("GET", `${B}/models/${m0.id}/advance`, { token: boardToken })).status === 405);
  check("GET /models/:id/safety → 405", (await call("GET", `${B}/models/${m0.id}/safety`, { token: boardToken })).status === 405);
  check("GET /models/:id/governance-approve → 405", (await call("GET", `${B}/models/${m0.id}/governance-approve`, { token: boardToken })).status === 405);
  check("PUT /models/:id/benchmark → 405", (await call("PUT", `${B}/models/${m0.id}/benchmark`, { token: boardToken, json: {} })).status === 405);
  check("DELETE /fine-tunes → 405", (await call("DELETE", `${B}/fine-tunes`, { token: boardToken })).status === 405);
  check("PUT /notes → 405", (await call("PUT", `${B}/notes`, { token: boardToken, json: {} })).status === 405);
  check("POST /notes/:id → 405", (await call("POST", `${B}/notes/${second.data.id}`, { token: boardToken, json: {} })).status === 405);

  // ── cleanup ────────────────────────────────────────────────────────────
  for (const table of ["model_factory_models", "model_factory_benchmarks", "model_factory_fine_tunes", "model_factory_notes", "kernel_events"]) {
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
  console.log("model factory: parity verified against the PHP runtime.");
}

main().catch((error) => { console.error(error); process.exit(1); });
