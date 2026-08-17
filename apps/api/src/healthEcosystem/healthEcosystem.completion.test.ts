/**
 * Session 175 — healthEcosystem completion (Tier 2 #10)
 * Read-path seeding per user + tenant/user isolation + Fifth Standing Rule.
 * Runs fully in-memory via FakeKv.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { HealthEcosystemService: Svc } = await import("./healthEcosystem.service.js");

const OID = "org-test-hec-completion";
const UID = "user-test-hec-completion";
const OTHER_ORG = "org-other-hec";
const OTHER_UID = "user-other-hec";

beforeEach(() => {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
});

describe("healthEcosystem completion — H1 read path does not seed", () => {
  it("dashboard on empty org/user has hasData:false and creates no hec:* keys (fails on H1)", async () => {
    const before = (await kv.keys("hec:*")).length;
    const d = await Svc.dashboard(OID, UID);
    expect(d.hasData).toBe(false);
    expect(d.recentMetrics).toHaveLength(0);
    expect(d.recentSessions).toHaveLength(0);
    expect(d.wearables).toHaveLength(0);
    // pure read must not create meta or any hec key
    const after = (await kv.keys("hec:*")).length;
    expect(after).toBe(before);
    expect(await kv.exists(`hec:meta:${OID}`)).toBe(0);
  });

  it("two consecutive dashboard reads are identical (no randomness, no seeding)", async () => {
    const a = await Svc.dashboard(OID, UID);
    const b = await Svc.dashboard(OID, UID);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("ensureBootstrapped is idempotent and does not create user records", async () => {
    await Svc.ensureBootstrapped(undefined, OID);
    expect(await kv.exists(`hec:meta:${OID}`)).toBe(1);
    const keysBefore = await kv.keys("hec:*");
    // Should only have meta
    expect(keysBefore.filter((k) => k.startsWith("hec:profile"))).toHaveLength(0);
    expect(keysBefore.filter((k) => k.startsWith("hec:metrics"))).toHaveLength(0);
    await Svc.ensureBootstrapped(undefined, OID);
    const keysAfter = await kv.keys("hec:*");
    expect(keysAfter.length).toBe(keysBefore.length);
  });

  it("after recording a metric, hasData becomes true and dashboard reflects it", async () => {
    const dEmpty = await Svc.dashboard(OID, UID);
    expect(dEmpty.hasData).toBe(false);
    await Svc.addMetric(OID, UID, { kind: "sleep", value: 420, unit: "min", source: "wearable" as any });
    const d = await Svc.dashboard(OID, UID);
    expect(d.hasData).toBe(true);
    expect(d.recentMetrics.length).toBeGreaterThan(0);
    expect(d.weeklyAvg.sleepQuality).toBeGreaterThan(0);
  });
});

describe("healthEcosystem completion — H2 tenant/user isolation (no anon fallback)", () => {
  it("does not leak metrics across organizations (fails on H2)", async () => {
    await Svc.addMetric(OID, UID, { kind: "steps", value: 5000, unit: "steps", source: "wearable" as any });
    const otherOrg = await Svc.dashboard(OTHER_ORG, UID);
    expect(otherOrg.recentMetrics).toHaveLength(0);
    expect(otherOrg.hasData).toBe(false);
  });

  it("does not leak metrics across users in same org (per-user isolation)", async () => {
    await Svc.addMetric(OID, UID, { kind: "steps", value: 8000, unit: "steps", source: "wearable" as any });
    const otherUser = await Svc.dashboard(OID, OTHER_UID);
    expect(otherUser.recentMetrics).toHaveLength(0);
    expect(otherUser.hasData).toBe(false);
    const own = await Svc.dashboard(OID, UID);
    expect(own.recentMetrics.length).toBeGreaterThan(0);
  });

  it("getProfile is per-user, not shared via anon", async () => {
    await Svc.upsertProfile(OID, UID, { age: 30, consentGiven: true, consentVersion: "v1" });
    const other = await Svc.getProfile(OID, OTHER_UID);
    expect(other).toBeNull();
    const own = await Svc.getProfile(OID, UID);
    expect(own?.age).toBe(30);
  });

  it("medications are per-user isolated", async () => {
    await Svc.addMedication(OID, UID, { name: "Metformin", dose: "500mg", frequency: "daily" });
    const other = await Svc.dashboard(OTHER_ORG, UID);
    expect(other.medications).toHaveLength(0);
    const otherUser = await Svc.dashboard(OID, OTHER_UID);
    expect(otherUser.medications).toHaveLength(0);
  });

  it("wearables are per-user isolated", async () => {
    await Svc.addWearable(OID, UID, { vendor: "apple" as any, model: "Watch 9", batteryPct: 80, connected: true });
    const other = await Svc.dashboard(OID, OTHER_UID);
    expect(other.wearables).toHaveLength(0);
  });

  it("requires organizationId and userId — dashboard throws on empty (no anon fallback) (fails on H2 anon)", async () => {
    await expect(Svc.dashboard("" as any, UID)).rejects.toThrow();
    await expect(Svc.dashboard(OID, "" as any)).rejects.toThrow();
    await expect(Svc.dashboard(null as any, UID)).rejects.toThrow();
    await expect(Svc.dashboard(OID, null as any)).rejects.toThrow();
  });
});

describe("healthEcosystem completion — Fifth Standing Rule still enforced after refactor", () => {
  it("manual entry cannot claim clinically_validated (wellness downgrade)", async () => {
    const m = await Svc.addMetric(OID, UID, { kind: "bp_systolic", value: 120, unit: "mmHg", source: "manual" as any, label: "clinically_validated" as any });
    expect(m.label).toBe("wellness_estimate");
  });

  it("phone source cannot claim medical_decision_support", async () => {
    const m = await Svc.addMetric(OID, UID, { kind: "glucose", value: 95, unit: "mg/dL", source: "phone" as any, label: "medical_decision_support" as any });
    expect(m.label).toBe("wellness_estimate");
  });

  it("real medical device may carry clinical label", async () => {
    const m = await Svc.addMetric(OID, UID, { kind: "bp_systolic", value: 118, unit: "mmHg", source: "bp_monitor" as any, label: "clinically_validated" as any });
    expect(m.label).toBe("clinically_validated");
  });

  it("every derived insight stays wellness_estimate", async () => {
    for (let i = 0; i < 6; i++) {
      await Svc.addMetric(OID, UID, { kind: "resting_hr", value: 60 + i, unit: "bpm", source: "wearable" as any, at: new Date(Date.now() - i * 86_400_000).toISOString() });
      await Svc.addMetric(OID, UID, { kind: "steps", value: 8000, unit: "steps", source: "wearable" as any, at: new Date(Date.now() - i * 86_400_000).toISOString() });
    }
    const d = await Svc.dashboard(OID, UID);
    expect(d.insights.length).toBeGreaterThan(0);
    for (const ins of d.insights) expect(ins.label).toBe("wellness_estimate");
  });
});
