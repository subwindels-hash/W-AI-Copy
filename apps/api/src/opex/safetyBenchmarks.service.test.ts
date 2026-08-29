/**
 * Safety benchmarks — org-scoped store + opex rollup.
 *
 * Backs the opex `safety.benchmarks` map, which used to be a structural empty
 * map. Tests pin real behaviour with FakeKv: pass is derived from the recorded
 * threshold, the rollup returns the LATEST result per evaluated category, and
 * never-benchmarked categories are absent (never reported as passing).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { SafetyBenchmarksService } = await import("./safetyBenchmarks.service.js");

const ORG = "org-bench";
const OTHER = "org-other";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("record + derived pass", () => {
  it("derives pass from the score vs threshold (not a free-form claim)", async () => {
    const passed = await SafetyBenchmarksService.record(ORG, { category: "jailbreak", score: 92, passThreshold: 80 }, "admin-1");
    expect(passed.pass).toBe(true);
    const failed = await SafetyBenchmarksService.record(ORG, { category: "bias", score: 55, passThreshold: 80 });
    expect(failed.pass).toBe(false);
  });

  it("isolates records by organization", async () => {
    await SafetyBenchmarksService.record(ORG, { category: "toxicity", score: 90, passThreshold: 80 });
    expect(await SafetyBenchmarksService.rollup(ORG)).toHaveProperty("toxicity");
    expect(await SafetyBenchmarksService.rollup(OTHER)).toEqual({});
  });
});

describe("latest per category + rollup", () => {
  it("rollup exposes only evaluated categories, with the latest result each", async () => {
    await SafetyBenchmarksService.record(ORG, { category: "alignment", score: 70, passThreshold: 80 }); // fail (older)
    await SafetyBenchmarksService.record(ORG, { category: "alignment", score: 85, passThreshold: 80 }); // pass (newer)
    await SafetyBenchmarksService.record(ORG, { category: "pii", score: 99, passThreshold: 90 });

    const rollup = await SafetyBenchmarksService.rollup(ORG);
    // alignment reflects the newest record (85, pass).
    expect(rollup.alignment).toEqual({ pass: true, score: 85 });
    expect(rollup.pii).toEqual({ pass: true, score: 99 });
    // A category never benchmarked is absent (not reported as passing).
    expect(rollup.hallucination).toBeUndefined();
  });

  it("history returns records newest-first for a category", async () => {
    await SafetyBenchmarksService.record(ORG, { category: "drift", score: 60, passThreshold: 80 });
    await SafetyBenchmarksService.record(ORG, { category: "drift", score: 88, passThreshold: 80 });
    const hist = await SafetyBenchmarksService.history(ORG, "drift");
    expect(hist).toHaveLength(2);
    expect(hist[0]!.score).toBe(88);
  });

  it("latest returns null for a never-benchmarked category", async () => {
    expect(await SafetyBenchmarksService.latest(ORG, "harm")).toBeNull();
  });
});
