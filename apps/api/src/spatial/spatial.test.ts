import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../config/demoData.js", async (orig) => {
  const actual = await (orig() as Promise<typeof import("../config/demoData.js")>);
  return { ...actual, demoDataEnabled: () => false };
});
vi.mock("../enterprise/memory/memory.service.js", () => ({ MemoryService: { remember: async () => {} } }));
vi.mock("../enterprise/knowledgeGraph/knowledgeGraph.service.js", () => ({
  KnowledgeGraphService: { upsertEntity: async () => {}, addRelation: async () => {} },
}));
vi.mock("../kernel/kernel.service.js", () => ({ KernelService: { dispatch: async () => {} } }));
vi.mock("../services/eventBus.js", () => ({ EventBus: { emit: async () => {} } }));
vi.mock("../fabric/fabric.service.js", () => ({ FabricService: { reportTwinTelemetry: async () => {} } }));
vi.mock("../db/client.js", () => ({ prisma: { agent: { findMany: async () => [] } } }));
vi.mock("../agents/agents.service.js", () => ({ recordAgentEvent: async () => {} }));

const { SpatialService } = await import("./spatial.service.js");

const ORG_A = "org-spa-a";
const ORG_B = "org-spa-b";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("Spatial — Session 156 completion", () => {
  it("does not seed a fake campus when demo data is off", async () => {
    await SpatialService.ensureBootstrapped(undefined, ORG_A);
    expect(await SpatialService.listSessions(ORG_A)).toEqual([]);
    expect(await SpatialService.listMaps(ORG_A)).toEqual([]);
    expect(await SpatialService.listWaypoints(ORG_A)).toEqual([]);
    expect(await SpatialService.listHoloDashboards(ORG_A)).toEqual([]);
    expect(await SpatialService.listRemoteExpertSessions(ORG_A)).toEqual([]);
  });

  it("dashboard does not seed on read", async () => {
    const d = await SpatialService.dashboard(ORG_A);
    expect(d.totalSessions).toBe(0);
    expect(d.activeSessions).toBe(0);
    expect(d.indoorMaps).toBe(0);
    expect(d.waypoints).toBe(0);
    expect(d.holoDashboards).toBe(0);
    expect(d.devicesOnline).toBe(0);
    expect(d.devicesSeen).toBe(0);
    expect(d.twinsVisualized).toBe(0);
  });

  it("createSession is org-scoped and does not leak to org B", async () => {
    const s = await SpatialService.createSession({
      title: "Line walk", mode: "ar", deviceTarget: "hololens", organizationId: ORG_A, host: "u1",
    });
    expect(s.status).toBe("streaming");
    expect(s.organizationId).toBe(ORG_A);
    expect((await SpatialService.listSessions(ORG_A)).map((x) => x.id)).toEqual([s.id]);
    expect(await SpatialService.listSessions(ORG_B)).toEqual([]);
    const dB = await SpatialService.dashboard(ORG_B);
    expect(dB.totalSessions).toBe(0);
  });

  it("endSession is org-scoped", async () => {
    const s = await SpatialService.createSession({
      title: "VR lab", mode: "vr", deviceTarget: "quest", organizationId: ORG_A, host: "u1",
    });
    expect(await SpatialService.endSession(s.id, ORG_B)).toBeNull();
    const ended = await SpatialService.endSession(s.id, ORG_A);
    expect(ended!.status).toBe("idle");
    expect(ended!.endedAt).toBeTruthy();
  });

  it("heartbeat is what makes a device online", async () => {
    const before = await SpatialService.dashboard(ORG_A);
    expect(before.devicesOnline).toBe(0);
    await SpatialService.heartbeat({ fingerprint: "hololens-01", deviceTarget: "hololens", organizationId: ORG_A });
    const after = await SpatialService.dashboard(ORG_A);
    expect(after.devicesOnline).toBe(1);
    expect(after.devicesSeen).toBe(1);
    const other = await SpatialService.dashboard(ORG_B);
    expect(other.devicesOnline).toBe(0);
  });

  it("creating a session records a device fingerprint as online", async () => {
    await SpatialService.createSession({
      title: "Quest onboarding", mode: "vr", deviceTarget: "quest", organizationId: ORG_A, host: "u1",
    });
    const d = await SpatialService.dashboard(ORG_A);
    expect(d.devicesOnline).toBe(1);
    expect(d.devicesSeen).toBe(1);
    expect(d.activeSessions).toBe(1);
  });

  it("twin refs increment twinsVisualized only for that org", async () => {
    await SpatialService.createSession({
      title: "Twin view", mode: "xr", deviceTarget: "vision_pro",
      organizationId: ORG_A, host: "u1", twinId: "twin-line-3",
    });
    const d = await SpatialService.dashboard(ORG_A);
    expect(d.twinsVisualized).toBe(1);
    expect((await SpatialService.dashboard(ORG_B)).twinsVisualized).toBe(0);
  });

  it("provenance names what devicesOnline actually is", async () => {
    const d = await SpatialService.dashboard(ORG_A);
    expect(d.provenance?.devicesOnline).toMatch(/heartbeat/i);
    expect(d.provenance?.twinsVisualized).toMatch(/referenced/i);
  });
});
