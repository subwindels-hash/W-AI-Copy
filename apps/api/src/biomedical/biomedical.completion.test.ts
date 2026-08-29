/**
 * Session 174 — biomedical completion (Tier 2 #9)
 * Read-path seeding + honest turnaround + tenant isolation + provenance.
 * Runs fully in-memory via FakeKv (no Redis/Prisma).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { BiomedicalService: Svc } = await import("./biomedical.service.js");

const OID = "org-test-completion";
const OTHER = "org-other-completion";

beforeEach(() => {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
});

describe("biomedical completion — B2 honest turnaround is null when unmeasured", () => {
  it("empty org dashboard has avgTurnaroundMin null and unmeasured provenance (fails on B2)", async () => {
    const d = await Svc.dashboard(OID);
    expect(d.imaging.avgTurnaroundMin).toBeNull();
    expect(d.provenance).toBeTruthy();
    expect(d.provenance!.avgTurnaroundMin).toBe("unmeasured_no_completed");
    expect(d.provenance!.studiesMeasured).toBe(false);
  });

  it("after one completed study turnaround becomes a measured number", async () => {
    const s = await Svc.submitStudy({ modality: "xray", bodyPart: "chest", organizationId: OID });
    // Still unmeasured while queued
    const dQueued = await Svc.dashboard(OID);
    expect(dQueued.imaging.avgTurnaroundMin).toBeNull();
    expect(dQueued.imaging.pendingReview).toBe(1);
    expect(dQueued.imaging.aiAssisted).toBe(0);

    await Svc.recordFindings(OID, s.id, [
      { finding: "No acute abnormality", confidence: 0.9, severity: "low", priority: false },
    ], { reviewedByRadiologist: true });

    const dDone = await Svc.dashboard(OID);
    expect(dDone.imaging.avgTurnaroundMin).not.toBeNull();
    expect(typeof dDone.imaging.avgTurnaroundMin).toBe("number");
    expect(dDone.provenance!.avgTurnaroundMin).toBe("measured");
    expect(dDone.provenance!.studiesMeasured).toBe(true);
    expect(dDone.imaging.pendingReview).toBe(0);
    expect(dDone.imaging.aiAssisted).toBe(1);
  });

  it("counts are honest zeros where they are counts", async () => {
    const d = await Svc.dashboard(OID);
    expect(d.imaging.studies24h).toBe(0);
    expect(d.imaging.pendingReview).toBe(0);
    expect(d.imaging.aiAssisted).toBe(0);
    expect(d.alerts24h).toBe(0);
    expect(d.telemetryActive).toBe(0);
  });
});

describe("biomedical completion — B1 read path does not seed", () => {
  it("dashboard performs no Redis write when bm:meta absent (fails on B1)", async () => {
    // Ensure clean
    const beforeMeta = await kv.exists(`bm:meta:${OID}`);
    expect(beforeMeta).toBe(0);

    const beforeKeys = (await kv.keys("bm:*")).length;
    await Svc.dashboard(OID);
    const afterKeys = (await kv.keys("bm:*")).length;
    // Pure read must not create meta or any bm:* key
    expect(afterKeys).toBe(beforeKeys);
    expect(await kv.exists(`bm:meta:${OID}`)).toBe(0);
  });

  it("ensureBootstrapped is idempotent and does not create studies", async () => {
    await Svc.ensureBootstrapped(undefined, OID);
    expect(await kv.exists(`bm:meta:${OID}`)).toBe(1);
    const idsBefore = await kv.smembers(`bm:imgs:${OID}`);
    expect(idsBefore.length).toBe(0);
    await Svc.ensureBootstrapped(undefined, OID);
    const idsAfter = await kv.smembers(`bm:imgs:${OID}`);
    expect(idsAfter.length).toBe(0);
    // Only meta flag should exist, no studies/ph/al alerts/tl
    const keys = await kv.keys(`bm:*`);
    expect(keys).toContain(`bm:meta:${OID}`);
    expect(keys.filter((k) => k.startsWith("bm:img"))).toHaveLength(0);
    expect(keys.filter((k) => k.startsWith("bm:ph"))).toHaveLength(0);
  });

  it("subsequent dashboard calls keep returning empty until a real write", async () => {
    await Svc.dashboard(OID);
    await Svc.dashboard(OID);
    const d = await Svc.dashboard(OID);
    expect(d.recentStudies).toHaveLength(0);
    expect(d.imaging.avgTurnaroundMin).toBeNull();
  });
});

describe("biomedical completion — B3 tenant isolation (no org-windels fallback)", () => {
  it("does not leak studies across organizations (fails on B3)", async () => {
    await Svc.submitStudy({ modality: "ct", bodyPart: "brain", organizationId: OID });
    const otherDash = await Svc.dashboard(OTHER);
    expect(otherDash.recentStudies).toHaveLength(0);
    expect(otherDash.imaging.studies24h).toBe(0);
    const otherStudies = await Svc.listStudies(OTHER);
    expect(otherStudies).toHaveLength(0);
    const ownStudies = await Svc.listStudies(OID);
    expect(ownStudies).toHaveLength(1);
  });

  it("getStudy is org-scoped — other org gets null", async () => {
    const s = await Svc.submitStudy({ modality: "mri", bodyPart: "knee", organizationId: OID });
    expect(await Svc.getStudy(OTHER, s.id)).toBeNull();
    expect(await Svc.getStudy(OID, s.id)).not.toBeNull();
  });

  it("pharmacy alerts are org-scoped", async () => {
    await Svc.addPharmacyAlert(OID, { kind: "interaction", severity: "critical", message: "A vs B" });
    const dOther = await Svc.dashboard(OTHER);
    expect(dOther.pharmacyAlerts).toHaveLength(0);
    const dOwn = await Svc.dashboard(OID);
    expect(dOwn.pharmacyAlerts).toHaveLength(1);
  });

  it("telemedicine sessions are org-scoped", async () => {
    await Svc.startTelemedSession(OID, { providerId: "dr-a", modality: "video" });
    const dOther = await Svc.dashboard(OTHER);
    expect(dOther.telemetryActive).toBe(0);
    const dOwn = await Svc.dashboard(OID);
    expect(dOwn.telemetryActive).toBe(1);
  });

  it("ops metrics are org-scoped", async () => {
    await Svc.setOpsMetrics(OID, [{ label: "bed_occupancy", value: 0.82, unit: "%", target: 0.85, status: "ok" }]);
    const dOther = await Svc.dashboard(OTHER);
    expect(dOther.ops).toHaveLength(0);
    const dOwn = await Svc.dashboard(OID);
    expect(dOwn.ops).toHaveLength(1);
  });

  it("requires organizationId — dashboard throws on empty org", async () => {
    await expect(Svc.dashboard("" as any)).rejects.toThrow();
    await expect(Svc.dashboard(null as any)).rejects.toThrow();
  });

  it("submitStudy requires organizationId", async () => {
    await expect(Svc.submitStudy({ modality: "xray", bodyPart: "chest", organizationId: "" as any })).rejects.toThrow();
    await expect(Svc.submitStudy({ modality: "xray", bodyPart: "chest", organizationId: null as any })).rejects.toThrow();
  });
});

describe("biomedical completion — registry-only remains intact", () => {
  it("queued study has no findings and no turnaround until explicit recordFindings", async () => {
    const s = await Svc.submitStudy({ modality: "ultrasound", bodyPart: "abdomen", organizationId: OID });
    expect(s.aiFindings).toHaveLength(0);
    expect(s.status).toBe("queued");
    expect(s.completedAt).toBeUndefined();
    const d = await Svc.dashboard(OID);
    expect(d.imaging.pendingReview).toBe(1);
    expect(d.imaging.avgTurnaroundMin).toBeNull();
  });

  it("recordFindings via non-admin path equivalent is blocked by route guard — service still records when called with org (route test covers 403)", async () => {
    const s = await Svc.submitStudy({ modality: "pet", bodyPart: "brain", organizationId: OID });
    const updated = await Svc.recordFindings(OID, s.id, [{ finding: "Hot nodule", confidence: 0.77, severity: "high", priority: true }]);
    expect(updated!.status).toBe("escalated");
  });
});
