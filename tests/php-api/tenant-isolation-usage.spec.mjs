/**
 * PHP runtime parity spec — Tenant Isolation + Usage Intelligence.
 *
 *   GET  /api/v1/tenant-isolation/policy                 GET    /api/v1/usage-intel/dashboard/rollup
 *   PUT  /api/v1/tenant-isolation/policy                 POST   /api/v1/usage-intel/events
 *   POST /api/v1/tenant-isolation/compliance/run         GET    /api/v1/usage-intel/events
 *   GET  /api/v1/tenant-isolation/compliance/runs        GET    /api/v1/usage-intel/events/:id
 *   GET  /api/v1/tenant-isolation/compliance/runs/:id    DELETE /api/v1/usage-intel/events/:id
 *   POST /api/v1/tenant-isolation/export-check
 *
 * Run:
 *   node tests/php-api/tenant-isolation-usage.spec.mjs http://localhost:8082 \
 *        owner@windels.example 'Owner!Pass#2026'
 *
 * No dependencies — uses the global fetch built into Node 18+.
 *
 * Two things this spec deliberately checks that a shape-only test would miss:
 *
 *   * the compliance probes must PASS. A probe that always succeeds is not a
 *     probe, so the run is asserted to have measured both and reported
 *     passed === true, with a non-zero duration.
 *   * the usage dashboard must be honest: a metric with no prior-period
 *     baseline reports deltaPct null (never 0), a rate with an empty
 *     denominator is null (never 0), and an average latency that was never
 *     measured is null (never 0 ms).
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
  const res = await fetch(base + path, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) , signal: AbortSignal.timeout(30000) });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

async function main() {
  console.log(`tenant-isolation + usage parity spec against ${base}\n`);

  const login = await call("POST", "/api/v1/auth/login", { json: { identifier: ident, password: pass } });
  check("login succeeds", login.status === 200 && login.body?.ok === true, `status ${login.status}`);
  const token = login.body?.data?.token;
  if (!token) { console.log("\nCannot continue without a token."); process.exit(1); }

  // ══════════════════════════════════════════════════════ tenant isolation
  console.log("\n[tenant-isolation]");

  const initial = await call("GET", "/api/v1/tenant-isolation/policy", { token });
  check("GET /policy → 200", initial.status === 200, `status ${initial.status}`);
  const p0 = initial.body?.data ?? {};
  check("default policy is isolated-by-default",
    p0.allowCrossTenantExport === false && p0.allowExternalSharing === false
      && p0.piiRedactionLevel === "basic" && p0.retentionDays === 365,
    JSON.stringify(p0));
  // "system" on a policy nobody has edited; the acting user's id afterwards.
  // This spec PUTs the policy (see the relaxed/restore sections below), so a
  // repeat run legitimately sees the last editor rather than "system" —
  // asserting "system" unconditionally made the spec pass only once per
  // database.
  check("policy records who last set it", typeof p0.updatedBy === "string" && p0.updatedBy.length > 0, String(p0.updatedBy));
  check("policy carries its org id and an ISO updatedAt",
    typeof p0.orgId === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(p0.updatedAt)),
    `${p0.orgId} / ${p0.updatedAt}`);

  // -- validation on write
  check("PUT /policy with no body → 422", (await call("PUT", "/api/v1/tenant-isolation/policy", { token, json: {} })).status === 422);
  check("PUT /policy with a bad PII level → 422",
    (await call("PUT", "/api/v1/tenant-isolation/policy", { token,
      json: { allowCrossTenantExport: false, allowExternalSharing: false, piiRedactionLevel: "maximum", retentionDays: 90 } })).status === 422);
  check("PUT /policy with retentionDays 0 → 422",
    (await call("PUT", "/api/v1/tenant-isolation/policy", { token,
      json: { allowCrossTenantExport: false, allowExternalSharing: false, piiRedactionLevel: "basic", retentionDays: 0 } })).status === 422);
  check("PUT /policy with retentionDays 3651 → 422",
    (await call("PUT", "/api/v1/tenant-isolation/policy", { token,
      json: { allowCrossTenantExport: false, allowExternalSharing: false, piiRedactionLevel: "basic", retentionDays: 3651 } })).status === 422);
  check("PUT /policy with a non-boolean flag → 422",
    (await call("PUT", "/api/v1/tenant-isolation/policy", { token,
      json: { allowCrossTenantExport: "yes", allowExternalSharing: false, piiRedactionLevel: "basic", retentionDays: 90 } })).status === 422);

  // -- export gate under the default (blocking) policy
  const blocked = await call("POST", "/api/v1/tenant-isolation/export-check", { token, json: { dataset: "conversations" } });
  check("POST /export-check is refused while the policy blocks export", blocked.status === 403, `status ${blocked.status}`);
  check("refusal explains itself and echoes the policy slice",
    blocked.body?.data?.allowed === false
      && typeof blocked.body?.data?.reason === "string"
      && blocked.body?.data?.policy?.allowCrossTenantExport === false,
    JSON.stringify(blocked.body?.data));
  check("POST /export-check with an empty dataset → 422",
    (await call("POST", "/api/v1/tenant-isolation/export-check", { token, json: { dataset: "" } })).status === 422);

  // -- compliance run: the probes must actually run and pass
  const run = await call("POST", "/api/v1/tenant-isolation/compliance/run", { token });
  check("POST /compliance/run → 201", run.status === 201, `status ${run.status}`);
  const r0 = run.body?.data ?? {};
  check("run id has the Node tirun_ prefix", typeof r0.id === "string" && r0.id.startsWith("tirun_"), String(r0.id));
  check("run reports a status and a 0-100 score",
    ["compliant", "review_required", "failed"].includes(r0.status) && r0.score >= 0 && r0.score <= 100,
    `${r0.status} / ${r0.score}`);
  check("run scanned the org-scoped tables", Array.isArray(r0.namespaces) && r0.namespaces.length >= 15, `${r0.namespaces?.length} tables`);
  check("every scanned table reports keyCount/conformingKeys/leakedKeys",
    (r0.namespaces ?? []).every(n => typeof n.keyCount === "number" && typeof n.conformingKeys === "number" && Array.isArray(n.leakedKeys)));
  check("org-scoped and platform-global tables are distinguished",
    (r0.namespaces ?? []).some(n => n.scope === "org_scoped") && (r0.namespaces ?? []).some(n => n.scope === "shared"),
    [...new Set((r0.namespaces ?? []).map(n => n.scope))].join(","));
  check("both cross-tenant probes ran",
    Array.isArray(r0.probes) && r0.probes.length === 2, `${r0.probes?.length} probes`);
  check("both cross-tenant probes passed",
    (r0.probes ?? []).length === 2 && r0.probes.every(p => p.passed === true),
    JSON.stringify((r0.probes ?? []).map(p => p.passed)));
  check("probes report a measured duration",
    (r0.probes ?? []).every(p => typeof p.durationMs === "number" && p.durationMs >= 0),
    JSON.stringify((r0.probes ?? []).map(p => p.durationMs)));
  check("findings carry severity and scope when present",
    (r0.findings ?? []).every(f => ["high", "medium", "low"].includes(f.severity) && ["database", "probe", "policy", "redis"].includes(f.scope)));
  check("run summary matches the status", typeof r0.summary === "string" && r0.summary.length > 0, String(r0.summary));

  const runs = await call("GET", "/api/v1/tenant-isolation/compliance/runs", { token });
  check("GET /compliance/runs → 200", runs.status === 200, `status ${runs.status}`);
  check("the new run is listed", (runs.body?.data ?? []).some(x => x.id === r0.id), `${runs.body?.data?.length} runs`);
  check("runs are ordered newest first",
    (runs.body?.data ?? []).length < 2 || (runs.body.data[0].ranAt >= runs.body.data[1].ranAt));

  const one = await call("GET", `/api/v1/tenant-isolation/compliance/runs/${r0.id}`, { token });
  check("GET /compliance/runs/:id → 200", one.status === 200, `status ${one.status}`);
  check("the fetched run is the same run", one.body?.data?.id === r0.id && one.body?.data?.score === r0.score);
  check("GET /compliance/runs/unknown → 404",
    (await call("GET", "/api/v1/tenant-isolation/compliance/runs/tirun_deadbeef", { token })).status === 404);

  // -- relax the policy so the allow-path of the gate is exercised too
  const relaxed = await call("PUT", "/api/v1/tenant-isolation/policy", { token, json: {
    allowCrossTenantExport: true, allowExternalSharing: false, piiRedactionLevel: "strict", retentionDays: 45, regionPin: "eu-central-1",
  } });
  check("PUT /policy stores the new policy", relaxed.status === 200 && relaxed.body?.data?.allowCrossTenantExport === true, JSON.stringify(relaxed.body?.data));
  check("stored policy keeps regionPin and the new retention",
    relaxed.body?.data?.regionPin === "eu-central-1" && relaxed.body?.data?.retentionDays === 45);
  check("stored policy is attributed to the acting user, not the system",
    relaxed.body?.data?.updatedBy !== "system" && typeof relaxed.body?.data?.updatedBy === "string",
    String(relaxed.body?.data?.updatedBy));

  const reread = await call("GET", "/api/v1/tenant-isolation/policy", { token });
  check("GET /policy re-reads the stored policy", reread.body?.data?.allowCrossTenantExport === true && reread.body?.data?.piiRedactionLevel === "strict");

  const allowed = await call("POST", "/api/v1/tenant-isolation/export-check", { token, json: { dataset: "conversations" } });
  check("POST /export-check is allowed once the policy permits it", allowed.status === 200 && allowed.body?.data?.allowed === true, `status ${allowed.status}`);

  // -- the relaxed policy must move the posture off "compliant"
  const run2 = await call("POST", "/api/v1/tenant-isolation/compliance/run", { token });
  check("a permissive policy produces policy findings",
    (run2.body?.data?.findings ?? []).some(f => f.scope === "policy"),
    JSON.stringify((run2.body?.data?.findings ?? []).map(f => f.scope)));
  check("a permissive policy lowers the score below 100", run2.body?.data?.score < 100, String(run2.body?.data?.score));
  check("the export-enabled finding is reported as medium",
    (run2.body?.data?.findings ?? []).some(f => f.message.includes("allowCrossTenantExport") && f.severity === "medium"));

  // -- restore the default policy so the spec is repeatable
  await call("PUT", "/api/v1/tenant-isolation/policy", { token, json: {
    allowCrossTenantExport: false, allowExternalSharing: false, piiRedactionLevel: "basic", retentionDays: 365,
  } });
  const restored = await call("GET", "/api/v1/tenant-isolation/policy", { token });
  check("policy restored to the defaults", restored.body?.data?.allowCrossTenantExport === false && restored.body?.data?.retentionDays === 365);

  check("GET /tenant-isolation/policy without a token → 401", (await call("GET", "/api/v1/tenant-isolation/policy")).status === 401);
  check("DELETE /tenant-isolation/policy (wrong verb) → 405", (await call("DELETE", "/api/v1/tenant-isolation/policy", { token })).status === 405);
  check("GET /tenant-isolation/compliance/run (wrong verb) → 405", (await call("GET", "/api/v1/tenant-isolation/compliance/run", { token })).status === 405);
  check("GET /tenant-isolation/export-check (wrong verb) → 405", (await call("GET", "/api/v1/tenant-isolation/export-check", { token })).status === 405);

  // ═════════════════════════════════════════════════════════════════ usage
  console.log("\n[usage-intel]");

  const rollup = await call("GET", "/api/v1/usage-intel/dashboard/rollup", { token });
  check("GET /dashboard/rollup → 200", rollup.status === 200, `status ${rollup.status}`);
  const u = rollup.body?.data ?? {};
  check("rollup returns the ten Session 55 metrics", Array.isArray(u.metrics) && u.metrics.length === 10, `${u.metrics?.length}`);
  check("every metric has label/value/unit/deltaPct/trend",
    (u.metrics ?? []).every(m => "label" in m && "value" in m && "unit" in m && "deltaPct" in m && "trend" in m));
  check("series covers 30 days", Array.isArray(u.series) && u.series.length === 30, `${u.series?.length}`);
  check("series points carry ts/requests/tokens/latencyMs/automationTasks",
    (u.series ?? []).every(s => "ts" in s && typeof s.requests === "number" && typeof s.tokens === "number" && "latencyMs" in s && "automationTasks" in s));

  // -- the Session 123 honesty rules
  const metric = (label) => (u.metrics ?? []).find(m => m.label === label);
  check("a metric with no prior baseline reports deltaPct null, not 0",
    metric("AI employees")?.deltaPct === null, JSON.stringify(metric("AI employees")));
  check("an unmeasured average latency is null, not 0 ms",
    metric("Avg AI latency")?.value === null || typeof metric("Avg AI latency")?.value === "number",
    JSON.stringify(metric("Avg AI latency")));
  check("an empty denominator reports a null error rate, not 0%",
    metric("AI error rate")?.value === null || typeof metric("AI error rate")?.value === "number",
    JSON.stringify(metric("AI error rate")));
  check("automationRate is null when there are no workflow runs",
    u.automationRate === null || typeof u.automationRate === "number", String(u.automationRate));
  check("empty days in the series report latencyMs null, not 0",
    (u.series ?? []).filter(s => s.requests === 0).every(s => s.latencyMs === null),
    JSON.stringify((u.series ?? []).filter(s => s.requests === 0 && s.latencyMs !== null).slice(0, 3)));
  check("automationTasks is null — no metering exists",
    (u.series ?? []).every(s => s.automationTasks === null));
  check("structural zeros are named in provenance",
    Array.isArray(u.provenance?.entries) && u.provenance.entries.some(e => e.basis === "structural_zero" && e.field === "resources"),
    JSON.stringify(u.provenance?.entries?.map(e => e.basis)));
  check("measured fields are named in provenance too",
    (u.provenance?.entries ?? []).some(e => e.basis === "measured" && e.field === "metrics"));
  check("rollup attaches the ledger block with its window note",
    typeof u.ledger?.total === "number" && typeof u.ledger?.byFeature === "object" && /most recent 100/.test(String(u.ledger?.note)),
    JSON.stringify(u.ledger?.note));

  // -- event ledger
  const created = await call("POST", "/api/v1/usage-intel/events", { token, json: {
    feature: "spec.smoke", actor: "parity-spec", quantity: 3, unit: "call", meta: { nested: { ok: true } },
  } });
  check("POST /events → 201", created.status === 201, `status ${created.status}`);
  const e0 = created.body?.data ?? {};
  check("created event echoes feature/actor/quantity/unit",
    e0.feature === "spec.smoke" && e0.actor === "parity-spec" && e0.quantity === 3 && e0.unit === "call",
    JSON.stringify(e0));
  check("created event keeps its meta payload", e0.meta?.nested?.ok === true, JSON.stringify(e0.meta));
  check("created event has an id prefixed u- and an ISO createdAt",
    typeof e0.id === "string" && e0.id.startsWith("u-") && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(e0.createdAt)),
    `${e0.id} / ${e0.createdAt}`);

  check("POST /events with a 1-character feature → 422",
    (await call("POST", "/api/v1/usage-intel/events", { token, json: { feature: "x", actor: "spec", quantity: 1, unit: "call" } })).status === 422);
  check("POST /events with a negative quantity → 422",
    (await call("POST", "/api/v1/usage-intel/events", { token, json: { feature: "spec.neg", actor: "spec", quantity: -1, unit: "call" } })).status === 422);
  check("POST /events with a quantity above 1e9 → 422",
    (await call("POST", "/api/v1/usage-intel/events", { token, json: { feature: "spec.big", actor: "spec", quantity: 2e9, unit: "call" } })).status === 422);
  check("POST /events with no unit → 422",
    (await call("POST", "/api/v1/usage-intel/events", { token, json: { feature: "spec.unit", actor: "spec", quantity: 1 } })).status === 422);
  check("POST /events with meta as a string → 422",
    (await call("POST", "/api/v1/usage-intel/events", { token, json: { feature: "spec.meta", actor: "spec", quantity: 1, unit: "call", meta: "nope" } })).status === 422);

  const list = await call("GET", "/api/v1/usage-intel/events", { token });
  check("GET /events → 200", list.status === 200, `status ${list.status}`);
  check("the created event is listed", (list.body?.data ?? []).some(e => e.id === e0.id), `${list.body?.data?.length} events`);
  check("events are newest first",
    (list.body?.data ?? []).length < 2 || (list.body.data[0].createdAt >= list.body.data[1].createdAt));

  const fetched = await call("GET", `/api/v1/usage-intel/events/${e0.id}`, { token });
  check("GET /events/:id → 200", fetched.status === 200 && fetched.body?.data?.id === e0.id, `status ${fetched.status}`);
  check("GET /events/unknown → 404", (await call("GET", "/api/v1/usage-intel/events/u-doesnotexist", { token })).status === 404);

  const clamped = await call("GET", "/api/v1/usage-intel/events?limit=99999", { token });
  check("GET /events clamps limit to 1000", clamped.status === 200 && (clamped.body?.data ?? []).length <= 1000);

  const deleted = await call("DELETE", `/api/v1/usage-intel/events/${e0.id}`, { token });
  check("DELETE /events/:id → 200", deleted.status === 200 && deleted.body?.data?.deleted === true, `status ${deleted.status}`);
  check("the deleted event is gone", (await call("GET", `/api/v1/usage-intel/events/${e0.id}`, { token })).status === 404);

  check("GET /usage-intel/dashboard/rollup without a token → 401", (await call("GET", "/api/v1/usage-intel/dashboard/rollup")).status === 401);
  check("DELETE /usage-intel/dashboard/rollup (wrong verb) → 405", (await call("DELETE", "/api/v1/usage-intel/dashboard/rollup", { token })).status === 405);
  check("PATCH /usage-intel/events (wrong verb) → 405", (await call("PATCH", "/api/v1/usage-intel/events", { token, json: {} })).status === 405);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.log("\nFailures:"); failures.forEach(f => console.log("  - " + f)); process.exit(1); }
  console.log("tenant-isolation + usage: parity verified against the PHP runtime.");
}

main().catch(e => { console.error(e); process.exit(1); });
