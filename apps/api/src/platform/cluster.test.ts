/**
 * The platform layer must not invent infrastructure.
 *
 * ClusterService previously fabricated an entire Kubernetes estate at boot —
 * three named nodes, eight workloads (windels-api, postgres, prometheus…), a
 * pod per replica with invented 10.42.x.x IPs and a 20% restart chance — and
 * `probe()` walked it applying ±6% jitter so it looked like a live feed.
 *
 * That fiction cascaded: OptimizationService reads these pods and emits
 * "downsize windels-api from 3 to 2 replicas" cost advice about workloads that
 * were never deployed.
 *
 * IaCService.run() likewise reported `succeeded` with an invented plan diff
 * without invoking terraform/pulumi/helm.
 *
 * Runs fully in-memory: FakeKv replaces Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { ClusterService } = await import("./cluster.service.js");
const { IaCService } = await import("./iac.service.js");
const { OptimizationService } = await import("./optimization.service.js");

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("cluster topology is never invented", () => {
  it("reports unknown with no nodes when no Kubernetes connection exists", async () => {
    const c = await ClusterService.getCluster();
    // Was: "healthy", 3 nodes, ~14 pods, 25-55% CPU on a host with no cluster.
    expect(c.status).toBe("unknown");
    expect(c.nodes).toBe(0);
    expect(c.pods).toBe(0);
    expect(c.cpuPercent).toBe(0);
  });

  it("lists no fabricated nodes, workloads or pods", async () => {
    expect(await ClusterService.listNodes()).toHaveLength(0);
    expect(await ClusterService.listWorkloads()).toHaveLength(0);
    expect(await ClusterService.listPods()).toHaveLength(0);
  });

  it("probe() is stable — it does not jitter a synthetic feed", async () => {
    const a = await ClusterService.probe();
    const b = await ClusterService.probe();
    // The old probe moved every node ±6% CPU on each call.
    expect(b.cpuPercent).toBe(a.cpuPercent);
    expect(b.memoryPercent).toBe(a.memoryPercent);
    expect(b.status).toBe("unknown");
  });

  it("emits no cost recommendations about workloads that do not exist", async () => {
    const recs = await OptimizationService.generate();
    // Previously produced "downsize windels-api" advice from invented pods.
    expect(recs).toHaveLength(0);
  });
});

describe("IaC runs report only real tool output", () => {
  it("a triggered run is queued, with no invented plan diff", async () => {
    const stacks = await IaCService.list();
    // Seeded stack definitions are configuration, not measurements.
    if (!stacks.length) return;
    const run = await IaCService.run(stacks[0]!.id, "plan", "test");
    expect(run.status).toBe("queued");
    // Was: succeeded, with add 0-2 / change 0-4 / destroy 0-1.
    expect(run.summary).toBeUndefined();
    expect(run.finishedAt).toBeUndefined();
  });

  it("records the executor's real result", async () => {
    const stacks = await IaCService.list();
    if (!stacks.length) return;
    const run = await IaCService.run(stacks[0]!.id, "apply", "test");
    const done = await IaCService.recordRun(run.id, {
      status: "succeeded",
      summary: { add: 4, change: 1, destroy: 0 },
      resources: 37,
    });
    expect(done!.status).toBe("succeeded");
    expect(done!.summary).toEqual({ add: 4, change: 1, destroy: 0 });
    const stack = await IaCService.get(stacks[0]!.id);
    expect(stack!.resources).toBe(37);
    expect(stack!.status).toBe("applied");
  });

  it("a failed run marks the stack failed rather than applied", async () => {
    const stacks = await IaCService.list();
    if (!stacks.length) return;
    const run = await IaCService.run(stacks[0]!.id, "apply", "test");
    await IaCService.recordRun(run.id, { status: "failed" });
    const stack = await IaCService.get(stacks[0]!.id);
    expect(stack!.status).toBe("failed");
  });

  it("seeded stacks carry no invented resource count", async () => {
    const stacks = await IaCService.list();
    // Was a random 20-100 managed resources per stack.
    for (const s of stacks) expect(s.resources).toBeUndefined();
  });
});
