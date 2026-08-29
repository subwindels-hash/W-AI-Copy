/**
 * Session 75 — record-only guarantees.
 *
 * These tests lock in the Fifth Standing Rule at the service boundary. The
 * module previously fabricated vitals (BP, glucose, AFib probability) and
 * tagged them `clinically_validated`; that class of bug must not return.
 *
 * Runs fully in-memory: FakeKv replaces Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { HealthEcosystemService: Svc } = await import("./healthEcosystem.service.js");

const OID = "org-test";
const UID = "user-test";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("health ecosystem — no fabricated data", () => {
  it("a fresh user has no health data at all", async () => {
    const d = await Svc.dashboard(OID, UID);

    expect(d.hasData).toBe(false);
    expect(d.recentMetrics).toHaveLength(0);
    expect(d.recentSessions).toHaveLength(0);
    expect(d.medications).toHaveLength(0);
    expect(d.insights).toHaveLength(0);
    // Devices and preventive care are never assumed to exist.
    expect(d.wearables).toHaveLength(0);
    expect(d.medicalDevices).toHaveLength(0);
    expect(d.vaccinations).toHaveLength(0);
    expect(d.screenings).toHaveLength(0);
    // No profile is invented, so consent is not implied.
    expect(d.profile).toBeUndefined();
    expect(d.consentStatus).toBe("none");
  });

  it("aggregate scores are zero rather than invented when nothing is recorded", async () => {
    const d = await Svc.dashboard(OID, UID);
    for (const bucket of [d.today, d.weeklyAvg, d.monthlyAvg]) {
      expect(bucket.score).toBe(0);
      expect(bucket.readiness).toBe(0);
      expect(bucket.recovery).toBe(0);
      expect(bucket.sleepQuality).toBe(0);
      expect(bucket.riskFlags).toHaveLength(0);
      expect(bucket.label).toBe("wellness_estimate");
    }
  });

  it("two consecutive dashboard reads are identical (no randomness)", async () => {
    const a = await Svc.dashboard(OID, UID);
    const b = await Svc.dashboard(OID, UID);
    // ids/timestamps would differ if anything were being generated per-call
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe("Fifth Standing Rule — label provenance is enforced on write", () => {
  it("a manual entry cannot claim clinically_validated", async () => {
    const m = await Svc.addMetric(OID, UID, {
      kind: "bp_systolic", value: 120, unit: "mmHg",
      source: "manual", label: "clinically_validated",
    });
    expect(m.label).toBe("wellness_estimate");
  });

  it("a self-reported phone entry cannot claim medical_decision_support", async () => {
    const m = await Svc.addMetric(OID, UID, {
      kind: "glucose", value: 95, unit: "mg/dL",
      source: "phone", label: "medical_decision_support",
    });
    expect(m.label).toBe("wellness_estimate");
  });

  it("a real medical device may carry a clinical label", async () => {
    const m = await Svc.addMetric(OID, UID, {
      kind: "bp_systolic", value: 118, unit: "mmHg",
      source: "bp_monitor", label: "clinically_validated",
    });
    expect(m.label).toBe("clinically_validated");
  });

  it("fitness sessions are always wellness estimates", async () => {
    const s = await Svc.addSession(OID, UID, {
      kind: "run", durationMin: 30, calories: 300, avgHr: 140, peakHr: 165,
      label: "clinically_validated",
    });
    expect(s.label).toBe("wellness_estimate");
  });

  it("a medication without a prescriber is not labelled clinical", async () => {
    const m = await Svc.addMedication(OID, UID, { name: "Vitamin D3", dose: "2000 IU", frequency: "daily" });
    expect(m.label).toBe("wellness_estimate");
    // adherence starts at zero rather than a flattering random number
    expect(m.adherencePct).toBe(0);
    expect(m.dosesTaken7d).toBe(0);
  });
});

describe("derived aggregates use only recorded values", () => {
  it("computes sleep quality and insights from real records", async () => {
    for (let i = 0; i < 5; i++) {
      await Svc.addMetric(OID, UID, {
        kind: "sleep", value: 420, unit: "min", source: "wearable",
        at: new Date(Date.now() - i * 86_400_000).toISOString(),
      });
    }
    const d = await Svc.dashboard(OID, UID);
    expect(d.hasData).toBe(true);
    // 420 min sits inside the 300–510 reference band -> a real, bounded score
    expect(d.weeklyAvg.sleepQuality).toBeGreaterThan(0);
    expect(d.weeklyAvg.sleepQuality).toBeLessThanOrEqual(100);

    const sleepInsight = d.insights.find((i) => i.citedKinds?.includes("sleep"));
    expect(sleepInsight).toBeTruthy();
    expect(sleepInsight!.text).toContain("7.0 h");
    // Derived insights never claim clinical authority.
    expect(sleepInsight!.label).toBe("wellness_estimate");
  });

  it("every derived insight is a wellness_estimate", async () => {
    for (let i = 0; i < 6; i++) {
      await Svc.addMetric(OID, UID, { kind: "resting_hr", value: 60 + i, unit: "bpm", source: "wearable",
        at: new Date(Date.now() - i * 86_400_000).toISOString() });
      await Svc.addMetric(OID, UID, { kind: "steps", value: 8000, unit: "steps", source: "wearable",
        at: new Date(Date.now() - i * 86_400_000).toISOString() });
    }
    const d = await Svc.dashboard(OID, UID);
    expect(d.insights.length).toBeGreaterThan(0);
    for (const i of d.insights) expect(i.label).toBe("wellness_estimate");
    expect(d.labelBreakdown.medical_decision_support).toBe(0);
  });

  it("raises a risk flag only from a recorded clinical-grade reading", async () => {
    await Svc.addMetric(OID, UID, {
      kind: "bp_systolic", value: 150, unit: "mmHg", source: "bp_monitor", label: "clinically_validated",
    });
    const d = await Svc.dashboard(OID, UID);
    expect(d.today.riskFlags).toContain("recorded_systolic_at_or_above_140");
  });
});

describe("organization isolation", () => {
  it("does not leak records across organizations", async () => {
    await Svc.addMetric(OID, UID, { kind: "steps", value: 5000, unit: "steps", source: "wearable" });
    const other = await Svc.dashboard("org-other", UID);
    expect(other.recentMetrics).toHaveLength(0);
    expect(other.hasData).toBe(false);
  });
});
