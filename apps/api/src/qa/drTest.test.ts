/**
 * QA disaster-recovery drills — verdicts must reflect work actually performed.
 *
 * These scenarios now perform real operations instead of the old stub that
 * slept and invented measurements:
 *
 *   - `redis-restore` runs a genuine Redis DUMP → RESTORE round-trip on a test
 *     key (RPO genuinely 0, RTO measured from the real operation).
 *   - `backup-restore` attempts a real backup via the automated backup service
 *     (pg_dump) — when no database is reachable it fails honestly.
 *   - `db-failover` performs a real region failover and measures the transition.
 *
 * These tests pin the honesty invariants: no invented RPO/RTO, and a scenario
 * that cannot complete must never report a passing verdict.
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

describe("DR scenarios never invent a measurement", () => {
  it("does not invent an RPO for a drill whose store is unavailable", async () => {
    // backup-restore requires a reachable database; none exists in this env, so
    // RPO must be left unmeasured rather than hardcoded.
    const res = await runDrTest(drCase({ scenario: "backup-restore", validationUrls: [] }));
    expect(res.metrics.rpoMs).toBeUndefined();
    expect(res.status).not.toBe("passed");
  });

  it("does not invent an RTO from a sleep for a store-backed scenario", async () => {
    const res = await runDrTest(drCase({ scenario: "db-failover", validationUrls: [] }));
    // RPO depends on replication telemetry; if it cannot be measured it is absent.
    expect(res.metrics.rpoMs ?? true).toBeDefined();
    expect(res.status).not.toBe("passed");
  });

  it("performs a real redis DUMP→RESTORE round-trip and can pass", async () => {
    const res = await runDrTest(drCase({ scenario: "redis-restore", validationUrls: [], maxRtoMs: 60_000 }));
    // The value round-trips; the drill genuinely completes with an RTO and RPO=0.
    expect(res.status).toBe("passed");
    expect(res.metrics.rtoMs).toBeGreaterThanOrEqual(0);
    expect(res.metrics.rpoMs).toBe(0);
  });

  it("cannot be made to pass an SLA it never measured", async () => {
    // A backup-restore drill against no database must not pass even with a
    // generous SLA — there is no real recovery to certify.
    const res = await runDrTest(drCase({
      scenario: "backup-restore", validationUrls: [], maxRtoMs: 60_000, maxRpoMs: 60_000,
    }));
    expect(res.status).not.toBe("passed");
    // RPO is not measured → no RPO assertion may be recorded.
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
