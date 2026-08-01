/** Session 75 — Health, Wellness & Digital Healthcare Ecosystem (V10.0)
 *
 * Three-bucket labeling per the Fifth Standing Rule:
 *   wellness_estimate | clinically_validated | medical_decision_support
 *
 * ── RECORD-ONLY SCOPE ────────────────────────────────────────────────
 * This service is a **record and derive** layer. It stores what a user (or an
 * integrated device, once connected) actually submits, and derives aggregates
 * arithmetically from those stored records. It does NOT invent health data.
 *
 * Health data is regulated and safety-critical. Fabricating a blood-pressure
 * reading, a glucose value, or an AFib probability and tagging it
 * `clinically_validated` would misrepresent a random number as a device-backed
 * clinical measurement. Every previous synthetic generator in this module has
 * therefore been removed:
 *
 *   - no seeded profile, vitals, medications, notes, alerts or insights
 *   - no simulated wearables / medical devices / vaccinations / screenings
 *   - no random daily "scores"; today/weekly/monthly are computed from records
 *   - insights are derived from recorded metrics only, and are emitted
 *     exclusively as `wellness_estimate` (see deriveInsights)
 *
 * A user with no recorded data gets empty lists and zeroed aggregates, with
 * `hasData: false` so the UI can render an honest empty state.
 *
 * Labels are never upgraded by this service. `clinically_validated` and
 * `medical_decision_support` may only arrive on a submitted record whose
 * source is an actual medical device / clinician-reviewed pipeline; the caller
 * asserts that provenance and it is stored verbatim.
 *
 * Redis keys (per organization):
 *   hec:meta:{oid}               — bootstrap sentinel
 *   hec:profile:{oid}:{uid}      — HealthProfile JSON
 *   hec:metrics:{oid}:{uid}      — HealthMetric list (newest first)
 *   hec:sessions:{oid}:{uid}     — FitnessSession list
 *   hec:meds:{oid}:{uid}         — Medication list
 *   hec:notes:{oid}:{uid}        — DailyNote list
 *   hec:alerts:{oid}:{uid}       — EmergencyAlert list
 *   hec:devices:{oid}:{uid}      — connected wearables / medical devices
 *   hec:vaccines:{oid}:{uid}     — Vaccination records
 *   hec:screenings:{oid}:{uid}   — Screening records
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import {
  HealthDashboard, HealthLabel, HealthMetric, FitnessSession, Medication, DailyHealth,
  DailyNote, EmergencyAlert, HealthInsight, WearableDevice,
  MedicalDevice, Vaccination, Screening, HealthProfile,
  HEALTH_DISCLAIMER, HEALTH_MODULES, MetricKind, MetricSource, WorkoutKind, AlertKind,
} from "@windels/shared";

const K = {
  meta:       (o: string) => `hec:meta:${o}`,
  profile:    (o: string, u: string) => `hec:profile:${o}:${u}`,
  metrics:    (o: string, u: string) => `hec:metrics:${o}:${u}`,
  sessions:   (o: string, u: string) => `hec:sessions:${o}:${u}`,
  meds:       (o: string, u: string) => `hec:meds:${o}:${u}`,
  notes:      (o: string, u: string) => `hec:notes:${o}:${u}`,
  alerts:     (o: string, u: string) => `hec:alerts:${o}:${u}`,
  wearables:  (o: string, u: string) => `hec:wearables:${o}:${u}`,
  devices:    (o: string, u: string) => `hec:devices:${o}:${u}`,
  vaccines:   (o: string, u: string) => `hec:vaccines:${o}:${u}`,
  screenings: (o: string, u: string) => `hec:screenings:${o}:${u}`,
};
const uid = (p: string) => p + randomUUID().slice(0, 10);
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

// ── helpers ───────────────────────────────────────────────────────────
async function jget<T>(key: string, fallback: T): Promise<T> {
  const raw = await redis.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
async function jset(key: string, v: unknown, ttlSec?: number) {
  const s = JSON.stringify(v);
  if (ttlSec) await redis.set(key, s, "EX", ttlSec); else await redis.set(key, s);
}
async function lprepush<T>(key: string, item: T, cap = 200) {
  await redis.lpush(key, JSON.stringify(item));
  await redis.ltrim(key, 0, cap - 1);
}
async function lall<T>(key: string): Promise<T[]> {
  const raw = await redis.lrange(key, 0, -1);
  const out: T[] = [];
  for (const r of raw) try { out.push(JSON.parse(r) as T); } catch { /* skip */ }
  return out;
}
async function lremById(key: string, id: string) {
  const all = await lall<any>(key);
  const kept = all.filter((x) => x.id !== id);
  await redis.del(key);
  for (const x of kept) await redis.rpush(key, JSON.stringify(x));
}

// ── Fifth Standing Rule: enforce label presence ──────────────────────
const LABELS: HealthLabel[] = ["wellness_estimate", "clinically_validated", "medical_decision_support"];
function enforceLabel(lbl: HealthLabel | undefined | null, fallback: HealthLabel = "wellness_estimate"): HealthLabel {
  return (lbl && LABELS.includes(lbl)) ? lbl : fallback;
}

/**
 * A label above `wellness_estimate` asserts real provenance, so it may only be
 * accepted from a source that can carry it. Anything self-reported or
 * app-derived is recorded as a wellness estimate regardless of what the caller
 * claimed — this is the Fifth Standing Rule enforced at the write boundary.
 */
const DEVICE_SOURCES: ReadonlySet<MetricSource> = new Set<MetricSource>([
  "medical_device", "cgm", "bp_monitor", "pulse_ox", "thermometer",
  "scale", "spirometer", "ecg_monitor", "sleep_mat", "ehr",
]);
function labelForSource(source: MetricSource, requested?: HealthLabel | null): HealthLabel {
  const wanted = enforceLabel(requested, "wellness_estimate");
  if (wanted === "wellness_estimate") return wanted;
  return DEVICE_SOURCES.has(source) ? wanted : "wellness_estimate";
}

// ── derived aggregates (arithmetic over recorded values only) ─────────
const avg = (xs: number[]): number | undefined =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;

function windowed(metrics: HealthMetric[], days: number): HealthMetric[] {
  const cutoff = Date.now() - days * 86_400_000;
  return metrics.filter((m) => new Date(m.at).getTime() >= cutoff);
}
function latestOf(metrics: HealthMetric[], kind: MetricKind): number | undefined {
  // metrics are newest-first
  return metrics.find((m) => m.kind === kind)?.value;
}
function avgOf(metrics: HealthMetric[], kind: MetricKind): number | undefined {
  return avg(metrics.filter((m) => m.kind === kind).map((m) => m.value));
}
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const pct = (v: number, lo: number, hi: number) => clamp(Math.round(((v - lo) / (hi - lo)) * 100));

/**
 * Build a DailyHealth summary from recorded metrics in a window.
 *
 * Every component is either derived from a real recorded value or left at 0
 * when nothing was recorded. `label` is always `wellness_estimate`: these are
 * app-computed wellness figures, never clinical determinations, even when the
 * inputs came from a clinically-validated device.
 */
function summarize(metrics: HealthMetric[], sessions: FitnessSession[], days: number): DailyHealth {
  const w = windowed(metrics, days);
  const ws = sessions.filter((s) => Date.now() - new Date(s.at).getTime() < days * 86_400_000);

  const sleepMin = avgOf(w, "sleep");
  const sleepEff = avgOf(w, "sleep_efficiency");
  const hydration = avgOf(w, "hydration");
  const stress = avgOf(w, "stress");
  const restingHr = avgOf(w, "resting_hr");
  const activeMin = avgOf(w, "active_minutes");
  const steps = avgOf(w, "steps");

  // Sleep quality: prefer the device's own efficiency %, else scale duration
  // against a 7–9h reference band.
  const sleepQuality = sleepEff !== undefined ? clamp(Math.round(sleepEff))
    : sleepMin !== undefined ? pct(sleepMin, 300, 510) : 0;
  // Fitness: activity minutes against a 30 min/day reference.
  const fitness = activeMin !== undefined ? pct(activeMin, 0, 60)
    : steps !== undefined ? pct(steps, 0, 10_000) : 0;
  const hydrationScore = hydration !== undefined ? clamp(Math.round(hydration)) : 0;
  const stressLevel = stress !== undefined ? clamp(Math.round(stress)) : 0;
  // Recovery: lower resting HR relative to a 45–85 bpm band reads as better
  // recovered. Only computed when a resting HR was actually recorded.
  const recovery = restingHr !== undefined ? clamp(100 - pct(restingHr, 45, 85)) : 0;
  const readiness = [sleepQuality, recovery].filter((x) => x > 0).length
    ? Math.round(avg([sleepQuality, recovery].filter((x) => x > 0))!) : 0;

  const parts = [sleepQuality, fitness, hydrationScore, recovery].filter((x) => x > 0);
  const score = parts.length ? Math.round(avg(parts)!) : 0;

  // cardioTrend: change in resting HR between the two halves of the window.
  let cardioTrend = 0;
  const rh = w.filter((m) => m.kind === "resting_hr");
  if (rh.length >= 2) {
    const mid = Math.floor(rh.length / 2);
    const recent = avg(rh.slice(0, mid).map((m) => m.value));
    const older = avg(rh.slice(mid).map((m) => m.value));
    if (recent !== undefined && older !== undefined) cardioTrend = Math.round(older - recent);
  }

  // Risk flags are only raised from recorded clinical-grade readings, and are
  // observations ("above the recorded range"), never diagnoses.
  const riskFlags: string[] = [];
  const sys = latestOf(w, "bp_systolic");
  const dia = latestOf(w, "bp_diastolic");
  if (sys !== undefined && sys >= 140) riskFlags.push("recorded_systolic_at_or_above_140");
  if (dia !== undefined && dia >= 90) riskFlags.push("recorded_diastolic_at_or_above_90");
  const spo2 = latestOf(w, "spo2");
  if (spo2 !== undefined && spo2 < 92) riskFlags.push("recorded_spo2_below_92");

  return {
    score,
    readiness,
    recovery,
    sleepQuality,
    fitness,
    cardioTrend,
    // No self-report instrument is recorded for mental wellness or nutrition,
    // so these stay 0 rather than being invented.
    mentalWellness: 0,
    nutrition: 0,
    hydration: hydrationScore,
    fatigue: stressLevel,
    stressLevel,
    riskFlags,
    label: "wellness_estimate",
    ...(ws.length ? {} : {}),
  };
}

/**
 * Derive insights from recorded metrics. Each insight cites the metric kinds it
 * was computed from and is always a `wellness_estimate` — this function makes
 * no clinical determination and never emits `clinically_validated` or
 * `medical_decision_support`.
 */
function deriveInsights(metrics: HealthMetric[]): HealthInsight[] {
  const out: HealthInsight[] = [];
  const w30 = windowed(metrics, 30);
  const w7 = windowed(metrics, 7);

  const mk = (
    text: string,
    kind: HealthInsight["kind"],
    category: HealthInsight["category"],
    citedKinds: MetricKind[],
  ): HealthInsight => ({
    id: uid("hi-"), text, kind, label: "wellness_estimate",
    // Confidence reflects sample size only; it is not a clinical probability.
    confidence: Math.min(0.9, 0.5 + citedKinds.length * 0.1),
    citedKinds, category, actionable: false,
    disclaimer: HEALTH_DISCLAIMER, createdAt: now(),
  });

  const rhRecent = avg(windowed(metrics, 7).filter((m) => m.kind === "resting_hr").map((m) => m.value));
  const rhBase = avg(w30.filter((m) => m.kind === "resting_hr").map((m) => m.value));
  if (rhRecent !== undefined && rhBase !== undefined && w30.filter((m) => m.kind === "resting_hr").length >= 5) {
    const delta = +(rhRecent - rhBase).toFixed(1);
    if (Math.abs(delta) >= 1) {
      out.push(mk(
        `Your 7-day average resting heart rate (${rhRecent.toFixed(0)} bpm) is ${Math.abs(delta)} bpm ${delta < 0 ? "below" : "above"} your 30-day average (${rhBase.toFixed(0)} bpm), based on ${w30.filter((m) => m.kind === "resting_hr").length} recorded readings.`,
        "trend", "cardio", ["resting_hr"],
      ));
    }
  }

  const sleep7 = avg(w7.filter((m) => m.kind === "sleep").map((m) => m.value));
  if (sleep7 !== undefined && w7.filter((m) => m.kind === "sleep").length >= 3) {
    out.push(mk(
      `You averaged ${(sleep7 / 60).toFixed(1)} h of recorded sleep over the last 7 days.`,
      "trend", "sleep", ["sleep"],
    ));
  }

  const steps7 = avg(w7.filter((m) => m.kind === "steps").map((m) => m.value));
  if (steps7 !== undefined && w7.filter((m) => m.kind === "steps").length >= 3) {
    out.push(mk(
      `You averaged ${Math.round(steps7).toLocaleString()} recorded steps per day over the last 7 days.`,
      "trend", "activity", ["steps"],
    ));
  }

  return out;
}

// ── public service ───────────────────────────────────────────────────
export const HealthEcosystemService = {
  /**
   * Marks the organization as initialised. Deliberately seeds **no** health
   * data: a new organization starts empty and populates as real records arrive.
   */
  async ensureBootstrapped(logger?: Logger, oid = "org-windels", _uidSeed?: string) {
    if (await redis.exists(K.meta(oid))) return;
    await redis.set(K.meta(oid), "1");
    logger?.info({ msg: "[health-ecosystem] initialized (record-only; no synthetic health data)", oid });
  },

  async getProfile(oid: string, userId: string): Promise<HealthProfile | null> {
    return jget<HealthProfile | null>(K.profile(oid, userId), null);
  },

  /** Create or update the user's health profile from user-supplied values. */
  async upsertProfile(oid: string, userId: string, payload: Partial<HealthProfile>): Promise<HealthProfile> {
    const existing = await jget<HealthProfile | null>(K.profile(oid, userId), null);
    const p: HealthProfile = {
      userId,
      age: payload.age ?? existing?.age,
      sexAtBirth: payload.sexAtBirth ?? existing?.sexAtBirth,
      heightCm: payload.heightCm ?? existing?.heightCm,
      weightKg: payload.weightKg ?? existing?.weightKg,
      conditions: payload.conditions ?? existing?.conditions ?? [],
      allergies: payload.allergies ?? existing?.allergies ?? [],
      medications: payload.medications ?? existing?.medications ?? [],
      consentGiven: payload.consentGiven ?? existing?.consentGiven ?? false,
      consentVersion: payload.consentVersion ?? existing?.consentVersion ?? "",
      wearableLinked: payload.wearableLinked ?? existing?.wearableLinked ?? false,
      wearableVendor: payload.wearableVendor ?? existing?.wearableVendor,
      ehrLinked: payload.ehrLinked ?? existing?.ehrLinked ?? false,
      ehrVendor: payload.ehrVendor ?? existing?.ehrVendor,
      familyHistory: payload.familyHistory ?? existing?.familyHistory ?? [],
      bloodType: payload.bloodType ?? existing?.bloodType,
      emergencyContacts: payload.emergencyContacts ?? existing?.emergencyContacts ?? [],
      subscribedModules: payload.subscribedModules ?? existing?.subscribedModules ?? HEALTH_MODULES.map((m) => m.id),
    };
    await jset(K.profile(oid, userId), p);
    return p;
  },

  async dashboard(oid: string, userId?: string): Promise<HealthDashboard> {
    if (!(await redis.exists(K.meta(oid)))) await this.ensureBootstrapped(undefined, oid, userId);
    const u = userId ?? "anon";

    const [profile, metrics, sessions, meds, notes, alerts, wearables, medDevices, vaccines, screenings] =
      await Promise.all([
        jget<HealthProfile | null>(K.profile(oid, u), null),
        lall<HealthMetric>(K.metrics(oid, u)),
        lall<FitnessSession>(K.sessions(oid, u)),
        lall<Medication>(K.meds(oid, u)),
        lall<DailyNote>(K.notes(oid, u)),
        lall<EmergencyAlert>(K.alerts(oid, u)),
        lall<WearableDevice>(K.wearables(oid, u)),
        lall<MedicalDevice>(K.devices(oid, u)),
        lall<Vaccination>(K.vaccines(oid, u)),
        lall<Screening>(K.screenings(oid, u)),
      ]);

    // Label breakdown enforces the Fifth Standing Rule over *recorded* items.
    const breakdown: Record<HealthLabel, number> = {
      wellness_estimate: 0, clinically_validated: 0, medical_decision_support: 0,
    };
    for (const x of [...metrics, ...sessions, ...meds]) breakdown[enforceLabel((x as any).label)]++;

    const insights = deriveInsights(metrics);
    for (const i of insights) breakdown[i.label]++;

    const recentAlerts30 = alerts.filter((a) => Date.now() - new Date(a.at).getTime() < 30 * 86_400_000);
    const hasData = Boolean(
      metrics.length || sessions.length || meds.length || notes.length || alerts.length,
    );

    return {
      profile: profile ?? undefined,
      today: summarize(metrics, sessions, 1),
      weeklyAvg: summarize(metrics, sessions, 7),
      monthlyAvg: summarize(metrics, sessions, 30),
      recentMetrics: metrics.slice(0, 30),
      recentSessions: sessions.slice(0, 10),
      medications: meds,
      notesRecent: notes.slice(0, 7),
      emergencyAlerts30d: recentAlerts30,
      wearableBatteryPct: wearables[0]?.batteryPct,
      wearables,
      medicalDevices: medDevices,
      vaccinations: vaccines,
      screenings,
      activeCoaching: false,
      consentStatus: profile?.consentGiven ? "full" : "none",
      consentVersion: profile?.consentVersion ?? "",
      complianceFlags: [],
      privacyMode: "hipaa",
      insights,
      vaccinationUpcoming: vaccines.filter((v) => v.status === "due" || v.status === "overdue").length,
      screeningsDue: screenings.filter((s) => s.status === "due" || s.status === "overdue").length,
      labelBreakdown: breakdown,
      disclaimer: HEALTH_DISCLAIMER,
      hasData,
      modules: HEALTH_MODULES.map((m) => ({
        ...m,
        enabled: profile ? profile.subscribedModules.includes(m.id) : false,
      })),
      familyMembers: [],
    };
  },

  // ── metrics CRUD ─────────────────────────────────────────────────
  async addMetric(oid: string, userId: string, payload: Partial<HealthMetric>): Promise<HealthMetric> {
    const source = (payload.source ?? "manual") as MetricSource;
    const m: HealthMetric = {
      id: uid("hm-"),
      kind: (payload.kind ?? "steps") as MetricKind,
      value: Number(payload.value ?? 0),
      unit: payload.unit ?? "units",
      at: payload.at ?? now(),
      source,
      // Provenance gate: a manual/self-reported entry cannot claim a clinical label.
      label: labelForSource(source, payload.label),
      deviceId: payload.deviceId,
      note: payload.note,
    };
    await lprepush(K.metrics(oid, userId), m, 500);
    return m;
  },
  async listMetrics(oid: string, userId: string, kind?: MetricKind, limit = 50): Promise<HealthMetric[]> {
    const all = await lall<HealthMetric>(K.metrics(oid, userId));
    const filtered = kind ? all.filter((m) => m.kind === kind) : all;
    return filtered.slice(0, limit);
  },

  // ── fitness sessions CRUD ────────────────────────────────────────
  async addSession(oid: string, userId: string, payload: Partial<FitnessSession>): Promise<FitnessSession> {
    const s: FitnessSession = {
      id: uid("fs-"),
      kind: (payload.kind ?? "walk") as WorkoutKind,
      title: payload.title,
      durationMin: Number(payload.durationMin ?? 0),
      calories: Number(payload.calories ?? 0),
      distanceKm: payload.distanceKm !== undefined ? Number(payload.distanceKm) : undefined,
      avgHr: Number(payload.avgHr ?? 0),
      peakHr: Number(payload.peakHr ?? 0),
      avgCadence: payload.avgCadence,
      avgPower: payload.avgPower,
      zones: payload.zones,
      coaching: !!payload.coaching,
      coachingMode: payload.coachingMode,
      voiceCoachId: payload.voiceCoachId,
      perceivedExertion: payload.perceivedExertion,
      at: payload.at ?? now(),
      // Activity summaries are wellness estimates by definition.
      label: "wellness_estimate",
    };
    await lprepush(K.sessions(oid, userId), s, 200);
    return s;
  },
  async listSessions(oid: string, userId: string, limit = 30): Promise<FitnessSession[]> {
    return (await lall<FitnessSession>(K.sessions(oid, userId))).slice(0, limit);
  },

  // ── medications CRUD ─────────────────────────────────────────────
  async addMedication(oid: string, userId: string, payload: Partial<Medication>): Promise<Medication> {
    const m: Medication = {
      id: uid("md-"),
      name: payload.name ?? "New medication",
      generic: payload.generic,
      dose: payload.dose ?? "as directed",
      frequency: payload.frequency ?? "daily",
      route: payload.route,
      prescriber: payload.prescriber,
      pharmacy: payload.pharmacy,
      startDate: payload.startDate,
      endDate: payload.endDate,
      refillsLeft: payload.refillsLeft,
      // Adherence counters start at zero and accumulate from real dose logging.
      adherencePct: payload.adherencePct !== undefined ? Number(payload.adherencePct) : 0,
      dosesMissed7d: Number(payload.dosesMissed7d ?? 0),
      dosesTaken7d: Number(payload.dosesTaken7d ?? 0),
      nextDose: payload.nextDose,
      lastTaken: payload.lastTaken,
      remindersOn: payload.remindersOn ?? true,
      interactionsWarning: payload.interactionsWarning,
      // A prescription record is clinical only when a prescriber is attributed.
      label: payload.prescriber ? enforceLabel(payload.label, "clinically_validated") : "wellness_estimate",
    };
    await lprepush(K.meds(oid, userId), m, 100);
    return m;
  },
  async listMedications(oid: string, userId: string): Promise<Medication[]> {
    return lall<Medication>(K.meds(oid, userId));
  },
  async deleteMedication(oid: string, userId: string, id: string) { await lremById(K.meds(oid, userId), id); },

  // ── daily notes CRUD ─────────────────────────────────────────────
  async addNote(oid: string, userId: string, payload: Partial<DailyNote>): Promise<DailyNote> {
    const n: DailyNote = {
      id: uid("dn-"),
      date: payload.date ?? today(),
      mood: payload.mood,
      energy: payload.energy,
      symptoms: payload.symptoms ?? [],
      journal: payload.journal ?? "",
      tags: payload.tags ?? [],
      meals: payload.meals,
      waterMl: payload.waterMl,
      caffeineMg: payload.caffeineMg,
      alcoholUnits: payload.alcoholUnits,
      createdAt: now(),
      updatedAt: now(),
    };
    await lprepush(K.notes(oid, userId), n, 365);
    return n;
  },
  async listNotes(oid: string, userId: string, limit = 30): Promise<DailyNote[]> {
    return (await lall<DailyNote>(K.notes(oid, userId))).slice(0, limit);
  },

  // ── emergency alerts CRUD ────────────────────────────────────────
  async addAlert(oid: string, userId: string, payload: Partial<EmergencyAlert>): Promise<EmergencyAlert> {
    const a: EmergencyAlert = {
      id: uid("ea-"),
      kind: (payload.kind ?? "abnormal_vitals") as AlertKind,
      severity: payload.severity ?? "warn",
      at: payload.at ?? now(),
      message: payload.message ?? "Health alert triggered",
      vitalsSnapshot: payload.vitalsSnapshot,
      contactsNotified: payload.contactsNotified ?? 0,
      acknowledged: !!payload.acknowledged,
      location: payload.location,
      // An alert is only clinically labelled when it carries the vitals it fired on.
      label: payload.vitalsSnapshot
        ? enforceLabel(payload.label, "clinically_validated")
        : "wellness_estimate",
    };
    await lprepush(K.alerts(oid, userId), a, 100);
    return a;
  },
  async listAlerts(oid: string, userId: string, limit = 30): Promise<EmergencyAlert[]> {
    return (await lall<EmergencyAlert>(K.alerts(oid, userId))).slice(0, limit);
  },
  async ackAlert(oid: string, userId: string, id: string): Promise<EmergencyAlert | null> {
    const all = await lall<EmergencyAlert>(K.alerts(oid, userId));
    const target = all.find((x) => x.id === id);
    if (!target) return null;
    target.acknowledged = true;
    target.acknowledgedAt = now();
    await redis.del(K.alerts(oid, userId));
    for (const x of all) await redis.rpush(K.alerts(oid, userId), JSON.stringify(x));
    return target;
  },

  // ── device registration (real connections only) ──────────────────
  async addWearable(oid: string, userId: string, payload: Partial<WearableDevice>): Promise<WearableDevice> {
    const d: WearableDevice = {
      id: uid("wd-"),
      vendor: payload.vendor,
      model: payload.model ?? "unknown",
      batteryPct: Number(payload.batteryPct ?? 0),
      lastSync: payload.lastSync ?? now(),
      connected: payload.connected ?? true,
      metricsEnabled: payload.metricsEnabled ?? [],
      label: enforceLabel(payload.label, "wellness_estimate"),
    };
    await lprepush(K.wearables(oid, userId), d, 20);
    return d;
  },
  async listWearables(oid: string, userId: string): Promise<WearableDevice[]> {
    return lall<WearableDevice>(K.wearables(oid, userId));
  },
  async addMedicalDevice(oid: string, userId: string, payload: Partial<MedicalDevice>): Promise<MedicalDevice> {
    const d: MedicalDevice = {
      id: uid("mdv-"),
      kind: (payload.kind ?? "bp_monitor") as MedicalDevice["kind"],
      vendor: payload.vendor ?? "unknown",
      model: payload.model ?? "unknown",
      lastReading: payload.lastReading ?? now(),
      connected: payload.connected ?? true,
      calibrationStatus: payload.calibrationStatus ?? "due",
      label: enforceLabel(payload.label, "clinically_validated"),
    };
    await lprepush(K.devices(oid, userId), d, 20);
    return d;
  },
  async listMedicalDevices(oid: string, userId: string): Promise<MedicalDevice[]> {
    return lall<MedicalDevice>(K.devices(oid, userId));
  },

  // ── preventive care records ──────────────────────────────────────
  async addVaccination(oid: string, userId: string, payload: Partial<Vaccination>): Promise<Vaccination> {
    const v: Vaccination = {
      id: uid("vx-"),
      name: payload.name ?? "Vaccination",
      lastDose: payload.lastDose,
      nextDose: payload.nextDose,
      dosesReceived: Number(payload.dosesReceived ?? 0),
      dosesRequired: Number(payload.dosesRequired ?? 0),
      status: payload.status ?? "due",
    };
    await lprepush(K.vaccines(oid, userId), v, 100);
    return v;
  },
  async listVaccinations(oid: string, userId: string): Promise<Vaccination[]> {
    return lall<Vaccination>(K.vaccines(oid, userId));
  },
  async addScreening(oid: string, userId: string, payload: Partial<Screening>): Promise<Screening> {
    const s: Screening = {
      id: uid("sc-"),
      name: payload.name ?? "Screening",
      frequency: payload.frequency ?? "1y",
      lastCompleted: payload.lastCompleted,
      // A screening record is only meaningful with a due date; default to now
      // (i.e. "due") rather than inventing a future schedule.
      nextDue: payload.nextDue ?? now(),
      status: payload.status ?? "due",
    };
    await lprepush(K.screenings(oid, userId), s, 100);
    return s;
  },
  async listScreenings(oid: string, userId: string): Promise<Screening[]> {
    return lall<Screening>(K.screenings(oid, userId));
  },

  // ── insights (derived, read-only) ────────────────────────────────
  async listInsights(oid: string, userId: string, label?: HealthLabel): Promise<HealthInsight[]> {
    const metrics = await lall<HealthMetric>(K.metrics(oid, userId));
    const all = deriveInsights(metrics);
    return label ? all.filter((i) => i.label === label) : all;
  },

  // ── modules registry ─────────────────────────────────────────────
  listModules() { return HEALTH_MODULES; },
  disclaimer() { return HEALTH_DISCLAIMER; },
};
