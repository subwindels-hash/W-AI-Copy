/**
 * Session 65 — registry-only guarantees.
 *
 * `submitStudy` previously attached a randomly drawn radiology finding
 * ("Fracture suspected — correlate clinically") with a fabricated confidence
 * score after a 1.5s timer. These tests ensure no study ever gains a finding
 * except through an explicit, attributed read.
 *
 * Runs fully in-memory: FakeKv replaces Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { BiomedicalService: Svc } = await import("./biomedical.service.js");

const OID = "org-test";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("biomedical — no fabricated diagnostics", () => {
  it("a fresh organization has no studies, alerts or sessions", async () => {
    const d = await Svc.dashboard(OID);
    expect(d.recentStudies).toHaveLength(0);
    expect(d.pharmacyAlerts).toHaveLength(0);
    expect(d.imaging.studies24h).toBe(0);
    expect(d.imaging.avgTurnaroundMin).toBe(0);
    expect(d.telemetryActive).toBe(0);
    expect(d.ops).toHaveLength(0);
  });

  it("a submitted study is queued with NO findings", async () => {
    const s = await Svc.submitStudy({ modality: "xray", bodyPart: "chest", organizationId: OID });
    expect(s.status).toBe("queued");
    expect(s.aiFindings).toHaveLength(0);
    expect(s.radiologistReviewed).toBe(false);
    expect(s.completedAt).toBeUndefined();
  });

  it("a study never grows findings on its own over time", async () => {
    const s = await Svc.submitStudy({ modality: "ct", bodyPart: "brain", organizationId: OID });
    // The old implementation populated findings via setTimeout(…, 1500).
    await vi.waitFor(async () => {
      const again = await Svc.getStudy(OID, s.id);
      expect(again).toBeTruthy();
    });
    await new Promise((r) => setTimeout(r, 2000));
    const after = await Svc.getStudy(OID, s.id);
    expect(after!.aiFindings).toHaveLength(0);
    expect(after!.status).toBe("queued");
  }, 10_000);

  it("does not report a study as AI-assisted until it has real findings", async () => {
    await Svc.submitStudy({ modality: "mri", bodyPart: "knee", organizationId: OID });
    const d = await Svc.dashboard(OID);
    expect(d.imaging.studies24h).toBe(1);
    expect(d.imaging.aiAssisted).toBe(0);
    expect(d.imaging.pendingReview).toBe(1);
  });

  it("patient identifiers are pseudonymous", async () => {
    const s = await Svc.submitStudy({ modality: "xray", bodyPart: "chest", organizationId: OID });
    expect(s.patientHash).toMatch(/^pt-/);
  });
});

describe("findings are only attached by an explicit read", () => {
  it("records clinician findings and escalates on priority", async () => {
    const s = await Svc.submitStudy({ modality: "xray", bodyPart: "chest", organizationId: OID });
    const updated = await Svc.recordFindings(OID, s.id, [
      { finding: "Pleural effusion, left side", confidence: 0.91, severity: "high", priority: true },
    ], { reviewedByRadiologist: true });

    expect(updated!.aiFindings).toHaveLength(1);
    expect(updated!.status).toBe("escalated");
    expect(updated!.radiologistReviewed).toBe(true);
    expect(updated!.completedAt).toBeTruthy();
  });

  it("a non-priority signed read is finalised", async () => {
    const s = await Svc.submitStudy({ modality: "xray", bodyPart: "chest", organizationId: OID });
    const updated = await Svc.recordFindings(OID, s.id, [
      { finding: "No acute abnormality", confidence: 0.88, severity: "low", priority: false },
    ], { reviewedByRadiologist: true });
    expect(updated!.status).toBe("signed_off");
  });

  it("returns null for an unknown study", async () => {
    expect(await Svc.recordFindings(OID, "img-missing", [])).toBeNull();
  });
});

describe("compliance posture is attested, not assumed", () => {
  it("reports unassessed controls as gaps rather than compliant", async () => {
    const d = await Svc.dashboard(OID);
    // The old code hard-coded HIPAA/HITECH/ISO-13485 as "compliant".
    for (const status of Object.values(d.complianceStatus)) expect(status).toBe("gap");
  });
});

describe("organization isolation", () => {
  it("does not leak studies across organizations", async () => {
    await Svc.submitStudy({ modality: "xray", bodyPart: "chest", organizationId: OID });
    const other = await Svc.dashboard("org-other");
    expect(other.recentStudies).toHaveLength(0);
  });
});
