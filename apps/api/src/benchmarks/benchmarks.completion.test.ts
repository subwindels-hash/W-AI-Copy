/**
 * Session 180 — benchmarks completion (Tier 2 #15)
 * Ungated 0/0 metrics + default tenant.
 * Runs via FakeKv.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { BenchmarksService } = await import("./benchmarks.service.js");

const ORG = "org-bm-comp";
const OTHER = "org-bm-other";

function resetAll() {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
}

beforeEach(() => resetAll());

describe("benchmarks completion — Q1 ungated 0/0 metrics", () => {
  it("dashboard on empty org creates no bm:* keys and returns honest 0s via fallback (fails if ensureBootstrapped had been called on read)", async () => {
    const d = await BenchmarksService.dashboard(ORG);
    expect(d.totalRuns).toBe(0);
    expect(d.feedbackToModelFactory.optimizedModels).toBe(0);
    expect(d.feedbackToModelFactory.pendingRecommendations).toBe(0);
    expect(d.leaderboard).toEqual([]);
    expect(d.recentRuns).toEqual([]);
    // Pure read must not have created bm:m via ensureBootstrapped
    expect(await kv.exists(`bm:m:${ORG}`)).toBe(0);
    expect((await kv.keys(`bm:*`)).length).toBe(0);
  });

  it("ensureBootstrapped is idempotent and isolated", async () => {
    await BenchmarksService.ensureBootstrapped(undefined, ORG);
    expect(await kv.exists(`bm:m:${ORG}`)).toBe(1);
    const keysBefore = await kv.keys(`bm:*`);
    await BenchmarksService.ensureBootstrapped(undefined, ORG);
    const keysAfter = await kv.keys(`bm:*`);
    expect(keysAfter.length).toBe(keysBefore.length);
    expect(await kv.exists(`bm:m:${OTHER}`)).toBe(0);
  });

  it("runBenchmark increments correct metric bucket based on overallScore threshold", async () => {
    await BenchmarksService.runBenchmark({
      area: "latency" as any,
      overallScore: 85,
      passed: true,
      evaluator: "harness",
      evidence: "ticket-1",
      metrics: [{ key: "p95", label: "p95", value: 120, unit: "ms", higherIsBetter: false }],
      organizationId: ORG,
    });
    let d = await BenchmarksService.dashboard(ORG);
    expect(d.feedbackToModelFactory.optimizedModels).toBe(1);
    expect(d.feedbackToModelFactory.pendingRecommendations).toBe(0);
    expect(d.totalRuns).toBe(1);

    await BenchmarksService.runBenchmark({
      area: "latency" as any,
      overallScore: 60,
      passed: false,
      evaluator: "harness",
      evidence: "ticket-2",
      metrics: [{ key: "p95", label: "p95", value: 200, unit: "ms", higherIsBetter: false }],
      organizationId: ORG,
    });
    d = await BenchmarksService.dashboard(ORG);
    expect(d.feedbackToModelFactory.optimizedModels).toBe(1);
    expect(d.feedbackToModelFactory.pendingRecommendations).toBe(1);
    expect(d.totalRuns).toBe(2);
  });

  it("dashboard second call still creates no new keys", async () => {
    await BenchmarksService.dashboard(ORG);
    const before = (await kv.keys(`bm:*`)).length;
    await BenchmarksService.dashboard(ORG);
    const after = (await kv.keys(`bm:*`)).length;
    expect(after).toBe(before);
  });
});

describe("benchmarks completion — Q2 default tenant removed", () => {
  it("dashboard requires organizationId (throws on empty) (fails on Q2)", async () => {
    await expect(BenchmarksService.dashboard("" as any)).rejects.toThrow();
    await expect(BenchmarksService.dashboard(null as any)).rejects.toThrow();
  });

  it("runBenchmark requires organizationId (throws on empty)", async () => {
    await expect(
      BenchmarksService.runBenchmark({
        area: "latency" as any,
        overallScore: 80,
        passed: true,
        evaluator: "harness",
        evidence: "ticket",
        metrics: [{ key: "p95", label: "p95", value: 100, unit: "ms", higherIsBetter: false }],
        organizationId: "" as any,
      })
    ).rejects.toThrow();
    await expect(
      BenchmarksService.runBenchmark({
        area: "latency" as any,
        overallScore: 80,
        passed: true,
        evaluator: "harness",
        evidence: "ticket",
        metrics: [{ key: "p95", label: "p95", value: 100, unit: "ms", higherIsBetter: false }],
        organizationId: null as any,
      })
    ).rejects.toThrow();
  });

  it("ensureBootstrapped early-returns on empty oid without creating global key", async () => {
    await BenchmarksService.ensureBootstrapped(undefined, "" as any);
    await BenchmarksService.ensureBootstrapped(undefined, null as any);
    expect((await kv.keys(`bm:*`)).length).toBe(0);
  });

  it("operations stay isolated across orgs", async () => {
    await BenchmarksService.runBenchmark({
      area: "latency" as any,
      overallScore: 90,
      passed: true,
      evaluator: "harness",
      evidence: "ticket-a",
      metrics: [{ key: "p95", label: "p95", value: 100, unit: "ms", higherIsBetter: false }],
      organizationId: ORG,
    });
    const otherRuns = await BenchmarksService.listRuns(OTHER);
    expect(otherRuns).toHaveLength(0);
    const otherDash = await BenchmarksService.dashboard(OTHER);
    expect(otherDash.totalRuns).toBe(0);
    expect(otherDash.feedbackToModelFactory.optimizedModels).toBe(0);
    const ownDash = await BenchmarksService.dashboard(ORG);
    expect(ownDash.totalRuns).toBe(1);
  });
});
