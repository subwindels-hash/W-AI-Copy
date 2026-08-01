/**
 * Composer — workflow run outcomes.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `run()` executed nothing (node execution belongs to the workflow engine) but
 * recorded the run as `succeeded` the moment it was triggered, and fed that
 * verdict into the stored `successRate`. A workflow that had never done any
 * work therefore displayed 100% success. An earlier version was worse: it
 * failed 1% of runs at random, so a workflow could be reported failed for no
 * reason at all.
 *
 * The module had no tests, so neither behaviour was pinned in either
 * direction. A triggered run is now `queued`, and only an executor reporting a
 * real outcome can resolve it or move the success rate.
 *
 * Redis is substituted with FakeKv; no infrastructure required.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { ComposerService } = await import("./composer.service.js");

const USER = "user-1";

async function makeWorkflow() {
  return ComposerService.upsert({
    name: "Nightly sync",
    description: "",
    nodes: [
      { id: "n1", type: "trigger", label: "Start", config: {} },
      { id: "n2", type: "action", label: "Sync", config: {} },
    ],
    edges: [{ from: "n1", to: "n2" }],
    createdBy: USER,
  } as any);
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("triggering a run claims nothing about the outcome", () => {
  it("records the run as queued, not succeeded", async () => {
    const wf = await makeWorkflow();
    const log = await ComposerService.run(wf.id, USER);

    // The specific regression: reporting success for work never done.
    expect(log.status).toBe("queued");
    expect(log.status).not.toBe("succeeded");
    expect(log.completedAt).toBeUndefined();
    expect(log.durationMs).toBe(0);
  });

  it("does not move the success rate", async () => {
    const wf = await makeWorkflow();
    await ComposerService.run(wf.id, USER);

    const after = await ComposerService.get(wf.id);
    // No outcome has been reported, so there is nothing to average yet.
    expect(after!.runs).toBe(0);
    expect(after!.successRate).toBe(0);
  });

  it("a workflow that has never run does not advertise a perfect record", async () => {
    // successRate defaulted to 1, so a brand-new workflow displayed 100%
    // success having executed nothing.
    const wf = await makeWorkflow();
    expect(wf.runs).toBe(0);
    expect(wf.successRate).toBe(0);
  });

  it("records the real step count from the workflow", async () => {
    const wf = await makeWorkflow();
    const log = await ComposerService.run(wf.id, USER);
    expect(log.stepCount).toBe(2);
  });

  it("404s for a workflow that does not exist", async () => {
    await expect(ComposerService.run("no-such-workflow", USER)).rejects.toMatchObject({ status: 404 });
  });

  it("attributes the run to the triggering user", async () => {
    const wf = await makeWorkflow();
    const log = await ComposerService.run(wf.id, USER);
    expect(log.triggeredBy).toBe(USER);
  });
});

describe("only a reported outcome resolves a run", () => {
  it("marks a run succeeded and records who said so", async () => {
    const wf = await makeWorkflow();
    const queued = await ComposerService.run(wf.id, USER);

    const done = await ComposerService.reportRunOutcome(queued.id, {
      status: "succeeded", durationMs: 1200, reportedBy: "workflow-engine-1",
    });

    expect(done.status).toBe("succeeded");
    expect(done.durationMs).toBe(1200);
    expect(done.reportedBy).toBe("workflow-engine-1");
    expect(done.completedAt).toBeTruthy();
  });

  it("marks a run failed when the executor says it failed", async () => {
    const wf = await makeWorkflow();
    const queued = await ComposerService.run(wf.id, USER);
    const done = await ComposerService.reportRunOutcome(queued.id, {
      status: "failed", reportedBy: "workflow-engine-1",
    });
    expect(done.status).toBe("failed");
  });

  it("moves the success rate only once a real outcome arrives", async () => {
    const wf = await makeWorkflow();
    const a = await ComposerService.run(wf.id, USER);
    const b = await ComposerService.run(wf.id, USER);

    await ComposerService.reportRunOutcome(a.id, { status: "succeeded", reportedBy: "e" });
    await ComposerService.reportRunOutcome(b.id, { status: "failed", reportedBy: "e" });

    const after = await ComposerService.get(wf.id);
    expect(after!.runs).toBe(2);
    expect(after!.successRate).toBe(0.5); // one of two, measured
  });

  it("refuses to resolve the same run twice", async () => {
    const wf = await makeWorkflow();
    const queued = await ComposerService.run(wf.id, USER);
    await ComposerService.reportRunOutcome(queued.id, { status: "succeeded", reportedBy: "e" });

    // A second report would let an executor inflate the success rate.
    await expect(
      ComposerService.reportRunOutcome(queued.id, { status: "succeeded", reportedBy: "e" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("404s for an unknown run id", async () => {
    await expect(
      ComposerService.reportRunOutcome("run-nope", { status: "succeeded", reportedBy: "e" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("keeps the resolved run visible in the run list", async () => {
    const wf = await makeWorkflow();
    const queued = await ComposerService.run(wf.id, USER);
    await ComposerService.reportRunOutcome(queued.id, { status: "succeeded", reportedBy: "e" });

    const runs = await ComposerService.getRuns();
    const found = runs.find((r) => r.id === queued.id);
    expect(found).toBeTruthy();
    expect(found!.status).toBe("succeeded");
    // Resolving must not duplicate the entry.
    expect(runs.filter((r) => r.id === queued.id)).toHaveLength(1);
  });

  it("measures elapsed time when the executor does not supply a duration", async () => {
    const wf = await makeWorkflow();
    const queued = await ComposerService.run(wf.id, USER);
    const done = await ComposerService.reportRunOutcome(queued.id, {
      status: "succeeded", reportedBy: "e",
    });
    expect(done.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(done.durationMs)).toBe(true);
  });
});
