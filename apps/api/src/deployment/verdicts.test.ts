/**
 * No-fabricated-verdict guarantees for the operational gates.
 *
 * Deployment validation, DR drills and update preflight all previously graded
 * themselves with `Math.random()`:
 *
 *   deployment.validate   passed = Math.random() > 0.05
 *   disasterRecovery      passed = Math.random() > 0.1   (+ random RTO/RPO)
 *   updates.validate      passed = Math.random() > 0.06
 *
 * A gate that passes on a coin flip is worse than no gate — it manufactures
 * evidence of a check that never ran. These tests keep that from coming back.
 *
 * Runs fully in-memory: FakeKv replaces Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { DeploymentService } = await import("./deployment.service.js");
const { DisasterRecoveryService } = await import("../disasterRecovery/disasterRecovery.service.js");

const OID = "org-test";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("deployment validation runs real probes", () => {
  it("a new target is not born healthy", async () => {
    const t = await DeploymentService.create({
      name: "test", environment: "docker", organizationId: OID, skipEmit: true,
    } as any);
    // Previously: status "healthy", validationPassed true, and random cpu/mem/gpu
    // telemetry — all before a single check had run.
    expect(t.status).toBe("validating");
    expect(t.validationPassed).toBe(false);
    expect(t.cpuPct).toBeUndefined();
    expect(t.memPct).toBeUndefined();
    expect(t.gpuPct).toBeUndefined();
  });

  it("marks unverifiable checks as skipped rather than passed", async () => {
    const v = await DeploymentService.validate("dt-missing", OID);
    const conn = v.checks.find((c) => c.category === "connectivity");
    const tls = v.checks.find((c) => c.category === "security");
    // Remote endpoint reachability and TLS cannot be asserted from here.
    expect(conn?.skipped).toBe(true);
    expect(conn?.passed).toBe(false);
    expect(tls?.skipped).toBe(true);
    expect(v.skippedCount).toBeGreaterThan(0);
  });

  it("reports a real, reproducible redis probe result", async () => {
    const a = await DeploymentService.validate("dt-x", OID);
    const b = await DeploymentService.validate("dt-x", OID);
    const ra = a.checks.find((c) => c.category === "redis")!;
    const rb = b.checks.find((c) => c.category === "redis")!;
    // A genuine probe gives the same answer twice; a coin flip would not.
    expect(ra.passed).toBe(rb.passed);
    expect(ra.skipped).toBeFalsy();
  });

  it("never reports passed when every check was skipped", async () => {
    const v = await DeploymentService.validate("dt-y", OID);
    const executed = v.checks.filter((c) => !c.skipped);
    if (executed.length === 0) expect(v.passed).toBe(false);
    // and the verdict must equal the conjunction of executed checks
    expect(v.passed).toBe(executed.length > 0 && executed.every((c) => c.passed));
  });
});

describe("DR drills are never auto-graded", () => {
  it("running a drill leaves it running, with no invented result", async () => {
    await DisasterRecoveryService.ensureBootstrapped(undefined, OID);
    const scheduled = await DisasterRecoveryService.scheduleDrill({
      component: "ai_cluster", scheduledAt: new Date().toISOString(), organizationId: OID,
    } as any);
    const running = await DisasterRecoveryService.runDrill(scheduled.id, OID);

    expect(running.status).toBe("running");
    expect(running.results).toBeUndefined();
    expect(running.completedAt).toBeUndefined();
  });

  it("records the measured outcome supplied by an operator", async () => {
    await DisasterRecoveryService.ensureBootstrapped(undefined, OID);
    const s = await DisasterRecoveryService.scheduleDrill({
      component: "ai_cluster", scheduledAt: new Date().toISOString(), organizationId: OID,
    } as any);
    await DisasterRecoveryService.runDrill(s.id, OID);
    const done = await DisasterRecoveryService.recordDrillResult(s.id, {
      passed: false, rtoAchievedMs: 41_000, rpoAchievedMs: 900,
      issues: ["standby lag exceeded SLO"], recordedBy: "user-1",
    }, OID);

    expect(done.status).toBe("failed");
    expect(done.results!.rtoAchievedMs).toBe(41_000);
    expect(done.recordedBy).toBe("user-1");
  });

  it("bootstrap seeds no drills and leaves components unverified", async () => {
    await DisasterRecoveryService.ensureBootstrapped(undefined, OID);
    const drills = await DisasterRecoveryService.getDrills(OID, 20);
    // Previously a fully-formed "passed" drill dated 3 days ago was seeded.
    expect(drills).toHaveLength(0);
    const status = await DisasterRecoveryService.getStatus(OID);
    expect(status.length).toBeGreaterThan(0);
    for (const c of status) {
      expect(c.healthy).toBe(false);
      expect(c.replicationLagMs).toBeUndefined();
    }
  });

  it("failover reports a measured duration, not an invented RTO", async () => {
    await DisasterRecoveryService.ensureBootstrapped(undefined, OID);
    const ev = await DisasterRecoveryService.triggerFailover({
      component: "ai_cluster", toRegion: "eu-west", reason: "test", organizationId: OID,
    });
    // The old code invented a 5-30s RTO after a 25ms sleep.
    expect(ev.durationMs).toBeLessThan(5_000);
    expect(ev.rtoMs).toBe(ev.durationMs);
    // Unmeasurable without replication telemetry — omitted rather than zeroed.
    expect(ev.rpoMs).toBeUndefined();
    expect(ev.dataLossMs).toBeUndefined();
  });
});
