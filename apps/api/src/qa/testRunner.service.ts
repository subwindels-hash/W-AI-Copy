/**
 * TestRunnerService — Slice 185 (Testing Framework).
 *
 * Registry of test suites + cases, dispatcher to run them via kind-specific
 * runners (api/ai/workflow/security/chaos/dr/digital-twin), in-memory+Redis
 * persistence of runs, and a simple scheduler for recurring suites.
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../db/redis.js";
import { logger } from "../observability/logger.js";
import { Metrics } from "../observability/metrics.js";
import type {
  TestCase, TestSuite, TestRun, TestCaseResult, TestAssertion,
  TestStatus, TestKind,
} from "@windels/shared/qa";

const SUITES_KEY = "qa:suites";
const SUITE_PREFIX = "qa:suite:";
const CASES_KEY = "qa:cases";
const CASE_PREFIX = "qa:case:";
const RUNS_KEY = "qa:runs";
const RUN_PREFIX = "qa:run:";
const MAX_RUNS = 200;
let runners: Partial<Record<TestKind, (c: TestCase) => Promise<TestCaseResult>>> = {};
let schedTimer: NodeJS.Timeout | null = null;
let seeded = false;
function now(){return new Date().toISOString();}

export const TestRunnerService = {
  registerRunner(kind: TestKind, fn: (c: TestCase) => Promise<TestCaseResult>) {
    runners[kind] = fn;
  },

  // ── Suite CRUD ────────────────────────────────────────────────────
  async createSuite(input: Omit<TestSuite,"id"|"caseIds"|"createdAt"|"updatedAt"|"lastRunId">): Promise<TestSuite> {
    const s: TestSuite = { ...input, id: randomUUID(), caseIds: [], createdAt: now(), updatedAt: now() };
    await redisCmd.set(SUITE_PREFIX+s.id, JSON.stringify(s));
    await redisCmd.sadd(SUITES_KEY, s.id);
    return s;
  },
  async listSuites(): Promise<TestSuite[]> {
    const ids = await redisCmd.smembers(SUITES_KEY);
    const out: TestSuite[] = [];
    for (const id of ids) { const r = await redisCmd.get(SUITE_PREFIX+id); if (r) out.push(JSON.parse(r)); }
    return out.sort((a,b)=>a.name.localeCompare(b.name));
  },
  async getSuite(id: string): Promise<TestSuite|null> {
    const r = await redisCmd.get(SUITE_PREFIX+id); return r?JSON.parse(r):null;
  },
  async deleteSuite(id: string): Promise<boolean> {
    const s = await this.getSuite(id); if (!s) return false;
    for (const cid of s.caseIds) { await redisCmd.del(CASE_PREFIX+cid); await redisCmd.srem(CASES_KEY, cid); }
    await redisCmd.del(SUITE_PREFIX+id); await redisCmd.srem(SUITES_KEY, id);
    return true;
  },

  // ── Case CRUD ─────────────────────────────────────────────────────
  async createCase(input: Omit<TestCase,"id"|"createdAt"|"updatedAt">): Promise<TestCase> {
    const c: TestCase = { ...input, id: randomUUID(), createdAt: now(), updatedAt: now() };
    await redisCmd.set(CASE_PREFIX+c.id, JSON.stringify(c));
    await redisCmd.sadd(CASES_KEY, c.id);
    const s = await this.getSuite(c.suiteId);
    if (s) { s.caseIds.push(c.id); s.updatedAt = now(); await redisCmd.set(SUITE_PREFIX+s.id, JSON.stringify(s)); }
    return c;
  },
  async listCases(filter?: { suiteId?: string; kind?: TestKind; tag?: string; selector?: string }): Promise<TestCase[]> {
    const ids = await redisCmd.smembers(CASES_KEY);
    const out: TestCase[] = [];
    for (const id of ids) { const r = await redisCmd.get(CASE_PREFIX+id); if (!r) continue;
      const c = JSON.parse(r) as TestCase; if (!c.enabled) continue;
      if (filter?.suiteId && c.suiteId !== filter.suiteId) continue;
      if (filter?.kind && c.kind !== filter.kind) continue;
      if (filter?.tag && !c.tags.includes(filter.tag)) continue;
      if (filter?.selector && !c.selectors.includes(filter.selector)) continue;
      out.push(c);
    }
    return out;
  },
  async getCase(id: string): Promise<TestCase|null> { const r=await redisCmd.get(CASE_PREFIX+id); return r?JSON.parse(r):null; },
  async deleteCase(id: string): Promise<boolean> {
    const c = await this.getCase(id); if (!c) return false;
    await redisCmd.del(CASE_PREFIX+id); await redisCmd.srem(CASES_KEY, id);
    const s = await this.getSuite(c.suiteId);
    if (s) { s.caseIds = s.caseIds.filter((x)=>x!==id); await redisCmd.set(SUITE_PREFIX+s.id, JSON.stringify(s)); }
    return true;
  },

  // ── Execution ─────────────────────────────────────────────────────
  async runSuite(suiteId: string, opts: { triggeredBy?: TestRun["triggeredBy"]; actorId?: string; selector?: string } = {}): Promise<TestRun> {
    const suite = await this.getSuite(suiteId); if (!suite) throw new Error("suite not found");
    const cases = (await this.listCases({ suiteId, selector: opts.selector }));
    const run: TestRun = {
      id: randomUUID(), suiteId, suiteName: suite.name, kind: suite.kind,
      triggeredBy: opts.triggeredBy ?? "manual", actorId: opts.actorId,
      status: "running", startedAt: now(), passed:0, failed:0, skipped:0, total: cases.length,
      passRate: 0, environment: "dev", results: [],
    };
    await redisCmd.set(RUN_PREFIX+run.id, JSON.stringify(run));
    await redisCmd.lpush(RUNS_KEY, run.id); await redisCmd.ltrim(RUNS_KEY, 0, MAX_RUNS - 1);
    suite.lastRunId = run.id; await redisCmd.set(SUITE_PREFIX+suite.id, JSON.stringify(suite));

    for (const c of cases) {
      const r = await this.runCaseInternal(c);
      run.results.push(r);
      if (r.status === "passed") run.passed++; else if (r.status === "failed") run.failed++; else if (r.status === "skipped") run.skipped++;
      await redisCmd.set(RUN_PREFIX+run.id, JSON.stringify(run));
    }
    run.finishedAt = now();
    run.durationMs = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
    run.status = run.failed > 0 ? "failed" : run.passed > 0 ? "passed" : "skipped";
    run.passRate = run.total > 0 ? run.passed / run.total : 0;
    run.summary = `${run.passed}/${run.total} passed in ${run.durationMs}ms`;
    await redisCmd.set(RUN_PREFIX+run.id, JSON.stringify(run));
    Metrics.gauge("qa.pass_rate", run.passRate, { suite: suite.name });
    Metrics.increment("qa.runs_completed", 1, { status: run.status, suite: suite.name });
    logger.info("qa suite run completed", { suite: suite.name, passed: run.passed, failed: run.failed, durationMs: run.durationMs });
    return run;
  },

  async runCase(caseId: string, opts: { triggeredBy?: TestRun["triggeredBy"] } = {}): Promise<TestCaseResult> {
    const c = await this.getCase(caseId); if (!c) throw new Error("case not found");
    const res = await this.runCaseInternal(c);
    Metrics.increment("qa.case_completed", 1, { kind: c.kind, status: res.status });
    return res;
  },

  async runCaseInternal(c: TestCase): Promise<TestCaseResult> {
    const startedAt = now(); const t0 = Date.now();
    const res: TestCaseResult = { caseId: c.id, caseName: c.name, status: "running", durationMs: 0, startedAt, assertions: [], logs: [], metrics: {} };
    const runner = runners[c.kind];
    if (!runner) { res.status = "skipped"; res.error = { code:"NO_RUNNER", message:`no runner for kind ${c.kind}` }; res.finishedAt = now(); res.durationMs = Date.now()-t0; return res; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(`timeout after ${c.timeoutMs}ms`), c.timeoutMs);
    try {
      const out = await runner(c);
      Object.assign(res, out);
      if (!res.finishedAt) res.finishedAt = now();
      res.durationMs = Date.now()-t0;
      if (res.status === "running") res.status = res.assertions.every((a)=>a.passed) ? "passed" : "failed";
    } catch (err: any) {
      res.status = "error"; res.error = { code: err.code ?? "RUNNER_ERROR", message: err.message, stack: err.stack };
      res.finishedAt = now(); res.durationMs = Date.now()-t0;
    } finally { clearTimeout(timer); }
    return res;
  },

  async recentRuns(limit = 30): Promise<TestRun[]> {
    const ids = await redisCmd.lrange(RUNS_KEY, 0, limit-1);
    const out: TestRun[] = [];
    for (const id of ids) { const r = await redisCmd.get(RUN_PREFIX+id); if (r) out.push(JSON.parse(r)); }
    return out;
  },
  async getRun(id: string): Promise<TestRun|null> { const r=await redisCmd.get(RUN_PREFIX+id); return r?JSON.parse(r):null; },

  async dashboard(): Promise<{ totalSuites:number; totalCases:number; recentRuns:TestRun[]; passRate7d:number; openFailures:number; coverage: {api:number;workflow:number;security:number;ai:number}; }> {
    const suites = await this.listSuites(); const cases = await this.listCases();
    const runs = await this.recentRuns(50);
    const cutoff = Date.now() - 7*24*3600*1000;
    const week = runs.filter((r)=>new Date(r.startedAt).getTime() > cutoff);
    const passRate7d = week.length ? week.reduce((s,r)=>s+r.passRate,0)/week.length : 1;
    const openFailures = runs.filter((r)=>r.status==="failed").length;
    const coverage = {
      api: cases.filter(c=>c.kind==="api").length,
      workflow: cases.filter(c=>c.kind==="workflow").length,
      security: cases.filter(c=>c.kind==="security").length,
      ai: cases.filter(c=>c.kind==="ai-validation").length,
    };
    return { totalSuites:suites.length, totalCases:cases.length, recentRuns:runs.slice(0,10), passRate7d, openFailures, coverage };
  },

  // ── Scheduler ─────────────────────────────────────────────────────
  startScheduler() {
    if (schedTimer) return;
    schedTimer = setInterval(() => { void this.tick(); }, 60_000);
    logger.info("qa scheduler started", { intervalMs: 60_000 });
  },
  async tick() {
    const suites = await this.listSuites();
    for (const s of suites) {
      if (!s.schedule || s.schedule.preset === "manual") continue;
      const last = s.lastRunId ? await this.getRun(s.lastRunId) : null;
      const intervalMs = s.schedule.intervalMs ?? (s.schedule.preset === "hourly" ? 3600_000 : s.schedule.preset === "daily" ? 86_400_000 : 7*86_400_000);
      const lastAt = last ? new Date(last.startedAt).getTime() : 0;
      if (Date.now() - lastAt >= intervalMs) {
        try { await this.runSuite(s.id, { triggeredBy: "schedule" }); }
        catch (e) { logger.warn("scheduled qa run failed", { suite: s.name, error: (e as Error).message }); }
      }
    }
  },
};

// Small helper for runners to build assertions easily.
export function assertion(id: string, label: string, passed: boolean, extra: Partial<TestAssertion> = {}): TestAssertion {
  return { id, label, passed, ...extra };
}
