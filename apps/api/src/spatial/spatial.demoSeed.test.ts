/**
 * Session 168 — spatial read-path seeding, with demo data ON.
 *
 * `spatial.test.ts` mocks demoDataEnabled() to FALSE for every case, which is
 * why it never caught this: with the gate closed the read-path bootstrap call
 * returned early and looked harmless. The defect only appears with demo data
 * enabled, which is the configuration a demo/sales environment actually runs.
 *
 * listHoloDashboards() called ensureBootstrapped() whenever its set was empty.
 * ensureBootstrapped seeds the WHOLE module, so opening the holograms tab on an
 * org that had never used spatial computing conjured sessions, maps, waypoints
 * and remote-expert sessions into existence as a side effect of a GET.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
// The whole point of this file: the gate is OPEN.
vi.mock("../config/demoData.js", async (orig) => {
  const actual = await (orig() as Promise<typeof import("../config/demoData.js")>);
  return { ...actual, demoDataEnabled: () => true };
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

const ORG = "org-spa-demo";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("Spatial — reads never seed, even with demo data enabled (S168)", () => {
  it("listHoloDashboards does not bootstrap the module", async () => {
    // Before S168 this returned six seeded dashboards and populated four other
    // collections on the way.
    expect(await SpatialService.listHoloDashboards(ORG)).toEqual([]);
    // ...and, crucially, nothing else was created either.
    expect(await SpatialService.listSessions(ORG)).toEqual([]);
    expect(await SpatialService.listMaps(ORG)).toEqual([]);
    expect(await SpatialService.listWaypoints(ORG)).toEqual([]);
    expect(await SpatialService.listRemoteExpertSessions(ORG)).toEqual([]);
  });

  it("the dashboard stays empty after a holo-dashboard read", async () => {
    await SpatialService.listHoloDashboards(ORG);
    const d = await SpatialService.dashboard(ORG);
    expect(d.totalSessions).toBe(0);
    expect(d.holoDashboards).toBe(0);
    expect(d.indoorMaps).toBe(0);
    expect(d.devicesSeen).toBe(0);
  });

  it("explicit bootstrap still seeds when demo data is on", async () => {
    // The gate is intact: seeding is not broken, it is merely no longer
    // reachable from a read. bootstrap.ts remains the only caller.
    await SpatialService.ensureBootstrapped(undefined, ORG);
    expect((await SpatialService.listSessions(ORG)).length).toBeGreaterThan(0);
  });
});
