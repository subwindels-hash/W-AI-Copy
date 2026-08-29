/**
 * Session 179 — disasterRecovery completion (Tier 2 #14)
 * Ungated na-east topology + unauthenticated routes.
 * Runs via FakeKv.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { DisasterRecoveryService } = await import("./disasterRecovery.service.js");

const ORG = "org-dr-comp";
const OTHER = "org-dr-other";

function resetAll() {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
}

beforeEach(() => resetAll());

describe("disasterRecovery completion — D1 ungated na-east topology", () => {
  it("dashboard on empty org returns activeRegion null, empty components, null lag and creates no dr:* keys (fails on D1/D4)", async () => {
    const d = await DisasterRecoveryService.dashboard(ORG);
    expect(d.activeRegion).toBeNull();
    expect(d.standbyRegions).toEqual([]);
    expect(d.components).toEqual([]);
    expect(d.replicationLagMs).toBeNull();
    expect(d.overallHealthy).toBe(false);
    expect(d.provenance?.topology).toBe("unconfigured");
    // Pure read must not create any dr:* keys
    expect((await kv.keys("dr:*")).length).toBe(0);
  });

  it("ensureBootstrapped is idempotent and isolated", async () => {
    await DisasterRecoveryService.ensureBootstrapped(undefined, ORG);
    expect(await kv.exists(`dr:active:${ORG}`)).toBe(1);
    const statusKeys = await kv.keys(`dr:status:${ORG}:*`);
    expect(statusKeys.length).toBe(12); // 12 components
    const keysBefore = await kv.keys(`dr:*`);
    await DisasterRecoveryService.ensureBootstrapped(undefined, ORG);
    const keysAfter = await kv.keys(`dr:*`);
    expect(keysAfter.length).toBe(keysBefore.length);
    expect(await kv.exists(`dr:active:${OTHER}`)).toBe(0);
  });

  it("after ensureBootstrapped, dashboard returns configured topology with na-east (honest after bootstrap)", async () => {
    await DisasterRecoveryService.ensureBootstrapped(undefined, ORG);
    const d = await DisasterRecoveryService.dashboard(ORG);
    expect(d.activeRegion).toBe("na-east");
    expect(d.standbyRegions.length).toBeGreaterThan(0);
    expect(d.components.length).toBe(12);
    expect(d.provenance?.topology).toBe("configured");
  });

  it("second dashboard call still creates no new keys", async () => {
    await DisasterRecoveryService.dashboard(ORG);
    const before = (await kv.keys(`dr:*`)).length;
    await DisasterRecoveryService.dashboard(ORG);
    const after = (await kv.keys(`dr:*`)).length;
    expect(after).toBe(before);
  });
});

describe("disasterRecovery completion — D2 no org-windels fallback", () => {
  it("dashboard requires organizationId (throws on empty) (fails on D2)", async () => {
    await expect(DisasterRecoveryService.dashboard("" as any)).rejects.toThrow();
    await expect(DisasterRecoveryService.dashboard(null as any)).rejects.toThrow();
  });

  it("triggerFailover requires organizationId (throws on empty)", async () => {
    await expect(DisasterRecoveryService.triggerFailover({ component: "ai_cluster" as any, toRegion: "eu-west", reason: "x", organizationId: "" as any })).rejects.toThrow();
    await expect(DisasterRecoveryService.triggerFailover({ component: "ai_cluster" as any, toRegion: "eu-west", reason: "x", organizationId: null as any })).rejects.toThrow();
  });

  it("ensureBootstrapped early-returns on empty oid without creating global keys", async () => {
    await DisasterRecoveryService.ensureBootstrapped(undefined, "" as any);
    await DisasterRecoveryService.ensureBootstrapped(undefined, null as any);
    expect((await kv.keys("dr:*")).length).toBe(0);
  });

  it("operations stay isolated across orgs", async () => {
    await DisasterRecoveryService.ensureBootstrapped(undefined, ORG);
    await DisasterRecoveryService.triggerFailover({ component: "ai_cluster" as any, toRegion: "eu-west", reason: "e2e", organizationId: ORG });
    const otherDash = await DisasterRecoveryService.dashboard(OTHER);
    expect(otherDash.activeRegion).toBeNull();
    expect(otherDash.components).toEqual([]);
    const otherEvents = await DisasterRecoveryService.getEvents(OTHER);
    expect(otherEvents).toHaveLength(0);
    const otherDrills = await DisasterRecoveryService.getDrills(OTHER);
    expect(otherDrills).toHaveLength(0);
  });
});

describe("disasterRecovery completion — dashboard still honest via measured paths", () => {
  it("schedule + run + record drill makes component healthy only after measured pass", async () => {
    await DisasterRecoveryService.ensureBootstrapped(undefined, ORG);
    const drill = await DisasterRecoveryService.scheduleDrill({ component: "ai_cluster" as any, scheduledAt: new Date(Date.now() + 3600 * 1000).toISOString(), organizationId: ORG });
    expect(drill.status).toBe("scheduled");
    const running = await DisasterRecoveryService.runDrill(drill.id, ORG);
    expect(running.status).toBe("running");
    const passed = await DisasterRecoveryService.recordDrillResult(running.id, { passed: true, rtoAchievedMs: 5000, rpoAchievedMs: 1000, recordedBy: "user-a" }, ORG);
    expect(passed.status).toBe("passed");
    const status = await DisasterRecoveryService.getStatus(ORG);
    const comp = status.find((c) => c.component === "ai_cluster");
    expect(comp?.healthy).toBe(true);
  });
});
