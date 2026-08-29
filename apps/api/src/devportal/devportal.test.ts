/**
 * Session 27 — Developer Portal: SDK registry, toolkit runs, environments.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Three functions in this module carry explicit notes describing fabrication
 * that was removed, and until now nothing enforced that it stayed removed:
 *
 *   - `toolkit.runTests` "previously invented the entire result — 20-80 cases,
 *     a 10% chance of 1-5 failures, a random 8-45s duration and 65-95%
 *     coverage — without executing anything, then persisted it as a real run."
 *   - `toolkit.deploy` "previously fabricated the outcome (`ok = a random draw
 *     above 0.05`) … and synthesised a plausible log transcript … for a deploy
 *     that never happened."
 *   - `sdkRegistry.register` notes that download and star counts are "shown on
 *     the public developer portal as real adoption", so a new SDK must start at
 *     zero.
 *
 * A comment is not a constraint. The whole point of the de-faking pass is that
 * a `queued` run with zero counters is honest while a fake `passed` is not, and
 * the difference is one `?? ` away from regressing. These tests pin the
 * distinction, plus the ordinary registry/lifecycle behaviour.
 *
 * Redis is substituted with FakeKv; no infrastructure required.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { ToolkitService } = await import("./toolkit.service.js");
const { SDKRegistryService } = await import("./sdkRegistry.service.js");
const { EnvironmentService } = await import("./environment.service.js");

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("toolkit.runTests records, and never invents a pass", () => {
  it("records a run with no supplied result as queued with zeroed counters", async () => {
    const run = await ToolkitService.runTests("unit", "api");

    // The honest shape: nothing ran, so nothing is claimed.
    expect(run.status).toBe("queued");
    expect(run.passed).toBe(0);
    expect(run.failed).toBe(0);
    expect(run.skipped).toBe(0);
    expect(run.durationMs).toBe(0);
    expect(run.coveragePct).toBeUndefined();
  });

  it("never reports 'passed' without a real result", async () => {
    const run = await ToolkitService.runTests("unit", "api");
    // This is the specific regression: a fabricated green run.
    expect(run.status).not.toBe("passed");
  });

  it("records exactly the counts the runner supplied", async () => {
    const run = await ToolkitService.runTests("integration", "api", {
      passed: 42, failed: 0, skipped: 3, durationMs: 1234, coveragePct: 81.5,
    });

    expect(run.status).toBe("passed");
    expect(run.passed).toBe(42);
    expect(run.skipped).toBe(3);
    expect(run.durationMs).toBe(1234);
    expect(run.coveragePct).toBe(81.5);
  });

  it("marks a run failed when any case failed", async () => {
    const run = await ToolkitService.runTests("unit", "api", { passed: 100, failed: 1 });
    // 100 passes do not outvote one failure.
    expect(run.status).toBe("failed");
  });

  it("does not invent coverage when the runner reported none", async () => {
    const run = await ToolkitService.runTests("unit", "api", { passed: 5, failed: 0 });
    expect(run.coveragePct).toBeUndefined();
  });

  it("keeps recent runs newest-first", async () => {
    await ToolkitService.runTests("first", "api", { passed: 1, failed: 0 });
    await ToolkitService.runTests("second", "api", { passed: 1, failed: 0 });
    const recent = await ToolkitService.recentTestRuns(10);
    expect(recent.map((r) => r.name)).toEqual(["second", "first"]);
  });
});

describe("toolkit.deploy records, and never invents an outcome", () => {
  it("records a deploy with no result as queued and with no logs", async () => {
    const run = await ToolkitService.deploy("production", "api", "1.4.0");

    expect(run.status).toBe("queued");
    expect(run.durationMs).toBe(0);
    // The old behaviour synthesised a convincing transcript for a deploy that
    // never happened. An empty log is the honest answer.
    expect(run.logs).toEqual([]);
    expect(run.url).toBeUndefined();
  });

  it("never reports a successful production deploy without a real result", async () => {
    const run = await ToolkitService.deploy("production", "api", "1.4.0");
    expect(run.status).not.toBe("passed");
  });

  it("records a real success with its own logs", async () => {
    const run = await ToolkitService.deploy("staging", "web", "2.0.1", {
      ok: true, durationMs: 45_000, logs: ["pull image", "rollout complete"], url: "https://staging.windels.ai",
    });

    expect(run.status).toBe("passed");
    expect(run.durationMs).toBe(45_000);
    expect(run.logs).toEqual(["pull image", "rollout complete"]);
    expect(run.url).toBe("https://staging.windels.ai");
  });

  it("records a real failure as failed", async () => {
    const run = await ToolkitService.deploy("canary", "api", "1.4.1", {
      ok: false, durationMs: 9_000, logs: ["health check failed"],
    });
    expect(run.status).toBe("failed");
    expect(run.logs).toEqual(["health check failed"]);
  });

  it("keeps recent deploys newest-first", async () => {
    await ToolkitService.deploy("dev", "api", "1", { ok: true });
    await ToolkitService.deploy("dev", "api", "2", { ok: true });
    const recent = await ToolkitService.recentDeploys(10);
    expect(recent.map((r) => r.version)).toEqual(["2", "1"]);
  });
});

describe("SDK registry adoption figures start at zero", () => {
  const base = {
    slug: "windels-node", name: "Node SDK", category: "server" as any,
    language: "typescript" as any, description: "Server SDK", features: ["chat"],
    sliceNumber: 230,
  };

  it("registers a new SDK with no downloads and no stars", async () => {
    const sdk = await SDKRegistryService.register(base);
    // These render on the public portal as real adoption.
    expect(sdk.weeklyDownloads).toBe(0);
    expect(sdk.stars).toBe(0);
  });

  it("derives the install snippet and docs URL from the slug", async () => {
    const sdk = await SDKRegistryService.register(base);
    expect(sdk.installSnippet).toContain("windels-node");
    expect(sdk.docsUrl).toBe("https://docs.windels.ai/sdks/windels-node");
  });

  it("counts downloads only from recorded events", async () => {
    const sdk = await SDKRegistryService.register(base);
    expect(await SDKRegistryService.weeklyTotal()).toBe(0);

    await SDKRegistryService.recordDownload(sdk.id);
    await SDKRegistryService.recordDownload(sdk.id);

    const after = await SDKRegistryService.get(sdk.id);
    expect(after!.weeklyDownloads).toBe(2);
    expect(await SDKRegistryService.weeklyTotal()).toBe(2);
  });

  it("ignores a download for an unknown SDK rather than creating one", async () => {
    await SDKRegistryService.recordDownload("no-such-sdk");
    expect(await SDKRegistryService.list()).toHaveLength(0);
  });

  it("filters by category", async () => {
    await SDKRegistryService.register(base);
    await SDKRegistryService.register({ ...base, slug: "windels-web", category: "client" as any });

    const server = await SDKRegistryService.list("server");
    expect(server.map((s) => s.slug)).toEqual(["windels-node"]);
  });

  it("returns null for an unknown id", async () => {
    await expect(SDKRegistryService.get("nope")).resolves.toBeNull();
  });

  it("starts with an empty registry", async () => {
    expect(await SDKRegistryService.list()).toEqual([]);
    expect(await SDKRegistryService.weeklyTotal()).toBe(0);
  });
});

describe("dev environments", () => {
  it("starts empty until seeded", async () => {
    expect(await EnvironmentService.list()).toEqual([]);
  });

  it("seeds nothing unless demo data is explicitly enabled", async () => {
    // The seed presents environments as already-running with uptime, CPU and
    // memory for workloads that were never started, so it is gated behind
    // WINDELS_DEMO_DATA (off by default — see config/demoData.ts).
    await EnvironmentService.seed();
    expect(await EnvironmentService.list()).toEqual([]);
  });

  it("transitions an environment through start and stop", async () => {
    // Seeding is demo-gated, so create the record directly — the lifecycle is
    // what is under test, not the seed.
    const { randomUUID } = await import("node:crypto");
    const id = randomUUID();
    await kv.set(`dev:env:${id}`, JSON.stringify({
      id, name: "local", kind: "local", services: ["api"], ports: [{ name: "web", port: 5173 }], status: "stopped",
      logs: [], uptimeSec: 0, cpuPct: 0, memMb: 0,
    }));
    await kv.sadd("dev:envs", id);

    const started = await EnvironmentService.start(id);
    expect(started!.status).toBe("running");

    const stopped = await EnvironmentService.stop(id);
    expect(stopped!.status).toBe("stopped");
  });

  it("returns null when starting an unknown environment", async () => {
    await expect(EnvironmentService.start("no-such-env")).resolves.toBeNull();
  });
});
