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
 *
 * S166 adapted the call signatures (org id is now required, and `run()` refuses
 * a workflow that is not deployed) and the two `successRate` expectations that
 * asserted `0` for a workflow with no resolved runs — that is now `null`, since
 * 0 means "every run failed" rather than "nothing has run". Every assertion's
 * original intent is preserved; none was weakened.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { ComposerService } = await import("./composer.service.js");

const USER = "user-1";
const ORG = "org-a";

/**
 * A workflow that passes validation, so it can be deployed and therefore run.
 *
 * S166 — the original fixture used `{ type: "trigger" }` and `{ from, to }`
 * edges, neither of which matches ComposerNode/ComposerEdge. It never mattered
 * because `run()` did not check the workflow's status and nothing validated the
 * graph. Now that a run requires a deployed workflow, and deploying requires a
 * valid one, the fixture has to be the real shape.
 */
async function makeWorkflow(org = ORG) {
  const wf = await ComposerService.upsert({
    organizationId: org,
    name: "Nightly sync",
    description: "",
    nodes: [
      { id: "n1", kind: "trigger", label: "Start", x: 0, y: 0, config: {} },
      { id: "n2", kind: "output", label: "Sync", x: 100, y: 0, config: {} },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    createdBy: USER,
  });
  return ComposerService.deploy(wf.id, org);
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("triggering a run claims nothing about the outcome", () => {
  it("records the run as queued, not succeeded", async () => {
    const wf = await makeWorkflow();
    const log = await ComposerService.run(wf.id, USER, ORG);

    // The specific regression: reporting success for work never done.
    expect(log.status).toBe("queued");
    expect(log.status).not.toBe("succeeded");
    expect(log.completedAt).toBeUndefined();
    expect(log.durationMs).toBe(0);
  });

  it("does not move the success rate", async () => {
    const wf = await makeWorkflow();
    await ComposerService.run(wf.id, USER, ORG);

    const after = await ComposerService.get(wf.id, ORG);
    // No outcome has been reported, so there is nothing to average yet.
    expect(after!.runs).toBe(0);
    // S166: null, not 0. A rate of 0 asserts every run failed.
    expect(after!.successRate).toBeNull();
  });

  it("a workflow that has never run does not advertise a perfect record", async () => {
    // successRate defaulted to 1, so a brand-new workflow displayed 100%
    // success having executed nothing.
    const wf = await makeWorkflow();
    expect(wf.runs).toBe(0);
    // S166: null, not 0 — and emphatically not the original 1.
    expect(wf.successRate).toBeNull();
    expect(wf.successRate).not.toBe(1);
  });

  it("records the real step count from the workflow", async () => {
    const wf = await makeWorkflow();
    const log = await ComposerService.run(wf.id, USER, ORG);
    expect(log.stepCount).toBe(2);
  });

  it("404s for a workflow that does not exist", async () => {
    await expect(ComposerService.run("no-such-workflow", USER, ORG)).rejects.toMatchObject({ status: 404 });
  });

  it("attributes the run to the triggering user", async () => {
    const wf = await makeWorkflow();
    const log = await ComposerService.run(wf.id, USER, ORG);
    expect(log.triggeredBy).toBe(USER);
  });
});

describe("only a reported outcome resolves a run", () => {
  it("marks a run succeeded and records who said so", async () => {
    const wf = await makeWorkflow();
    const queued = await ComposerService.run(wf.id, USER, ORG);

    const done = await ComposerService.reportRunOutcome(queued.id, {
      status: "succeeded", durationMs: 1200, reportedBy: "workflow-engine-1",
    }, ORG);

    expect(done.status).toBe("succeeded");
    expect(done.durationMs).toBe(1200);
    expect(done.reportedBy).toBe("workflow-engine-1");
    expect(done.completedAt).toBeTruthy();
  });

  it("marks a run failed when the executor says it failed", async () => {
    const wf = await makeWorkflow();
    const queued = await ComposerService.run(wf.id, USER, ORG);
    const done = await ComposerService.reportRunOutcome(queued.id, {
      status: "failed", reportedBy: "workflow-engine-1",
    }, ORG);
    expect(done.status).toBe("failed");
  });

  it("moves the success rate only once a real outcome arrives", async () => {
    const wf = await makeWorkflow();
    const a = await ComposerService.run(wf.id, USER, ORG);
    const b = await ComposerService.run(wf.id, USER, ORG);

    await ComposerService.reportRunOutcome(a.id, { status: "succeeded", reportedBy: "e" }, ORG);
    await ComposerService.reportRunOutcome(b.id, { status: "failed", reportedBy: "e" }, ORG);

    const after = await ComposerService.get(wf.id, ORG);
    expect(after!.runs).toBe(2);
    expect(after!.successRate).toBe(0.5); // one of two, measured
  });

  it("refuses to resolve the same run twice", async () => {
    const wf = await makeWorkflow();
    const queued = await ComposerService.run(wf.id, USER, ORG);
    await ComposerService.reportRunOutcome(queued.id, { status: "succeeded", reportedBy: "e" }, ORG);

    // A second report would let an executor inflate the success rate.
    await expect(
      ComposerService.reportRunOutcome(queued.id, { status: "succeeded", reportedBy: "e" }, ORG),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("404s for an unknown run id", async () => {
    await expect(
      ComposerService.reportRunOutcome("run-nope", { status: "succeeded", reportedBy: "e" }, ORG),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("keeps the resolved run visible in the run list", async () => {
    const wf = await makeWorkflow();
    const queued = await ComposerService.run(wf.id, USER, ORG);
    await ComposerService.reportRunOutcome(queued.id, { status: "succeeded", reportedBy: "e" }, ORG);

    const runs = await ComposerService.getRuns(ORG);
    const found = runs.find((r) => r.id === queued.id);
    expect(found).toBeTruthy();
    expect(found!.status).toBe("succeeded");
    // Resolving must not duplicate the entry.
    expect(runs.filter((r) => r.id === queued.id)).toHaveLength(1);
  });

  it("measures elapsed time when the executor does not supply a duration", async () => {
    const wf = await makeWorkflow();
    const queued = await ComposerService.run(wf.id, USER, ORG);
    const done = await ComposerService.reportRunOutcome(queued.id, {
      status: "succeeded", reportedBy: "e",
    }, ORG);
    expect(done.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(done.durationMs)).toBe(true);
  });
});
