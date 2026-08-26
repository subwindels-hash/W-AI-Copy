/**
 * Operational playbooks — org-scoped store + opex rollup.
 *
 * Backs the opex `playbooks` field, which used to be a structural zero. Tests
 * pin real behaviour with FakeKv: tenant-scoped CRUD, recorded simulations, and
 * a rollup whose figures (total/active/simulating/avgCompliancePct) come from
 * stored records.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { PlaybooksRegistryService } = await import("./playbooksRegistry.service.js");

const ORG = "org-pb";
const OTHER = "org-other";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("playbook CRUD + simulation (tenant-scoped)", () => {
  it("creates, lists per-org, and records a simulation", async () => {
    const pb = await PlaybooksRegistryService.create(ORG, { name: "IR runbook", category: "cyber", version: "1.0.0", steps: 12, status: "active", compliance: "verified" }, "admin-1");
    expect(pb.simulations).toBe(0);
    expect(await PlaybooksRegistryService.list(ORG)).toHaveLength(1);
    expect(await PlaybooksRegistryService.list(OTHER)).toHaveLength(0);

    const ran = await PlaybooksRegistryService.runSimulation(ORG, pb.id);
    expect(ran.simulations).toBe(1);
    expect(ran.lastRun).toBeTruthy();
  });

  it("updates and refuses cross-org update", async () => {
    const pb = await PlaybooksRegistryService.create(ORG, { name: "DR", category: "dr", version: "1", steps: 3, status: "draft", compliance: "unknown" });
    const up = await PlaybooksRegistryService.update(ORG, pb.id, { status: "approved", compliance: "gaps" });
    expect(up.status).toBe("approved");
    await expect(PlaybooksRegistryService.update(OTHER, pb.id, { status: "active" })).rejects.toMatchObject({ status: 404 });
  });

  it("deletes a playbook", async () => {
    const pb = await PlaybooksRegistryService.create(ORG, { name: "X", category: "ops", version: "1", steps: 1, status: "draft", compliance: "unknown" });
    expect(await PlaybooksRegistryService.delete(ORG, pb.id)).toBe(true);
    expect(await PlaybooksRegistryService.list(ORG)).toHaveLength(0);
  });
});

describe("rollup", () => {
  it("computes total, active, and avgCompliancePct from compliance scores", async () => {
    await PlaybooksRegistryService.create(ORG, { name: "A", category: "cyber", version: "1", steps: 1, status: "active", compliance: "verified" }); // 100
    await PlaybooksRegistryService.create(ORG, { name: "B", category: "dr", version: "1", steps: 1, status: "draft", compliance: "gaps" }); // 50
    await PlaybooksRegistryService.create(ORG, { name: "C", category: "hr", version: "1", steps: 1, status: "active", compliance: "unknown" }); // 0

    const r = await PlaybooksRegistryService.rollup(ORG);
    expect(r.total).toBe(3);
    expect(r.active).toBe(2);
    expect(r.avgCompliancePct).toBe(50); // (100+50+0)/3
  });

  it("counts simulating only within the last 24h", async () => {
    const pb = await PlaybooksRegistryService.create(ORG, { name: "S", category: "ops", version: "1", steps: 1, status: "active", compliance: "verified" });
    await PlaybooksRegistryService.runSimulation(ORG, pb.id);
    expect((await PlaybooksRegistryService.rollup(ORG)).simulating).toBe(1);
    // 48h later the simulation is stale.
    const future = Date.now() + 48 * 3_600_000;
    expect((await PlaybooksRegistryService.rollup(ORG, future)).simulating).toBe(0);
  });

  it("returns empty rollup for an org with no playbooks", async () => {
    expect(await PlaybooksRegistryService.rollup(ORG)).toEqual({ total: 0, active: 0, simulating: 0, avgCompliancePct: 0 });
  });
});
