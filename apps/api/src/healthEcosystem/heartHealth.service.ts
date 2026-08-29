/** Session 200 — Heart Center: AI-Powered Heart Reports & Scans.
 *
 * Adds the heart-health suite to the Session 75 ecosystem:
 *   Your Heart Data · HRV Analysis · Heart Rate Monitor · Quick Heart Measure ·
 *   Track Blood Pressure · Pulse Statistics · Heart / Kidney / Health Scans
 *
 * ── SAME RECORD-ONLY RULES AS healthEcosystem.service.ts ─────────────
 * This service is an *analysis and convenience* layer over recorded metrics.
 * It writes exclusively through HealthEcosystemService.addMetric (so the Fifth
 * Standing Rule provenance gate applies to every write) and computes every
 * statistic arithmetically from what was actually recorded:
 *
 *   - no fabricated heart rates, RR intervals, BP pairs or scan findings
 *   - HRV is time-domain math (SDNN / RMSSD / pNN50) over submitted intervals
 *   - MAP and pulse pressure are arithmetic on a recorded systolic/diastolic pair
 *   - "scans" are deterministic report compilations over recorded data; with no
 *     data every section reads "no … recorded" instead of inventing findings
 *   - all derived output is labeled wellness_estimate, never a clinical label
 *
 * Redis keys (per organization/user), reusing the Session 75 namespace:
 *   hec:metrics:{oid}:{uid}        — shared metric stream (read/write via Svc)
 *   hec:heart-reports:{oid}:{uid}  — saved AI-powered heart/scan reports
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { HealthEcosystemService } from "./healthEcosystem.service.js";
import {
  HEART_METRIC_KINDS, HEART_SCAN_KINDS, HEALTH_DISCLAIMER,
  type HeartDataSnapshot, type HrvAnalysis, type HeartMonitorFeed,
  type QuickHeartMeasureInput, type QuickHeartMeasureResult,
  type BloodPressureReading, type BloodPressureSummary, type PulseStats,
  type HeartReport, type HeartScanKind, type MetricKind, type MetricSource,
  type HealthLabel, type HealthMetric,
} from "@windels/shared";

const REPORTS_KEY = (o: string, u: string) => `hec:heart-reports:${o}:${u}`;
const uid = (p: string) => p + randomUUID().slice(0, 10);
const now = () => new Date().toISOString();

// ── local redis list helpers (same shape as healthEcosystem.service.ts) ──
async function lprepush<T>(key: string, item: T, cap = 50) {
  await redis.lpush(key, JSON.stringify(item));
  await redis.ltrim(key, 0, cap - 1);
}
async function lall<T>(key: string): Promise<T[]> {
  const raw = await redis.lrange(key, 0, -1);
  const out: T[] = [];
  for (const r of raw) try { out.push(JSON.parse(r) as T); } catch { /* skip */ }
  return out;
}

// ── small math helpers ────────────────────────────────────────────────
const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const inWindow = (m: HealthMetric, days: number) =>
  Date.now() - new Date(m.at).getTime() < days * 86_400_000;
function valuesOf(metrics: HealthMetric[], kind: MetricKind, days?: number): number[] {
  return metrics.filter((m) => m.kind === kind && (days === undefined || inWindow(m, days))).map((m) => m.value);
}

/** Population standard deviation. */
function stddev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = avg(xs)!;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

/** Time-domain HRV over an ordered RR/NN series (ms). */
export function computeHrvSeries(rr: number[]) {
  const meanRrMs = avg(rr)!;
  const sdnnMs = stddev(rr);
  const diffs: number[] = [];
  for (let i = 1; i < rr.length; i++) diffs.push(rr[i] - rr[i - 1]);
  const rmssdMs = diffs.length ? Math.sqrt(diffs.reduce((a, d) => a + d * d, 0) / diffs.length) : null;
  const pnn50Pct = diffs.length
    ? round1((diffs.filter((d) => Math.abs(d) > 50).length / diffs.length) * 100)
    : null;
  return { meanRrMs: round1(meanRrMs), sdnnMs: sdnnMs === null ? null : round1(sdnnMs), rmssdMs: rmssdMs === null ? null : round1(rmssdMs), pnn50Pct };
}

/** AHA reference bands — used only to describe where a recorded pair sits. */
function bpBand(sys: number, dia: number): string {
  if (sys >= 180 || dia >= 120) return "crisis band (≥180 or ≥120)";
  if (sys >= 140 || dia >= 90) return "stage 2 band (140–159/90–99 or higher)";
  if (sys >= 130 || dia >= 80) return "stage 1 band (130–139/80–89)";
  if (sys >= 120 && dia < 80) return "elevated band (120–129/<80)";
  return "normal band (<120/<80)";
}

async function allMetrics(oid: string, userId: string): Promise<HealthMetric[]> {
  return HealthEcosystemService.listMetrics(oid, userId, undefined, 500);
}

// ── public service ───────────────────────────────────────────────────
export const HeartHealthService = {

  /** "Your Heart Data" — heart-domain metrics for this user, honestly empty. */
  async heartData(oid: string, userId: string): Promise<HeartDataSnapshot> {
    const metrics = (await allMetrics(oid, userId))
      .filter((m) => (HEART_METRIC_KINDS as readonly string[]).includes(m.kind));
    const counts = Object.fromEntries(HEART_METRIC_KINDS.map((k) => [k, 0])) as HeartDataSnapshot["counts"];
    const latest: HeartDataSnapshot["latest"] = {};
    for (const m of metrics) {
      const k = m.kind as keyof HeartDataSnapshot["counts"];
      counts[k] = (counts[k] ?? 0) + 1;
    }
    // metrics arrive newest-first, so the first hit per kind is the latest
    for (const k of HEART_METRIC_KINDS) {
      const m = metrics.find((x) => x.kind === k);
      if (m) latest[k] = { value: m.value, unit: m.unit, at: m.at, label: m.label };
    }
    return { counts, latest, recent: metrics.slice(0, 50), totalRecorded: metrics.length, hasData: metrics.length > 0 };
  },

  /** Heart Rate Variability Analysis — time-domain math over recorded RR intervals. */
  async hrvAnalysis(oid: string, userId: string, days = 7): Promise<HrvAnalysis> {
    const d = Math.max(1, Math.min(90, Math.round(days)));
    const metrics = await allMetrics(oid, userId);
    const rr = metrics
      .filter((m) => m.kind === "rr_interval" && inWindow(m, d))
      .map((m) => ({ at: m.at, v: m.value }))
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .map((x) => x.v);
    const deviceSdnn = avg(valuesOf(metrics, "hrv_sdnn"));
    const deviceRmssd = avg(valuesOf(metrics, "hrv_rmssd"));
    const hasData = rr.length > 0 || deviceSdnn !== null || deviceRmssd !== null;

    if (!rr.length) {
      return {
        windowDays: d, sampleCount: 0,
        meanRrMs: null, sdnnMs: null, rmssdMs: null, pnn50Pct: null, meanHeartRateBpm: null,
        deviceAvgSdnnMs: deviceSdnn === null ? null : round1(deviceSdnn),
        deviceAvgRmssdMs: deviceRmssd === null ? null : round1(deviceRmssd),
        label: "wellness_estimate", hasData,
      };
    }
    const hrv = computeHrvSeries(rr);
    return {
      windowDays: d,
      sampleCount: rr.length,
      meanRrMs: hrv.meanRrMs,
      sdnnMs: hrv.sdnnMs,
      rmssdMs: hrv.rmssdMs,
      pnn50Pct: hrv.pnn50Pct,
      meanHeartRateBpm: round1(60_000 / hrv.meanRrMs),
      deviceAvgSdnnMs: deviceSdnn === null ? null : round1(deviceSdnn),
      deviceAvgRmssdMs: deviceRmssd === null ? null : round1(deviceRmssd),
      label: "wellness_estimate",
      hasData: true,
    };
  },

  /** Heart Rate Monitor feed — recorded heart-rate stream + 24h aggregates. */
  async monitorFeed(oid: string, userId: string, limit = 60): Promise<HeartMonitorFeed> {
    const metrics = await allMetrics(oid, userId);
    const hr = metrics.filter((m) => m.kind === "heart_rate");
    const hr24 = hr.filter((m) => inWindow(m, 1)).map((m) => m.value);
    const resting = avg(valuesOf(metrics, "resting_hr", 30));
    return {
      latestBpm: hr[0]?.value ?? null,
      latestAt: hr[0]?.at ?? null,
      min24hBpm: hr24.length ? Math.min(...hr24) : null,
      max24hBpm: hr24.length ? Math.max(...hr24) : null,
      avg24hBpm: hr24.length ? round1(avg(hr24)!) : null,
      restingAvgBpm: resting === null ? null : round1(resting),
      readings: hr.slice(0, Math.max(1, Math.min(200, limit))),
      hasData: hr.length > 0,
    };
  },

  /**
   * Quick Heart Measure — record whatever was just measured (HR, a BP pair,
   * and/or an RR-interval sample) in one call. Writes go through
   * HealthEcosystemService.addMetric so label provenance is enforced.
   */
  async quickMeasure(oid: string, userId: string, input: QuickHeartMeasureInput): Promise<QuickHeartMeasureResult> {
    const source = (input.source ?? "manual") as MetricSource;
    const at = input.at ?? now();
    const note = input.note;
    // Device sources may carry a clinical label; manual/phone entries cannot.
    const requested: HealthLabel | undefined =
      ["medical_device", "bp_monitor", "ecg_monitor", "ehr"].includes(source)
        ? "clinically_validated"
        : undefined;

    const recorded: HealthMetric[] = [];
    if (input.heartRateBpm !== undefined) {
      recorded.push(await HealthEcosystemService.addMetric(oid, userId, {
        kind: "heart_rate", value: input.heartRateBpm, unit: "bpm", at, source, label: requested, note,
      }));
    }
    if (input.systolic !== undefined && input.diastolic !== undefined) {
      recorded.push(await HealthEcosystemService.addMetric(oid, userId, {
        kind: "bp_systolic", value: input.systolic, unit: "mmHg", at, source, label: requested, note,
      }));
      recorded.push(await HealthEcosystemService.addMetric(oid, userId, {
        kind: "bp_diastolic", value: input.diastolic, unit: "mmHg", at, source, label: requested, note,
      }));
    }
    if (input.rrIntervalsMs?.length) {
      for (const rr of input.rrIntervalsMs) {
        await HealthEcosystemService.addMetric(oid, userId, {
          kind: "rr_interval", value: rr, unit: "ms", at, source, note,
        });
      }
      // Persist the derived sample stats so they surface in dashboard aggregates.
      const hrv = computeHrvSeries(input.rrIntervalsMs);
      if (hrv.sdnnMs !== null) {
        await HealthEcosystemService.addMetric(oid, userId, {
          kind: "hrv_sdnn", value: hrv.sdnnMs, unit: "ms", at, source: "manual",
          note: note ?? "derived from submitted RR sample",
        });
      }
      if (hrv.rmssdMs !== null) {
        await HealthEcosystemService.addMetric(oid, userId, {
          kind: "hrv_rmssd", value: hrv.rmssdMs, unit: "ms", at, source: "manual",
          note: note ?? "derived from submitted RR sample",
        });
      }
      return { recorded, hrv: { ...hrv, sampleCount: input.rrIntervalsMs.length }, label: "wellness_estimate" };
    }
    return { recorded, hrv: null, label: "wellness_estimate" };
  },

  /** Track Blood Pressure — record a systolic/diastolic pair (+ optional pulse). */
  async addBloodPressure(
    oid: string, userId: string,
    input: { systolic: number; diastolic: number; pulseBpm?: number; source?: MetricSource; at?: string; note?: string },
  ): Promise<BloodPressureReading> {
    const r = await this.quickMeasure(oid, userId, {
      systolic: input.systolic, diastolic: input.diastolic,
      heartRateBpm: input.pulseBpm, source: input.source, at: input.at, note: input.note,
    });
    const sys = r.recorded.find((m) => m.kind === "bp_systolic")!;
    return {
      at: sys.at,
      systolic: input.systolic,
      diastolic: input.diastolic,
      pulseBpm: input.pulseBpm,
      map: round1(input.diastolic + (input.systolic - input.diastolic) / 3),
      pulsePressure: input.systolic - input.diastolic,
      source: sys.source,
      label: sys.label,
    };
  },

  /** Blood-pressure summary — pairs recorded at identical timestamps. */
  async bloodPressure(oid: string, userId: string): Promise<BloodPressureSummary> {
    const metrics = await allMetrics(oid, userId);
    const sys = metrics.filter((m) => m.kind === "bp_systolic");
    const dias = metrics.filter((m) => m.kind === "bp_diastolic");
    const pulseByAt = new Map(metrics.filter((m) => m.kind === "heart_rate").map((m) => [m.at, m.value]));

    // Pair each systolic with a diastolic recorded at the same instant.
    const readings: BloodPressureReading[] = [];
    const usedDia = new Set<string>();
    for (const s of sys) {
      const d = dias.find((x) => x.at === s.at && x.source === s.source && !usedDia.has(x.id));
      if (!d) continue;
      usedDia.add(d.id);
      const pulse = pulseByAt.get(s.at);
      readings.push({
        at: s.at, systolic: s.value, diastolic: d.value,
        pulseBpm: pulse,
        map: round1(d.value + (s.value - d.value) / 3),
        pulsePressure: s.value - d.value,
        source: s.source, label: s.label,
      });
    }

    const sysAll = sys.map((m) => m.value);
    const diaAll = dias.map((m) => m.value);
    const sys7 = valuesOf(metrics, "bp_systolic", 7);
    const dia7 = valuesOf(metrics, "bp_diastolic", 7);
    const maps = readings.map((r) => r.map);
    const pps = readings.map((r) => r.pulsePressure);

    const observations: string[] = [];
    if (readings.length) {
      const l = readings[0];
      observations.push(`Latest recorded pair ${l.systolic}/${l.diastolic} mmHg sits in the ${bpBand(l.systolic, l.diastolic)} (AHA reference bands — informational, not a diagnosis).`);
      const sysHigh = sys.filter((m) => m.value >= 140 && inWindow(m, 30)).length;
      const diaHigh = dias.filter((m) => m.value >= 90 && inWindow(m, 30)).length;
      const sys30 = sys.filter((m) => inWindow(m, 30)).length;
      if (sys30 > 0 && sysHigh > 0) observations.push(`${sysHigh} of ${sys30} systolic readings in the last 30 days were at or above 140 mmHg.`);
      if (diaHigh > 0) observations.push(`${diaHigh} diastolic readings in the last 30 days were at or above 90 mmHg.`);
    }

    return {
      totalReadings: readings.length,
      latest: readings[0] ?? null,
      readings: readings.slice(0, 60),
      avgSystolic: sysAll.length ? round1(avg(sysAll)!) : null,
      avgDiastolic: diaAll.length ? round1(avg(diaAll)!) : null,
      avgSystolic7d: sys7.length ? round1(avg(sys7)!) : null,
      avgDiastolic7d: dia7.length ? round1(avg(dia7)!) : null,
      avgMap: maps.length ? round1(avg(maps)!) : null,
      avgPulsePressure: pps.length ? round1(avg(pps)!) : null,
      latestBand: readings.length ? bpBand(readings[0].systolic, readings[0].diastolic) : null,
      observations,
      hasData: readings.length > 0,
    };
  },

  /** Pulse Statistics — aggregate arithmetic over recorded pulse metrics. */
  async pulseStats(oid: string, userId: string): Promise<PulseStats> {
    const metrics = await allMetrics(oid, userId);
    const pulse = metrics.filter((m) => m.kind === "heart_rate");
    const vals = pulse.map((m) => m.value);
    const v7 = valuesOf(metrics, "heart_rate", 7);
    const v30 = valuesOf(metrics, "heart_rate", 30);
    const resting = avg(valuesOf(metrics, "resting_hr", 30));
    const a7 = v7.length ? round1(avg(v7)!) : null;
    const a30 = v30.length ? round1(avg(v30)!) : null;
    return {
      count: pulse.length,
      latestBpm: pulse[0]?.value ?? null,
      latestAt: pulse[0]?.at ?? null,
      minBpm: vals.length ? Math.min(...vals) : null,
      maxBpm: vals.length ? Math.max(...vals) : null,
      avgBpm: vals.length ? round1(avg(vals)!) : null,
      avgBpm7d: a7,
      avgBpm30d: a30,
      restingAvgBpm: resting === null ? null : round1(resting),
      trendBpm: a7 !== null && a30 !== null ? round1(a7 - a30) : null,
      series: pulse.slice(0, 30).map((m) => ({ at: m.at, bpm: m.value })).reverse(),
      hasData: pulse.length > 0,
    };
  },

  /**
   * AI-Powered Heart Reports — compile a report (Heart Scan / Kidney Scan /
   * Health Scan) from recorded data. Deterministic: the same recorded data
   * always yields the same sections. Empty domains yield honest "empty"
   * sections rather than invented findings.
   */
  async generateReport(oid: string, userId: string, kind: HeartScanKind): Promise<HeartReport> {
    const metrics = await allMetrics(oid, userId);
    const report = compileReport(kind, metrics);
    await lprepush(REPORTS_KEY(oid, userId), report, 50);
    return report;
  },

  async listReports(oid: string, userId: string, limit = 20): Promise<HeartReport[]> {
    return (await lall<HeartReport>(REPORTS_KEY(oid, userId))).slice(0, Math.max(1, Math.min(100, limit)));
  },

  async getReport(oid: string, userId: string, id: string): Promise<HeartReport | null> {
    const all = await lall<HeartReport>(REPORTS_KEY(oid, userId));
    return all.find((r) => r.id === id) ?? null;
  },

  listScanKinds() { return HEART_SCAN_KINDS; },
};

// ── report compiler (pure, deterministic) ─────────────────────────────
function compileReport(kind: HeartScanKind, metrics: HealthMetric[]): HeartReport {
  const sections: HeartReport["sections"] = [];
  const sec = (title: string, kinds: MetricKind[], text: string, status: HeartReport["sections"][number]["status"] = "ok") => {
    const n = metrics.filter((m) => kinds.includes(m.kind)).length;
    sections.push({ title, status: n === 0 ? "empty" : status, text, basisKinds: kinds, basisReadings: n });
  };
  const nOf = (k: MetricKind) => metrics.filter((m) => m.kind === k);

  const pulse = nOf("heart_rate").map((m) => m.value);
  const resting = nOf("resting_hr").map((m) => m.value);
  const rr = nOf("rr_interval").map((m) => m.value);
  const sys = nOf("bp_systolic").map((m) => m.value);
  const dia = nOf("bp_diastolic").map((m) => m.value);

  if (kind === "heart_scan" || kind === "health_scan") {
    sec("Pulse", ["heart_rate"],
      pulse.length
        ? `Recorded pulse: latest ${nOf("heart_rate")[0].value} bpm, average ${round1(avg(pulse)!)} bpm, range ${Math.min(...pulse)}–${Math.max(...pulse)} bpm across ${pulse.length} readings.`
        : "No pulse readings recorded yet.");
    sec("Resting Heart Rate", ["resting_hr"],
      resting.length
        ? `Average recorded resting heart rate ${round1(avg(resting)!)} bpm across ${resting.length} readings.`
        : "No resting heart rate readings recorded yet.");
    sec("Heart Rate Variability", ["rr_interval", "hrv_sdnn", "hrv_rmssd", "hrv"],
      rr.length >= 2
        ? `From ${rr.length} recorded beat-to-beat intervals: SDNN ${computeHrvSeries(rr).sdnnMs} ms, RMSSD ${computeHrvSeries(rr).rmssdMs} ms (time-domain wellness estimates).`
        : rr.length === 1
          ? "Only 1 beat-to-beat interval recorded — at least 2 are needed for variability statistics."
          : nOf("hrv_sdnn").length || nOf("hrv_rmssd").length
            ? `No raw intervals recorded, but ${nOf("hrv_sdnn").length} SDNN and ${nOf("hrv_rmssd").length} RMSSD device values were recorded.`
            : "No heart-rate-variability data recorded yet.");
    const band = sys.length && dia.length ? bpBand(nOf("bp_systolic")[0].value, nOf("bp_diastolic")[0].value) : null;
    sec("Blood Pressure", ["bp_systolic", "bp_diastolic"],
      sys.length && dia.length
        ? `Latest recorded pair ${nOf("bp_systolic")[0].value}/${nOf("bp_diastolic")[0].value} mmHg (${band}); average of ${sys.length} systolic readings is ${round1(avg(sys)!)} mmHg.`
        : "No blood-pressure readings recorded yet.");
    sec("ECG / Rhythm Context", ["ecg", "afib_probability"],
      nOf("ecg").length || nOf("afib_probability").length
        ? `${nOf("ecg").length} ECG and ${nOf("afib_probability").length} AFib-probability entries recorded (as submitted; this report interprets none of them).`
        : "No ECG or rhythm recordings recorded yet.");
  }

  if (kind === "kidney_scan" || kind === "health_scan") {
    const egfr = nOf("egfr").map((m) => m.value);
    const cr = nOf("creatinine").map((m) => m.value);
    sec("Kidney Function Labs", ["egfr", "creatinine"],
      egfr.length || cr.length
        ? `Recorded eGFR: latest ${egfr.length ? nOf("egfr")[0].value : "—"} mL/min/1.73m² (${egfr.length} readings); creatinine: latest ${cr.length ? nOf("creatinine")[0].value : "—"} mg/dL (${cr.length} readings). Values are reported as recorded — no interpretation.`
        : "No kidney-related lab values (eGFR, creatinine) recorded yet. Lab results can be recorded from your reports.");
    sec("Blood Pressure (kidney-relevant)", ["bp_systolic", "bp_diastolic"],
      sys.length && dia.length
        ? `Blood pressure is kidney-relevant: latest recorded pair ${nOf("bp_systolic")[0].value}/${nOf("bp_diastolic")[0].value} mmHg across ${sys.length} readings.`
        : "No blood-pressure readings recorded yet.");
  }

  if (kind === "health_scan") {
    const sleep = nOf("sleep").map((m) => m.value);
    const spo2 = nOf("spo2").map((m) => m.value);
    const steps = nOf("steps").map((m) => m.value);
    const weight = nOf("weight").map((m) => m.value);
    sec("Sleep", ["sleep"], sleep.length ? `Average recorded sleep ${(avg(sleep)! / 60).toFixed(1)} h across ${sleep.length} entries.` : "No sleep recordings yet.");
    sec("Oxygen Saturation", ["spo2"], spo2.length ? `Latest recorded SpO₂ ${nOf("spo2")[0].value}% across ${spo2.length} readings.` : "No SpO₂ readings recorded yet.");
    sec("Activity", ["steps"], steps.length ? `Average recorded steps ${Math.round(avg(steps)!).toLocaleString()}/day across ${steps.length} entries.` : "No activity recordings yet.");
    sec("Body Composition", ["weight", "bmi", "body_fat_pct"], weight.length ? `Latest recorded weight ${nOf("weight")[0].value} kg (${weight.length} entries).` : "No weight recordings yet.");

    // Session 204 — complete the whole-health surface: metabolic, thermal,
    // respiratory and lifestyle domains, every one reported as recorded.
    const glucose = nOf("glucose").map((m) => m.value);
    const hba1c = nOf("hba1c").map((m) => m.value);
    sec("Blood Glucose & HbA1c", ["glucose", "hba1c"],
      glucose.length || hba1c.length
        ? `Latest recorded glucose ${glucose.length ? nOf("glucose")[0].value : "—"} mg/dL (${glucose.length} readings); HbA1c ${hba1c.length ? nOf("hba1c")[0].value : "—"} % (${hba1c.length} readings). Values are reported as recorded — no interpretation.`
        : "No glucose or HbA1c recordings yet.");
    const temps = [...nOf("temperature"), ...nOf("skin_temp")];
    sec("Body Temperature", ["temperature", "skin_temp"],
      temps.length
        ? `Latest recorded temperature ${nOf("temperature").length ? nOf("temperature")[0].value : nOf("skin_temp")[0].value} °C across ${temps.length} readings.`
        : "No temperature recordings yet.");
    const resp = nOf("respiratory_rate").map((m) => m.value);
    sec("Respiratory Rate", ["respiratory_rate"],
      resp.length ? `Latest recorded respiratory rate ${nOf("respiratory_rate")[0].value} breaths/min across ${resp.length} readings.` : "No respiratory-rate recordings yet.");
    const stressVals = nOf("stress").map((m) => m.value);
    sec("Stress", ["stress"],
      stressVals.length ? `Average recorded stress index ${round1(avg(stressVals)!)} across ${stressVals.length} entries.` : "No stress recordings yet.");
    const hydrationVals = nOf("hydration").map((m) => m.value);
    sec("Hydration", ["hydration"],
      hydrationVals.length ? `Average recorded hydration ${round1(avg(hydrationVals)!)}% across ${hydrationVals.length} entries.` : "No hydration recordings yet.");
    const vo2 = nOf("vo2max").map((m) => m.value);
    sec("Cardio Fitness (VO2 max)", ["vo2max"],
      vo2.length ? `Latest recorded VO2 max ${nOf("vo2max")[0].value} mL/kg/min across ${vo2.length} readings.` : "No VO2 max recordings yet.");

    // Deterministic summary of domain coverage — computed from the sections
    // above, so the same recorded data always yields the same summary.
    const domainSections = sections.slice();
    const withData = domainSections.filter((s) => s.status !== "empty").length;
    const readingsTotal = domainSections.reduce((a, s) => a + s.basisReadings, 0);
    sections.push({
      title: "Scan Summary",
      status: withData ? "ok" : "empty",
      text: withData
        ? `${withData} of ${domainSections.length} health domains have recorded data (${readingsTotal} readings analyzed). Domains without recordings are listed as "no data recorded" rather than estimated.`
        : `No health domains have recorded data yet (${domainSections.length} domains checked). Record measurements to build your Health Scan.`,
      basisKinds: [...new Set(domainSections.flatMap((s) => s.basisKinds))],
      basisReadings: readingsTotal,
    });
  }

  const inputCount = new Set(sections.flatMap((s) => s.basisKinds)).size;
  const meta = HEART_SCAN_KINDS.find((k) => k.id === kind)!;
  const relevantKinds = kind === "heart_scan"
    ? (["heart_rate", "resting_hr", "rr_interval", "hrv_sdnn", "hrv_rmssd", "hrv", "bp_systolic", "bp_diastolic", "ecg", "afib_probability"] as MetricKind[])
    : kind === "kidney_scan"
      ? (["egfr", "creatinine", "bp_systolic", "bp_diastolic"] as MetricKind[])
      : metrics.map((m) => m.kind);
  const hasData = metrics.some((m) => relevantKinds.includes(m.kind));

  return {
    id: uid("hr-"),
    kind,
    title: kind === "heart_scan" ? "AI-Powered Heart Report" : `${meta.name} Report`,
    generatedAt: now(),
    sections,
    inputMetricCount: inputCount,
    label: "wellness_estimate",
    disclaimer: HEALTH_DISCLAIMER,
    hasData,
  };
}
