/**
 * QA disaster-recovery drills — verdicts must reflect work actually performed.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `runDrTest` is registered as the `dr` runner, so its verdict feeds the QA
 * dashboard's pass rate and any release gate reading it. Three of its six
 * scenarios — `backup-restore`, `db-failover`, `redis-restore` — did this:
 *
 *     await sleep(50 + _rng.next()*150);          // simulate backup
 *     const snapshotBytes = 1_000_000 + rng*50MB; // invented
 *     await sleep(30 + _rng.next()*200);          // simulate restore
 *     rtoMs = performance.now() - t1;             // measures only the sleeps
 *     rpoMs = 200;                                // asserted, not measured
 *
 * Nothing was backed up and nothing was restored. `success` defaults to `true`
 * and that branch never reassigns it, so the drill reported **passed** — with
 * an RTO that measured its own sleep and an RPO of a constant — and those
 * numbers were then checked against the caller's `maxRtoMs` / `maxRpoMs` SLA
 * thresholds. A team could pass a recovery-objective audit against a drill that
 * did nothing.
 *
 * The fix follows the pattern already used across this repo (ETL runs,
 * benchmarks, composer): report `not_performed` honestly rather than inventing
 * a measurement. These tests pin that.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../db/redis.js", async () => {
  const { FakeKv } = await import("../mediaFactory/publishing/fakeKv.js");
  const kv = new FakeKv();
  return { redis: kv, redisCmd: kv, redisSub: kv };
});

const { runDrTest } = await import("./drTest.service.js");

function drCase(config: Record<string, unknown>) {
  return {
    id: "case-1",
    suiteId: "suite-1",
    name: "dr drill",
    kind: "dr",
    timeoutMs: 30_000,
    tags: [],
    selectors: [],
    enabled: true,
    config,
  } as any;
}

describe("unimplemented DR scenarios do not report a pass", () => {
  it.each(["backup-restore", "db-failover", "redis-restore"])(
    "%s reports that no drill was performed",
    async (scenario) => {
      const res = await runDrTest(drCase({ scenario, validationUrls: [] }));

      // The specific regression: a green drill for work never done.
      expect(res.status).not.toBe("passed");

      const successAssertion = res.assertions.find((a) => a.id === "success");
      expect(successAssertion?.passed).toBe(false);
    },
  );

  it("does not invent an RPO for a drill it did not run", async () => {
    const res = await runDrTest(drCase({ scenario: "backup-restore", validationUrls: [] }));
    // rpoMs was hardcoded to 200 and then compared against the caller's SLA.
    expect(res.metrics.rpoMs).toBeUndefined();
  });

  it("does not report an RTO that only measures its own sleep", async () => {
    const res = await runDrTest(drCase({ scenario: "backup-restore", validationUrls: [] }));
    expect(res.metrics.rtoMs).toBeUndefined();
  });

  it("does not invent a snapshot size in the log", async () => {
    const res = await runDrTest(drCase({ scenario: "backup-restore", validationUrls: [] }));
    const text = res.logs.join(" ");
    expect(text).not.toMatch(/MiB/);
    // It should say plainly why there is no result.
    expect(text).toMatch(/not performed|not implemented|no backup/i);
  });

  it("states the reason on the result so a dashboard cannot show a bare failure", async () => {
    const res = await runDrTest(drCase({ scenario: "backup-restore", validationUrls: [] }));
    expect(res.error?.code).toBe("DR_SCENARIO_NOT_IMPLEMENTED");
    expect(res.error?.message).toMatch(/backup-restore/);
  });

  it("cannot be made to pass an SLA it never measured", async () => {
    // Previously: rtoMs ~ a few hundred ms of sleep and rpoMs = 200, so a
    // generous threshold produced two passing assertions and a green drill.
    const res = await runDrTest(drCase({
      scenario: "backup-restore", validationUrls: [], maxRtoMs: 60_000, maxRpoMs: 60_000,
    }));

    expect(res.status).not.toBe("passed");
    // No RTO/RPO assertions may be recorded, because neither was measured.
    expect(res.assertions.find((a) => a.id === "rto")).toBeUndefined();
    expect(res.assertions.find((a) => a.id === "rpo")).toBeUndefined();
  });
});

describe("result shape", () => {
  it("always records timing and a terminal status", async () => {
    const res = await runDrTest(drCase({ scenario: "backup-restore", validationUrls: [] }));
    expect(res.caseId).toBe("case-1");
    expect(res.finishedAt).toBeTruthy();
    expect(["passed", "failed", "error", "skipped"]).toContain(res.status);
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });
});
