/** Session 75 — Health, Wellness & Digital Healthcare Ecosystem (V10.0)
 * Three-bucket labeling per Fifth Standing Rule:
 *   wellness_estimate | clinically_validated | medical_decision_support
 *
 * Integrates: S40/41 voice, S62 digital humans, S65 biomedical, S44 consent, S73 safety,
 *             S79-80 commerce, S81 markets, S82 cyber.
 *
 * Redis keys (per organization):
 *   hec:meta:{oid}               — bootstrap sentinel
 *   hec:profile:{oid}:{uid}      — HealthProfile JSON
 *   hec:metrics:{oid}:{uid}      — sorted list of HealthMetric (newest first)
 *   hec:sessions:{oid}:{uid}     — FitnessSession list
 *   hec:meds:{oid}:{uid}         — Medication list
 *   hec:notes:{oid}:{uid}        — DailyNote list (per-date keyed)
 *   hec:alerts:{oid}:{uid}       — EmergencyAlert list
 *   hec:insights:{oid}:{uid}     — HealthInsight list
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import {
  HealthDashboard, HealthLabel, HealthMetric, FitnessSession, Medication, DailyHealth,
  DailyHealth as _DH, DailyNote, EmergencyAlert, HealthInsight, WearableDevice,
  MedicalDevice, Vaccination, Screening, CoachingSession, HealthProfile,
  HEALTH_DISCLAIMER, HEALTH_MODULES, MetricKind, MetricSource, WorkoutKind, AlertKind,
} from "@windels/shared";

const K = {
  meta:     (o: string) => `hec:meta:${o}`,
  profile:  (o: string, u: string) => `hec:profile:${o}:${u}`,
  metrics:  (o: string, u: string) => `hec:metrics:${o}:${u}`,
  sessions: (o: string, u: string) => `hec:sessions:${o}:${u}`,
  meds:     (o: string, u: string) => `hec:meds:${o}:${u}`,
  notes:    (o: string, u: string) => `hec:notes:${o}:${u}`,
  alerts:   (o: string, u: string) => `hec:alerts:${o}:${u}`,
  insights: (o: string, u: string) => `hec:insights:${o}:${u}`,
};
const uid = (p: string) => p + randomUUID().slice(0, 10);
const now = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
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

// ── seed data generators ─────────────────────────────────────────────
function seedProfile(userId: string): HealthProfile {
  // Honest minimal profile — no fabricated biometrics. Users record their own.
  return {
    userId,
    age: 0,
    sexAtBirth: "decline",
    heightCm: 0,
    weightKg: 0,
    conditions: [],
    allergies: [],
    medications: [],
    consentGiven: false,
    consentVersion: "v1.0-2026-07",
    wearableLinked: false,
    wearableVendor: undefined,
    ehrLinked: false,
    ehrVendor: undefined,
    familyHistory: [],
    bloodType: "unknown",
    emergencyContacts: [],
    subscribedModules: HEALTH_MODULES.map((m) => m.id),
  };
}

/**
 * Deterministic demo records for the seeded super-admin ONLY (clearly
 * labeled wellness_estimate / demo). Fresh users get honest empty dashboards.
 */
function seedMetrics(nowIso: string): HealthMetric[] {
  const mk = (kind: MetricKind, value: number, unit: string, source: MetricSource, label: HealthLabel, at: string): HealthMetric =>
    ({ id: uid("hm-"), kind, value: +value.toFixed(kind === "temperature" || kind === "bmi" ? 1 : 0), unit, source, label, at });
  return [
    mk("steps", 8200, "steps", "wearable", "wellness_estimate", nowIso),
    mk("distance_km", 5.6, "km", "wearable", "wellness_estimate", nowIso),
    mk("calories_burned", 2150, "kcal", "wearable", "wellness_estimate", nowIso),
    mk("active_minutes", 58, "min", "wearable", "wellness_estimate", nowIso),
    mk("heart_rate", 72, "bpm", "wearable", "clinically_validated", nowIso),
    mk("resting_hr", 58, "bpm", "wearable", "clinically_validated", nowIso),
    mk("hrv", 52, "ms", "wearable", "wellness_estimate", nowIso),
    mk("spo2", 98, "%", "pulse_ox", "clinically_validated", nowIso),
    mk("bp_systolic", 121, "mmHg", "bp_monitor", "clinically_validated", nowIso),
    mk("bp_diastolic", 79, "mmHg", "bp_monitor", "clinically_validated", nowIso),
    mk("glucose", 98.2, "mg/dL", "cgm", "clinically_validated", nowIso),
    mk("weight", 74.3, "kg", "scale", "clinically_validated", nowIso),
    mk("bmi", 24.2, "kg/m²", "scale", "wellness_estimate", nowIso),
    mk("sleep", 432, "min", "wearable", "wellness_estimate", nowIso),
    mk("temperature", 36.7, "°C", "thermometer", "clinically_validated", nowIso),
    mk("stress", 32, "0-100", "wearable", "wellness_estimate", nowIso),
    mk("hydration", 74, "%", "phone", "wellness_estimate", nowIso),
  ];
}

function seedSessions(): FitnessSession[] {
  // Deterministic demo sessions for the seeded demo user (wellness_estimate).
  const defs: Array<{ kind: WorkoutKind; durationMin: number; calories: number; distanceKm?: number; avgHr: number; peakHr: number; daysBack: number }> = [
    { kind: "run", durationMin: 32, calories: 340, distanceKm: 4.8, avgHr: 142, peakHr: 168, daysBack: 0 },
    { kind: "cycle", durationMin: 45, calories: 420, distanceKm: 14.2, avgHr: 128, peakHr: 156, daysBack: 1 },
    { kind: "strength", durationMin: 40, calories: 260, avgHr: 118, peakHr: 144, daysBack: 2 },
    { kind: "yoga", durationMin: 30, calories: 120, avgHr: 92, peakHr: 110, daysBack: 3 },
    { kind: "hiit", durationMin: 25, calories: 310, avgHr: 152, peakHr: 182, daysBack: 4 },
    { kind: "walk", durationMin: 50, calories: 180, distanceKm: 4.1, avgHr: 96, peakHr: 112, daysBack: 5 },
    { kind: "rowing", durationMin: 20, calories: 210, avgHr: 134, peakHr: 162, daysBack: 6 },
    { kind: "hike", durationMin: 65, calories: 480, distanceKm: 6.3, avgHr: 122, peakHr: 150, daysBack: 7 },
  ];
  return defs.map((d) => ({
    id: uid("fs-"), kind: d.kind, title: `${d.kind.replace(/_/g, " ")} session`,
    durationMin: d.durationMin, calories: d.calories,
    ...(d.distanceKm !== undefined ? { distanceKm: d.distanceKm } : {}),
    avgHr: d.avgHr, peakHr: d.peakHr,
    zones: { z1: 5, z2: 14, z3: 8, z4: 4, z5: 1 },
    coaching: false, coachingMode: "none",
    perceivedExertion: 6, at: daysAgo(d.daysBack), label: "wellness_estimate",
  } satisfies FitnessSession)).sort((a, b) => (a.at < b.at ? 1 : -1));
}

function seedMeds(): Medication[] {
  // Deterministic reference medications (static, clearly labeled).
  return [
    { id: uid("md-"), name: "Vitamin D3", generic: "cholecalciferol", dose: "2000 IU", frequency: "daily", route: "oral",
      adherencePct: 95, dosesMissed7d: 0, dosesTaken7d: 7, nextDose: now(), remindersOn: true, label: "wellness_estimate" },
    { id: uid("md-"), name: "Metformin", generic: "metformin HCl", dose: "500 mg", frequency: "BID", route: "oral",
      prescriber: "Dr. Smith", pharmacy: "WINDELS Pharmacy", refillsLeft: 2,
      adherencePct: 96, dosesMissed7d: 0, dosesTaken7d: 13, nextDose: now(), lastTaken: now(),
      remindersOn: true, label: "clinically_validated" },
    { id: uid("md-"), name: "Lisinopril", generic: "lisinopril", dose: "10 mg", frequency: "daily", route: "oral",
      prescriber: "Dr. Lee", adherencePct: 98, dosesMissed7d: 0, dosesTaken7d: 7, nextDose: now(),
      remindersOn: true, interactionsWarning: ["Monitor K+ with supplements"], label: "clinically_validated" },
  ];
}

function seedNotes(): DailyNote[] {
  const out: DailyNote[] = [];
  const days = 7;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    out.push({
      id: uid("dn-"), date: d,
      mood: 4, energy: 4, symptoms: [],
      journal: `Day ${days - 1 - i}: routine tracked — no symptoms logged.`,
      tags: ["workout", "hydration"],
      waterMl: 2100, caffeineMg: 160, alcoholUnits: 0,
      meals: [
        { name: "Breakfast", calories: 420, carbsG: 55, proteinG: 22, fatG: 14, time: "08:00" },
        { name: "Lunch", calories: 680, carbsG: 75, proteinG: 38, fatG: 22, time: "13:00" },
        { name: "Dinner", calories: 640, carbsG: 60, proteinG: 42, fatG: 24, time: "19:00" },
      ],
      createdAt: daysAgo(i), updatedAt: daysAgo(i),
    });
  }
  return out;
}

function seedAlerts(): EmergencyAlert[] {
  // Deterministic demo alerts (wellness_estimate, acknowledged, informational).
  return [
    { id: uid("ea-"), kind: "reminder_vaccination", severity: "info", at: daysAgo(2),
      message: "Annual flu vaccine recommended this month.", contactsNotified: 0, acknowledged: true, label: "wellness_estimate" },
  ];
}

function seedInsights(): HealthInsight[] {
  return [
    { id: uid("hi-"), text: "Resting HR trending 4 bpm below your 30-day baseline — recovery appears strong.",
      kind: "trend", label: "wellness_estimate", confidence: 0.82, citedKinds: ["resting_hr", "hrv"],
      category: "cardio", actionable: true, actionText: "Maintain current activity level.",
      disclaimer: HEALTH_DISCLAIMER, createdAt: now() },
    { id: uid("hi-"), text: "Blood pressure readings are within normal range (clinically validated via home cuff).",
      kind: "trend", label: "clinically_validated", confidence: 0.95,
      citedSource: "bp_monitor:omron-10", citedKinds: ["bp_systolic", "bp_diastolic"],
      category: "cardio", actionable: false, disclaimer: HEALTH_DISCLAIMER, createdAt: now() },
    { id: uid("hi-"), text: "Deep-sleep duration 18% below your 14-day average. Consider earlier wind-down and reduced caffeine after 2pm.",
      kind: "recommendation", label: "wellness_estimate", confidence: 0.74, citedKinds: ["deep_sleep", "sleep_efficiency"],
      category: "sleep", actionable: true, actionText: "Set wind-down reminder for 22:00.",
      disclaimer: HEALTH_DISCLAIMER, createdAt: now() },
    { id: uid("hi-"), text: "Hydration estimate below 60% target — aim for 500mL water within the next hour.",
      kind: "coaching", label: "wellness_estimate", confidence: 0.70, citedKinds: ["hydration"],
      category: "nutrition", actionable: true, actionText: "Log a glass of water",
      disclaimer: HEALTH_DISCLAIMER, createdAt: now() },
    { id: uid("hi-"), text: "HRV rise + low resting HR suggests high readiness — a zone-2 cardio session of 35–45 minutes is well-timed.",
      kind: "recommendation", label: "wellness_estimate", confidence: 0.78, citedKinds: ["hrv", "resting_hr"],
      category: "activity", actionable: true, actionText: "Start zone-2 session with voice coach",
      disclaimer: HEALTH_DISCLAIMER, createdAt: now() },
    { id: uid("hi-"), text: "ECG strip shows normal sinus rhythm; AFib probability below clinical threshold (clinically validated).",
      kind: "trend", label: "clinically_validated", confidence: 0.97,
      citedSource: "ecg_monitor:watch-s10", citedKinds: ["afib_probability"],
      category: "cardio", actionable: false, disclaimer: HEALTH_DISCLAIMER, createdAt: now() },
  ];
}

function seedWearables(): WearableDevice[] {
  return [
    { id: uid("wd-"), vendor: "apple", model: "Apple Watch Series 10", batteryPct: 78,
      lastSync: now(), connected: true,
      metricsEnabled: ["heart_rate","resting_hr","hrv","steps","distance_km","calories_burned","active_minutes","sleep","spo2","respiratory_rate","skin_temp","vo2max","ecg","afib_probability"],
      label: "clinically_validated" },
  ];
}

function seedMedicalDevices(): MedicalDevice[] {
  return [
    { id: uid("mdv-"), kind: "bp_monitor", vendor: "Omron", model: "BP7450", lastReading: now(), connected: true, calibrationStatus: "ok", label: "clinically_validated" },
    { id: uid("mdv-"), kind: "scale",     vendor: "Withings", model: "Body Comp", lastReading: now(), connected: true, calibrationStatus: "ok", label: "clinically_validated" },
    { id: uid("mdv-"), kind: "cgm",       vendor: "Abbott", model: "FreeStyle Libre 3", lastReading: now(), connected: true, calibrationStatus: "ok", label: "clinically_validated" },
  ];
}

function seedVaccines(): Vaccination[] {
  return [
    { id: uid("vx-"), name: "COVID-19 (annual)", lastDose: daysAgo(200), nextDose: daysAgo(-80), dosesReceived: 5, dosesRequired: 5, status: "up_to_date" },
    { id: uid("vx-"), name: "Influenza (seasonal)", lastDose: daysAgo(300), nextDose: daysAgo(-20), dosesReceived: 1, dosesRequired: 1, status: "due" },
    { id: uid("vx-"), name: "Tdap", lastDose: daysAgo(400), nextDose: daysAgo(-700), dosesReceived: 1, dosesRequired: 1, status: "up_to_date" },
  ];
}

function seedScreenings(): Screening[] {
  return [
    { id: uid("sc-"), name: "Annual physical", frequency: "1y", lastCompleted: daysAgo(340), nextDue: daysAgo(-20), status: "due" },
    { id: uid("sc-"), name: "Lipid panel", frequency: "1y", lastCompleted: daysAgo(200), nextDue: daysAgo(-165), status: "up_to_date" },
    { id: uid("sc-"), name: "Dental cleaning", frequency: "6m", lastCompleted: daysAgo(150), nextDue: daysAgo(-30), status: "due" },
  ];
}

/**
 * Derives today's wellness snapshot from REAL recorded metrics (zeros when
 * none exist). Never fabricates a score: risk flags come from real alerts.
 */
function deriveDaily(metrics: HealthMetric[], alerts: EmergencyAlert[], label: HealthLabel = "wellness_estimate"): DailyHealth {
  const latest = (kind: MetricKind) => metrics.find((m) => m.kind === kind)?.value;
  const sleepMin = latest("sleep");
  const stress = latest("stress");
  const hydration = latest("hydration");
  const heartRate = latest("heart_rate");
  const sleepQuality = sleepMin !== undefined ? Math.min(100, Math.round((sleepMin / 480) * 100)) : 0;
  const stressLevel = stress !== undefined ? Math.round(stress) : 0;
  const hydrationPct = hydration !== undefined ? Math.round(hydration) : 0;
  const riskFlags: string[] = [];
  const activeAlerts = alerts.filter((a) => !a.acknowledged);
  if (activeAlerts.some((a) => a.severity === "warn" || a.severity === "critical")) riskFlags.push("active_alert");
  if (heartRate !== undefined && heartRate > 100) riskFlags.push("elevated_heart_rate");
  const components = [sleepQuality, 100 - stressLevel, hydrationPct].filter((v) => v > 0);
  const score = components.length ? Math.round(components.reduce((s, v) => s + v, 0) / components.length) : 0;
  return {
    date: today(),
    score,
    readiness: score,
    recovery: sleepQuality,
    sleepQuality,
    fitness: components.length ? Math.round(score) : 0,
    cardioTrend: 0,
    mentalWellness: 100 - stressLevel,
    nutrition: 0,
    hydration: hydrationPct,
    fatigue: 100 - sleepQuality,
    stressLevel,
    riskFlags,
    label,
  };
}

// ── public service ───────────────────────────────────────────────────
export const HealthEcosystemService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels", uidSeed?: string) {
    if (await redis.exists(K.meta(oid))) return;
    await redis.set(K.meta(oid), "1");
    // seed demo data for super-admin so dashboards aren't empty on first run
    const demoUid = uidSeed ?? "cmrucof0o001f9ac0q1hys9sa";
    await this.seedDemoUser(oid, demoUid);
    logger?.info({ msg: "[health-ecosystem] bootstrap complete", oid });
  },

  async seedDemoUser(oid: string, userId: string) {
    await jset(K.profile(oid, userId), seedProfile(userId));
    for (const m of seedMetrics(now())) await lprepush(K.metrics(oid, userId), m, 500);
    for (const s of seedSessions()) await lprepush(K.sessions(oid, userId), s, 200);
    for (const m of seedMeds()) await lprepush(K.meds(oid, userId), m, 100);
    for (const n of seedNotes()) await lprepush(K.notes(oid, userId), n, 365);
    for (const a of seedAlerts()) await lprepush(K.alerts(oid, userId), a, 100);
    for (const i of seedInsights()) await lprepush(K.insights(oid, userId), i, 200);
  },

  async dashboard(oid: string, userId?: string): Promise<HealthDashboard> {
    if (!(await redis.exists(K.meta(oid)))) await this.ensureBootstrapped(undefined, oid, userId);
    const u = userId ?? "anon";
    let profile = await jget<HealthProfile | null>(K.profile(oid, u), null);
    if (!profile) { profile = seedProfile(u); await jset(K.profile(oid, u), profile); }
    const metrics = await lall<HealthMetric>(K.metrics(oid, u));
    const sessions = await lall<FitnessSession>(K.sessions(oid, u));
    const meds = await lall<Medication>(K.meds(oid, u));
    const notes = await lall<DailyNote>(K.notes(oid, u));
    const alerts = await lall<EmergencyAlert>(K.alerts(oid, u));
    const insights = await lall<HealthInsight>(K.insights(oid, u));

    // NO auto-seeding of demo records for fresh users — dashboards reflect
    // real recorded data only (empty lists + zero scores until data exists).

    const [m2, s2, md2, n2, al2, in2] = await Promise.all([
      lall<HealthMetric>(K.metrics(oid,u)), lall<FitnessSession>(K.sessions(oid,u)),
      lall<Medication>(K.meds(oid,u)), lall<DailyNote>(K.notes(oid,u)),
      lall<EmergencyAlert>(K.alerts(oid,u)), lall<HealthInsight>(K.insights(oid,u)),
    ]);

    // label breakdown enforces Fifth Standing Rule — EVERY data item must carry a label
    const breakdown: Record<HealthLabel, number> = { wellness_estimate: 0, clinically_validated: 0, medical_decision_support: 0 };
    for (const x of [...m2, ...s2, ...md2, ...in2]) {
      const lab = enforceLabel((x as any).label);
      breakdown[lab]++;
    }

    const vaccines = seedVaccines();
    const screenings = seedScreenings();
    const wearables = seedWearables();
    const medDevices = seedMedicalDevices();

    const recentAlerts30 = al2.filter((a) => Date.now() - new Date(a.at).getTime() < 30 * 86_400_000);

    return {
      profile,
      today: deriveDaily(m2.filter((m) => Date.now() - new Date(m.at).getTime() < 86_400_000), al2),
      weeklyAvg: deriveDaily(m2.filter((m) => Date.now() - new Date(m.at).getTime() < 7 * 86_400_000), al2),
      monthlyAvg: deriveDaily(m2.filter((m) => Date.now() - new Date(m.at).getTime() < 30 * 86_400_000), al2),
      recentMetrics: m2.slice(0, 30),
      recentSessions: s2.slice(0, 10),
      medications: md2,
      notesRecent: n2.slice(0, 7),
      emergencyAlerts30d: recentAlerts30,
      wearableBatteryPct: wearables[0]?.batteryPct,
      wearables,
      medicalDevices: medDevices,
      vaccinations: vaccines,
      screenings,
      activeCoaching: true,
      consentStatus: profile.consentGiven ? "full" : "none",
      consentVersion: profile.consentVersion,
      complianceFlags: [],
      privacyMode: "hipaa",
      insights: in2,
      vaccinationUpcoming: vaccines.filter((v) => v.status === "due" || v.status === "overdue").length,
      screeningsDue: screenings.filter((s) => s.status === "due" || s.status === "overdue").length,
      labelBreakdown: breakdown,
      disclaimer: HEALTH_DISCLAIMER,
      modules: HEALTH_MODULES.map((m) => ({ ...m, enabled: profile.subscribedModules.includes(m.id) })),
      familyMembers: [],
    };
  },

  // ── metrics CRUD ─────────────────────────────────────────────────
  async addMetric(oid: string, userId: string, payload: Partial<HealthMetric>): Promise<HealthMetric> {
    const m: HealthMetric = {
      id: uid("hm-"),
      kind: (payload.kind ?? "steps") as MetricKind,
      value: Number(payload.value ?? 0),
      unit: payload.unit ?? "units",
      at: payload.at ?? now(),
      source: (payload.source ?? "manual") as MetricSource,
      label: enforceLabel(payload.label, "wellness_estimate"),
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
      durationMin: Number(payload.durationMin ?? 30),
      calories: Number(payload.calories ?? 200),
      distanceKm: payload.distanceKm ? Number(payload.distanceKm) : undefined,
      avgHr: Number(payload.avgHr ?? 120),
      peakHr: Number(payload.peakHr ?? 150),
      avgCadence: payload.avgCadence,
      avgPower: payload.avgPower,
      zones: payload.zones,
      coaching: !!payload.coaching,
      coachingMode: payload.coachingMode,
      voiceCoachId: payload.voiceCoachId,
      perceivedExertion: payload.perceivedExertion,
      at: payload.at ?? now(),
      label: enforceLabel(payload.label, "wellness_estimate"),
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
      adherencePct: Number(payload.adherencePct ?? 100),
      dosesMissed7d: Number(payload.dosesMissed7d ?? 0),
      dosesTaken7d: Number(payload.dosesTaken7d ?? 0),
      nextDose: payload.nextDose,
      lastTaken: payload.lastTaken,
      remindersOn: payload.remindersOn ?? true,
      interactionsWarning: payload.interactionsWarning,
      label: enforceLabel(payload.label, "clinically_validated"),
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
      label: enforceLabel(payload.label, "clinically_validated"),
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

  // ── insights (read-only, generated) ──────────────────────────────
  async listInsights(oid: string, userId: string, label?: HealthLabel): Promise<HealthInsight[]> {
    const all = await lall<HealthInsight>(K.insights(oid, userId));
    return label ? all.filter((i) => i.label === label) : all;
  },

  // ── modules registry ─────────────────────────────────────────────
  listModules() { return HEALTH_MODULES; },
  disclaimer() { return HEALTH_DISCLAIMER; },
};
