/**
 * ApiTestService — Slice 186.
 *
 * Runs HTTP assertions against live endpoints (internal or external) using
 * node's built-in fetch. Validates status codes, JSON body via simple
 * dot-path matching, required response headers, and max latency.
 */
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { assertion } from "./testRunner.service.js";
import type { TestCase, TestCaseResult, ApiTestCaseConfig } from "@windels/shared/qa";

function getByPath(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

export async function runApiTest(c: TestCase): Promise<TestCaseResult> {
  const cfg = c.config as unknown as ApiTestCaseConfig;
  const t0 = performance.now();
  const res: TestCaseResult = { caseId: c.id, caseName: c.name, status: "running", durationMs:0, startedAt: new Date().toISOString(), assertions: [], logs: [], metrics: {} };
  try {
    const isApi = !cfg.url.startsWith("http") && cfg.url.startsWith("/");
    const base = `http://127.0.0.1:${env.API_PORT}`;
    const prefix = cfg.url.startsWith("/api/") || cfg.url.startsWith("/healthz") ? "" : (isApi ? "/api/v1" : "");
    const url = cfg.url.startsWith("http") ? cfg.url : `${base}${prefix}${cfg.url}`;
    const headers: Record<string,string> = { "Content-Type": "application/json", ...(cfg.headers ?? {}) };
    if (cfg.auth === "admin") headers.Authorization = `Bearer ${(await bootstrapAdminToken())}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(c.timeoutMs, cfg.expected.maxLatencyMs ?? c.timeoutMs) + 500);
    let fetchRes: Response;
    try {
      fetchRes = await fetch(url, { method: cfg.method, headers, body: cfg.body ? JSON.stringify(cfg.body) : undefined, signal: controller.signal, redirect: "manual" });
    } finally { clearTimeout(timer); }
    const bodyText = await fetchRes.text();
    let bodyJson: any = undefined; try { bodyJson = JSON.parse(bodyText); } catch { /* not json */ }
    const latency = performance.now() - t0;

    const expectedStatus = cfg.expected.status ?? 200;
    const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    res.assertions.push(assertion("status", `status in [${statuses.join(",")}]`, statuses.includes(fetchRes.status), { expected: statuses, actual: fetchRes.status, message: `got ${fetchRes.status}` }));

    if (cfg.expected.schemaEnvelope !== false && bodyJson) {
      const okField = typeof bodyJson.ok === "boolean";
      res.assertions.push(assertion("envelope", "response is {ok,data} envelope", okField, { actual: okField ? "ok present" : `missing ok (keys=${Object.keys(bodyJson||{}).join(",")})` }));
    }

    for (const m of (cfg.expected.bodyMatches ?? [])) {
      const val = getByPath(bodyJson, m.path);
      if ("equals" in m && m.equals !== undefined) {
        res.assertions.push(assertion(`body:${m.path}`, `${m.path} equals ${JSON.stringify(m.equals)}`, JSON.stringify(val) === JSON.stringify(m.equals), { expected: m.equals, actual: val }));
      }
      if (m.contains) {
        const hay = typeof val === "string" ? val : JSON.stringify(val ?? "");
        res.assertions.push(assertion(`body:${m.path}:contains`, `${m.path} contains "${m.contains}"`, hay.includes(m.contains), { actual: val }));
      }
      if (m.type) {
        const ok = m.type === "array" ? Array.isArray(val) : typeof val === m.type;
        res.assertions.push(assertion(`body:${m.path}:type`, `${m.path} is ${m.type}`, ok, { actual: typeof val }));
      }
      if (m.regex) {
        const re = new RegExp(m.regex); const hay = typeof val === "string" ? val : JSON.stringify(val ?? "");
        res.assertions.push(assertion(`body:${m.path}:regex`, `${m.path} matches ${m.regex}`, re.test(hay), { actual: val }));
      }
    }

    for (const h of (cfg.expected.headersPresent ?? [])) {
      res.assertions.push(assertion(`header:${h}`, `header ${h} present`, fetchRes.headers.has(h), { actual: fetchRes.headers.get(h) }));
    }

    if (cfg.expected.maxLatencyMs) {
      res.assertions.push(assertion("latency", `latency ≤ ${cfg.expected.maxLatencyMs}ms`, latency <= cfg.expected.maxLatencyMs, { actual: Math.round(latency), expected: cfg.expected.maxLatencyMs }));
    }
    res.metrics.latencyMs = Math.round(latency);
    res.metrics.status = fetchRes.status;
    res.finishedAt = new Date().toISOString();
    res.durationMs = Math.round(performance.now()-t0);
    res.status = res.assertions.every(a=>a.passed) ? "passed" : "failed";
    res.logs.push(`${cfg.method} ${url} → ${fetchRes.status} in ${Math.round(latency)}ms`);
  } catch (err:any) {
    res.status = "error"; res.error = { code: err.code ?? "API_TEST_ERROR", message: err.message };
    res.finishedAt = new Date().toISOString(); res.durationMs = Math.round(performance.now()-t0);
  }
  return res;
}

// Lazy-load an admin token (used only when auth==="admin").
let _adminToken: string | null = null;
async function bootstrapAdminToken(): Promise<string> {
  if (_adminToken) return _adminToken;
  try {
    const res = await fetch(`http://127.0.0.1:${env.API_PORT}/api/v1/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
    });
    const j = await res.json() as any; _adminToken = j.data?.token;
    return _adminToken ?? "";
  } catch { return ""; }
}

export function newApiCase(suiteId: string, name: string, cfg: ApiTestCaseConfig, opts: Partial<TestCase> = {}): Omit<TestCase,"id"|"createdAt"|"updatedAt"> {
  return {
    suiteId, name, kind: "api", severity: opts.severity ?? "high", config: cfg as any,
    tags: opts.tags ?? ["api","smoke"], selectors: opts.selectors ?? ["smoke"],
    timeoutMs: opts.timeoutMs ?? 8000, enabled: true, description: opts.description,
  };
}
