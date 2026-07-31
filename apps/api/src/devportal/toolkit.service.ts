/**
 * ToolkitService - Slices 234-235: Testing SDK + Deployment Toolkit.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { DeploymentKitRun, TestSuiteRun } from "@windels/shared";

const TEST_RUNS_KEY = "dev:test-runs";
const DEPLOY_RUNS_KEY = "dev:deploy-runs";
const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }
function rand(min:number,max:number){return Math.floor(min+Math.random()*(max-min+1));}

export const ToolkitService = {
  /**
   * Record a test-suite run.
   *
   * This previously invented the entire result — 20-80 cases, a 10% chance of
   * 1-5 failures, a random 8-45s duration and 65-95% coverage — without
   * executing anything, then persisted it as a real run. Results must now be
   * supplied by whatever actually ran the suite; with nothing supplied the run
   * is recorded as `pending` with zeroed counters rather than a fake pass.
   */
  async runTests(
    suite: string,
    target: string,
    result?: { passed: number; failed: number; skipped?: number; durationMs?: number; coveragePct?: number },
  ): Promise<TestSuiteRun> {
    const id = randomUUID();
    const start = iso();
    const startMs = Date.now();
    const passed = result?.passed ?? 0;
    const failed = result?.failed ?? 0;
    const skipped = result?.skipped ?? 0;
    const duration = result?.durationMs ?? 0;
    const run: TestSuiteRun = {
      id, name: suite, target,
      status: !result ? "queued" : failed > 0 ? "failed" : "passed",
      durationMs: duration,
      passed, failed, skipped,
      coveragePct: result?.coveragePct,
      startedAt: start,
      finishedAt: new Date(startMs + duration).toISOString(),
    };
    await redis.lpush(TEST_RUNS_KEY, SER(run));
    await redis.ltrim(TEST_RUNS_KEY, 0, 49);
    return run;
  },
  async recentTestRuns(limit = 10): Promise<TestSuiteRun[]> {
    const raw = await redis.lrange(TEST_RUNS_KEY, 0, limit - 1);
    return raw.map(s => JSON.parse(s) as TestSuiteRun);
  },
  /**
   * Record a deployment-kit run.
   *
   * Previously fabricated the outcome (`ok = Math.random() > 0.05`) plus a
   * random 15-120s duration, and synthesised a plausible log transcript
   * ("running tests: passed", "healthy: svc on prod") for a deploy that never
   * happened. The caller now supplies the real result.
   */
  async deploy(
    target: "dev"|"staging"|"canary"|"production",
    service: string,
    version: string,
    result?: { ok: boolean; durationMs?: number; logs?: string[]; url?: string },
  ): Promise<DeploymentKitRun> {
    const id = randomUUID();
    const start = iso();
    const startMs = Date.now();
    const duration = result?.durationMs ?? 0;
    const run: DeploymentKitRun = {
      id, target, service, version,
      status: !result ? "queued" : result.ok ? "passed" : "failed",
      durationMs: duration,
      url: result?.url,
      // Logs come from the real deploy; nothing is invented.
      logs: result?.logs ?? [],
      startedAt: start,
      finishedAt: new Date(startMs + duration).toISOString(),
    };
    await redis.lpush(DEPLOY_RUNS_KEY, SER(run));
    await redis.ltrim(DEPLOY_RUNS_KEY, 0, 49);
    return run;
  },
  async recentDeploys(limit = 10): Promise<DeploymentKitRun[]> {
    const raw = await redis.lrange(DEPLOY_RUNS_KEY, 0, limit - 1);
    return raw.map(s => JSON.parse(s) as DeploymentKitRun);
  },
};
