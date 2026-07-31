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
import { makeRng } from "../utils/detRng.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('healthEcosystem:healthEcosystem');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



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
const rnd = (a: number, b: number) => _rng.next() * (b - a) + a;
const rndInt = (a: number, b: number) => Math.floor(rnd(a, b + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(_rng.next() * arr.length)];
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
  return {
    userId,
    age: rndInt(25, 58),
    sexAtBirth: pick(["male", "female"] as const),
    heightCm: rndInt(160, 190),
    weightKg: +rnd(55, 95).toFixed(1),
    conditions: [],
    allergies: [],
    medications: ["Vitamin D3"],
    consentGiven: true,
    consentVersion: "v1.0-2026-07",
    wearableLinked: true,
    wearableVendor: pick(["apple", "samsung", "fitbit", "garmin"] as const),
    ehrLinked: _rng.next() > 0.5,
    ehrVendor: "epic",
    familyHistory: [],
    bloodType: pick(["O+", "A+", "B+", "AB+"] as const),
    emergencyContacts: [
      { name: "Emergency Contact", phone: "+1-555-0100", relation: "family" },
    ],
    subscribedModules: HEALTH_MODULES.map((m) => m.id),
  };
}

function seedMetrics(nowIso: string): HealthMetric[] {
  const mk = (kind: MetricKind, value: number, unit: string, source: MetricSource, label: HealthLabel, at: string): HealthMetric =>
    ({ id: uid("hm-"), kind, value: +value.toFixed(kind === "temperature" || kind === "bmi" ? 1 : 0), unit, source, label, at });
  return [
    mk("steps", rndInt(3200, 13500), "steps", "wearable", "wellness_estimate", nowIso),
    mk("distance_km", rnd(2, 12), "km", "wearable", "wellness_estimate", nowIso),
    mk("calories_burned", rndInt(1500, 3200), "kcal", "wearable", "wellness_estimate", nowIso),
    mk("active_minutes", rndInt(20, 120), "min", "wearable", "wellness_estimate", nowIso),
    mk("heart_rate", rndInt(58, 88), "bpm", "wearable", "clinically_validated", nowIso),
    mk("resting_hr", rndInt(48, 70), "bpm", "wearable", "clinically_validated", nowIso),
    mk("hrv", rndInt(28, 82), "ms", "wearable", "wellness_estimate", nowIso),
    mk("hrv_sdnn", rndInt(35, 80), "ms", "wearable", "wellness_estimate", nowIso),
    mk("spo2", rndInt(95, 99), "%", "pulse_ox", "clinically_validated", nowIso),
    mk("respiratory_rate", rndInt(12, 20), "bpm", "wearable", "clinically_validated", nowIso),
    mk("bp_systolic", rndInt(110, 132), "mmHg", "bp_monitor", "clinically_validated", nowIso),
    mk("bp_diastolic", rndInt(70, 88), "mmHg", "bp_monitor", "clinically_validated", nowIso),
    mk("glucose", +rnd(82, 132).toFixed(1), "mg/dL", "cgm", "clinically_validated", nowIso),
    mk("weight", +rnd(65, 88).toFixed(1), "kg", "scale", "clinically_validated", nowIso),
    mk("bmi", +rnd(21, 27).toFixed(1), "kg/m²", "scale", "wellness_estimate", nowIso),
    mk("sleep", rndInt(360, 480), "min", "wearable", "wellness_estimate", nowIso),
    mk("deep_sleep", rndInt(60, 120), "min", "wearable", "wellness_estimate", nowIso),
    mk("rem_sleep", rndInt(70, 120), "min", "wearable", "wellness_estimate", nowIso),
    mk("sleep_efficiency", rndInt(78, 94), "%", "wearable", "wellness_estimate", nowIso),
    mk("temperature", +rnd(36.4, 37.1).toFixed(1), "°C", "thermometer", "clinically_validated", nowIso),
    mk("skin_temp", +rnd(33.2, 35.5).toFixed(1), "°C", "wearable", "wellness_estimate", nowIso),
    mk("vo2max", rndInt(35, 55), "mL/kg/min", "wearable", "wellness_estimate", nowIso),
    mk("stress", rndInt(15, 65), "0-100", "wearable", "wellness_estimate", nowIso),
    mk("hydration", rndInt(55, 92), "%", "phone", "wellness_estimate", nowIso),
    mk("afib_probability", +rnd(0.0, 0.02).toFixed(3), "prob", "ecg_monitor", "medical_decision_support", nowIso),
  ];
}

function seedSessions(): FitnessSession[] {
  const kinds: WorkoutKind[] = ["run", "cycle", "strength", "yoga", "hiit", "walk", "rowing", "hike", "coached_ai", "pilates"];
  const out: FitnessSession[] = [];
  for (let i = 0; i < 8; i++) {
    const k = pick(kinds);
    const coached = _rng.next() > 0.5;
    out.push({
      id: uid("fs-"),
      kind: k,
      title: `${k.replace(/_/g, " ")} session`,
      durationMin: rndInt(20, 70),
      calories: rndInt(180, 620),
      distanceKm: ["run", "cycle", "walk", "hike"].includes(k) ? +rnd(2, 10).toFixed(1) : undefined,
      avgHr: rndInt(110, 155),
      peakHr: rndInt(150, 185),
      avgCadence: ["run", "cycle"].includes(k) ? rndInt(70, 170) : undefined,
      avgPower: k === "cycle" ? rndInt(120, 260) : undefined,
      zones: { z1: rndInt(2, 10), z2: rndInt(10, 25), z3: rndInt(5, 15), z4: rndInt(2, 10), z5: rndInt(0, 5) },
      coaching: coached,
      coachingMode: coached ? pick(["voice_live", "digital_human", "programmed"] as const) : "none",
      voiceCoachId: coached && _rng.next() > 0.5 ? "vc-maya-001" : undefined,
      perceivedExertion: rndInt(4, 8),
      at: daysAgo(rndInt(0, 6)),
      label: "wellness_estimate",
    });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

function seedMeds(): Medication[] {
  return [
    { id: uid("md-"), name: "Vitamin D3", generic: "cholecalciferol", dose: "2000 IU", frequency: "daily", route: "oral",
      adherencePct: rndInt(75, 98), dosesMissed7d: rndInt(0, 2), dosesTaken7d: 7, nextDose: now(), remindersOn: true,
      label: "wellness_estimate" },
    { id: uid("md-"), name: "Metformin", generic: "metformin HCl", dose: "500 mg", frequency: "BID", route: "oral",
      prescriber: "Dr. Smith", pharmacy: "WINDELS Pharmacy", refillsLeft: rndInt(0, 3),
      adherencePct: rndInt(80, 98), dosesMissed7d: rndInt(0, 1), dosesTaken7d: 13, nextDose: now(), lastTaken: now(),
      remindersOn: true, label: "clinically_validated" },
    { id: uid("md-"), name: "Lisinopril", generic: "lisinopril", dose: "10 mg", frequency: "daily", route: "oral",
      prescriber: "Dr. Lee", adherencePct: rndInt(85, 99), dosesMissed7d: 0, dosesTaken7d: 7, nextDose: now(),
      remindersOn: true, interactionsWarning: ["Monitor K+ with supplements"], label: "clinically_validated" },
  ];
}

function seedNotes(): DailyNote[] {
  const moods = ["energetic", "calm", "tired", "stressed", "focused"];
  const out: DailyNote[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    out.push({
      id: uid("dn-"),
      date: d,
      mood: rndInt(2, 5),
      energy: rndInt(2, 5),
      symptoms: _rng.next() > 0.6 ? ["mild fatigue"] : [],
      journal: `Day ${i}: feeling ${pick(moods)}. Workout and hydration tracked.`,
      tags: pick([["workout"], ["hydration"], ["rest"], ["workout", "hydration"], []]),
      waterMl: rndInt(1400, 3000),
      caffeineMg: rndInt(80, 300),
      alcoholUnits: _rng.next() > 0.7 ? rndInt(1, 3) : 0,
      meals: [
        { name: "Breakfast", calories: rndInt(300, 600), carbsG: rndInt(40, 90), proteinG: rndInt(15, 35), fatG: rndInt(10, 25), time: "08:00" },
        { name: "Lunch",     calories: rndInt(500, 900), carbsG: rndInt(50, 120), proteinG: rndInt(25, 55), fatG: rndInt(15, 35), time: "13:00" },
        { name: "Dinner",    calories: rndInt(500, 900), carbsG: rndInt(40, 110), proteinG: rndInt(30, 60), fatG: rndInt(15, 40), time: "19:00" },
      ],
      createdAt: daysAgo(i),
      updatedAt: daysAgo(i),
    });
  }
  return out;
}

function seedAlerts(): EmergencyAlert[] {
  const out: EmergencyAlert[] = [];
  if (_rng.next() > 0.4) {
    out.push({ id: uid("ea-"), kind: "reminder_vaccination", severity: "info", at: daysAgo(2),
      message: "Annual flu vaccine recommended this month.", contactsNotified: 0, acknowledged: true,
      label: "wellness_estimate" });
  }
  if (_rng.next() > 0.6) {
    out.push({ id: uid("ea-"), kind: "abnormal_vitals", severity: "warn", at: daysAgo(5),
      message: "Resting HR elevated 12% above baseline during sleep.", contactsNotified: 0, acknowledged: true,
      vitalsSnapshot: { resting_hr: 78 }, label: "clinically_validated" });
  }
  return out;
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
      citedSource: "ecg_monitor:apple-watch-s9", citedKinds: ["ecg", "afib_probability"],
      category: "cardio", actionable: false, disclaimer: HEALTH_DISCLAIMER, createdAt: now() },
    { id: uid("hi-"), text: "No clinical decision support alerts active this week. Continue monitoring per your clinician's plan.",
      kind: "trend", label: "medical_decision_support", confidence: 0.90,
      citedSource: "clinician:dr-lee-q2-plan",
      category: "general", actionable: false, disclaimer: HEALTH_DISCLAIMER, createdAt: now() },
    { id: uid("hi-"), text: "Medication adherence for Lisinopril is 100% over the last 7 days — great consistency.",
      kind: "trend", label: "wellness_estimate", confidence: 0.99,
      category: "meds", actionable: false, disclaimer: HEALTH_DISCLAIMER, createdAt: now() },
    { id: uid("hi-"), text: "Glucose time-in-range 88% (last 7 days) — within target for your management plan.",
      kind: "trend", label: "clinically_validated", confidence: 0.92,
      citedSource: "cgm:freestyle-libre-3", citedKinds: ["glucose"],
      category: "cardio", actionable: false, disclaimer: HEALTH_DISCLAIMER, createdAt: now() },
    { id: uid("hi-"), text: "Annual physical exam is due in 3 weeks — booking now would keep preventive care on schedule.",
      kind: "reminder", label: "wellness_estimate", confidence: 1.0,
      category: "preventive", actionable: true, actionText: "Book appointment",
      disclaimer: HEALTH_DISCLAIMER, createdAt: now() },
  ];
}

function seedWearables(): WearableDevice[] {
  // Deterministic stable IDs; batteryPct fixed until a real wearable adapter reports it.
  return [
    { id: "wd-apple-watch-s10", vendor: "apple", model: "Apple Watch Series 10", batteryPct: 78,
      lastSync: "2026-07-31T14:00:00.000Z", connected: true,
      metricsEnabled: ["heart_rate","resting_hr","hrv","steps","distance_km","calories_burned","active_minutes","sleep","spo2","respiratory_rate","skin_temp","vo2max","ecg","afib_probability"],
      label: "clinically_validated" },
  ];
}

function seedMedicalDevices(): MedicalDevice[] {
  return [
    { id: "mdv-omron-bp7450",    kind: "bp_monitor", vendor: "Omron",    model: "BP7450",              lastReading: "2026-07-31T14:00:00.000Z", connected: true, calibrationStatus: "ok", label: "clinically_validated" },
    { id: "mdv-withings-scale",  kind: "scale",      vendor: "Withings", model: "Body Comp",           lastReading: "2026-07-31T14:00:00.000Z", connected: true, calibrationStatus: "ok", label: "clinically_validated" },
    { id: "mdv-libre-3",         kind: "cgm",        vendor: "Abbott",   model: "FreeStyle Libre 3",   lastReading: "2026-07-31T14:00:00.000Z", connected: true, calibrationStatus: "ok", label: "clinically_validated" },
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

function daily(scoreBase: number, label: HealthLabel = "wellness_estimate"): DailyHealth {
  // Deterministic: same base + label → same numbers. Reads never drift.
  // Real telemetry integration would replace this with computed metrics
  // from the persisted HealthMetric stream (HRV, resting HR, sleep,
  // activity minutes, etc.) rolled over the appropriate window.
  return {
    score: scoreBase,
    readiness: Math.max(40, Math.min(95, scoreBase - 5)),
    recovery: Math.max(40, Math.min(95, scoreBase - 3)),
    sleepQuality: Math.max(40, Math.min(95, scoreBase - 8)),
    fitness: Math.max(30, Math.min(95, scoreBase - 10)),
    cardioTrend: 0,
    mentalWellness: Math.max(45, Math.min(95, scoreBase)),
    nutrition: Math.max(40, Math.min(95, scoreBase - 6)),
    hydration: Math.max(40, Math.min(95, scoreBase - 4)),
    fatigue: Math.max(5, Math.min(70, 100 - scoreBase)),
    stressLevel: Math.max(10, Math.min(70, 100 - scoreBase - 5)),
    riskFlags: [],
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

    // seed defaults if lists empty (fresh user)
    if (!metrics.length)  for (const m of seedMetrics(now())) await lprepush(K.metrics(oid,u),m,500);
    if (!sessions.length) for (const s of seedSessions())     await lprepush(K.sessions(oid,u),s,200);
    if (!meds.length)     for (const m of seedMeds())         await lprepush(K.meds(oid,u),m,100);
    if (!notes.length)    for (const n of seedNotes())        await lprepush(K.notes(oid,u),n,365);
    if (!alerts.length)   for (const a of seedAlerts())       await lprepush(K.alerts(oid,u),a,100);
    if (!insights.length) for (const i of seedInsights())     await lprepush(K.insights(oid,u),i,200);

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
      today: daily(78, "wellness_estimate"),
      weeklyAvg: daily(75, "wellness_estimate"),
      monthlyAvg: daily(73, "wellness_estimate"),
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
