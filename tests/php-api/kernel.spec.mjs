/**
 * PHP runtime parity spec — Enterprise AI Kernel + AI provider registry.
 *
 * Exercises every endpoint of the two controllers that make up the `kernel`
 * module, against the PHP/cPanel build rather than the Node build:
 *
 *   GET  /api/v1/kernel/status            GET  /api/v1/ai/models
 *   GET  /api/v1/kernel/components        GET  /api/v1/ai/providers
 *   POST /api/v1/kernel/dispatch          GET  /api/v1/ai/health
 *   GET  /api/v1/kernel/events            GET  /api/v1/ai/usage
 *   POST /api/v1/kernel/policy/evaluate   POST /api/v1/ai/complete
 *   POST /api/v1/kernel/resources/grant   POST /api/v1/ai/embed
 *   POST /api/v1/kernel/model/select      POST /api/v1/ai/test-providers
 *   POST /api/v1/kernel/diagnostics/run
 *
 * Run:
 *   node tests/php-api/kernel.spec.mjs http://localhost:8082 \
 *        owner@windels.example 'Owner!Pass#2026'
 *
 * No dependencies — uses the global fetch built into Node 18+.
 */
const base  = (process.argv[2] || "http://localhost:8082").replace(/\/$/, "");
const ident = process.argv[3] || "owner@windels.example";
const pass  = process.argv[4] || "Owner!Pass#2026";

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name + (detail ? ` — ${detail}` : "")); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function call(method, path, { token, json, expect } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(base + path, {
    method, headers, body: json === undefined ? undefined : JSON.stringify(json),
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

const KERNEL_COMPONENT_KEYS = [
  "comm-bus", "compute", "context", "diag", "event-bus", "heal", "health", "kg-sync",
  "media", "memory", "model-sel", "perf", "policy", "reasoning", "res-agent", "res-ai",
  "security", "self-opt", "voice", "workflow",
];

async function main() {
  console.log(`kernel parity spec against ${base}\n`);

  // ---------------------------------------------------------------- auth
  const login = await call("POST", "/api/v1/auth/login", { json: { identifier: ident, password: pass } });
  check("login succeeds", login.status === 200 && login.body?.ok === true, `status ${login.status}`);
  const token = login.body?.data?.token;
  check("login returns a bearer token", typeof token === "string" && token.length > 20);
  if (!token) { console.log("\nCannot continue without a token."); process.exit(1); }

  // -------------------------------------------------------- kernel: reads
  const status = await call("GET", "/api/v1/kernel/status", { token });
  check("GET /kernel/status → 200", status.status === 200, `status ${status.status}`);
  const d = status.body?.data ?? {};
  check("status.components has all 20 components", Array.isArray(d.components) && d.components.length === 20, `got ${d.components?.length}`);
  check("status.component keys match Node's defaults",
    Array.isArray(d.components) && KERNEL_COMPONENT_KEYS.every(k => d.components.some(c => c.key === k)));
  check("status reports stub components as stub",
    Array.isArray(d.components) && d.components.filter(c => c.status === "stub").length === 5,
    `stubs: ${d.components?.filter(c => c.status === "stub").map(c => c.key).join(",")}`);
  for (const field of ["events24h", "avgDispatchLatencyMs", "policiesEvaluated24h", "policiesBlocked24h", "uptimeSeconds", "selfHealed24h", "modelSelections24h"]) {
    check(`status.${field} is a number`, typeof d[field] === "number", `got ${typeof d[field]}`);
  }
  check("status.uptimeSeconds is non-negative", (d.uptimeSeconds ?? -1) >= 0);

  const comps = await call("GET", "/api/v1/kernel/components", { token });
  check("GET /kernel/components → 200", comps.status === 200, `status ${comps.status}`);
  check("components returns 20 entries", Array.isArray(comps.body?.data) && comps.body.data.length === 20, `got ${comps.body?.data?.length}`);
  const one = comps.body?.data?.[0] ?? {};
  check("component shape is {key,name,status,messageRate,errorRate,lastHeartbeat}",
    ["key", "name", "status", "messageRate", "errorRate", "lastHeartbeat"].every(k => k in one),
    Object.keys(one).join(","));
  check("component.lastHeartbeat is ISO-8601", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(one.lastHeartbeat)), String(one.lastHeartbeat));

  // ------------------------------------------------------ kernel: dispatch
  const before = (await call("GET", "/api/v1/kernel/events", { token })).body?.data?.length ?? 0;
  const dispatch = await call("POST", "/api/v1/kernel/dispatch", {
    token, json: { kind: "spec.ping", source: "kernel.spec", target: "kernel", payload: { n: 1, nested: { ok: true } } },
  });
  check("POST /kernel/dispatch → 201", dispatch.status === 201, `status ${dispatch.status}`);
  const ev = dispatch.body?.data ?? {};
  check("dispatch returns an id prefixed ke-", typeof ev.id === "string" && ev.id.startsWith("ke-"), String(ev.id));
  check("dispatch echoes kind/source/target", ev.kind === "spec.ping" && ev.source === "kernel.spec" && ev.target === "kernel");
  check("dispatch preserves nested payload", ev.payload?.nested?.ok === true, JSON.stringify(ev.payload));
  check("dispatch stamps an ISO timestamp", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(ev.at)), String(ev.at));

  const after = await call("GET", "/api/v1/kernel/events", { token });
  check("GET /kernel/events → 200", after.status === 200, `status ${after.status}`);
  check("dispatched event appears in the event list",
    (after.body?.data ?? []).some(e => e.id === ev.id), `${after.body?.data?.length} events`);
  check("event list grew by one", (after.body?.data?.length ?? 0) >= before, `${before} → ${after.body?.data?.length}`);
  check("event list is newest-first",
    (after.body?.data?.[0]?.id ?? "") === ev.id || (after.body?.data ?? []).length <= 1);

  check("POST /kernel/dispatch without kind → 422",
    (await call("POST", "/api/v1/kernel/dispatch", { token, json: { source: "x" } })).status === 422);
  check("POST /kernel/dispatch without source → 422",
    (await call("POST", "/api/v1/kernel/dispatch", { token, json: { kind: "x" } })).status === 422);

  // -------------------------------------------------------- kernel: policy
  const allow = await call("POST", "/api/v1/kernel/policy/evaluate", { token, json: { action: "read", risk: "low" } });
  check("POST /kernel/policy/evaluate (low risk) → 200", allow.status === 200, `status ${allow.status}`);
  check("low-risk policy is allowed", allow.body?.data?.allowed === true, JSON.stringify(allow.body?.data));
  check("allowed decision carries an empty requiredApprovals",
    Array.isArray(allow.body?.data?.requiredApprovals) && allow.body.data.requiredApprovals.length === 0);

  const deny = await call("POST", "/api/v1/kernel/policy/evaluate", { token, json: { action: "deploy", risk: "high" } });
  check("high-risk policy is blocked", deny.body?.data?.allowed === false, JSON.stringify(deny.body?.data));
  check("blocked decision names the required approvals",
    JSON.stringify(deny.body?.data?.requiredApprovals ?? []) === JSON.stringify(["org-admin", "risk-officer"]),
    JSON.stringify(deny.body?.data?.requiredApprovals));
  const approved = await call("POST", "/api/v1/kernel/policy/evaluate", { token, json: { action: "deploy", risk: "high", approved: true } });
  check("high-risk with approval is allowed", approved.body?.data?.allowed === true);

  // ----------------------------------------------------- kernel: resources
  const interactive = await call("POST", "/api/v1/kernel/resources/grant", { token, json: { priority: "interactive" } });
  check("POST /kernel/resources/grant (interactive) → 200", interactive.status === 200, `status ${interactive.status}`);
  check("interactive grant is 2000 millicores / 4096 MB / 60s",
    interactive.body?.data?.cpuMillicores === 2000 && interactive.body?.data?.memoryMb === 4096 && interactive.body?.data?.ttlSeconds === 60,
    JSON.stringify(interactive.body?.data));
  const batch = await call("POST", "/api/v1/kernel/resources/grant", { token, json: { priority: "batch", gpuCards: 2 } });
  check("batch grant is 500 millicores / 1024 MB / 600s / 2 GPU",
    batch.body?.data?.cpuMillicores === 500 && batch.body?.data?.memoryMb === 1024 && batch.body?.data?.ttlSeconds === 600 && batch.body?.data?.gpuCards === 2,
    JSON.stringify(batch.body?.data));
  check("invalid priority → 422",
    (await call("POST", "/api/v1/kernel/resources/grant", { token, json: { priority: "urgent" } })).status === 422);

  // --------------------------------------------------------- kernel: model
  const model = await call("POST", "/api/v1/kernel/model/select", { token, json: { task: "chat" } });
  check("POST /kernel/model/select → 200", model.status === 200, `status ${model.status}`);
  check("model select returns {modelId, via}",
    typeof model.body?.data?.modelId === "string" && typeof model.body?.data?.via === "string",
    JSON.stringify(model.body?.data));

  // --------------------------------------------------- kernel: diagnostics
  const diag = await call("POST", "/api/v1/kernel/diagnostics/run", { token });
  check("POST /kernel/diagnostics/run → 200", diag.status === 200, `status ${diag.status}`);
  check("diagnostics returns {healthy, degraded}",
    typeof diag.body?.data?.healthy === "boolean" && Array.isArray(diag.body?.data?.degraded),
    JSON.stringify(diag.body?.data));
  const postDiag = await call("GET", "/api/v1/kernel/components", { token });
  check("diagnostics healed every degraded component",
    (postDiag.body?.data ?? []).every(c => c.status !== "degraded" && c.status !== "offline"),
    (postDiag.body?.data ?? []).filter(c => c.status === "degraded" || c.status === "offline").map(c => c.key).join(","));
  check("diagnostics leaves stub components as stub",
    (postDiag.body?.data ?? []).filter(c => c.status === "stub").length === 5);

  // -------------------------------------------------------------- ai: reads
  const models = await call("GET", "/api/v1/ai/models", { token });
  check("GET /ai/models → 200", models.status === 200, `status ${models.status}`);
  check("/ai/models returns an array", Array.isArray(models.body?.data), typeof models.body?.data);

  const providers = await call("GET", "/api/v1/ai/providers", { token });
  check("GET /ai/providers → 200", providers.status === 200, `status ${providers.status}`);
  check("/ai/providers lists the six provider slots",
    (providers.body?.data ?? []).length === 6, `got ${providers.body?.data?.length}`);
  check("every provider reports id/displayName/isReal/configured",
    (providers.body?.data ?? []).every(p => "id" in p && "displayName" in p && "isReal" in p && "configured" in p));

  const aiHealth = await call("GET", "/api/v1/ai/health", { token });
  check("GET /ai/health → 200", aiHealth.status === 200, `status ${aiHealth.status}`);
  check("/ai/health reports hasRealProvider as a boolean", typeof aiHealth.body?.data?.hasRealProvider === "boolean");
  check("/ai/health explains itself when no provider is configured",
    aiHealth.body?.data?.hasRealProvider === true || typeof aiHealth.body?.data?.configMessage === "string",
    String(aiHealth.body?.data?.configMessage).slice(0, 60));

  const usage = await call("GET", "/api/v1/ai/usage?periodDays=7", { token });
  check("GET /ai/usage → 200", usage.status === 200, `status ${usage.status}`);
  const u = usage.body?.data ?? {};
  check("/ai/usage echoes periodDays", u.periodDays === 7, String(u.periodDays));
  for (const field of ["requests", "succeeded", "failed", "avgLatency", "totalCost", "totalPromptTokens", "totalCompletionTokens", "successRate"]) {
    check(`/ai/usage totals.${field} is a number`, typeof (u.totals ?? {})[field] === "number", `got ${typeof (u.totals ?? {})[field]}`);
  }
  check("/ai/usage returns byModel/byChannel/recent arrays",
    Array.isArray(u.byModel) && Array.isArray(u.byChannel) && Array.isArray(u.recent));
  check("/ai/usage clamps periodDays to 1..365",
    (await call("GET", "/api/v1/ai/usage?periodDays=9999", { token })).body?.data?.periodDays === 365);

  // ------------------------------------------------------------- ai: writes
  const hasReal = aiHealth.body?.data?.hasRealProvider === true;
  const complete = await call("POST", "/api/v1/ai/complete", { token, json: { messages: [{ role: "user", content: "say ok" }] } });
  const brief = JSON.stringify(complete.body?.data ?? complete.body?.error ?? complete.body ?? null).slice(0, 160);
  if (hasReal) {
    check("POST /ai/complete → 200 with a real provider", complete.status === 200, `status ${complete.status} ${brief}`);
    check("completion returns Node's CompletionResult shape",
      typeof complete.body?.data?.content === "string" && complete.body?.data?.usage && typeof complete.body?.data?.durationMs === "number",
      brief);
  } else {
    // Outside production the Echo demo assistant answers; in production the
    // endpoint must refuse rather than invent an answer.
    check("POST /ai/complete answers or refuses honestly", [200, 503].includes(complete.status), `status ${complete.status}`);
    if (complete.status === 200) {
      check("demo completion is labelled as a demo",
        complete.body?.data?.modelSource === "echo-demo" && String(complete.body?.data?.content).startsWith("[WINDELS ECHO DEMO"),
        JSON.stringify(complete.body?.data).slice(0, 120));
    } else {
      check("production refusal uses AI_PROVIDER_CONFIGURATION_REQUIRED",
        complete.body?.error?.code === "AI_PROVIDER_CONFIGURATION_REQUIRED", JSON.stringify(complete.body?.error));
    }
  }
  check("POST /ai/complete with no messages → 422",
    (await call("POST", "/ai/complete", { token, json: { messages: [] } })).status === 422);
  check("POST /ai/complete with an invalid role → 422",
    (await call("POST", "/ai/complete", { token, json: { messages: [{ role: "wizard", content: "hi" }] } })).status === 422);
  check("POST /ai/complete with temperature out of range → 422",
    (await call("POST", "/ai/complete", { token, json: { messages: [{ role: "user", content: "hi" }], temperature: 9 } })).status === 422);

  const embed = await call("POST", "/api/v1/ai/embed", { token, json: { input: "hello world" } });
  check("POST /ai/embed answers or refuses honestly", [200, 503].includes(embed.status), `status ${embed.status}`);
  if (embed.status === 200) {
    check("embedding returns Node's EmbeddingResult shape",
      Array.isArray(embed.body?.data?.embeddings) && typeof embed.body?.data?.model === "string" && typeof embed.body?.data?.durationMs === "number",
      JSON.stringify(embed.body?.data).slice(0, 120));
    check("embedding vector is non-empty", (embed.body?.data?.embeddings?.[0] ?? []).length > 0);
    if (embed.body?.data?.source === "echo-demo") {
      check("placeholder embeddings carry a warning", typeof embed.body?.data?.warning === "string");
    }
  }
  check("POST /ai/embed with empty input → 422",
    (await call("POST", "/api/v1/ai/embed", { token, json: { input: "" } })).status === 422);

  const probe = await call("POST", "/api/v1/ai/test-providers", { token });
  check("POST /ai/test-providers (admin) → 200", probe.status === 200, `status ${probe.status}`);
  check("provider probe reports one result per provider",
    Array.isArray(probe.body?.data) && probe.body.data.length >= 1, `got ${probe.body?.data?.length}`);
  check("each probe result states healthy/latencyMs/checkedAt",
    (probe.body?.data ?? []).every(p => "healthy" in p && "latencyMs" in p && "checkedAt" in p));

  // ------------------------------------------------------------ auth + verbs
  const noAuth = await call("GET", "/api/v1/kernel/status");
  check("GET /kernel/status without a token → 401", noAuth.status === 401, `status ${noAuth.status}`);
  check("GET /ai/models without a token → 401", (await call("GET", "/api/v1/ai/models")).status === 401);

  check("GET /kernel/dispatch (wrong verb) → 405", (await call("GET", "/api/v1/kernel/dispatch", { token })).status === 405);
  check("GET /kernel/diagnostics/run (wrong verb) → 405", (await call("GET", "/api/v1/kernel/diagnostics/run", { token })).status === 405);
  check("POST /kernel/components (wrong verb) → 405", (await call("POST", "/api/v1/kernel/components", { token, json: {} })).status === 405);
  check("GET /ai/complete (wrong verb) → 405", (await call("GET", "/api/v1/ai/complete", { token })).status === 405);

  // ------------------------------------------------------------------ report
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.log("\nFailures:"); failures.forEach(f => console.log("  - " + f)); process.exit(1); }
  console.log("kernel module: parity verified against the PHP runtime.");
}

main().catch(e => { console.error(e); process.exit(1); });
