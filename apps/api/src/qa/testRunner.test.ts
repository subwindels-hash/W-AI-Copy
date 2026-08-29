/**
 * QA Testing Framework (Slice 185) — verdict semantics.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * This is the module that decides whether the platform's *own* tests passed,
 * and the module inventory reported `tests=0` for it. An unverified test runner
 * is a particularly bad blind spot: if it reports green when a case actually
 * failed, every quality signal downstream of it is worthless, and the failure
 * mode is silent by construction.
 *
 * The properties pinned here are the ones that make a verdict trustworthy:
 *
 *   - a suite is `failed` if *any* case failed, regardless of how many passed
 *   - a case's verdict is derived from its real assertions, never assumed
 *   - a kind with no registered runner is `skipped`, not `passed`
 *     (silently passing an unrunnable case is the fake-completion failure mode)
 *   - a runner that throws yields `error`, and the error is retained
 *   - pass rate is computed from recorded runs, not asserted
 *
 * Runners are injected via the service's own `registerRunner` hook, so the
 * dispatcher is exercised for real with deterministic outcomes. Redis is
 * substituted with FakeKv; no infrastructure needed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { TestRunnerService, assertion } = await import("./testRunner.service.js");

/** Build a runner that returns a fixed set of assertion outcomes. */
function runnerWith(outcomes: boolean[]) {
  return async (c: any) => ({
    caseId: c.id,
    caseName: c.name,
    status: "running" as const, // let the service derive the verdict
    durationMs: 0,
    startedAt: new Date().toISOString(),
    assertions: outcomes.map((ok, i) => assertion(`a${i}`, `assertion ${i}`, ok)),
    logs: [],
    metrics: {},
  });
}

async function makeSuiteWithCases(kind: string, cases: Array<{ name: string; outcomes: boolean[] }>) {
  const suite = await TestRunnerService.createSuite({
    name: `suite-${Math.random().toString(36).slice(2, 8)}`,
    description: "",
    tags: [],
    schedule: { preset: "manual" },
  } as any);

  for (const c of cases) {
    await TestRunnerService.createCase({
      suiteId: suite.id,
      name: c.name,
      kind,
      timeoutMs: 5000,
      tags: [],
      selectors: [],
      // listCases() skips cases where `enabled` is falsy, so an omitted flag
      // makes the case invisible to the runner.
      enabled: true,
      config: {},
    } as any);
  }
  return suite;
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("case verdicts derive from real assertions", () => {
  it("passes only when every assertion passed", async () => {
    TestRunnerService.registerRunner("api" as any, runnerWith([true, true, true]));
    const suite = await makeSuiteWithCases("api", [{ name: "all good", outcomes: [true, true, true] }]);
    const run = await TestRunnerService.runSuite(suite.id);

    expect(run.status).toBe("passed");
    expect(run.passed).toBe(1);
    expect(run.failed).toBe(0);
  });

  it("fails when a single assertion failed, even among passing ones", async () => {
    TestRunnerService.registerRunner("api" as any, runnerWith([true, false, true]));
    const suite = await makeSuiteWithCases("api", [{ name: "one bad", outcomes: [] }]);
    const run = await TestRunnerService.runSuite(suite.id);

    expect(run.status).toBe("failed");
    expect(run.failed).toBe(1);
  });

  it("does not overrule a verdict the runner set explicitly", async () => {
    // A runner that already decided "failed" must be respected even if it
    // recorded no assertions.
    TestRunnerService.registerRunner("api" as any, async (c: any) => ({
      caseId: c.id, caseName: c.name, status: "failed" as const,
      durationMs: 1, startedAt: new Date().toISOString(),
      assertions: [], logs: [], metrics: {},
    }));
    const suite = await makeSuiteWithCases("api", [{ name: "explicit fail", outcomes: [] }]);
    const run = await TestRunnerService.runSuite(suite.id);
    expect(run.status).toBe("failed");
  });
});

describe("unrunnable cases are skipped, never passed", () => {
  it("skips a kind with no registered runner and says why", async () => {
    // "chaos" has no runner registered in this suite.
    const suite = await makeSuiteWithCases("chaos", [{ name: "no runner", outcomes: [] }]);
    const run = await TestRunnerService.runSuite(suite.id);

    // The critical property: an unrunnable case must NOT count as a pass.
    expect(run.passed).toBe(0);
    expect(run.skipped).toBe(1);
    expect(run.status).toBe("skipped");
  });

  it("records NO_RUNNER on the case result rather than inventing a pass", async () => {
    const suite = await makeSuiteWithCases("chaos", [{ name: "no runner", outcomes: [] }]);
    const cases = await TestRunnerService.listCases({ suiteId: suite.id });
    const res = await TestRunnerService.runCase(cases[0]!.id);

    expect(res.status).toBe("skipped");
    expect(res.error?.code).toBe("NO_RUNNER");
  });
});

describe("runner failures are reported, not swallowed", () => {
  it("marks a throwing runner as error and keeps the message", async () => {
    TestRunnerService.registerRunner("security" as any, async () => {
      throw Object.assign(new Error("target unreachable"), { code: "ECONNREFUSED" });
    });
    const suite = await makeSuiteWithCases("security", [{ name: "boom", outcomes: [] }]);
    const cases = await TestRunnerService.listCases({ suiteId: suite.id });
    const res = await TestRunnerService.runCase(cases[0]!.id);

    expect(res.status).toBe("error");
    expect(res.error?.code).toBe("ECONNREFUSED");
    expect(res.error?.message).toBe("target unreachable");
  });

  it("an errored case does not count towards passes", async () => {
    TestRunnerService.registerRunner("security" as any, async () => { throw new Error("nope"); });
    const suite = await makeSuiteWithCases("security", [{ name: "boom", outcomes: [] }]);
    const run = await TestRunnerService.runSuite(suite.id);
    expect(run.passed).toBe(0);
  });
});

describe("suite aggregation", () => {
  it("reports failed when any case fails among several", async () => {
    let call = 0;
    // First case passes, second fails.
    TestRunnerService.registerRunner("api" as any, async (c: any) => {
      const ok = call++ === 0;
      return {
        caseId: c.id, caseName: c.name, status: "running" as const,
        durationMs: 0, startedAt: new Date().toISOString(),
        assertions: [assertion("a", "check", ok)], logs: [], metrics: {},
      };
    });

    const suite = await makeSuiteWithCases("api", [
      { name: "first", outcomes: [] },
      { name: "second", outcomes: [] },
    ]);
    const run = await TestRunnerService.runSuite(suite.id);

    expect(run.total).toBe(2);
    expect(run.passed).toBe(1);
    expect(run.failed).toBe(1);
    // One failure is enough to fail the suite — a majority-pass must not be
    // rounded up to green.
    expect(run.status).toBe("failed");
    expect(run.passRate).toBe(0.5);
  });

  it("summarises honestly", async () => {
    TestRunnerService.registerRunner("api" as any, runnerWith([true]));
    const suite = await makeSuiteWithCases("api", [{ name: "x", outcomes: [] }]);
    const run = await TestRunnerService.runSuite(suite.id);
    expect(run.summary).toMatch(/^1\/1 passed in \d+ms$/);
  });
});

describe("dashboard reflects recorded runs", () => {
  it("counts suites and cases that actually exist", async () => {
    TestRunnerService.registerRunner("api" as any, runnerWith([true]));
    await makeSuiteWithCases("api", [{ name: "a", outcomes: [] }, { name: "b", outcomes: [] }]);

    const d = await TestRunnerService.dashboard();
    expect(d.totalSuites).toBeGreaterThanOrEqual(1);
    expect(d.totalCases).toBeGreaterThanOrEqual(2);
    expect(d.coverage.api).toBeGreaterThanOrEqual(2);
  });

  it("surfaces a failing run as an open failure", async () => {
    TestRunnerService.registerRunner("api" as any, runnerWith([false]));
    const suite = await makeSuiteWithCases("api", [{ name: "bad", outcomes: [] }]);
    await TestRunnerService.runSuite(suite.id);

    const d = await TestRunnerService.dashboard();
    expect(d.openFailures).toBeGreaterThanOrEqual(1);
  });
});

describe("suite and case lifecycle", () => {
  it("deletes a suite and reports whether it existed", async () => {
    const suite = await makeSuiteWithCases("api", []);
    await expect(TestRunnerService.deleteSuite(suite.id)).resolves.toBe(true);
    await expect(TestRunnerService.deleteSuite(suite.id)).resolves.toBe(false);
    await expect(TestRunnerService.getSuite(suite.id)).resolves.toBeNull();
  });

  it("filters cases by suite", async () => {
    const a = await makeSuiteWithCases("api", [{ name: "in-a", outcomes: [] }]);
    const b = await makeSuiteWithCases("api", [{ name: "in-b", outcomes: [] }]);

    const inA = await TestRunnerService.listCases({ suiteId: a.id });
    const inB = await TestRunnerService.listCases({ suiteId: b.id });
    expect(inA.map((c) => c.name)).toEqual(["in-a"]);
    expect(inB.map((c) => c.name)).toEqual(["in-b"]);
  });
});
