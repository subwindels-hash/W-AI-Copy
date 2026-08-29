/**
 * Core Integration checkpoint tests.
 *
 * S165 — the `deployments` probe used to call
 * `DeploymentService.ensureBootstrapped()` and then count the three targets the
 * seeder had just written, so the checkpoint reported `wired` on an
 * installation where nobody had deployed anything. The old test could not
 * catch that: its "no targets" case asserted
 * `expect(["wired","missing"]).toContain(status)` — accepting both outcomes,
 * and therefore unable to fail.
 *
 * These tests pin the honest behaviour: the probe never writes, registration
 * alone is `stub`, and only a validated target earns `wired`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { CoreIntegrationService } = await import("./coreIntegration.service.js");
const { DeploymentService } = await import("../deployment/deployment.service.js");

const PLATFORM_ORG = "org-windels";

async function depLink() {
  const report = await CoreIntegrationService.checkpoint();
  return report.links.find((s) => s.id === "deployments")!;
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("deployments system probe", () => {
  it("reports missing when nothing has been deployed", async () => {
    const dep = await depLink();
    expect(dep.status).toBe("missing");
    expect(dep.evidence).toMatch(/no deployment targets registered/);
  });

  it("does not create targets as a side effect of being probed", async () => {
    // The whole defect: the probe seeded the evidence it then reported.
    await CoreIntegrationService.checkpoint();
    expect(await DeploymentService.list(PLATFORM_ORG)).toEqual([]);
  });

  it("reports stub when targets are registered but none is validated", async () => {
    await DeploymentService.create({
      name: "NA-East", environment: "aws", organizationId: PLATFORM_ORG, skipEmit: true,
    });
    const dep = await depLink();
    expect(dep.status).toBe("stub");
    expect(dep.evidence).toMatch(/registration is not verification/);
  });

  it("reports wired only once a target has passed validation", async () => {
    const t = await DeploymentService.create({
      name: "NA-East", environment: "aws", organizationId: PLATFORM_ORG, skipEmit: true,
    });
    // Mark it validated the way a real passing run would.
    const raw = JSON.parse(kv.hashes.get(`dep:t:${PLATFORM_ORG}:${t.id}`)!._doc);
    raw.validationPassed = true;
    kv.hashes.get(`dep:t:${PLATFORM_ORG}:${t.id}`)!._doc = JSON.stringify(raw);

    const dep = await depLink();
    expect(dep.status).toBe("wired");
    expect(dep.evidence).toMatch(/1 validated/);
  });

  it("a registered-but-unvalidated deployment does not clear the critical gate", async () => {
    await DeploymentService.create({
      name: "NA-East", environment: "aws", organizationId: PLATFORM_ORG, skipEmit: true,
    });
    const report = await CoreIntegrationService.checkpoint();
    const dep = report.links.find((s) => s.id === "deployments")!;
    // `stub` is not `wired`: the checkpoint must not count it as a wired link.
    expect(report.wired).not.toContain(dep.id);
    expect(dep.status).not.toBe("wired");
  });

  it("still emits the overall checkpoint shape", async () => {
    const report = await CoreIntegrationService.checkpoint();
    expect(report.links.length).toBeGreaterThan(0);
    expect(typeof report.criticalPassed).toBe("boolean");
    expect(typeof report.generatedAt).toBe("string");
  });
});
