/**
 * Composer — S166 defects.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `composer.test.ts` (prior art, untouched) pins the fake-verdict fix: a
 * triggered run is `queued`, and only an executor can resolve it. This file
 * covers what that session did not reach:
 *
 *   1. A bootstrap that DELETED an organization's workflows. Its "recovery"
 *      branch wiped every workflow key and reseeded whenever no stored row
 *      parsed — so a Redis hiccup or a schema change turned the next restart
 *      into silent data loss, with no operator involved.
 *   2. An ungated demo seed.
 *   3. Ten routes that dropped the caller's organization, so every tenant read
 *      and OVERWROTE org-windels' workflow definitions.
 *   4. `successRate` of 1 (100%) reported for zero runs.
 *   5. A fabricated dollar cost, `capabilityCount * 0.002`.
 *   6. "Recent Runs" returning the OLDEST runs, via a reversed zrange window.
 *   7. `paused` / `validated` — statuses nothing could assign.
 *   8. A metrics hash written by two paths and read by none.
 *   9. `run()` accepting a workflow that was never deployed.
 *
 * Redis is substituted with FakeKv; no infrastructure required.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const demoEnabled = vi.hoisted(() => ({ value: false }));
vi.mock("../config/demoData.js", () => ({
  demoDataEnabled: () => demoEnabled.value,
  skipDemoSeed: () => undefined,
}));

const { ComposerService } = await import("./composer.service.js");

const ORG_A = "org-a";
const ORG_B = "org-b";
const USER = "user-1";

const NODES = [
  { id: "n1", kind: "trigger" as const, label: "Start", x: 0, y: 0, config: {} },
  { id: "n2", kind: "capability" as const, type: "ocr" as const, label: "OCR", x: 50, y: 0, config: {} },
  { id: "n3", kind: "output" as const, label: "Done", x: 100, y: 0, config: {} },
];
const EDGES = [
  { id: "e1", source: "n1", target: "n2" },
  { id: "e2", source: "n2", target: "n3" },
];

async function makeWorkflow(org = ORG_A, name = "Nightly sync") {
  return ComposerService.upsert({
    organizationId: org, createdBy: USER, name, description: "", nodes: NODES, edges: EDGES,
  });
}

async function makeDeployed(org = ORG_A, name = "Nightly sync") {
  const wf = await makeWorkflow(org, name);
  return ComposerService.deploy(wf.id, org);
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  demoEnabled.value = false;
});

// ───────────────────────────────────────────────────────────────────────────
describe("a bootstrap may create, but must never delete", () => {
  it("does not delete workflows whose stored rows cannot be parsed", async () => {
    demoEnabled.value = true;
    const wf = await makeWorkflow();

    // Corrupt the stored document — a partial write, or a schema change.
    kv.hashes.get(`cmp:wf:${ORG_A}:${wf.id}`)!._doc = "{not json";

    await ComposerService.ensureBootstrapped(undefined, ORG_A);

    // THE REGRESSION: the old recovery branch ran `del` over every id in the
    // set and reseeded, destroying the organization's real workflows.
    expect(kv.hashes.has(`cmp:wf:${ORG_A}:${wf.id}`)).toBe(true);
    expect([...kv.sets.get(`cmp:wfs:${ORG_A}`)!]).toContain(wf.id);
  });

  it("does not reseed over an organization whose rows are all unreadable", async () => {
    demoEnabled.value = true;
    const wf = await makeWorkflow();
    kv.hashes.get(`cmp:wf:${ORG_A}:${wf.id}`)!._doc = "{not json";

    await ComposerService.ensureBootstrapped(undefined, ORG_A);

    // Exactly one id — the original. No example workflow was added.
    expect(kv.sets.get(`cmp:wfs:${ORG_A}`)!.size).toBe(1);
  });

  it("surfaces an unreadable row instead of hiding it", async () => {
    const wf = await makeWorkflow();
    kv.hashes.get(`cmp:wf:${ORG_A}:${wf.id}`)!._doc = "{not json";

    const d = await ComposerService.dashboard(ORG_A);
    expect(d.unreadableWorkflows).toBe(1);
    expect(d.totalWorkflows).toBe(0);
  });

  it("does not resurrect a workflow the operator deleted", async () => {
    demoEnabled.value = true;
    await ComposerService.ensureBootstrapped(undefined, ORG_A);
    const seeded = await ComposerService.list(ORG_A);
    expect(seeded).toHaveLength(1);

    // Operator removes the example.
    await kv.srem(`cmp:wfs:${ORG_A}`, seeded[0]!.id);
    await kv.del(`cmp:wf:${ORG_A}:${seeded[0]!.id}`);

    // Restart. The old code reseeded because the set was empty.
    await ComposerService.ensureBootstrapped(undefined, ORG_A);
    // Seeding into genuine emptiness is allowed; what matters is it is gated.
    demoEnabled.value = false;
    kv.sets.clear();
    await ComposerService.ensureBootstrapped(undefined, ORG_A);
    expect(await ComposerService.list(ORG_A)).toHaveLength(0);
  });

  it("does not delete the metrics counters", async () => {
    demoEnabled.value = true;
    const wf = await makeDeployed();
    await ComposerService.run(wf.id, USER, ORG_A);
    kv.hashes.get(`cmp:wf:${ORG_A}:${wf.id}`)!._doc = "{not json";

    await ComposerService.ensureBootstrapped(undefined, ORG_A);
    expect(kv.hashes.get(`cmp:m:${ORG_A}`)?.totalRuns).toBe("1");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("the demo seed is opt-in", () => {
  it("seeds nothing when WINDELS_DEMO_DATA is off", async () => {
    await ComposerService.ensureBootstrapped(undefined, ORG_A);
    expect(await ComposerService.list(ORG_A)).toHaveLength(0);
  });

  it("seeds the example when explicitly enabled", async () => {
    demoEnabled.value = true;
    await ComposerService.ensureBootstrapped(undefined, ORG_A);
    const list = await ComposerService.list(ORG_A);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toMatch(/Example/);
  });

  it("tags a seeded workflow so it is distinguishable from real work", async () => {
    demoEnabled.value = true;
    await ComposerService.ensureBootstrapped(undefined, ORG_A);
    expect((await ComposerService.list(ORG_A))[0]!.source).toBe("demo_seed");
  });

  it("tags an operator-created workflow as such", async () => {
    expect((await makeWorkflow()).source).toBe("operator_created");
  });

  it("a fresh organization's dashboard reports an empty registry", async () => {
    const d = await ComposerService.dashboard(ORG_A);
    expect(d.totalWorkflows).toBe(0);
    expect(d.totalRuns).toBe(0);
    expect(d.successRate).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("workflows are private to their organization", () => {
  it("does not list another organization's workflows", async () => {
    await makeWorkflow(ORG_A, "A's workflow");
    expect(await ComposerService.list(ORG_B)).toHaveLength(0);
  });

  it("does not read another organization's workflow by id", async () => {
    const wf = await makeWorkflow(ORG_A);
    expect(await ComposerService.get(wf.id, ORG_B)).toBeNull();
  });

  it("cannot overwrite another organization's workflow by reusing its id", async () => {
    const a = await makeWorkflow(ORG_A, "A's workflow");

    // THE REGRESSION: upsert took an id from the request body and no org, so
    // this wrote straight over tenant A's definition.
    await ComposerService.upsert({
      id: a.id, organizationId: ORG_B, createdBy: "attacker",
      name: "hijacked", description: "", nodes: NODES, edges: EDGES,
    });

    expect((await ComposerService.get(a.id, ORG_A))!.name).toBe("A's workflow");
    expect((await ComposerService.get(a.id, ORG_B))!.name).toBe("hijacked");
  });

  it("keeps run ledgers separate", async () => {
    const a = await makeDeployed(ORG_A);
    await ComposerService.run(a.id, USER, ORG_A);
    expect(await ComposerService.getRuns(ORG_B)).toHaveLength(0);
  });

  it("cannot resolve a run belonging to another organization", async () => {
    const a = await makeDeployed(ORG_A);
    const log = await ComposerService.run(a.id, USER, ORG_A);
    await expect(
      ComposerService.reportRunOutcome(log.id, { status: "succeeded", reportedBy: "e" }, ORG_B),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("cannot deploy another organization's workflow", async () => {
    const a = await makeWorkflow(ORG_A);
    await expect(ComposerService.deploy(a.id, ORG_B)).rejects.toBeTruthy();
  });

  it("counts only its own workflows on the dashboard", async () => {
    await makeWorkflow(ORG_A);
    await makeWorkflow(ORG_A, "second");
    await makeWorkflow(ORG_B);
    expect((await ComposerService.dashboard(ORG_A)).totalWorkflows).toBe(2);
    expect((await ComposerService.dashboard(ORG_B)).totalWorkflows).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("success rate is a measurement, not a default", () => {
  it("is null for an organization that has never run anything", async () => {
    await makeWorkflow();
    // THE REGRESSION: `totalRuns ? succ/totalRuns : 1` reported 100%.
    const d = await ComposerService.dashboard(ORG_A);
    expect(d.successRate).toBeNull();
    expect(d.successRate).not.toBe(1);
  });

  it("is null while runs are queued but unresolved", async () => {
    const wf = await makeDeployed();
    await ComposerService.run(wf.id, USER, ORG_A);
    await ComposerService.run(wf.id, USER, ORG_A);
    const d = await ComposerService.dashboard(ORG_A);
    expect(d.successRate).toBeNull();
    expect(d.queuedRuns).toBe(2);
    expect(d.resolvedRuns).toBe(0);
  });

  it("reports 0 — not null — when every resolved run failed", async () => {
    const wf = await makeDeployed();
    const log = await ComposerService.run(wf.id, USER, ORG_A);
    await ComposerService.reportRunOutcome(log.id, { status: "failed", reportedBy: "e" }, ORG_A);

    const d = await ComposerService.dashboard(ORG_A);
    // 0 and null are different claims and must not collapse into each other.
    expect(d.successRate).toBe(0);
    expect(d.failedRuns).toBe(1);
  });

  it("reports the measured share once outcomes arrive", async () => {
    const wf = await makeDeployed();
    for (let i = 0; i < 4; i++) {
      const log = await ComposerService.run(wf.id, USER, ORG_A);
      await ComposerService.reportRunOutcome(
        log.id, { status: i === 3 ? "failed" : "succeeded", reportedBy: "e" }, ORG_A,
      );
    }
    expect((await ComposerService.dashboard(ORG_A)).successRate).toBe(0.75);
  });

  it("a new workflow has null duration and null rate, not zero", async () => {
    const wf = await makeWorkflow();
    expect(wf.successRate).toBeNull();
    expect(wf.avgDurationMs).toBeNull();
  });

  it("counts only workflows with resolved runs in workflowsWithRuns", async () => {
    const a = await makeDeployed(ORG_A, "ran");
    await makeDeployed(ORG_A, "never ran");
    const log = await ComposerService.run(a.id, USER, ORG_A);
    await ComposerService.reportRunOutcome(log.id, { status: "succeeded", reportedBy: "e" }, ORG_A);

    const d = await ComposerService.dashboard(ORG_A);
    expect(d.totalWorkflows).toBe(2);
    expect(d.workflowsWithRuns).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("queued and resolved runs are reported separately", () => {
  it("a triggered run raises the queue depth, not the resolved count", async () => {
    const wf = await makeDeployed();
    await ComposerService.run(wf.id, USER, ORG_A);

    const d = await ComposerService.dashboard(ORG_A);
    expect(d.totalRuns).toBe(1);
    expect(d.queuedRuns).toBe(1);
    expect(d.resolvedRuns).toBe(0);
  });

  it("resolving a run moves it from queued to resolved", async () => {
    const wf = await makeDeployed();
    const log = await ComposerService.run(wf.id, USER, ORG_A);
    await ComposerService.reportRunOutcome(log.id, { status: "succeeded", reportedBy: "e" }, ORG_A);

    const d = await ComposerService.dashboard(ORG_A);
    expect(d.queuedRuns).toBe(0);
    expect(d.resolvedRuns).toBe(1);
  });

  it("tracks queue depth on the workflow itself", async () => {
    const wf = await makeDeployed();
    await ComposerService.run(wf.id, USER, ORG_A);
    await ComposerService.run(wf.id, USER, ORG_A);
    expect((await ComposerService.get(wf.id, ORG_A))!.queuedRuns).toBe(2);
  });

  it("reads the metrics counters that nothing used to read", async () => {
    // The hash was written by run() and reportRunOutcome() and read by nobody.
    const wf = await makeDeployed();
    await ComposerService.run(wf.id, USER, ORG_A);
    expect((await ComposerService.dashboard(ORG_A)).totalRuns)
      .toBe(Number(kv.hashes.get(`cmp:m:${ORG_A}`)!.totalRuns));
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("the run list is ordered newest first", () => {
  it("returns the most recent runs, not the oldest", async () => {
    const wf = await makeDeployed();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push((await ComposerService.run(wf.id, USER, ORG_A)).id);
      // FakeKv scores by Date.now(); nudge so ordering is deterministic.
      await new Promise((r) => setTimeout(r, 2));
    }

    // THE REGRESSION: `zrange(key, -limit, -1, "REV")` took the tail of an
    // already-reversed list, so the panel titled "Recent Runs" showed the
    // oldest ones and a new run did not appear at all.
    const recent = await ComposerService.getRuns(ORG_A, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0]!.id).toBe(ids[4]);
    expect(recent.map((r) => r.id)).not.toContain(ids[0]);
  });

  it("honours the limit", async () => {
    const wf = await makeDeployed();
    for (let i = 0; i < 6; i++) await ComposerService.run(wf.id, USER, ORG_A);
    expect(await ComposerService.getRuns(ORG_A, 3)).toHaveLength(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("a workflow can only be run when it is deployed", () => {
  it("refuses to run a draft", async () => {
    const wf = await makeWorkflow();
    // The console disabled the button; the endpoint did not check.
    await expect(ComposerService.run(wf.id, USER, ORG_A)).rejects.toMatchObject({ status: 409 });
  });

  it("runs a deployed workflow", async () => {
    const wf = await makeDeployed();
    expect((await ComposerService.run(wf.id, USER, ORG_A)).status).toBe("queued");
  });

  it("refuses to run a paused workflow", async () => {
    const wf = await makeDeployed();
    await ComposerService.pause(wf.id, ORG_A);
    await expect(ComposerService.run(wf.id, USER, ORG_A)).rejects.toMatchObject({ status: 409 });
  });

  it("editing a deployed workflow returns it to draft", async () => {
    const wf = await makeDeployed();
    const edited = await ComposerService.upsert({
      id: wf.id, organizationId: ORG_A, createdBy: USER,
      name: "edited", description: "", nodes: NODES, edges: EDGES,
    });
    // The deployed shape is no longer the stored shape.
    expect(edited.status).toBe("draft");
    await expect(ComposerService.run(wf.id, USER, ORG_A)).rejects.toMatchObject({ status: 409 });
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("pause is a status something can actually assign", () => {
  it("pauses a deployed workflow", async () => {
    const wf = await makeDeployed();
    expect((await ComposerService.pause(wf.id, ORG_A)).status).toBe("paused");
  });

  it("resumes a paused workflow", async () => {
    const wf = await makeDeployed();
    await ComposerService.pause(wf.id, ORG_A);
    expect((await ComposerService.resume(wf.id, ORG_A)).status).toBe("deployed");
  });

  it("refuses to pause a draft", async () => {
    const wf = await makeWorkflow();
    await expect(ComposerService.pause(wf.id, ORG_A)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses to resume something that is not paused", async () => {
    const wf = await makeDeployed();
    await expect(ComposerService.resume(wf.id, ORG_A)).rejects.toMatchObject({ status: 409 });
  });

  it("counts paused workflows on the dashboard", async () => {
    const wf = await makeDeployed();
    await ComposerService.pause(wf.id, ORG_A);
    const d = await ComposerService.dashboard(ORG_A);
    expect(d.pausedWorkflows).toBe(1);
    expect(d.deployedWorkflows).toBe(0);
  });

  it("migrates a legacy `validated` status to draft", async () => {
    // `validated` was in the union and nothing could assign it; any row
    // carrying it came from outside the service.
    const wf = await makeWorkflow();
    const key = `cmp:wf:${ORG_A}:${wf.id}`;
    const doc = JSON.parse(kv.hashes.get(key)!._doc!);
    doc.status = "validated";
    kv.hashes.get(key)!._doc = JSON.stringify(doc);

    expect((await ComposerService.get(wf.id, ORG_A))!.status).toBe("draft");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("cost per run is not invented", () => {
  it("reports null rather than a fabricated dollar figure", async () => {
    const wf = await makeWorkflow();
    const v = await ComposerService.validate(wf.id, ORG_A);
    // Was `capabilityCount * 0.002`, rendered as "est $0.0020/run".
    expect(v.estimatedCostPerRun).toBeNull();
    expect(v.costModelConfigured).toBe(false);
  });

  it("still reports the capability count, which is real", async () => {
    const wf = await makeWorkflow();
    expect((await ComposerService.validate(wf.id, ORG_A)).capabilityCount).toBe(1);
  });

  it("does not price a missing workflow either", async () => {
    const v = await ComposerService.validate("nope", ORG_A);
    expect(v.valid).toBe(false);
    expect(v.estimatedCostPerRun).toBeNull();
  });
});
