/**
 * Session 165 — Enterprise Deployment Platform.
 *
 * `verdicts.test.ts` already guards the earlier fix to `validate()` (no more
 * `passed = Math.random() > 0.05`, no targets born healthy). This file covers
 * what S165 changed: tenant scoping, the honest health score, real version
 * reporting, de-registration naming, and the local-vs-target scope of a
 * validation run.
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

const demo = { enabled: false };
vi.mock("../config/demoData.js", () => ({
  demoDataEnabled: () => demo.enabled,
  skipDemoSeed: () => undefined,
}));

const { DeploymentService, LATEST_VERSION } = await import("./deployment.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  demo.enabled = false;
});

async function target(oid = ORG_A, name = "t1") {
  return DeploymentService.create({
    name, environment: "aws", region: "us-east-1", organizationId: oid, skipEmit: true,
  });
}

/** Mark a target as having a real health result, the way a run would. */
function setHealth(oid: string, id: string, ok: boolean) {
  const h = kv.hashes.get(`dep:t:${oid}:${id}`)!;
  const t = JSON.parse(h._doc);
  t.lastHealthOk = ok; t.validationPassed = ok; t.status = ok ? "healthy" : "degraded";
  h._doc = JSON.stringify(t);
}

describe("avgHealthScore reports only what was measured", () => {
  it("is null when nothing has been validated", async () => {
    await target();
    const d = await DeploymentService.dashboard(ORG_A);
    // Previously an unvalidated target scored 50 — a mid-range figure implying
    // partial health for something entirely unmeasured.
    expect(d.avgHealthScore).toBeNull();
    expect(d.validatedTargets).toBe(0);
  });

  it("is null for an organization with no targets at all", async () => {
    const d = await DeploymentService.dashboard(ORG_A);
    expect(d.avgHealthScore).toBeNull();
    expect(d.totalTargets).toBe(0);
  });

  it("reports 100 when every validated target passed", async () => {
    const t = await target();
    setHealth(ORG_A, t.id, true);
    const d = await DeploymentService.dashboard(ORG_A);
    expect(d.avgHealthScore).toBe(100);
    expect(d.validatedTargets).toBe(1);
  });

  it("excludes unvalidated targets from the denominator", async () => {
    const a = await target(ORG_A, "a");
    await target(ORG_A, "b"); // never validated
    setHealth(ORG_A, a.id, true);
    const d = await DeploymentService.dashboard(ORG_A);
    // 1 of 1 validated passed — the unvalidated target does not drag it to 50.
    expect(d.avgHealthScore).toBe(100);
    expect(d.validatedTargets).toBe(1);
    expect(d.totalTargets).toBe(2);
  });

  it("reports a real proportion when some validated targets failed", async () => {
    const a = await target(ORG_A, "a");
    const b = await target(ORG_A, "b");
    setHealth(ORG_A, a.id, true);
    setHealth(ORG_A, b.id, false);
    const d = await DeploymentService.dashboard(ORG_A);
    expect(d.avgHealthScore).toBe(50);
  });
});

describe("version reporting is observed, not assumed", () => {
  it("counts a never-reporting target as unknown, not up to date", async () => {
    await target();
    const d = await DeploymentService.dashboard(ORG_A);
    // The old comparison used the version assigned at creation, so this was
    // always 0 outdated and the gap was invisible.
    expect(d.unknownVersionTargets).toBe(1);
    expect(d.outdatedTargets).toBe(0);
  });

  it("records a reported version", async () => {
    const t = await target();
    const updated = await DeploymentService.reportVersion({
      targetId: t.id, version: "0.80.0", organizationId: ORG_A,
    });
    expect(updated.reportedVersion).toBe("0.80.0");
    expect(updated.versionReportedAt).toBeTruthy();
  });

  it("counts a target reporting an old version as outdated", async () => {
    const t = await target();
    await DeploymentService.reportVersion({ targetId: t.id, version: "0.80.0", organizationId: ORG_A });
    const d = await DeploymentService.dashboard(ORG_A);
    expect(d.outdatedTargets).toBe(1);
    expect(d.unknownVersionTargets).toBe(0);
  });

  it("does not count a target reporting the latest version as outdated", async () => {
    const t = await target();
    await DeploymentService.reportVersion({ targetId: t.id, version: LATEST_VERSION, organizationId: ORG_A });
    const d = await DeploymentService.dashboard(ORG_A);
    expect(d.outdatedTargets).toBe(0);
  });

  it("refuses a report for an unknown target", async () => {
    await expect(DeploymentService.reportVersion({
      targetId: "dt-nope", version: "1.0.0", organizationId: ORG_A,
    })).rejects.toThrow(/target not found/);
  });
});

describe("validation declares what it actually exercised", () => {
  it("labels dependency probes as local_host, not target", async () => {
    const t = await target();
    const v = await DeploymentService.validate(t.id, ORG_A);
    const redisCheck = v.checks.find((c) => c.category === "redis")!;
    expect(redisCheck.scope).toBe("local_host");
  });

  it("labels endpoint and TLS checks as target-scoped", async () => {
    const t = await target();
    const v = await DeploymentService.validate(t.id, ORG_A);
    expect(v.checks.find((c) => c.category === "connectivity")!.scope).toBe("target");
    expect(v.checks.find((c) => c.category === "security")!.scope).toBe("target");
  });

  it("reports zero target-scoped checks when only local probes ran", async () => {
    const t = await target();
    const v = await DeploymentService.validate(t.id, ORG_A);
    // The two target-specific checks are precisely the two that get skipped.
    expect(v.targetScopedChecks).toBe(0);
  });

  it("does not call a remote target healthy on the strength of local probes", async () => {
    const t = await target();
    await DeploymentService.validate(t.id, ORG_A);
    const [after] = await DeploymentService.list(ORG_A);
    // Local Redis connectivity says nothing about us-east-1.
    expect(after.status).not.toBe("healthy");
    if (after.validationPassed) expect(after.status).toBe("validated_locally");
  });

  it("leaves lastHealthOk undefined when nothing probed the target", async () => {
    const t = await target();
    await DeploymentService.validate(t.id, ORG_A);
    const [after] = await DeploymentService.list(ORG_A);
    expect(after.lastHealthOk).toBeUndefined();
    // …and so it does not contribute a health figure.
    const d = await DeploymentService.dashboard(ORG_A);
    expect(d.avgHealthScore).toBeNull();
  });
});

describe("de-registration does not claim teardown", () => {
  it("reports that no infrastructure was modified", async () => {
    const t = await target();
    const r = await DeploymentService.deregister(t.id, ORG_A);
    expect(r.deregistered).toBe(true);
    expect(r.infrastructureModified).toBe(false);
  });

  it("removes the target from the registry", async () => {
    const t = await target();
    await DeploymentService.deregister(t.id, ORG_A);
    expect(await DeploymentService.list(ORG_A)).toEqual([]);
  });

  it("reports false for a target that was not registered", async () => {
    const r = await DeploymentService.deregister("dt-nope", ORG_A);
    expect(r.deregistered).toBe(false);
  });

  it("keeps the deprecated destroy alias working", async () => {
    const t = await target();
    await DeploymentService.destroy(t.id, ORG_A);
    expect(await DeploymentService.list(ORG_A)).toEqual([]);
  });
});

describe("tenant isolation", () => {
  it("does not leak targets across organizations", async () => {
    await target(ORG_A);
    expect(await DeploymentService.list(ORG_B)).toEqual([]);
  });

  it("cannot de-register another organization's target", async () => {
    const t = await target(ORG_A);
    const r = await DeploymentService.deregister(t.id, ORG_B);
    expect(r.deregistered).toBe(false);
    // A's target survives — pre-S165 DELETE hit a shared namespace.
    expect((await DeploymentService.list(ORG_A)).length).toBe(1);
  });

  it("cannot report a version onto another organization's target", async () => {
    const t = await target(ORG_A);
    await expect(DeploymentService.reportVersion({
      targetId: t.id, version: "0.1.0", organizationId: ORG_B,
    })).rejects.toThrow(/target not found/);
  });

  it("keeps dashboards separate", async () => {
    const t = await target(ORG_A);
    setHealth(ORG_A, t.id, true);
    const b = await DeploymentService.dashboard(ORG_B);
    expect(b.totalTargets).toBe(0);
    expect(b.avgHealthScore).toBeNull();
  });

  it("scopes validation records per organization", async () => {
    const t = await target(ORG_A);
    await DeploymentService.validate(t.id, ORG_A);
    expect(await DeploymentService.getLatestValidation(t.id, ORG_B)).toBeNull();
  });
});

describe("seeding is opt-in", () => {
  it("registers no production environments by default", async () => {
    await DeploymentService.ensureBootstrapped(undefined, ORG_A);
    expect(await DeploymentService.list(ORG_A)).toEqual([]);
  });

  it("labels seeded targets as demo when enabled", async () => {
    demo.enabled = true;
    await DeploymentService.ensureBootstrapped(undefined, ORG_A);
    const rows = await DeploymentService.list(ORG_A);
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.source === "demo_seed")).toBe(true);
  });

  it("marks an operator-registered target as such", async () => {
    const t = await target(ORG_A);
    expect(t.source).toBe("operator_registered");
  });

  it("seeds no health: seeded targets are unvalidated", async () => {
    demo.enabled = true;
    await DeploymentService.ensureBootstrapped(undefined, ORG_A);
    const d = await DeploymentService.dashboard(ORG_A);
    expect(d.avgHealthScore).toBeNull();
    expect(d.validatedTargets).toBe(0);
  });
});
