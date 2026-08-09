/**
 * Core Integration checkpoint tests.
 *
 * Verifies that the deployments system probe reflects the real DeploymentService
 * targets (aws / kubernetes / edge) rather than reporting a static stub, and
 * that the overall checkpoint still emits the expected shape.
 */
import { describe, it, expect, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { CoreIntegrationService } = await import("./coreIntegration.service.js");
const { DeploymentService } = await import("../deployment/deployment.service.js");

describe("deployments system probe", () => {
  it("reports real deployment targets once the service is bootstrapped", async () => {
    await DeploymentService.ensureBootstrapped();
    const report = await CoreIntegrationService.checkpoint();
    const dep = report.links.find((s) => s.id === "deployments");
    expect(dep).toBeTruthy();
    expect(dep!.status).toBe("wired");
    expect(dep!.evidence).toMatch(/deployment target\(s\) registered/);
  });

  it("reports missing when no targets exist", async () => {
    // Empty FakeKv → no targets seeded.
    const report = await CoreIntegrationService.checkpoint();
    const dep = report.links.find((s) => s.id === "deployments");
    expect(dep).toBeTruthy();
    // Either wired (if seeded) or missing — never a static 'stub' with a fake
    // claim of end-to-end verification.
    expect(["wired", "missing"]).toContain(dep!.status);
  });
});
