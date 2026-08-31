/**
 * PHP runtime parity spec — Memory Evolution (Node routes/memoryEvolution.ts).
 *
 * Exercises the memory register, all six routes:
 *
 *   GET  /api/v1/memory-evolution/dashboard/rollup
 *   GET  /api/v1/memory-evolution/memories
 *   POST /api/v1/memory-evolution/memories
 *   POST /api/v1/memory-evolution/consolidate
 *   GET  /api/v1/memory-evolution/consolidations
 *   POST /api/v1/memory-evolution/memories/:id/share
 *
 * Run:
 *   node tests/php-api/memoryEvolution.spec.mjs http://localhost:8082 \
 *        owner@windels.example 'Owner!Pass#2026' \
 *        <dbUser> <dbPass> <dbName> [dbHost] [dbPort]
 *
 * One deliberate divergence from Node is asserted rather than hidden
 * ---------------------------------------------------------------
 * Node's Redis keys carry no organization segment (`me:mems`, `me:mem:<id>`,
 * `me:consol`, `me:m:*`), so every tenant shares one register and the admin
 * gate is the only thing in front of it — an administrator of one
 * organization reads another organization's memories. This port scopes the
 * register by organization_id, because a memory register holds enterprise
 * knowledge and the tenant boundary in the PHP build is a column, not a gate.
 * "Cross-tenant reads return nothing" is therefore asserted here, and the
 * module's own behaviour — nine types, 1% decay per day, the 0.2 recall floor,
 * the 0.05/0.5 forget threshold, deduplication within a scope and the five
 * consolidation kinds — is asserted unchanged.
 *
 * The second thing this spec exists to protect is that nothing is seeded:
 * Node's nine sample memories (platform mission, voice-consent policy, team
 * standups) were demo data behind a flag, and a fresh organization must report
 * an empty register rather than plausible-looking enterprise facts.
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

const TYPES = ["episodic", "semantic", "procedural", "organizational", "department", "project", "user", "team", "knowledge"];

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

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const stamp = Date.now();
const pad = (field, length) => field.repeat(Math.ceil(length / field.length)).slice(0, length);

const memoryInput = (over = {}) => ({ type: "knowledge", content: "Exchange rate fallback is used when live/cache are unavailable.", ...over });

async function registerAccount(db, label, organization) {
  const email = `me-${label}-${stamp}@windels.example`;
  const created = await call("POST", "/api/v1/auth/register", { json: { email, password: "Memory!Pass#2026", displayName: `Memory ${label}`, organizationName: organization } });
  if (!created.data?.token) throw new Error(`register ${label} failed: ${JSON.stringify(created.body)}`);
  const login = await call("POST", "/api/v1/auth/login", { json: { email, password: "Memory!Pass#2026" } });
  return { email, login: login.data };
}

async function main() {
  const db = await mysql.createConnection({ host: dbHost, port: dbPort, user: dbUser, password: dbPass, database: dbName });

  console.log(`\nmemory evolution parity — ${base}\n`);

  const login = await call("POST", "/api/v1/auth/login", { json: { email: ident, password: pass } });
  const token = login.data?.token;
  check("super admin can sign in", !!token, JSON.stringify(login.body?.error));
  if (!token) { await db.end(); process.exit(1); }

  const board = await registerAccount(db, "board", "Memory Board Org");
  const boardToken = board.login?.token;
  const boardOrg = board.login?.user?.organizationId;
  check("the board fixture signs in to its own organization", !!boardToken && !!boardOrg, JSON.stringify(board.login?.user));
  if (!boardToken || !boardOrg) { await db.end(); process.exit(1); }

  // A second administrator, for the tenant-boundary checks.
  const other = await registerAccount(db, "other", "Memory Other Org");
  const otherToken = other.login?.token;
  const otherOrg = other.login?.user?.organizationId;

  // A plain member, for the admin gate.
  const member = await registerAccount(db, "member", "Memory Member Org");
  await db.query("UPDATE users SET role = 'USER' WHERE id = ?", [member.login.user.id]);
  const memberLogin = await call("POST", "/api/v1/auth/login", { json: { email: member.email, password: "Memory!Pass#2026" } });
  const memberToken = memberLogin.data?.token;
  check("the member fixture signs in as a plain user", !!memberToken && memberLogin.data.user.role === "user", JSON.stringify(memberLogin.data?.user));

  // ═══════════════════════════════════════════════════════ authentication
  console.log("\n[authentication]");
  for (const [method, path] of [
    ["GET", "/api/v1/memory-evolution/dashboard/rollup"],
    ["GET", "/api/v1/memory-evolution/memories"],
    ["POST", "/api/v1/memory-evolution/memories"],
    ["POST", "/api/v1/memory-evolution/consolidate"],
    ["GET", "/api/v1/memory-evolution/consolidations"],
    ["POST", "/api/v1/memory-evolution/memories/mem-12345678/share"],
  ]) {
    const r = await call(method, path, { json: method === "GET" ? undefined : {} });
    check(`${method} ${path} without a token → 401`, r.status === 401, `status ${r.status}`);
  }

  // ═══════════════════════════════════════════════════════ admin gate
  console.log("\n[admin gate]");
  for (const [method, path] of [
    ["GET", "/api/v1/memory-evolution/dashboard/rollup"],
    ["GET", "/api/v1/memory-evolution/memories"],
    ["POST", "/api/v1/memory-evolution/memories"],
    ["POST", "/api/v1/memory-evolution/consolidate"],
    ["GET", "/api/v1/memory-evolution/consolidations"],
    ["POST", "/api/v1/memory-evolution/memories/mem-12345678/share"],
  ]) {
    const r = await call(method, path, { token: memberToken, json: method === "GET" ? undefined : { agentId: "a" } });
    check(`${method} ${path} as a plain user → 403`, r.status === 403, `status ${r.status}`);
  }
  const denied = await call("GET", "/api/v1/memory-evolution/dashboard/rollup", { token: memberToken });
  check("403 says Admins only, as Node does", denied.error?.message === "Admins only", JSON.stringify(denied.error));

  // ═══════════════════════════════════════════════════════ empty register
  console.log("\n[a fresh organization starts empty]");
  const emptyDashboard = await call("GET", "/api/v1/memory-evolution/dashboard/rollup", { token: boardToken });
  const e = emptyDashboard.data ?? {};
  check("GET /dashboard/rollup → 200", emptyDashboard.status === 200, `status ${emptyDashboard.status}`);
  check("total 0 — no sample memories are seeded", e.total === 0, String(e.total));
  check("avgConfidence 0", e.avgConfidence === 0, String(e.avgConfidence));
  check("every one of the nine types reports 0", TYPES.every((t) => e.memoriesByType?.[t] === 0), JSON.stringify(e.memoriesByType));
  check("no consolidation jobs", e.consolidationJobs24h === 0, String(e.consolidationJobs24h));
  check("no duplicates merged", e.duplicatesMerged === 0, String(e.duplicatesMerged));
  check("nothing forgotten", e.memoriesForgotten === 0, String(e.memoriesForgotten));
  check("nothing shared", e.crossAgentShares === 0, String(e.crossAgentShares));
  check("aging is reported active", e.agingActive === true, String(e.agingActive));
  check("intelligent forgetting is reported active", e.intelligentForgettingActive === true, String(e.intelligentForgettingActive));
  check("the S37 fabric lineage is reported", e.extendsS37Fabric === true, String(e.extendsS37Fabric));
  const emptyMemories = await call("GET", "/api/v1/memory-evolution/memories", { token: boardToken });
  check("a fresh register recalls nothing", Array.isArray(emptyMemories.data) && emptyMemories.data.length === 0, JSON.stringify(emptyMemories.data));
  const emptyJobs = await call("GET", "/api/v1/memory-evolution/consolidations", { token: boardToken });
  check("GET /consolidations → 200 []", Array.isArray(emptyJobs.data) && emptyJobs.data.length === 0, JSON.stringify(emptyJobs.data));

  // ═══════════════════════════════════════════════════════ storing
  console.log("\n[storing a memory]");
  const created = await call("POST", "/api/v1/memory-evolution/memories", { token: boardToken, json: memoryInput({ tags: ["currency", "fallback"], scope: "enterprise:knowledge", confidence: 0.92 }) });
  check("POST /memories → 200", created.status === 200, `status ${created.status} ${JSON.stringify(created.body?.error)}`);
  const m0 = created.data ?? {};
  check("the id is a mem-<8 hex> memory id", /^mem-[0-9a-f]{8}$/.test(String(m0.id)), String(m0.id));
  check("confidence is stored as given", m0.confidence === 0.92, String(m0.confidence));
  check("tags round-trip", Array.isArray(m0.tags) && m0.tags.join(",") === "currency,fallback", JSON.stringify(m0.tags));
  check("scope is stored", m0.scope === "enterprise:knowledge", String(m0.scope));
  check("a new memory has been accessed once", m0.accessCount === 1, String(m0.accessCount));
  check("and starts at full strength", m0.decayedStrength === 1, String(m0.decayedStrength));
  check("createdAt and lastAccessedAt are ISO timestamps", ISO.test(String(m0.createdAt)) && ISO.test(String(m0.lastAccessedAt)), `${m0.createdAt} / ${m0.lastAccessedAt}`);
  const row = (await db.query("SELECT organization_id, content, tags FROM memory_evolution_memories WHERE id = ?", [m0.id]))[0][0];
  check("the row is in MySQL, stamped with the caller's organization", row?.organization_id === boardOrg, JSON.stringify(row));

  const bare = await call("POST", "/api/v1/memory-evolution/memories", { token: boardToken, json: { type: "semantic", content: "The Kernel uses event dispatching with policy gates." } });
  check("confidence defaults to 0.8", bare.data?.confidence === 0.8, String(bare.data?.confidence));
  check("tags default to an empty array", Array.isArray(bare.data?.tags) && bare.data.tags.length === 0, JSON.stringify(bare.data?.tags));
  check("scope defaults to enterprise:windels", bare.data?.scope === "enterprise:windels", String(bare.data?.scope));

  // ═══════════════════════════════════════════════════════ deduplication
  console.log("\n[deduplication]");
  const repeat = await call("POST", "/api/v1/memory-evolution/memories", { token: boardToken, json: memoryInput({ tags: ["currency"], scope: "enterprise:knowledge" }) });
  check("the same content in the same scope is not a second memory", repeat.data?.id === m0.id, `${repeat.data?.id} vs ${m0.id}`);
  check("the existing memory is re-accessed instead", repeat.data?.accessCount === 2, String(repeat.data?.accessCount));
  check("and its confidence rises by 0.02", Math.abs(repeat.data?.confidence - 0.94) < 1e-6, String(repeat.data?.confidence));
  const otherScope = await call("POST", "/api/v1/memory-evolution/memories", { token: boardToken, json: memoryInput({ scope: "team:platform" }) });
  check("the same content in a different scope IS a new memory", otherScope.data?.id !== m0.id, String(otherScope.data?.id));
  const afterDedup = (await call("GET", "/api/v1/memory-evolution/dashboard/rollup", { token: boardToken })).data;
  check("the dashboard counts one duplicate merged", afterDedup.duplicatesMerged === 1, String(afterDedup.duplicatesMerged));
  check("and three memories in total", afterDedup.total === 3, String(afterDedup.total));

  // ═══════════════════════════════════════════════════════ validation
  console.log("\n[POST /memories — validation]");
  for (const [name, body] of [
    ["no body at all", {}],
    ["a missing type", { content: "Something remembered." }],
    ["an unknown type", { type: "instinct", content: "Something remembered." }],
    ["a missing content", { type: "knowledge" }],
    ["an empty content", { type: "knowledge", content: "" }],
    ["tags given as a string", { type: "knowledge", content: "x", tags: "currency" }],
    ["tags containing a non-string", { type: "knowledge", content: "x", tags: ["ok", 7] }],
    ["a scope over 200 characters", { type: "knowledge", content: "x", scope: pad("s", 201) }],
    ["confidence above 1", { type: "knowledge", content: "x", confidence: 1.5 }],
    ["confidence below 0", { type: "knowledge", content: "x", confidence: -0.2 }],
    ["a non-numeric confidence", { type: "knowledge", content: "x", confidence: "high" }],
  ]) {
    const r = await call("POST", "/api/v1/memory-evolution/memories", { token: boardToken, json: body });
    check(`POST /memories with ${name} → 422`, r.status === 422, `status ${r.status}`);
  }
  check("no rejected body stored anything", (await call("GET", "/api/v1/memory-evolution/dashboard/rollup", { token: boardToken })).data.total === 3);

  // ═══════════════════════════════════════════════════════ recall
  console.log("\n[recall]");
  const recalled = await call("GET", "/api/v1/memory-evolution/memories", { token: boardToken });
  check("GET /memories recalls the register", recalled.data.length === 3, `count ${recalled.data?.length}`);
  check("the newest memory comes first", recalled.data[0].id === otherScope.data.id, recalled.data.map((m) => m.id).join(","));
  check("recall re-stamps the access it made", recalled.data.some((m) => m.id === m0.id && m.accessCount === 3), JSON.stringify(recalled.data.map((m) => [m.id, m.accessCount])));
  check("a memory recalled minutes ago is still near full strength",
    recalled.data.every((m) => m.decayedStrength > 0.99), JSON.stringify(recalled.data.map((m) => m.decayedStrength)));

  const byType = await call("GET", "/api/v1/memory-evolution/memories?type=semantic", { token: boardToken });
  check("filtering by type returns only that type", byType.data.length === 1 && byType.data[0].type === "semantic", JSON.stringify(byType.data.map((m) => m.type)));
  const byScope = await call("GET", "/api/v1/memory-evolution/memories?scope=team:platform", { token: boardToken });
  check("filtering by scope returns only that scope", byScope.data.length === 1 && byScope.data[0].scope === "team:platform", JSON.stringify(byScope.data.map((m) => m.scope)));
  const byQuery = await call("GET", "/api/v1/memory-evolution/memories?query=KERNEL", { token: boardToken });
  check("a query matches content case-insensitively", byQuery.data.length === 1 && byQuery.data[0].id === bare.data.id, JSON.stringify(byQuery.data.map((m) => m.content)));
  check("a query that matches nothing returns []", (await call("GET", "/api/v1/memory-evolution/memories?query=zzzz", { token: boardToken })).data.length === 0);
  check("limit=1 → one memory", (await call("GET", "/api/v1/memory-evolution/memories?limit=1", { token: boardToken })).data.length === 1);
  check("limit=0 → 422", (await call("GET", "/api/v1/memory-evolution/memories?limit=0", { token: boardToken })).status === 422);
  check("limit=-1 → 422", (await call("GET", "/api/v1/memory-evolution/memories?limit=-1", { token: boardToken })).status === 422);
  check("limit=abc → 422", (await call("GET", "/api/v1/memory-evolution/memories?limit=abc", { token: boardToken })).status === 422);
  check("an unknown type is an empty result, not an error — Node types the query loosely",
    (await call("GET", "/api/v1/memory-evolution/memories?type=instinct", { token: boardToken })).status === 200 &&
    (await call("GET", "/api/v1/memory-evolution/memories?type=instinct", { token: boardToken })).data.length === 0);

  // ═══════════════════════════════════════════════════════ consolidation
  console.log("\n[consolidation]");
  const merged = await call("POST", "/api/v1/memory-evolution/consolidate", { token: boardToken, json: {} });
  check("POST /consolidate with no body → 200 and defaults to merge", merged.status === 200 && merged.data?.kind === "merge", JSON.stringify(merged.body));
  check("the job id is a cj-<8 hex>", /^cj-[0-9a-f]{8}$/.test(String(merged.data?.id)), String(merged.data?.id));
  check("processedAt is an ISO timestamp", ISO.test(String(merged.data?.processedAt)), String(merged.data?.processedAt));
  check("a merge counts the memories it considered", merged.data?.affected === 3, String(merged.data?.affected));
  const jobs = await call("GET", "/api/v1/memory-evolution/consolidations", { token: boardToken });
  check("the job is listed", jobs.data.length === 1 && jobs.data[0].id === merged.data.id, JSON.stringify(jobs.data));
  check("an explicit kind is recorded", (await call("POST", "/api/v1/memory-evolution/consolidate", { token: boardToken, json: { kind: "refine" } })).data?.kind === "refine");
  check("an unknown kind → 422", (await call("POST", "/api/v1/memory-evolution/consolidate", { token: boardToken, json: { kind: "compress" } })).status === 422);
  check("consolidating does not delete anything by itself", (await call("GET", "/api/v1/memory-evolution/dashboard/rollup", { token: boardToken })).data.total === 3);
  const consolidationEvents = (await db.query("SELECT COUNT(*) n FROM kernel_events WHERE kind = 'memory-evolution.consolidated' AND organization_id = ?", [boardOrg]))[0][0].n;
  check("consolidation emits a kernel event", consolidationEvents === 2, `events ${consolidationEvents}`);

  // ── deduplicate ────────────────────────────────────────────────────────
  // Node keys duplicates on `scope:content.slice(0, 60)` — the shared part
  // has to be at least 60 characters before the tails diverge.
  const sharedPrefix = "Quarterly close checklist step one: reconcile the ledgers. " + ".".repeat(20);
  const first = await call("POST", "/api/v1/memory-evolution/memories", { token: boardToken, json: { type: "procedural", content: sharedPrefix + "before the run.", scope: "team:finance", confidence: 0.6 } });
  await call("POST", "/api/v1/memory-evolution/memories", { token: boardToken, json: { type: "procedural", content: sharedPrefix + "after the run.", scope: "team:finance", confidence: 0.4 } });
  const dedupJob = await call("POST", "/api/v1/memory-evolution/consolidate", { token: boardToken, json: { kind: "deduplicate" } });
  check("deduplicate reports one memory merged away", dedupJob.data?.affected === 1, String(dedupJob.data?.affected));
  const kept = (await db.query("SELECT confidence, access_count FROM memory_evolution_memories WHERE id = ?", [first.data.id]))[0][0];
  check("the surviving memory gains 0.05 confidence", Math.abs(Number(kept.confidence) - 0.65) < 1e-6, String(kept.confidence));
  check("and absorbs the duplicate's access count", Number(kept.access_count) === 2, String(kept.access_count));
  const dedupDashboard = (await call("GET", "/api/v1/memory-evolution/dashboard/rollup", { token: boardToken })).data;
  check("the deduplication counter rises", dedupDashboard.duplicatesMerged === 2, String(dedupDashboard.duplicatesMerged));

  // ── age + forgetting ───────────────────────────────────────────────────
  const old = new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 19).replace("T", " ");
  const stale = await call("POST", "/api/v1/memory-evolution/memories", { token: boardToken, json: { type: "episodic", content: "An old, low-confidence recollection.", scope: "team:platform", confidence: 0.3 } });
  const strong = await call("POST", "/api/v1/memory-evolution/memories", { token: boardToken, json: { type: "episodic", content: "An old but confident fact.", scope: "team:platform", confidence: 0.95 } });
  await db.query("UPDATE memory_evolution_memories SET last_accessed_at = ? WHERE id IN (?, ?)", [old, stale.data.id, strong.data.id]);

  const aged = await call("POST", "/api/v1/memory-evolution/consolidate", { token: boardToken, json: { kind: "age" } });
  check("an age pass reports what it forgot", aged.data?.affected === 1, String(aged.data?.affected));
  check("the decayed, low-confidence memory is gone", (await db.query("SELECT COUNT(*) n FROM memory_evolution_memories WHERE id = ?", [stale.data.id]))[0][0].n === 0);
  check("a confident memory survives the same decay", (await db.query("SELECT COUNT(*) n FROM memory_evolution_memories WHERE id = ?", [strong.data.id]))[0][0].n === 1);
  check("the forget counter rises", (await call("GET", "/api/v1/memory-evolution/dashboard/rollup", { token: boardToken })).data.memoriesForgotten === 1);
  const survivor = (await db.query("SELECT decayed_strength FROM memory_evolution_memories WHERE id = ?", [strong.data.id]))[0][0];
  check("the surviving memory's strength was recomputed to zero after 120 days", Number(survivor.decayed_strength) === 0, String(survivor.decayed_strength));
  check("a memory below the 0.2 strength floor is not surfaced",
    !(await call("GET", "/api/v1/memory-evolution/memories", { token: boardToken })).data.some((m) => m.id === strong.data.id));

  // ═══════════════════════════════════════════════════════ sharing
  console.log("\n[cross-agent sharing]");
  const shared = await call("POST", `/api/v1/memory-evolution/memories/${m0.id}/share`, { token: boardToken, json: { agentId: "agent-7" } });
  check("POST /memories/:id/share → 200", shared.status === 200, `status ${shared.status} ${JSON.stringify(shared.body?.error)}`);
  check("the response echoes the agent it was shared with", shared.data?.ok === true && shared.data?.sharedWith === "agent-7", JSON.stringify(shared.data));
  check("the share counter rises", (await call("GET", "/api/v1/memory-evolution/dashboard/rollup", { token: boardToken })).data.crossAgentShares === 1);
  const shareEvents = (await db.query("SELECT COUNT(*) n FROM kernel_events WHERE kind = 'memory-evolution.shared' AND organization_id = ?", [boardOrg]))[0][0].n;
  check("sharing emits a kernel event", shareEvents === 1, `events ${shareEvents}`);
  check("a missing agentId → 422", (await call("POST", `/api/v1/memory-evolution/memories/${m0.id}/share`, { token: boardToken, json: {} })).status === 422);
  check("a non-string agentId → 422", (await call("POST", `/api/v1/memory-evolution/memories/${m0.id}/share`, { token: boardToken, json: { agentId: 7 } })).status === 422);
  check("an id over 64 characters → 422", (await call("POST", `/api/v1/memory-evolution/memories/${pad("i", 65)}/share`, { token: boardToken, json: { agentId: "a" } })).status === 422);
  // Node does not check that the memory exists; the counter is the contract.
  check("sharing an unknown memory still records the share, as Node does",
    (await call("POST", "/api/v1/memory-evolution/memories/mem-deadbeef/share", { token: boardToken, json: { agentId: "agent-9" } })).status === 200);
  check("and the counter follows", (await call("GET", "/api/v1/memory-evolution/dashboard/rollup", { token: boardToken })).data.crossAgentShares === 2);

  // ═══════════════════════════════════════════════════════ tenancy
  console.log("\n[organization scope]");
  const otherDashboard = await call("GET", "/api/v1/memory-evolution/dashboard/rollup", { token: otherToken });
  check("another organization's register is empty", otherDashboard.data?.total === 0 && otherDashboard.data?.duplicatesMerged === 0, JSON.stringify(otherDashboard.data));
  check("another organization recalls nothing", (await call("GET", "/api/v1/memory-evolution/memories", { token: otherToken })).data.length === 0);
  check("another organization sees no consolidation jobs", (await call("GET", "/api/v1/memory-evolution/consolidations", { token: otherToken })).data.length === 0);
  const otherMemory = await call("POST", "/api/v1/memory-evolution/memories", { token: otherToken, json: { type: "team", content: "Platform team holds Wed standups." } });
  check("an administrator of another organization can write to their own register", otherMemory.status === 200, `status ${otherMemory.status}`);
  check("and it does not appear in the first organization's", (await call("GET", "/api/v1/memory-evolution/dashboard/rollup", { token: boardToken })).data.total === 5, `total ${(await call("GET", "/api/v1/memory-evolution/dashboard/rollup", { token: boardToken })).data.total}`);
  check("nor in the other direction",
    (await call("GET", "/api/v1/memory-evolution/memories?query=Exchange", { token: otherToken })).data.length === 0);
  const shareScoped = await call("POST", `/api/v1/memory-evolution/memories/${m0.id}/share`, { token: otherToken, json: { agentId: "agent-9" } });
  check("sharing a memory id from another organization is a share of an id, not a leak — the counter stays with the caller",
    shareScoped.status === 200 && (await call("GET", "/api/v1/memory-evolution/dashboard/rollup", { token: otherToken })).data.crossAgentShares === 1, JSON.stringify(shareScoped.data));

  // ═══════════════════════════════════════════════════════ method guards
  console.log("\n[method guards]");
  check("POST /dashboard/rollup → 405", (await call("POST", "/api/v1/memory-evolution/dashboard/rollup", { token: boardToken, json: {} })).status === 405);
  check("POST /consolidations → 405", (await call("POST", "/api/v1/memory-evolution/consolidations", { token: boardToken, json: {} })).status === 405);
  check("GET /consolidate → 405", (await call("GET", "/api/v1/memory-evolution/consolidate", { token: boardToken })).status === 405);
  check("DELETE /memories → 405", (await call("DELETE", "/api/v1/memory-evolution/memories", { token: boardToken })).status === 405);
  check("GET /memories/:id/share → 405", (await call("GET", `/api/v1/memory-evolution/memories/${m0.id}/share`, { token: boardToken })).status === 405);

  // ── cleanup ────────────────────────────────────────────────────────────
  await db.query("DELETE FROM memory_evolution_memories WHERE organization_id IN (?, ?, ?)", [boardOrg, otherOrg, memberLogin.data.user.organizationId]);
  await db.query("DELETE FROM memory_evolution_jobs WHERE organization_id IN (?, ?, ?)", [boardOrg, otherOrg, memberLogin.data.user.organizationId]);
  await db.query("DELETE FROM memory_evolution_metrics WHERE organization_id IN (?, ?, ?)", [boardOrg, otherOrg, memberLogin.data.user.organizationId]);
  await db.query("DELETE FROM kernel_events WHERE organization_id IN (?, ?, ?)", [boardOrg, otherOrg, memberLogin.data.user.organizationId]);
  await db.query("DELETE FROM users WHERE email IN (?, ?, ?)", [board.email, other.email, member.email]);
  await db.end();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nfailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  console.log("memory evolution: parity verified against the PHP runtime.");
}

main().catch((error) => { console.error(error); process.exit(1); });
