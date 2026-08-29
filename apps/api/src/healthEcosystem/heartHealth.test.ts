/**
 * Session 200 — Heart Center (AI-Powered Heart Reports & Scans).
 *
 * Locks in the same guarantees as healthEcosystem.test.ts at the new
 * heart-suite boundary:
 *   - record-only: empty users get null statistics and honest empty reports,
 *     never fabricated readings or findings
 *   - Fifth Standing Rule: writes go through the provenance gate (a manual
 *     quick-measure cannot claim a clinical label; a BP monitor can)
 *   - the arithmetic is correct (HRV time-domain math, MAP, pulse pressure)
 *   - scans compile deterministically from recorded data only
 *
 * Runs fully in-memory: FakeKv replaces Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { HeartHealthService: Heart } = await import("./heartHealth.service.js");
const { HealthEcosystemService: Svc } = await import("./healthEcosystem.service.js");
const { computeHrvSeries } = await import("./heartHealth.service.js");

const OID = "org-heart-test";
const UID = "user-heart-test";
const OTHER_ORG = "org-heart-other";
const OTHER_UID = "user-heart-other";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("heart center — record-only honesty", () => {
  it("a fresh user has no heart data and no fabricated statistics", async () => {
    const data = await Heart.heartData(OID, UID);
    expect(data.hasData).toBe(false);
    expect(data.totalRecorded).toBe(0);
    expect(data.recent).toHaveLength(0);

    const hrv = await Heart.hrvAnalysis(OID, UID);
    expect(hrv.hasData).toBe(false);
    expect(hrv.sdnnMs).toBeNull();
    expect(hrv.rmssdMs).toBeNull();
    expect(hrv.sampleCount).toBe(0);

    const monitor = await Heart.monitorFeed(OID, UID);
    expect(monitor.hasData).toBe(false);
    expect(monitor.latestBpm).toBeNull();

    const bp = await Heart.bloodPressure(OID, UID);
    expect(bp.hasData).toBe(false);
    expect(bp.latest).toBeNull();
    expect(bp.avgSystolic).toBeNull();
    expect(bp.observations).toHaveLength(0);

    const pulse = await Heart.pulseStats(OID, UID);
    expect(pulse.hasData).toBe(false);
    expect(pulse.avgBpm).toBeNull();
    expect(pulse.series).toHaveLength(0);
  });

  it("a scan on an empty account yields empty sections, never invented findings", async () => {
    const r = await Heart.generateReport(OID, UID, "heart_scan");
    expect(r.hasData).toBe(false);
    expect(r.label).toBe("wellness_estimate");
    expect(r.sections.length).toBeGreaterThan(0);
    for (const s of r.sections) {
      expect(s.status).toBe("empty");
      expect(s.basisReadings).toBe(0);
      expect(s.text).toMatch(/no .* recorded/i);
    }
  });

  it("pulse statistics are deterministic across reads (no randomness)", async () => {
    await Heart.quickMeasure(OID, UID, { heartRateBpm: 72 });
    const a = await Heart.pulseStats(OID, UID);
    const b = await Heart.pulseStats(OID, UID);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe("heart center — HRV arithmetic", () => {
  it("computes SDNN/RMSSD/pNN50 correctly on a known series", () => {
    // perfectly regular 800ms series: zero variability
    const flat = computeHrvSeries([800, 800, 800, 800, 800]);
    expect(flat.sdnnMs).toBe(0);
    expect(flat.rmssdMs).toBe(0);
    expect(flat.pnn50Pct).toBe(0);
    expect(flat.meanRrMs).toBe(800);

    // alternating 800/900: diffs are all ±100 → RMSSD 100, pNN50 100%
    const alt = computeHrvSeries([800, 900, 800, 900, 800]);
    expect(alt.meanRrMs).toBe(840);
    expect(alt.rmssdMs).toBe(100);
    expect(alt.pnn50Pct).toBe(100);
    expect(alt.sdnnMs).toBeCloseTo(48.99, 1);
  });

  it("derives HRV from a quick-measure RR sample and surfaces it in the analysis", async () => {
    const r = await Heart.quickMeasure(OID, UID, {
      rrIntervalsMs: [800, 820, 790, 810, 805, 830, 795, 800],
      source: "ecg_monitor",
    });
    expect(r.hrv).not.toBeNull();
    expect(r.hrv!.sampleCount).toBe(8);
    expect(r.hrv!.sdnnMs).toBeGreaterThan(0);

    const hrv = await Heart.hrvAnalysis(OID, UID, 1);
    expect(hrv.hasData).toBe(true);
    expect(hrv.sampleCount).toBe(8);
    expect(hrv.sdnnMs).toBe(r.hrv!.sdnnMs);
    expect(hrv.meanHeartRateBpm).toBeCloseTo(60000 / hrv.meanRrMs!, 0);
  });

  it("a single interval cannot produce variability statistics", async () => {
    await Heart.quickMeasure(OID, UID, { rrIntervalsMs: [800] });
    const hrv = await Heart.hrvAnalysis(OID, UID, 1);
    expect(hrv.sampleCount).toBe(1);
    expect(hrv.sdnnMs).toBeNull();
    expect(hrv.rmssdMs).toBeNull();
  });
});

describe("heart center — Fifth Standing Rule on every write path", () => {
  it("a manual quick measure cannot claim a clinical label", async () => {
    const r = await Heart.quickMeasure(OID, UID, {
      heartRateBpm: 80, systolic: 120, diastolic: 80,
      source: "manual", // note: provenance gate ignores any caller claim via addMetric
    });
    for (const m of r.recorded) expect(m.label).toBe("wellness_estimate");
  });

  it("a BP-monitor reading carries the clinical label", async () => {
    const reading = await Heart.addBloodPressure(OID, UID, {
      systolic: 118, diastolic: 76, pulseBpm: 64, source: "bp_monitor",
    });
    expect(reading.label).toBe("clinically_validated");
  });

  it("every derived report stays wellness_estimate even from clinical inputs", async () => {
    await Heart.addBloodPressure(OID, UID, { systolic: 120, diastolic: 80, source: "bp_monitor" });
    await Heart.quickMeasure(OID, UID, { heartRateBpm: 70, source: "ecg_monitor" });
    const r = await Heart.generateReport(OID, UID, "heart_scan");
    expect(r.hasData).toBe(true);
    expect(r.label).toBe("wellness_estimate");
  });
});

describe("heart center — blood pressure arithmetic and pairing", () => {
  it("computes MAP and pulse pressure from the recorded pair", async () => {
    const reading = await Heart.addBloodPressure(OID, UID, {
      systolic: 120, diastolic: 80, source: "manual",
    });
    // MAP = 80 + (120-80)/3 = 93.3 ; PP = 40
    expect(reading.map).toBeCloseTo(93.3, 1);
    expect(reading.pulsePressure).toBe(40);
  });

  it("pairs systolic/diastolic recorded together and averages the history", async () => {
    await Heart.addBloodPressure(OID, UID, { systolic: 120, diastolic: 80, source: "manual" });
    await Heart.addBloodPressure(OID, UID, { systolic: 140, diastolic: 95, source: "manual" });
    const bp = await Heart.bloodPressure(OID, UID);
    expect(bp.totalReadings).toBe(2);
    expect(bp.latest!.systolic).toBe(140);
    expect(bp.avgSystolic).toBe(130);
    expect(bp.observations.some((o) => o.includes("140 mmHg"))).toBe(true);
  });

  it("unpaired systolic metrics do not fabricate readings", async () => {
    await Svc.addMetric(OID, UID, { kind: "bp_systolic", value: 130, unit: "mmHg", source: "manual" });
    const bp = await Heart.bloodPressure(OID, UID);
    expect(bp.totalReadings).toBe(0);
    expect(bp.latest).toBeNull();
  });
});

describe("heart center — pulse statistics", () => {
  it("aggregates min/max/avg over recorded heart-rate metrics", async () => {
    for (const bpm of [60, 72, 96, 84]) {
      await Heart.quickMeasure(OID, UID, { heartRateBpm: bpm });
    }
    const p = await Heart.pulseStats(OID, UID);
    expect(p.count).toBe(4);
    expect(p.minBpm).toBe(60);
    expect(p.maxBpm).toBe(96);
    expect(p.avgBpm).toBe(78);
    expect(p.latestBpm).toBe(84);
  });
});

describe("heart center — scans compile recorded data only", () => {  it("a heart scan reflects recorded pulse/BP/HRV with per-section basis counts", async () => {
    await Heart.quickMeasure(OID, UID, { heartRateBpm: 68, source: "wearable" });
    await Heart.addBloodPressure(OID, UID, { systolic: 120, diastolic: 78, source: "bp_monitor" });
    const r = await Heart.generateReport(OID, UID, "heart_scan");
    expect(r.hasData).toBe(true);
    const pulse = r.sections.find((s) => s.title === "Pulse")!;
    expect(pulse.status).toBe("ok");
    expect(pulse.basisReadings).toBe(1);
    expect(pulse.text).toContain("68 bpm");
    const bpSec = r.sections.find((s) => s.title === "Blood Pressure")!;
    expect(bpSec.text).toContain("120/78");
  });

  it("a kidney scan without kidney labs says so honestly", async () => {
    await Heart.quickMeasure(OID, UID, { heartRateBpm: 70 });
    const r = await Heart.generateReport(OID, UID, "kidney_scan");
    const labs = r.sections.find((s) => s.title === "Kidney Function Labs")!;
    expect(labs.status).toBe("empty");
    expect(labs.text).toMatch(/no kidney-related lab values/i);
  });

  it("a kidney scan reports recorded eGFR/creatinine as recorded, without interpretation", async () => {
    await Svc.addMetric(OID, UID, { kind: "egfr", value: 92, unit: "mL/min/1.73m²", source: "ehr", label: "clinically_validated" });
    await Svc.addMetric(OID, UID, { kind: "creatinine", value: 0.9, unit: "mg/dL", source: "ehr", label: "clinically_validated" });
    const r = await Heart.generateReport(OID, UID, "kidney_scan");
    const labs = r.sections.find((s) => s.title === "Kidney Function Labs")!;
    expect(labs.status).toBe("ok");
    expect(labs.text).toContain("92");
    expect(labs.text).toContain("0.9");
    expect(labs.text).toContain("no interpretation");
  });

  it("reports persist per user and are retrievable", async () => {
    const r = await Heart.generateReport(OID, UID, "health_scan");
    const listed = await Heart.listReports(OID, UID);
    expect(listed).toHaveLength(1);
    const got = await Heart.getReport(OID, UID, r.id);
    expect(got?.id).toBe(r.id);
    expect(await Heart.getReport(OID, UID, "hr-missing")).toBeNull();
  });
});

describe("heart center — tenant/user isolation", () => {
  it("heart data does not leak across orgs or users", async () => {
    await Heart.quickMeasure(OID, UID, { heartRateBpm: 75 });
    const otherOrg = await Heart.heartData(OTHER_ORG, UID);
    const otherUser = await Heart.heartData(OID, OTHER_UID);
    expect(otherOrg.hasData).toBe(false);
    expect(otherUser.hasData).toBe(false);
    const own = await Heart.heartData(OID, UID);
    expect(own.hasData).toBe(true);
  });

  it("reports do not leak across users", async () => {
    await Heart.generateReport(OID, UID, "heart_scan");
    const other = await Heart.listReports(OID, OTHER_UID);
    expect(other).toHaveLength(0);
  });
});

describe("heart center — complete Health Scan (Session 204)", () => {
  it("covers the whole recorded-health surface", async () => {
    const r = await Heart.generateReport(OID, UID, "health_scan");
    const titles = r.sections.map((s) => s.title);
    const expected = [
      "Pulse", "Resting Heart Rate", "Heart Rate Variability", "Blood Pressure", "ECG / Rhythm Context",
      "Kidney Function Labs", "Blood Pressure (kidney-relevant)",
      "Sleep", "Oxygen Saturation", "Activity", "Body Composition",
      "Blood Glucose & HbA1c", "Body Temperature", "Respiratory Rate", "Stress", "Hydration", "Cardio Fitness (VO2 max)",
    ];
    for (const t of expected) expect(titles).toContain(t);
    // summary always last
    expect(r.sections[r.sections.length - 1]!.title).toBe("Scan Summary");
  });

  it("reports recorded glucose and temperature values verbatim", async () => {
    await Svc.addMetric(OID, UID, { kind: "glucose", value: 95, unit: "mg/dL", source: "manual" });
    await Svc.addMetric(OID, UID, { kind: "temperature", value: 36.8, unit: "°C", source: "manual" });
    const r = await Heart.generateReport(OID, UID, "health_scan");
    const glu = r.sections.find((s) => s.title === "Blood Glucose & HbA1c")!;
    expect(glu.status).toBe("ok");
    expect(glu.text).toContain("95");
    const temp = r.sections.find((s) => s.title === "Body Temperature")!;
    expect(temp.status).toBe("ok");
    expect(temp.text).toContain("36.8");
  });

  it("domains without recordings stay honest 'empty' sections", async () => {
    await Svc.addMetric(OID, UID, { kind: "glucose", value: 95, unit: "mg/dL", source: "manual" });
    const r = await Heart.generateReport(OID, UID, "health_scan");
    expect(r.sections.find((s) => s.title === "Hydration")!.status).toBe("empty");
    expect(r.sections.find((s) => s.title === "Hydration")!.text).toMatch(/no hydration recordings/i);
  });

  it("Scan Summary counts are consistent with the section list", async () => {
    await Heart.quickMeasure(OID, UID, { heartRateBpm: 70 });
    await Svc.addMetric(OID, UID, { kind: "sleep", value: 420, unit: "min", source: "manual" });
    const r = await Heart.generateReport(OID, UID, "health_scan");
    const domains = r.sections.slice(0, -1);
    const summary = r.sections[r.sections.length - 1]!;
    const withData = domains.filter((s) => s.status !== "empty").length;
    const readings = domains.reduce((a, s) => a + s.basisReadings, 0);
    expect(summary.basisReadings).toBe(readings);
    expect(summary.text).toContain(`${withData} of ${domains.length}`);
  });

  it("an empty Health Scan summary says so honestly", async () => {
    const r = await Heart.generateReport(OID, UID, "health_scan");
    const summary = r.sections[r.sections.length - 1]!;
    expect(summary.status).toBe("empty");
    expect(summary.text).toMatch(/no health domains have recorded data/i);
  });
});
