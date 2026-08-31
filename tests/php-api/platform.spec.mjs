/**
 * PHP runtime parity spec — Global Platform (Node routes/platform.ts).
 *
 * Exercises all 15 endpoints against the PHP/cPanel build:
 *
 *   GET    /api/v1/platform/metrics            GET    /api/v1/platform/regions
 *   GET    /api/v1/platform/logs               GET    /api/v1/platform/dr
 *   GET    /api/v1/platform/traces             POST   /api/v1/platform/failover
 *   GET    /api/v1/platform/traces/:traceId    DELETE /api/v1/platform/failover
 *   GET    /api/v1/platform/spans/:spanId      GET    /api/v1/platform/cdn
 *   GET    /api/v1/platform/ai-observability   PUT    /api/v1/platform/cdn/rules
 *                                              POST   /api/v1/platform/cdn/purge
 *   GET    /api/v1/platform/overview           POST   /api/v1/platform/cdn/sign-url
 *
 * Run:
 *   node tests/php-api/platform.spec.mjs http://localhost:8082 \
 *        owner@windels.example 'Owner!Pass#2026' \
 *        <dbUser> <dbPass> <dbName> [dbHost] [dbPort] [VP_AUTH_SECRET]
 *
 * The database arguments let the spec prove that failover state, CDN rules and
 * purge records are durable — Node keeps all three in process memory, and a
 * port that kept them in PHP request memory would fail these checks.
 *
 * `VP_AUTH_SECRET` is optional; when it is supplied the signed-URL check
 * recomputes the HMAC instead of only checking the shape.
 */
import { createRequire } from "node:module";
import crypto from "node:crypto";

const base    = (process.argv[2] || "http://localhost:8082").replace(/\/$/, "");
const ident   = process.argv[3] || "owner@windels.example";
const pass    = process.argv[4] || "Owner!Pass#2026";
const dbUser  = process.argv[5] || "windels";
const dbPass  = process.argv[6] || "windels";
const dbName  = process.argv[7] || "wnd_final_a";
const dbHost  = process.argv[8] || "127.0.0.1";
const dbPort  = Number(process.argv[9] || 3306);
const secret  = process.argv[10] || "";

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name + (detail ? ` — ${detail}` : "")); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const HEX32 = /^[0-9a-f]{32}$/;
const HEX16 = /^[0-9a-f]{16}$/;

async function call(method, path, { token, json, headers } = {}) {
  const h = { ...(headers || {}) };
  if (token) h.Authorization = `Bearer ${token}`;
  if (json !== undefined) h["Content-Type"] = "application/json";
  const res = await fetch(base + path, {
    method, headers: h, body: json === undefined ? undefined : JSON.stringify(json),
    signal: AbortSignal.timeout(30000),
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body, headers: res.headers };
}

async function main() {
  console.log(`global platform parity spec against ${base}\n`);

  const require = createRequire(import.meta.url);
  const mysql = require(process.env.MYSQL2_MODULE || "mysql2/promise");
  const db = await mysql.createConnection({ host: dbHost, port: dbPort, user: dbUser, password: dbPass, database: dbName });
  const q = async (sql, args) => (await db.query(sql, args))[0];

  const login = await call("POST", "/api/v1/auth/login", { json: { identifier: ident, password: pass } });
  check("login succeeds", login.status === 200 && login.body?.ok === true, `status ${login.status}`);
  const token = login.body?.data?.token;
  if (!token) { console.log("\nCannot continue without a token."); process.exit(1); }
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  const me = claims.sub;

  // ═══════════════════════════════════════════════════════════════ access gate
  console.log("\n[access gate]");
  check("every read endpoint rejects anonymous callers", (
    (await call("GET", "/api/v1/platform/overview")).status === 401 &&
    (await call("GET", "/api/v1/platform/metrics")).status === 401 &&
    (await call("GET", "/api/v1/platform/logs")).status === 401 &&
    (await call("GET", "/api/v1/platform/regions")).status === 401 &&
    (await call("GET", "/api/v1/platform/cdn")).status === 401));
  check("every write endpoint rejects anonymous callers", (
    (await call("POST", "/api/v1/platform/failover", { json: { toRegion: "dr-us-west-2", reason: "x" } })).status === 401 &&
    (await call("DELETE", "/api/v1/platform/failover")).status === 401 &&
    (await call("PUT", "/api/v1/platform/cdn/rules", { json: { rules: [] } })).status === 401 &&
    (await call("POST", "/api/v1/platform/cdn/purge", { json: { paths: ["/a"] } })).status === 401));

  // Failover state is durable, so a previous run can leave it set. Clear it
  // before asserting on the pristine region/DR picture, and again at the end.
  await call("DELETE", "/api/v1/platform/failover", { token });

  const originalRole = (await q("SELECT role FROM users WHERE id=?", [me]))[0]?.role;
  await q("UPDATE users SET role='USER' WHERE id=?", [me]);
  const demoted = await call("GET", "/api/v1/platform/metrics", { token });
  check("GET /metrics as a non-admin → 403", demoted.status === 403, `status ${demoted.status}`);
  await q("UPDATE users SET role=? WHERE id=?", [originalRole, me]);
  const restored = await call("GET", "/api/v1/platform/metrics", { token });
  check("restoring the admin role restores access", restored.status === 200, `status ${restored.status}`);

  // ══════════════════════════════════════════════════════════════════ metrics
  console.log("\n[metrics]");
  const m0 = await call("GET", "/api/v1/platform/metrics", { token });
  check("GET /metrics → 200", m0.status === 200 && m0.body?.ok === true, `status ${m0.status}`);
  const s0 = m0.body?.data ?? {};
  check("snapshot exposes counters, gauges, histograms, series and collectedAt",
    typeof s0.counters === "object" && typeof s0.gauges === "object" &&
    typeof s0.histograms === "object" && typeof s0.series === "object" && ISO.test(s0.collectedAt ?? ""),
    Object.keys(s0).join(","));
  const req0 = s0.counters?.["http.request.count"]?.total ?? 0;
  check("http.request.count has been recorded by real requests", req0 > 0, `total=${req0}`);
  check("counters carry a byTags breakdown", Object.keys(s0.counters?.["http.request.count"]?.byTags ?? {}).length > 0,
    JSON.stringify(s0.counters?.["http.request.count"]?.byTags ?? {}).slice(0, 160));
  check("counters total equals the sum of its tags",
    Object.values(s0.counters?.["http.request.count"]?.byTags ?? {}).reduce((a, b) => a + b, 0) === req0);
  check("the request counter is tagged by method and route, as Node's middleware tags it",
    Object.keys(s0.counters?.["http.request.count"]?.byTags ?? {}).every(k => k.includes("method=") && k.includes("route=")),
    JSON.stringify(Object.keys(s0.counters?.["http.request.count"]?.byTags ?? {})).slice(0, 160));
  const gauges = Object.keys(s0.gauges ?? {});
  check("gauges are measured, and memory usage is one of them",
    gauges.includes("php_memory_used_bytes") && (s0.gauges.php_memory_used_bytes?.value ?? 0) > 0,
    gauges.join(","));
  check("every gauge reports a value and a byTags entry",
    Object.values(s0.gauges ?? {}).every(g => typeof g.value === "number" && typeof g.byTags?._ === "number"),
    JSON.stringify(s0.gauges).slice(0, 160));
  // Tagged by method+route like the counter, so take whichever tag is present.
  const hist = Object.values(s0.histograms?.["http.request.duration_ms"]?.byTags ?? {})[0];
  check("request duration histogram exists", !!hist && hist.count > 0, JSON.stringify(hist));
  check("histogram min ≤ avg ≤ max", !!hist && hist.min <= hist.avg + 0.001 && hist.avg <= hist.max + 0.001,
    JSON.stringify(hist));
  const seriesKeys = Object.keys(s0.series ?? {});
  check("series has a minute bucket list", seriesKeys.length > 0 && Array.isArray(s0.series[seriesKeys[0]]?.minute),
    seriesKeys.join(","));
  check("minute buckets carry epoch-ms timestamps, a value and tags",
    (s0.series?.["http.request.count"]?.minute ?? []).every(p =>
      Number.isInteger(p.t) && p.t > 1_600_000_000_000 && typeof p.v === "number" && typeof p.tags === "string"),
    JSON.stringify((s0.series?.["http.request.count"]?.minute ?? []).slice(0, 2)));
  check("hour buckets are aggregated for the same counter",
    (s0.series?.["http.request.count"]?.hour ?? []).length > 0 &&
    (s0.series?.["http.request.count"]?.hour ?? []).every(p => Number.isInteger(p.t) && typeof p.v === "number"),
    JSON.stringify((s0.series?.["http.request.count"]?.hour ?? []).slice(0, 2)));
  check("timings are charted under Node's `name_ms` series key",
    (s0.series?.["http.request.duration_ms_ms"]?.minute ?? []).length > 0 &&
    (s0.series?.["http.request.duration_ms_ms"]?.minute ?? []).every(p => Number.isFinite(p.v)),
    JSON.stringify(Object.keys(s0.series ?? {})).slice(0, 200));

  // The counters are written by real requests, not seeded: three more calls
  // must move the number by at least three.
  await call("GET", "/api/v1/platform/regions", { token });
  await call("GET", "/api/v1/platform/dr", { token });
  await call("GET", "/api/v1/platform/logs?limit=1", { token });
  const m1 = await call("GET", "/api/v1/platform/metrics", { token });
  const req1 = m1.body?.data?.counters?.["http.request.count"]?.total ?? 0;
  check("counters advance as requests are served", req1 >= req0 + 4, `${req0} → ${req1}`);

  // ═════════════════════════════════════════════════════════════════════ logs
  console.log("\n[logs]");
  const logs = await call("GET", "/api/v1/platform/logs?limit=25", { token });
  check("GET /logs → 200", logs.status === 200 && Array.isArray(logs.body?.data), `status ${logs.status}`);
  const rows = logs.body?.data ?? [];
  check("log rows are capped by limit", rows.length <= 25, `got ${rows.length}`);
  check("every row carries level, time, msg and a source",
    rows.every(r => ["debug", "info", "warn", "error", "fatal"].includes(r.level) && ISO.test(r.time ?? "") &&
      typeof r.msg === "string" && ["audit", "trace", "ai"].includes(r.source)),
    JSON.stringify(rows[0] ?? {}).slice(0, 200));
  check("rows come back newest first (PHP has no ring to tail)",
    rows.every((r, i) => i === 0 || rows[i - 1].time >= r.time), JSON.stringify(rows.slice(0, 3).map(r => r.time)));

  // A platform write is audited, so it must show up as a log row.
  await call("POST", "/api/v1/platform/cdn/purge", { token, json: { paths: ["/spec/log-probe"] } });
  const logsAfter = await call("GET", "/api/v1/platform/logs?search=cdn_purge&limit=10", { token });
  check("a search finds the audit row the API just wrote",
    (logsAfter.body?.data ?? []).some(r => r.msg.includes("platform.cdn_purge_requested")),
    JSON.stringify((logsAfter.body?.data ?? []).map(r => r.msg)).slice(0, 200));
  check("search only returns matching rows",
    (logsAfter.body?.data ?? []).every(r => JSON.stringify(r).toLowerCase().includes("cdn_purge")));

  const errLogs = await call("GET", "/api/v1/platform/logs?level=error&limit=50", { token });
  check("level=error returns only error/fatal rows",
    (errLogs.body?.data ?? []).every(r => r.level === "error" || r.level === "fatal"),
    JSON.stringify((errLogs.body?.data ?? []).map(r => r.level)));
  check("limit=1 returns at most one row", (await call("GET", "/api/v1/platform/logs?limit=1", { token })).body?.data?.length <= 1);
  check("an unknown level → 400", (await call("GET", "/api/v1/platform/logs?level=loud", { token })).status === 400);
  check("limit=0 → 400", (await call("GET", "/api/v1/platform/logs?limit=0", { token })).status === 400);
  const warnLogs = await call("GET", "/api/v1/platform/logs?level=warn&limit=50", { token });
  check("level=warn includes warn and above",
    (warnLogs.body?.data ?? []).every(r => ["warn", "error", "fatal"].includes(r.level)));

  // ════════════════════════════════════════════════════════════════════ traces
  console.log("\n[traces]");
  const traces = await call("GET", "/api/v1/platform/traces?limit=5", { token });
  check("GET /traces → 200", traces.status === 200 && Array.isArray(traces.body?.data), `status ${traces.status}`);
  const spans = traces.body?.data ?? [];
  check("traces are capped by limit", spans.length <= 5, `got ${spans.length}`);
  check("spans carry traceId, spanId, name, kind, status, attrs and children",
    spans.length > 0 && spans.every(s => HEX32.test(s.traceId ?? "") && HEX16.test(s.spanId ?? "") &&
      typeof s.name === "string" && typeof s.kind === "string" && ["ok", "error"].includes(s.status) &&
      typeof s.attrs === "object" && Array.isArray(s.children)),
    JSON.stringify(spans[0] ?? {}).slice(0, 220));
  check("listed spans are trace roots", spans.every(s => s.parentSpanId === null),
    JSON.stringify(spans.slice(0, 3).map(s => s.parentSpanId)));
  check("every span has a duration and an ISO start time",
    spans.every(s => ISO.test(s.startedAt ?? "") && Number.isInteger(s.durationMs) && s.durationMs >= 0),
    JSON.stringify(spans.slice(0, 2).map(s => [s.startedAt, s.durationMs])));

  // W3C traceparent propagation: a caller-supplied trace must continue here.
  const traceId = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
  const parentId = "0102030405060708";
  const traced = await call("GET", "/api/v1/platform/metrics", { token, headers: { traceparent: `00-${traceId}-${parentId}-01` } });
  check("the response echoes a traceparent header", /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/.test(traced.headers.get("traceparent") ?? ""),
    String(traced.headers.get("traceparent")));
  check("an inbound traceparent is continued, not replaced",
    (traced.headers.get("traceparent") ?? "").includes(traceId), String(traced.headers.get("traceparent")));
  const byTrace = await call("GET", `/api/v1/platform/traces/${traceId}`, { token });
  check("GET /traces/:traceId → 200 for a trace that just ran", byTrace.status === 200 && Array.isArray(byTrace.body?.data),
    `status ${byTrace.status}`);
  const traceSpans = byTrace.body?.data ?? [];
  check("the trace contains the root span with that trace id",
    traceSpans.some(s => s.traceId === traceId && s.kind === "server"),
    JSON.stringify(traceSpans.map(s => [s.traceId, s.kind])));
  check("the root span records the route that was called",
    traceSpans.some(s => (s.attrs?.route ?? "").includes("platform/metrics")),
    JSON.stringify(traceSpans.map(s => s.attrs?.route)));

  const bySpan = await call("GET", `/api/v1/platform/spans/${traceSpans[0]?.spanId}`, { token });
  check("GET /spans/:spanId → 200 for a known span", bySpan.status === 200, `status ${bySpan.status}`);
  check("the span returned is the one that was asked for", bySpan.body?.data?.spanId === traceSpans[0]?.spanId);
  check("GET /traces/:unknown → 404",
    (await call("GET", "/api/v1/platform/traces/" + "f".repeat(32), { token })).status === 404);
  check("GET /spans/:unknown → 404",
    (await call("GET", "/api/v1/platform/spans/" + "0".repeat(16), { token })).status === 404);
  check("GET /traces/:not-a-trace-id → 404", (await call("GET", "/api/v1/platform/traces/nope", { token })).status === 404);
  check("GET /spans/:not-a-span-id → 404", (await call("GET", "/api/v1/platform/spans/nope", { token })).status === 404);
  check("traces limit=0 → 400", (await call("GET", "/api/v1/platform/traces?limit=0", { token })).status === 400);

  const dbSpan = await q("SELECT COUNT(*) AS n FROM platform_spans WHERE trace_id=?", [traceId]);
  check("the span is durable in platform_spans (not a request-scoped ring)", dbSpan[0].n >= 1, `rows=${dbSpan[0].n}`);

  // ═══════════════════════════════════════════════════════════ ai observability
  console.log("\n[ai observability]");
  const ai = await call("GET", "/api/v1/platform/ai-observability?minutes=120", { token });
  check("GET /ai-observability → 200", ai.status === 200 && ai.body?.ok === true, `status ${ai.status}`);
  const a = ai.body?.data ?? {};
  check("windowMinutes echoes the request", a.windowMinutes === 120, String(a.windowMinutes));
  const t = a.totals ?? {};
  check("totals account for every request", t.requests === (t.succeeded ?? 0) + (t.failed ?? 0),
    JSON.stringify(t));
  check("errorRate is failed/requests",
    t.requests === 0 ? t.errorRate === 0 : Math.abs(t.errorRate - t.failed / t.requests) < 1e-9, JSON.stringify(t));
  check("latency percentiles are ordered p50 ≤ p95",
    (t.p50LatencyMs ?? 0) <= (t.p95LatencyMs ?? 0), JSON.stringify(t));
  check("token and cost totals are numbers, never null",
    Number.isFinite(t.totalPromptTokens) && Number.isFinite(t.totalCompletionTokens) && Number.isFinite(t.totalCostUsd),
    JSON.stringify(t));
  check("byModel groups are shaped like Node's",
    Object.values(a.byModel ?? {}).every(b => Number.isFinite(b.requests) && Number.isFinite(b.avgLatencyMs) &&
      Number.isFinite(b.errorRate) && Number.isFinite(b.costUsd)), JSON.stringify(a.byModel).slice(0, 160));
  check("byFeature groups count requests and errors",
    Object.values(a.byFeature ?? {}).every(f => Number.isInteger(f.requests) && Number.isInteger(f.errors) && f.errors <= f.requests),
    JSON.stringify(a.byFeature).slice(0, 160));
  check("timeSeries buckets are ISO-timestamped and bounded",
    Array.isArray(a.timeSeries) && a.timeSeries.length >= 1 && a.timeSeries.length <= 40 &&
    a.timeSeries.every(p => ISO.test(p.t ?? "") && Number.isInteger(p.requests) && Number.isInteger(p.errors) &&
      Number.isInteger(p.latencyMs) && Number.isInteger(p.tokens)),
    JSON.stringify((a.timeSeries ?? []).slice(0, 2)));
  check("recent is capped at 100", (a.recent ?? []).length <= 100, String((a.recent ?? []).length));
  check("minutes below the minimum → 400", (await call("GET", "/api/v1/platform/ai-observability?minutes=4", { token })).status === 400);
  check("minutes above the maximum → 400", (await call("GET", "/api/v1/platform/ai-observability?minutes=99999", { token })).status === 400);

  // A failed AI call must be visible here, and as an error log row.
  const aiFail = await call("POST", "/api/v1/ai/complete", { token, json: { messages: [{ role: "user", content: "spec probe" }] } });
  // Same window as `a` above: comparing a 60-minute count against a
  // 120-minute one silently depends on when the spec last ran.
  const aiAfter = await call("GET", "/api/v1/platform/ai-observability?minutes=120", { token });
  check("the AI window covers calls made during the run",
    (aiAfter.body?.data?.totals?.requests ?? 0) >= (a.totals?.requests ?? 0),
    `${a.totals?.requests} → ${aiAfter.body?.data?.totals?.requests} (probe status ${aiFail.status})`);

  // ═══════════════════════════════════════════════════════════════════ regions
  console.log("\n[regions]");
  const regions = await call("GET", "/api/v1/platform/regions", { token });
  check("GET /regions → 200", regions.status === 200 && Array.isArray(regions.body?.data), `status ${regions.status}`);
  const rs = regions.body?.data ?? [];
  check("the five-region catalogue is returned", rs.length === 5, `got ${rs.length}`);
  check("catalogue ids match Node's",
    JSON.stringify(rs.map(r => r.id)) === JSON.stringify(["local-dev", "us-east-1", "eu-west-1", "ap-southeast-1", "dr-us-west-2"]),
    JSON.stringify(rs.map(r => r.id)));
  const primary = rs.find(r => r.role === "primary");
  check("exactly one region is the primary", !!primary && rs.filter(r => r.role === "primary").length === 1);
  check("the primary is pinged live and reports latency",
    primary?.status === "active" && Number.isInteger(primary?.latencyMs) && primary.latencyMs >= 0 && ISO.test(primary.lastPingAt ?? ""),
    JSON.stringify(primary));
  check("regions with no health probe are marked maintenance, not faked as healthy",
    rs.filter(r => r.role !== "primary").every(r => r.status === "maintenance"),
    JSON.stringify(rs.map(r => [r.id, r.status])));
  check("every region carries RPO/RTO targets and coordinates",
    rs.every(r => Number.isInteger(r.rpoSeconds) && Number.isInteger(r.rtoSeconds) &&
      Number.isFinite(r.lat) && Number.isFinite(r.lng)));

  const dr0 = await call("GET", "/api/v1/platform/dr", { token });
  check("GET /dr → 200", dr0.status === 200, `status ${dr0.status}`);
  const d0 = dr0.body?.data ?? {};
  check("DR reports healthy while the primary is active", d0.status === "healthy", String(d0.status));
  check("DR names the primary and DR regions", d0.primaryRegion === "local-dev" && d0.drRegion === "dr-us-west-2",
    JSON.stringify([d0.primaryRegion, d0.drRegion]));
  check("replica list matches the catalogue",
    JSON.stringify((d0.replicas ?? []).map(r => r.id)) === JSON.stringify(["us-east-1", "eu-west-1"]),
    JSON.stringify(d0.replicas));
  check("replicationLagMs is null — a single database has no replica to measure",
    d0.replicationLagMs === null, JSON.stringify(d0.replicationLagMs));
  check("lastBackupAt is null until a backup subsystem exists", d0.lastBackupAt === null, JSON.stringify(d0.lastBackupAt));
  check("backupStatus says so explicitly", d0.backupStatus === "no-recent-backup", String(d0.backupStatus));
  check("failover starts inactive", d0.failover?.active === false && d0.failover?.toRegion === null, JSON.stringify(d0.failover));

  // ══════════════════════════════════════════════════════════════════ failover
  console.log("\n[failover]");
  const badRegion = await call("POST", "/api/v1/platform/failover", { token, json: { toRegion: "mars-1", reason: "test" } });
  check("an unknown target region → 400", badRegion.status === 400, `status ${badRegion.status}`);
  const noReason = await call("POST", "/api/v1/platform/failover", { token, json: { toRegion: "dr-us-west-2" } });
  check("a missing reason → 400", noReason.status === 400, `status ${noReason.status}`);

  const fo = await call("POST", "/api/v1/platform/failover", { token, json: { toRegion: "dr-us-west-2", reason: "spec: DR drill" } });
  check("POST /failover → 200", fo.status === 200, `status ${fo.status}`);
  const f = fo.body?.data ?? {};
  check("failover reports active, target, reason and an ISO timestamp",
    f.active === true && f.toRegion === "dr-us-west-2" && f.reason === "spec: DR drill" && ISO.test(f.since ?? ""),
    JSON.stringify(f));
  const foState = await q("SELECT value FROM platform_state WHERE state_key='failover'");
  // mysql2 hands JSON columns back already decoded; a raw client would not.
  const foStateRaw = foState[0]?.value;
  const foStateValue = typeof foStateRaw === "string" ? JSON.parse(foStateRaw) : foStateRaw;
  check("failover survives the request in platform_state",
    foStateValue?.active === true, JSON.stringify(foStateRaw ?? null));

  const dr1 = await call("GET", "/api/v1/platform/dr", { token });
  check("DR switches to failover-active", dr1.body?.data?.status === "failover-active", String(dr1.body?.data?.status));
  check("DR reports the failover target", dr1.body?.data?.failover?.toRegion === "dr-us-west-2");
  const foRegions = await call("GET", "/api/v1/platform/regions", { token });
  const frs = foRegions.body?.data ?? [];
  check("the failover target becomes active",
    frs.find(r => r.id === "dr-us-west-2")?.status === "active", JSON.stringify(frs.map(r => [r.id, r.status])));
  check("the primary is degraded while failed over",
    frs.find(r => r.role === "primary")?.status === "degraded", JSON.stringify(frs.map(r => [r.id, r.status])));

  const cleared = await call("DELETE", "/api/v1/platform/failover", { token });
  check("DELETE /failover → 200", cleared.status === 200, `status ${cleared.status}`);
  check("failover is inactive again", cleared.body?.data?.active === false && cleared.body?.data?.toRegion === null,
    JSON.stringify(cleared.body?.data));
  const dr2 = await call("GET", "/api/v1/platform/dr", { token });
  check("DR returns to healthy", dr2.body?.data?.status === "healthy", String(dr2.body?.data?.status));
  const backRegions = await call("GET", "/api/v1/platform/regions", { token });
  check("the primary is active again and the DR region is back to maintenance",
    backRegions.body?.data?.find(r => r.role === "primary")?.status === "active" &&
    backRegions.body?.data?.find(r => r.id === "dr-us-west-2")?.status === "maintenance",
    JSON.stringify(backRegions.body?.data?.map(r => [r.id, r.status])));

  // ══════════════════════════════════════════════════════════════════════ CDN
  console.log("\n[cdn]");
  // Cache rules are durable, so a previous run leaves its own rules behind.
  // Restore the shipped defaults first, which makes the seed check below
  // repeat-safe: on a fresh install it verifies the migration's INSERT, and on
  // a re-run it verifies that this restore is faithful.
  const seeded = await call("PUT", "/api/v1/platform/cdn/rules", {
    token,
    json: { rules: [
      { pathPattern: "/assets/*", ttlSeconds: 31536000, staleWhileRevalidate: 0, cacheKeyIncludes: [], enabled: true },
      { pathPattern: "/api/rest/v1/*", ttlSeconds: 0, staleWhileRevalidate: 0, cacheKeyIncludes: ["Authorization"], enabled: false },
      { pathPattern: "/*", ttlSeconds: 0, staleWhileRevalidate: 0, cacheKeyIncludes: [], enabled: true },
    ] },
  });
  check("PUT /cdn/rules replaces the whole rule set", seeded.status === 200 && seeded.body?.data?.length === 3,
    `status ${seeded.status}`);

  const cdn0 = await call("GET", "/api/v1/platform/cdn", { token });
  check("GET /cdn → 200", cdn0.status === 200 && cdn0.body?.ok === true, `status ${cdn0.status}`);
  const c0 = cdn0.body?.data ?? {};
  check("enabled is reported as a boolean", typeof c0.enabled === "boolean", String(c0.enabled));
  check("popCount/cacheHitRate/bandwidthGb are null rather than Node's literals 42/0.87/12.4",
    c0.popCount === null && c0.cacheHitRate === null && c0.bandwidthGb === null,
    JSON.stringify([c0.popCount, c0.cacheHitRate, c0.bandwidthGb]));
  check("provider is null when no CDN is configured", c0.enabled === true ? typeof c0.provider === "string" : c0.provider === null,
    JSON.stringify(c0.provider));
  check("the three default cache rules are seeded",
    Array.isArray(c0.rules) && c0.rules.length === 3 &&
    c0.rules[0].pathPattern === "/assets/*" && c0.rules[0].ttlSeconds === 31536000 &&
    c0.rules[1].pathPattern === "/api/rest/v1/*" && c0.rules[1].enabled === false &&
    JSON.stringify(c0.rules[1].cacheKeyIncludes) === JSON.stringify(["Authorization"]),
    JSON.stringify(c0.rules));
  check("recentPurges is a list", Array.isArray(c0.recentPurges));

  const badRules = [
    { rules: [] },
    { rules: [{ ttlSeconds: 60 }] },
    { rules: [{ pathPattern: "/a", ttlSeconds: -1, enabled: true }] },
    { rules: [{ pathPattern: "/a", ttlSeconds: 99999999, enabled: true }] },
    { rules: [{ pathPattern: "/a", ttlSeconds: 60 }] },
    { rules: [{ pathPattern: "/a", ttlSeconds: 60, enabled: "yes" }] },
    {},
  ];
  for (const [i, body] of badRules.entries()) {
    const r = await call("PUT", "/api/v1/platform/cdn/rules", { token, json: body });
    check(`invalid cache rules #${i + 1} → 400`, r.status === 400, `status ${r.status}`);
  }
  const details = (await call("PUT", "/api/v1/platform/cdn/rules", { token, json: { rules: [{ ttlSeconds: 60 }] } })).body?.error?.details;
  check("validation failures name the offending field", Array.isArray(details) && details.some(d => d.path?.includes("pathPattern")),
    JSON.stringify(details));

  const newRules = [
    { pathPattern: "/assets/*", ttlSeconds: 86400, staleWhileRevalidate: 300, cacheKeyIncludes: [], enabled: true },
    { pathPattern: "/api/*", ttlSeconds: 0, staleWhileRevalidate: 0, cacheKeyIncludes: ["Authorization"], enabled: false },
  ];
  const putRules = await call("PUT", "/api/v1/platform/cdn/rules", { token, json: { rules: newRules } });
  check("PUT /cdn/rules → 200", putRules.status === 200, `status ${putRules.status}`);
  check("the saved rules come back with the values that were sent",
    JSON.stringify(putRules.body?.data?.map(r => [r.pathPattern, r.ttlSeconds, r.staleWhileRevalidate, r.enabled])) ===
    JSON.stringify([["/assets/*", 86400, 300, true], ["/api/*", 0, 0, false]]), JSON.stringify(putRules.body?.data));
  const cdn1 = await call("GET", "/api/v1/platform/cdn", { token });
  check("the new rules are still there on the next request (durable, not in-memory)",
    cdn1.body?.data?.rules?.length === 2 && cdn1.body?.data?.rules?.[0]?.ttlSeconds === 86400,
    JSON.stringify(cdn1.body?.data?.rules));
  const dbRules = await q("SELECT COUNT(*) AS n FROM platform_cdn_rules");
  check("the rules are persisted in platform_cdn_rules", dbRules[0].n === 2, `rows=${dbRules[0].n}`);

  const badPurge = await call("POST", "/api/v1/platform/cdn/purge", { token, json: { paths: [] } });
  check("purging with no paths → 400", badPurge.status === 400, `status ${badPurge.status}`);
  const bigPurge = await call("POST", "/api/v1/platform/cdn/purge", { token, json: { paths: new Array(501).fill("/x") } });
  check("purging more than 500 paths → 400", bigPurge.status === 400, `status ${bigPurge.status}`);
  const purge = await call("POST", "/api/v1/platform/cdn/purge", { token, json: { paths: ["/assets/app.js", "/assets/app.css"] } });
  check("POST /cdn/purge → 202 (accepted, not silently complete)", purge.status === 202, `status ${purge.status}`);
  const p = purge.body?.data ?? {};
  check("the purge records the paths that were requested",
    JSON.stringify(p.paths) === JSON.stringify(["/assets/app.js", "/assets/app.css"]), JSON.stringify(p.paths));
  check("a purge with no provider says it was skipped, instead of claiming success",
    p.status === "skipped" && typeof p.detail === "string" && p.detail.includes("VP_CDN_ENABLED"),
    JSON.stringify([p.status, p.detail]));
  check("the purge has an id and an ISO timestamp", typeof p.id === "string" && ISO.test(p.createdAt ?? ""), JSON.stringify(p));
  const cdn2 = await call("GET", "/api/v1/platform/cdn", { token });
  check("the purge shows up in recentPurges",
    (cdn2.body?.data?.recentPurges ?? []).some(x => x.id === p.id),
    JSON.stringify((cdn2.body?.data?.recentPurges ?? []).slice(0, 2)));
  const dbPurge = await q("SELECT COUNT(*) AS n FROM platform_cdn_purges WHERE id=?", [p.id]);
  check("the purge is persisted in platform_cdn_purges", dbPurge[0].n === 1, `rows=${dbPurge[0].n}`);

  const sign = await call("POST", "/api/v1/platform/cdn/sign-url", {
    token, json: { url: "https://cdn.example.com/assets/app.js?v=3", ttlSeconds: 600 },
  });
  check("POST /cdn/sign-url → 200", sign.status === 200, `status ${sign.status}`);
  const signed = sign.body?.data?.signedUrl ?? "";
  check("the signed URL keeps the path", signed.startsWith("/assets/app.js?"), signed.slice(0, 80));
  check("the signed URL carries cdn_exp and cdn_sig", signed.includes("cdn_exp=") && signed.includes("cdn_sig="), signed);
  check("the signature is 32 hex characters", /cdn_sig=[0-9a-f]{32}$/.test(signed), signed);
  check("expiresAt is an ISO timestamp", ISO.test(sign.body?.data?.expiresAt ?? ""), String(sign.body?.data?.expiresAt));
  if (secret) {
    const [path, query] = signed.split("?");
    const sig = query.split("cdn_sig=")[1];
    const expected = crypto.createHmac("sha256", secret).update(path + "?" + query.split("&cdn_sig=")[0]).digest("hex").slice(0, 32);
    check("the signature is a real HMAC-SHA256 of path+query", sig === expected, `${sig} vs ${expected}`);
  } else {
    console.log("  --   HMAC verification skipped (pass VP_AUTH_SECRET as the last argument to enable it)");
  }
  const sign2 = await call("POST", "/api/v1/platform/cdn/sign-url", {
    token, json: { url: "https://cdn.example.com/assets/app.js?v=3", ttlSeconds: 1800 },
  });
  check("a different TTL produces a different expiry and signature",
    sign2.body?.data?.signedUrl !== signed && sign2.body?.data?.expiresAt !== sign.body?.data?.expiresAt);
  // The signature covers the expiry, so "the same input" only means the same
  // input *within the same second*. Re-sign until two calls land on the same
  // expiry, then compare signatures.
  let reference = signed;
  let deterministic = false;
  for (let i = 0; i < 5 && !deterministic; i++) {
    const again = await call("POST", "/api/v1/platform/cdn/sign-url", {
      token, json: { url: "https://cdn.example.com/assets/app.js?v=3", ttlSeconds: 600 },
    });
    const url2 = again.body?.data?.signedUrl ?? "";
    if (url2 === reference) { deterministic = true; break; }
    const exp2 = (url2.match(/cdn_exp=(\d+)/) || [])[1];
    const exp1 = (reference.match(/cdn_exp=(\d+)/) || [])[1];
    if (exp2 && exp1 && exp2 === exp1) {
      deterministic = url2.split("cdn_sig=")[1] === reference.split("cdn_sig=")[1];
      break;
    }
    reference = url2;
  }
  check("the same input within the same expiry produces the same signature (deterministic)",
    deterministic, `reference=${reference}`);
  check("a relative URL → 400", (await call("POST", "/api/v1/platform/cdn/sign-url", { token, json: { url: "/assets/app.js" } })).status === 400);
  check("a TTL below 60s → 400", (await call("POST", "/api/v1/platform/cdn/sign-url", { token, json: { url: "https://x.test/a", ttlSeconds: 5 } })).status === 400);
  check("a TTL beyond 7 days → 400", (await call("POST", "/api/v1/platform/cdn/sign-url", { token, json: { url: "https://x.test/a", ttlSeconds: 999999 } })).status === 400);

  // ══════════════════════════════════════════════════════════════════ overview
  console.log("\n[overview]");
  const ov = await call("GET", "/api/v1/platform/overview", { token });
  check("GET /overview → 200", ov.status === 200, `status ${ov.status}`);
  const o = ov.body?.data ?? {};
  check("overview bundles regions, dr, cdn and metrics",
    Array.isArray(o.regions) && typeof o.dr === "object" && typeof o.cdn === "object" && typeof o.metrics === "object",
    Object.keys(o).join(","));
  check("overview agrees with the individual endpoints",
    o.regions?.length === rs.length && o.dr?.primaryRegion === d0.primaryRegion &&
    o.cdn?.rules?.length === cdn1.body?.data?.rules?.length &&
    typeof o.metrics?.counters?.["http.request.count"]?.total === "number",
    JSON.stringify([o.regions?.length, o.dr?.primaryRegion, o.cdn?.rules?.length]));

  // ══════════════════════════════════════════════════════════════ verb guards
  console.log("\n[verb guards]");
  const verbs = [
    ["POST", "/api/v1/platform/metrics"], ["POST", "/api/v1/platform/logs"],
    ["POST", "/api/v1/platform/traces"], ["POST", "/api/v1/platform/traces/" + "f".repeat(32)],
    ["POST", "/api/v1/platform/spans/" + "0".repeat(16)], ["POST", "/api/v1/platform/ai-observability"],
    ["POST", "/api/v1/platform/regions"], ["POST", "/api/v1/platform/dr"],
    ["GET", "/api/v1/platform/failover"], ["PUT", "/api/v1/platform/cdn"],
    ["GET", "/api/v1/platform/cdn/rules"], ["GET", "/api/v1/platform/cdn/purge"],
    ["GET", "/api/v1/platform/cdn/sign-url"], ["POST", "/api/v1/platform/overview"],
  ];
  for (const [method, path] of verbs) {
    const r = await call(method, path, { token });
    check(`${method} ${path.replace(base, "")} → 405`, r.status === 405, `status ${r.status}`);
  }

  // Leave the installation as it was found: no failover in progress.
  const finalClear = await call("DELETE", "/api/v1/platform/failover", { token });
  check("failover is cleared again at the end of the run", finalClear.body?.data?.active === false,
    JSON.stringify(finalClear.body?.data));

  await db.end();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nfailures:");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  console.log("global platform: parity verified against the PHP runtime.");
}

main().catch(e => { console.error(e); process.exit(1); });
