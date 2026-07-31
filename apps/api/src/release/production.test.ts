/**
 * A production rollout must never promote itself.
 *
 * `promote()` previously started a canary and then ran an in-process loop —
 * 60 ms per stage across 25/50/75/100% — inventing an error rate (5-15%) and a
 * p95 (40-70 ms) at each step before hard-setting `healthyAt100 = true` and
 * marking the release `deployed`. That produced a complete
 * "canary passed, promoted to production" audit record for a rollout that
 * never touched an environment.
 *
 * Runs fully in-memory: FakeKv replaces Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
// The pipeline status writer is incidental here; stub it so the test stays
// focused on the rollout state machine.
vi.mock("./pipeline.service.js", () => ({
  PipelineService: {
    get: async (id: string) => ({ id, name: "test-release", version: "1.0.0" }),
    setStatus: async () => undefined,
    rollback: async () => undefined,
  },
}));

const { ProductionService } = await import("./production.service.js");

const REL = "rel-test-1";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("canary rollout reports only observed telemetry", () => {
  it("starting a canary does not promote it", async () => {
    const dep = await ProductionService.promote(REL, 5);
    expect(dep!.canaryPercent).toBe(5);
    expect(dep!.status).toBe("canary_ramping");
    // Was: ramped to 100% and marked deployed within ~240ms.
    expect(dep!.healthyAt100).toBe(false);
    expect(dep!.promotedAt).toBeUndefined();
  });

  it("carries no invented error rate or p95 at kick-off", async () => {
    const dep = await ProductionService.promote(REL, 5);
    // Were hard-coded 0.1 and 42, then overwritten with random values.
    expect(dep!.errorRate).toBeUndefined();
    expect(dep!.p95LatencyMs).toBeUndefined();
  });

  it("advances only with telemetry the caller measured", async () => {
    await ProductionService.promote(REL, 5);
    const dep = await ProductionService.reportCanary(REL, {
      canaryPercent: 50, errorRate: 0.02, p95LatencyMs: 88,
    });
    expect(dep!.canaryPercent).toBe(50);
    expect(dep!.errorRate).toBe(0.02);
    expect(dep!.p95LatencyMs).toBe(88);
    expect(dep!.status).toBe("canary_ramping");
  });

  it("refuses to finalize before the canary reaches 100%", async () => {
    await ProductionService.promote(REL, 5);
    await ProductionService.reportCanary(REL, { canaryPercent: 75 });
    await expect(ProductionService.finalize(REL, true)).rejects.toThrow(/100%/);
  });

  it("does not mark deployed when health was not confirmed", async () => {
    await ProductionService.promote(REL, 5);
    await ProductionService.reportCanary(REL, { canaryPercent: 100 });
    const dep = await ProductionService.finalize(REL, false);
    expect(dep!.healthyAt100).toBe(false);
    expect(dep!.status).not.toBe("deployed");
    expect(dep!.promotedAt).toBeUndefined();
  });

  it("deploys only after a real 100% canary with confirmed health", async () => {
    await ProductionService.promote(REL, 5);
    await ProductionService.reportCanary(REL, { canaryPercent: 100, errorRate: 0.001, p95LatencyMs: 61 });
    const dep = await ProductionService.finalize(REL, true);
    expect(dep!.status).toBe("deployed");
    expect(dep!.healthyAt100).toBe(true);
    expect(dep!.promotedAt).toBeTruthy();
  });
});
