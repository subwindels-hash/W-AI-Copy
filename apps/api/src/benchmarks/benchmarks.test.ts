/**
 * Session 50 — Enterprise AI Benchmark Center.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * This module used to invent its own results: `runBenchmark` generated random
 * scores and then reported them as measurements. The 2026-07-31 pass rewrote it
 * as a **result registry** — a caller must supply the score, the pass/fail
 * verdict, the evaluator, and the evidence, and the service only records what
 * it was given.
 *
 * That is precisely the kind of guarantee that decays silently. Nothing in the
 * code stops a future edit from reintroducing "if no score was supplied,
 * compute one", and the module inventory reported `tests=0`, so no test would
 * have noticed. These cases pin the honesty properties:
 *
 *   - a fresh organization reports an EMPTY centre, not seeded runs
 *   - the recorded score/verdict are exactly what the caller passed
 *   - the evaluator and evidence are retained (provenance, not just a number)
 *   - dashboard aggregates are derived from recorded runs only
 *
 * Redis is substituted with the repo's FakeKv, so no infrastructure is needed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
// The kernel bus is a side channel here; keep it inert and observable.
const emitted: Array<{ topic: string; payload: any }> = [];
vi.mock("../kernel/kernel.service.js", () => ({
  emitKernel: (topic: string, payload: any) => { emitted.push({ topic, payload }); },
  KernelService: { emit: (topic: string, payload: any) => { emitted.push({ topic, payload }); } },
}));

const { BenchmarksService } = await import("./benchmarks.service.js");

const ORG = "org-test";

const metric = (value: number) => ([{
  key: "accuracy", label: "Accuracy", value, unit: "%", higherIsBetter: true,
}]);

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  emitted.length = 0;
});

describe("a fresh organization invents nothing", () => {
  it("bootstraps with zero runs", async () => {
    await BenchmarksService.ensureBootstrapped(undefined, ORG);
    const runs = await BenchmarksService.listRuns(ORG);
    expect(runs).toEqual([]);
  });

  it("reports an empty dashboard rather than fabricated scores", async () => {
    await BenchmarksService.ensureBootstrapped(undefined, ORG);
    const d = await BenchmarksService.dashboard(ORG);

    expect(d.totalRuns).toBe(0);
    expect(d.completed24h).toBe(0);
    expect(d.avgScore).toBe(0);
    expect(d.passRate).toBe(0);
    expect(d.leaderboard).toEqual([]);
    expect(d.recentRuns).toEqual([]);
    // Every area starts at zero — not a plausible-looking random baseline.
    for (const score of Object.values(d.areaScores)) expect(score).toBe(0);
  });

  it("is idempotent — re-bootstrapping does not accumulate state", async () => {
    await BenchmarksService.ensureBootstrapped(undefined, ORG);
    await BenchmarksService.ensureBootstrapped(undefined, ORG);
    expect((await BenchmarksService.dashboard(ORG)).totalRuns).toBe(0);
  });
});

describe("runBenchmark records, and does not grade", () => {
  it("stores exactly the score and verdict the caller supplied", async () => {
    const run = await BenchmarksService.runBenchmark({
      area: "latency",
      targetName: "gpt-4o",
      metrics: metric(42),
      overallScore: 42,
      passed: false,          // deliberately a failing verdict with a mid score
      evaluator: "nightly-harness",
      evidence: "s3://reports/run-1.json",
      organizationId: ORG,
    });

    expect(run.overallScore).toBe(42);
    expect(run.passed).toBe(false);
    expect(run.metrics).toEqual(metric(42));
  });

  it("honours a passing verdict even when the score is low", async () => {
    // The service must not second-guess the evaluator by recomputing `passed`
    // from `overallScore` — the evaluator owns the criteria.
    const run = await BenchmarksService.runBenchmark({
      area: "cost_efficiency", metrics: metric(10), overallScore: 10, passed: true,
      evaluator: "cost-model-v2", evidence: "ticket-4412", organizationId: ORG,
    });
    expect(run.passed).toBe(true);
    expect(run.overallScore).toBe(10);
  });

  it("retains evaluator and evidence as provenance", async () => {
    const run = await BenchmarksService.runBenchmark({
      area: "safety_metrics", metrics: metric(91), overallScore: 91, passed: true,
      evaluator: "red-team-2026-07", evidence: "https://wiki/redteam/july", organizationId: ORG,
    });

    expect(run.metadata.evaluator).toBe("red-team-2026-07");
    expect(run.metadata.evidence).toBe("https://wiki/redteam/july");
    // Flagged as imported, i.e. measured elsewhere and recorded here.
    expect(run.metadata.imported).toBe(true);
  });

  it("falls back to a readable target name without inventing a target", async () => {
    const run = await BenchmarksService.runBenchmark({
      area: "coding_performance", metrics: metric(70), overallScore: 70, passed: true,
      evaluator: "e", evidence: "e", organizationId: ORG,
    });
    expect(run.targetName).toBe("coding performance");
    expect(run.targetId).toBeUndefined();
  });
});

describe("dashboard aggregates only what was recorded", () => {
  async function record(score: number, passed: boolean, area: any = "latency") {
    return BenchmarksService.runBenchmark({
      area, metrics: metric(score), overallScore: score, passed,
      evaluator: "harness", evidence: "log", organizationId: ORG,
    });
  }

  it("computes pass rate and average from real runs", async () => {
    await record(90, true);
    await record(70, false);
    await record(80, true, "reliability");

    const d = await BenchmarksService.dashboard(ORG);
    expect(d.totalRuns).toBe(3);
    expect(d.avgScore).toBe(80);              // (90+70+80)/3
    expect(d.passRate).toBeCloseTo(2 / 3, 5); // 2 of 3 passed
  });

  it("keeps organizations isolated", async () => {
    await record(90, true);
    const other = await BenchmarksService.dashboard("org-someone-else");
    expect(other.totalRuns).toBe(0);
    expect(other.avgScore).toBe(0);
  });

  it("ranks the leaderboard by recorded score", async () => {
    await record(55, false, "latency");
    await record(95, true, "reliability");
    const d = await BenchmarksService.dashboard(ORG);
    expect(d.leaderboard[0]!.overallScore).toBe(95);
  });
});

describe("underperformance signalling", () => {
  it("flags a run below the threshold for follow-up", async () => {
    await BenchmarksService.runBenchmark({
      area: "latency", metrics: metric(50), overallScore: 50, passed: false,
      evaluator: "harness", evidence: "log", organizationId: ORG,
    });
    const d = await BenchmarksService.dashboard(ORG);
    expect(d.feedbackToModelFactory.pendingRecommendations).toBe(1);
    expect(d.feedbackToModelFactory.optimizedModels).toBe(0);
  });

  it("counts a strong run as optimized instead", async () => {
    await BenchmarksService.runBenchmark({
      area: "latency", metrics: metric(95), overallScore: 95, passed: true,
      evaluator: "harness", evidence: "log", organizationId: ORG,
    });
    const d = await BenchmarksService.dashboard(ORG);
    expect(d.feedbackToModelFactory.optimizedModels).toBe(1);
    expect(d.feedbackToModelFactory.pendingRecommendations).toBe(0);
  });
});

describe("scheduling", () => {
  it("stores a schedule without executing anything", async () => {
    const s = await BenchmarksService.schedule({
      area: "ai_models", cron: "0 3 * * *", enabled: true, organizationId: ORG,
    });
    expect(s.cron).toBe("0 3 * * *");
    expect(s.enabled).toBe(true);
    // Scheduling must not manufacture a run.
    expect((await BenchmarksService.listRuns(ORG)).length).toBe(0);
  });
});
