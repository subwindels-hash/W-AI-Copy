/**
 * ToolkitService - Slices 234-235: Testing SDK + Deployment Toolkit.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { DeploymentKitRun, TestSuiteRun } from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable per (module, seed) so dashboard
// reads return the same numbers within a running process.
const _rng = makeRng('devportal');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const TEST_RUNS_KEY = "dev:test-runs";
const DEPLOY_RUNS_KEY = "dev:deploy-runs";
const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }
export const ToolkitService = {
  async runTests(suite: string, target: string): Promise<TestSuiteRun> {
    _rng.reseed(`runTests:${suite}`);
    const id = randomUUID();
    const start = iso();
    const startMs = Date.now();
    // Simulate test run
    const total = rand(20, 80);
    const failed = _rng.next() < 0.1 ? rand(1, 5) : 0;
    const skipped = rand(0, 3);
    const passed = total - failed - skipped;
    const duration = rand(8000, 45_000);
    await new Promise(r => setTimeout(r, Math.min(600, duration/20)));
    const run: TestSuiteRun = {
      id, name: suite, target,
      status: failed > 0 ? "failed" : "passed",
      durationMs: duration,
      passed, failed, skipped,
      coveragePct: Math.round((65 + _rng.next() * 30) * 10) / 10,
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
  async deploy(target: "dev"|"staging"|"canary"|"production", service: string, version: string): Promise<DeploymentKitRun> {
    _rng.reseed(`deploy:${target}`);
    const id = randomUUID();
    const start = iso();
    const startMs = Date.now();
    const duration = rand(15_000, 120_000);
    await new Promise(r => setTimeout(r, Math.min(700, duration/20)));
    const ok = _rng.next() > 0.05;
    const run: DeploymentKitRun = {
      id, target, service, version,
      status: ok ? "passed" : "failed",
      durationMs: duration,
      url: ok ? `https://${service}.${target === "production" ? "windels.ai" : target + ".windels.ai"}` : undefined,
      logs: [
        `[${iso()}] building ${service}@${version}`,
        `[${iso()}] running tests: ${ok ? "passed" : "failed"}`,
        ok ? `[${iso()}] deploying to ${target}` : `[${iso()}] deploy failed, rolling back`,
        ok ? `[${iso()}] healthy: ${service} on ${target}` : undefined,
      ].filter(Boolean) as string[],
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
