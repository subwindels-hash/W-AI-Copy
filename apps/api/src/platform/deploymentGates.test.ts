/**
 * Deployment gates in the platform layer (the `infrastructure` module's
 * blue/green, canary and regional-failover surfaces).
 *
 * `cluster.test.ts` and `infraMetrics.test.ts` already cover topology and
 * telemetry. The release and region services were untested, and both contained
 * a gate that could not fail:
 *
 *   1. `bgStage()` set `stagingHealthy = true` unconditionally — comment:
 *      "simulate health gate" — and `bgSwap()` never read it. The check
 *      guarding a production cutover was decorative in both directions.
 *   2. `failover()` ran the entire state machine inline (draining → switching →
 *      verifying → complete) in a handful of Redis writes and logged "failover
 *      complete". No traffic drained, no replication switched, nothing
 *      verified. A DR drill reading that record would conclude the platform
 *      can fail over regionally when it had never been demonstrated.
 *
 * Runs fully in-memory: FakeKv replaces Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { ReleaseService } = await import("./release.service.js");
const { RegionService } = await import("./region.service.js");

const ENV = "prod";
const SVC = "api";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("blue/green cutover requires a real health probe", () => {
  it("stages a version without claiming it is healthy", async () => {
    const bg = await ReleaseService.bgStage(ENV, SVC, "2.0.0");
    expect(bg.stagingVersion).toBe("2.0.0");
    // Previously hard-set to true by the staging call itself.
    expect(bg.stagingHealthy).toBe(false);
  });

  it("refuses to swap into an unverified environment", async () => {
    // Deploy first so there is a real active version to protect. (With no
    // prior state bgStage seeds activeVersion from the staged version, so
    // asserting on activeVersion alone would prove nothing.)
    await ReleaseService.deploy({
      environment: ENV as never, service: SVC as never, version: "1.0.0",
      strategy: "blue-green" as never, author: "tester",
    });
    const before = await ReleaseService.bgGet(ENV, SVC);
    expect(before!.activeVersion).toBe("1.0.0");

    await ReleaseService.bgStage(ENV, SVC, "2.0.0");
    await expect(ReleaseService.bgSwap(ENV, SVC)).rejects.toThrow(/not confirmed healthy/i);

    // A refused swap must leave the live colour serving the old version.
    const after = await ReleaseService.bgGet(ENV, SVC);
    expect(after!.activeVersion).toBe("1.0.0");
    expect(after!.activeColor).toBe(before!.activeColor);
  });

  it("swaps once a probe reports the staged colour healthy", async () => {
    await ReleaseService.bgStage(ENV, SVC, "2.0.0");
    await ReleaseService.bgReportHealth(ENV, SVC, true);
    const bg = await ReleaseService.bgSwap(ENV, SVC);
    expect(bg.activeVersion).toBe("2.0.0");
    // After a swap the new idle colour is again unproven.
    expect(bg.stagingHealthy).toBe(false);
    expect(bg.stagingVersion).toBeUndefined();
  });

  it("still refuses when a probe reports the staged colour unhealthy", async () => {
    await ReleaseService.bgStage(ENV, SVC, "2.0.0");
    await ReleaseService.bgReportHealth(ENV, SVC, false);
    await expect(ReleaseService.bgSwap(ENV, SVC)).rejects.toThrow(/not confirmed healthy/i);
  });
});

describe("a deploy records only what it did", () => {
  it("does not invent a duration or assert a health gate it never ran", async () => {
    const rel = await ReleaseService.deploy({
      environment: ENV as never, service: SVC as never, version: "3.0.0",
      strategy: "rolling" as never, author: "tester",
    });
    expect(rel.version).toBe("3.0.0");
    // A control-plane record with no artifact transfer to time.
    expect((rel as { durationMs?: number }).durationMs).toBeUndefined();
    expect((rel as { healthGatePassed?: boolean }).healthGatePassed).toBeUndefined();
  });

  it("links the previous version when one was deployed", async () => {
    await ReleaseService.deploy({
      environment: ENV as never, service: SVC as never, version: "1.0.0",
      strategy: "rolling" as never, author: "tester",
    });
    const second = await ReleaseService.deploy({
      environment: ENV as never, service: SVC as never, version: "1.1.0",
      strategy: "rolling" as never, author: "tester",
    });
    expect(second.previousVersion).toBe("1.0.0");
  });
});

describe("regional failover is not self-completing", () => {
  async function regions() {
    // The 5-region demo estate is gated, so register the two regions
    // explicitly — which is also the honest shape for a real deployment.
    await RegionService.seed();
    return RegionService.list();
  }

  it("starts at preflight rather than completing itself", async () => {
    await regions();
    await kv.set("infra:region:r-a", JSON.stringify({
      id: "r-a", name: "A", tier: "primary", status: "online",
      replicationRole: "primary", capacity: { requestsPerSec: 0, activeUsers: 0, pods: 0 }, loadPercent: 0,
    }));
    await kv.set("infra:region:r-b", JSON.stringify({
      id: "r-b", name: "B", tier: "dr", status: "online",
      replicationRole: "standby", capacity: { requestsPerSec: 0, activeUsers: 0, pods: 0 }, loadPercent: 0,
    }));
    const fo = await RegionService.failover("r-a", "r-b", "drill");
    // It used to return `complete` having touched no infrastructure.
    expect(fo.state).toBe("preflight");
    expect(fo.completedAt).toBeUndefined();
  });

  it("only reassigns the primary role when a switch is reported", async () => {
    await regions();
    await kv.set("infra:region:r-a", JSON.stringify({
      id: "r-a", name: "A", tier: "primary", status: "online",
      replicationRole: "primary", capacity: { requestsPerSec: 0, activeUsers: 0, pods: 0 }, loadPercent: 0,
    }));
    await kv.set("infra:region:r-b", JSON.stringify({
      id: "r-b", name: "B", tier: "dr", status: "online",
      replicationRole: "standby", capacity: { requestsPerSec: 0, activeUsers: 0, pods: 0 }, loadPercent: 0,
    }));
    await RegionService.failover("r-a", "r-b", "drill");

    // Still standby: nothing has switched yet.
    expect((await RegionService.get("r-b"))!.replicationRole).toBe("standby");

    await RegionService.advanceFailover("draining");
    expect((await RegionService.get("r-a"))!.status).toBe("read-only");

    await RegionService.advanceFailover("switching");
    expect((await RegionService.get("r-b"))!.replicationRole).toBe("primary");
    expect((await RegionService.get("r-a"))!.replicationRole).toBe("standby");

    const done = await RegionService.advanceFailover("complete");
    expect(done!.state).toBe("complete");
    expect(done!.completedAt).toBeDefined();
    expect((await RegionService.get("r-a"))!.status).toBe("online");
  });

  it("refuses a second failover while one is in flight", async () => {
    await regions();
    for (const id of ["r-a", "r-b"]) {
      await kv.set(`infra:region:${id}`, JSON.stringify({
        id, name: id, tier: id === "r-a" ? "primary" : "dr", status: "online",
        replicationRole: id === "r-a" ? "primary" : "standby",
        capacity: { requestsPerSec: 0, activeUsers: 0, pods: 0 }, loadPercent: 0,
      }));
    }
    await RegionService.failover("r-a", "r-b", "first");
    await expect(RegionService.failover("r-a", "r-b", "second")).rejects.toThrow(/already in progress/i);
  });
});

describe("region health is reported, not drifted", () => {
  it("does not fabricate load or status on refresh", async () => {
    await kv.set("infra:region:r-a", JSON.stringify({
      id: "r-a", name: "A", tier: "primary", status: "online",
      replicationRole: "primary", capacity: { requestsPerSec: 0, activeUsers: 0, pods: 0 },
      loadPercent: 0, replicationLagMs: 0,
    }));
    await RegionService.refreshHealth();
    const r = await RegionService.get("r-a");
    // refreshHealth used to apply +/-8% load jitter and derive status from it.
    expect(r!.loadPercent).toBe(0);
    expect(r!.lastHealthCheckAt).toBeUndefined();
  });

  it("accepts a measured report and derives status from it", async () => {
    await kv.set("infra:region:r-a", JSON.stringify({
      id: "r-a", name: "A", tier: "primary", status: "online",
      replicationRole: "primary", capacity: { requestsPerSec: 0, activeUsers: 0, pods: 0 },
      loadPercent: 0, replicationLagMs: 0,
    }));
    const r = await RegionService.recordHealth("r-a", { loadPercent: 95, requestsPerSec: 1200 });
    expect(r!.loadPercent).toBe(95);
    expect(r!.status).toBe("degraded");
    expect(r!.capacity.requestsPerSec).toBe(1200);
    expect(r!.lastHealthCheckAt).toBeTruthy();
  });
});
