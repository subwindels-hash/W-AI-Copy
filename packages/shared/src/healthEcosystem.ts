/** Session 75 — Enterprise AI Health, Wellness & Digital Healthcare Ecosystem (V10.0)
 * Strict three-bucket labeling per the Fifth Standing Rule:
 *   wellness_estimate      – AI/derived, informational only (NOT medical advice)
 *   clinically_validated   – Measurements from FDA/CE-cleared devices or clinician-entered data
 *   medical_decision_support – Decision-support output gated by clinician review + consent
 *
 * Integrates with: S40/41 voice (voice coach), S62 digital humans (avatars/doctors),
 * S65 biomedical (imaging/lab), S44 consent (HIPAA/GDPR gate), S73 safety (fall/SOS),
 * S79-80 commerce (pharmacy/insurance), S81 markets (benefits/claims), S82 cyber (PHI security).
 */

export type HealthLabel = "wellness_estimate" | "clinically_validated" | "medical_decision_support";

export const HEALTH_DISCLAIMER =
  "For informational wellness use only — not medical advice. Clinically-validated readings come from approved devices; medical decision support requires clinician review.";

export interface HealthProfile {
  userId: string;
  age?: number;
  sexAtBirth?: "male" | "female" | "other" | "decline";
  heightCm?: number;
  weightKg?: number;
  conditions: string[];
  allergies: string[];
  medications: string[];
  consentGiven: boolean;
  consentVersion: string;
  wearableLinked: boolean;
  wearableVendor?: "apple" | "samsung" | "fitbit" | "garmin" | "wearos" | "oura" | "whoop" | "polar" | "none";
  ehrLinked: boolean;
  ehrVendor?: "epic" | "cerner" | "allscripts" | "meditech" | "none";
  familyHistory: string[];
  bloodType?: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "unknown";
  emergencyContacts: Array<{ name: string; phone: string; relation: string }>;
  subscribedModules: string[];
}

export type MetricKind =
  | "steps" | "distance_km" | "floors" | "calories_burned" | "active_minutes"
  | "heart_rate" | "resting_hr" | "hrv" | "hrv_sdnn" | "hrv_rmssd"
  | "spo2" | "respiratory_rate" | "bp_systolic" | "bp_diastolic"
  | "glucose" | "hba1c" | "weight" | "bmi" | "body_fat_pct"
  | "sleep" | "deep_sleep" | "rem_sleep" | "sleep_efficiency"
  | "temperature" | "skin_temp" | "vo2max" | "stress" | "hydration"
  | "ecg" | "afib_probability" | "menstrual_cycle_day" | "basal_temp"
  | "peak_flow" | "fev1" | "pain_level";

export type MetricSource =
  | "phone" | "phone_ppg" | "phone_mic" | "phone_camera" | "phone_motion"
  | "wearable" | "medical_device" | "manual" | "ehr" | "voice_cv" | "digital_human"
  | "cgm" | "bp_monitor" | "pulse_ox" | "thermometer" | "scale" | "spirometer"
  | "ecg_monitor" | "sleep_mat";

export interface HealthMetric {
  id: string;
  kind: MetricKind;
  value: number;
  unit: string;
  at: string; // ISO
  source: MetricSource;
  label: HealthLabel;
  deviceId?: string;
  note?: string;
  raw?: Record<string, number>;
}

export interface DailyHealth {
  date?: string;
  score: number;
  readiness: number;
  recovery: number;
  sleepQuality: number;
  fitness: number;
  cardioTrend: number;
  mentalWellness: number;
  nutrition: number;
  hydration: number;
  fatigue: number;
  stressLevel: number;
  riskFlags: string[];
  label: HealthLabel;
}

export type WorkoutKind =
  | "run" | "treadmill_run" | "trail_run" | "cycle" | "indoor_cycle"
  | "strength" | "hiit" | "yoga" | "pilates" | "swim" | "walk" | "hike"
  | "rowing" | "elliptical" | "stair_climber" | "dance" | "boxing" | "mma"
  | "crossfit" | "functional" | "jump_rope" | "ski" | "snowboard" | "surf"
  | "tennis" | "basketball" | "soccer" | "golf" | "climbing" | "mountain_bike"
  | "stretching" | "meditation" | "breathwork" | "recovery" | "sport_other"
  | "coached_ai" | "custom";

export interface FitnessSession {
  id: string;
  kind: WorkoutKind;
  title?: string;
  durationMin: number;
  calories: number;
  distanceKm?: number;
  avgHr: number;
  peakHr: number;
  avgCadence?: number;
  avgPower?: number;
  zones?: { z1: number; z2: number; z3: number; z4: number; z5: number };
  coaching: boolean;
  coachingMode?: "voice_live" | "digital_human" | "programmed" | "none";
  voiceCoachId?: string;
  perceivedExertion?: number; // 1-10
  at: string;
  label: HealthLabel;
}

export interface Medication {
  id: string;
  name: string;
  generic?: string;
  dose: string;
  frequency: string;
  route?: string;
  prescriber?: string;
  pharmacy?: string;
  startDate?: string;
  endDate?: string;
  refillsLeft?: number;
  adherencePct: number;
  dosesMissed7d: number;
  dosesTaken7d: number;
  nextDose?: string;
  lastTaken?: string;
  remindersOn: boolean;
  interactionsWarning?: string[];
  label: HealthLabel;
}

export type AlertKind =
  | "sos" | "fall_detected" | "abnormal_vitals" | "afib_suspected"
  | "med_missed" | "high_bp" | "low_spo2" | "glucose_critical"
  | "temperature_fever" | "inactivity" | "crash_detected" | "medication_interaction"
  | "reminder_vaccination" | "reminder_screening" | "caregiver_checkin";

export interface EmergencyAlert {
  id: string;
  kind: AlertKind;
  severity: "info" | "warn" | "critical" | "emergency";
  at: string;
  message: string;
  vitalsSnapshot?: Partial<Record<MetricKind, number>>;
  contactsNotified: number;
  acknowledged: boolean;
  acknowledgedAt?: string;
  responderArrivedAt?: string;
  resolvedAt?: string;
  location?: { lat: number; lon: number };
  label: HealthLabel;
}

export interface HealthInsight {
  id: string;
  text: string;
  kind: "trend" | "anomaly" | "recommendation" | "reminder" | "coaching" | "risk";
  label: HealthLabel;
  confidence: number;
  citedSource?: string;
  citedKinds?: MetricKind[];
  category: "cardio" | "sleep" | "activity" | "nutrition" | "mental" | "meds" | "preventive" | "general";
  actionable: boolean;
  actionText?: string;
  disclaimer?: string;
  createdAt: string;
}

export interface DailyNote {
  id: string;
  date: string; // YYYY-MM-DD
  mood?: number; // 1-5
  energy?: number; // 1-5
  symptoms: string[];
  journal: string;
  tags: string[];
  meals?: Array<{ name: string; calories?: number; carbsG?: number; proteinG?: number; fatG?: number; time?: string }>;
  waterMl?: number;
  caffeineMg?: number;
  alcoholUnits?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WearableDevice {
  id: string;
  vendor: HealthProfile["wearableVendor"];
  model: string;
  batteryPct: number;
  lastSync: string;
  connected: boolean;
  metricsEnabled: MetricKind[];
  label: HealthLabel;
}

export interface MedicalDevice {
  id: string;
  kind: "bp_monitor" | "cgm" | "pulse_ox" | "ecg" | "thermometer" | "scale" | "spirometer" | "sleep_mat" | "glucose_meter";
  vendor: string;
  model: string;
  lastReading: string;
  connected: boolean;
  calibrationStatus: "ok" | "due" | "expired";
  label: HealthLabel;
}

export interface Vaccination {
  id: string;
  name: string;
  lastDose?: string;
  nextDose?: string;
  dosesReceived: number;
  dosesRequired: number;
  status: "up_to_date" | "due" | "overdue" | "recommended";
}

export interface Screening {
  id: string;
  name: string;
  frequency: string;
  lastCompleted?: string;
  nextDue: string;
  status: "up_to_date" | "due" | "overdue";
}

export interface CoachingSession {
  id: string;
  coachType: "voice" | "digital_human" | "ai_text";
  focus: WorkoutKind | "nutrition" | "mental" | "sleep" | "recovery" | "general";
  startedAt: string;
  durationSec: number;
  feedbackRating?: number;
  transcript?: string;
}

export interface HealthDashboard {
  profile?: HealthProfile;
  today: DailyHealth;
  weeklyAvg: DailyHealth;
  monthlyAvg: DailyHealth;
  recentMetrics: HealthMetric[];
  recentSessions: FitnessSession[];
  medications: Medication[];
  notesRecent: DailyNote[];
  emergencyAlerts30d: EmergencyAlert[];
  wearableBatteryPct?: number;
  wearables: WearableDevice[];
  medicalDevices: MedicalDevice[];
  vaccinations: Vaccination[];
  screenings: Screening[];
  activeCoaching: boolean;
  activeCoachingSession?: CoachingSession;
  consentStatus: "full" | "partial" | "none";
  consentVersion: string;
  complianceFlags: string[];
  privacyMode: "standard" | "hipaa" | "gdpr" | "local_only";
  insights: HealthInsight[];
  vaccinationUpcoming: number;
  screeningsDue: number;
  labelBreakdown: Record<HealthLabel, number>;
  disclaimer: string;
  modules: Array<{
    id: string;
    name: string;
    enabled: boolean;
    route: string;
    description: string;
    icon: string;
  }>;
  familyMembers?: Array<{ id: string; name: string; relation: string; age?: number; shared: boolean }>;
}

// Sub-module registration — mirrors the 20+ modules defined in Source 12 (V10.0)
export const HEALTH_MODULES = [
  { id: "symptom_checker", name: "Symptom Checker", route: "/symptoms", icon: "stethoscope", description: "AI triage with three-bucket labeling." },
  { id: "medication",      name: "Medication Manager", route: "/medications", icon: "pill", description: "Adherence, interactions, refills." },
  { id: "heart_center",    name: "Heart Center", route: "/heart", icon: "heart-pulse", description: "HR, HRV, BP, ECG, AFib detection." },
  { id: "bp_center",       name: "Blood Pressure Center", route: "/bp", icon: "activity", description: "Trends, MAP, pulse pressure, hypertension screening." },
  { id: "diabetes",        name: "Diabetes Center", route: "/diabetes", icon: "droplet", description: "CGM, HbA1c, bolus calculator, time-in-range." },
  { id: "sleep",           name: "Sleep Lab", route: "/sleep", icon: "moon", description: "Stages, apnea screening, recovery correlation." },
  { id: "womens_health",   name: "Women's Health", route: "/womens", icon: "heart", description: "Cycle tracking, fertility, menopause." },
  { id: "pregnancy",       name: "Pregnancy", route: "/pregnancy", icon: "baby", description: "Week-by-week tracking, kick counter, prenatal." },
  { id: "child_growth",    name: "Child Growth", route: "/pediatrics", icon: "child", description: "Growth percentiles, vaccines, milestones." },
  { id: "elder_care",      name: "Elder Care", route: "/elder", icon: "users", description: "Fall detection, adherence, caregiver dashboard." },
  { id: "nutrition",       name: "Nutrition", route: "/nutrition", icon: "utensils", description: "Logging, macros, allergen scanning, hydration." },
  { id: "hydration",       name: "Hydration Coach", route: "/hydration", icon: "glass-water", description: "Intake tracking, reminders." },
  { id: "fitness_coach",   name: "Fitness Platform", route: "/fitness", icon: "dumbbell", description: "100+ workout types, GPS, zones." },
  { id: "ai_workouts",     name: "AI Workout Engine", route: "/workouts", icon: "sparkles", description: "Adaptive plans, form analysis via CV." },
  { id: "voice_coach",     name: "Voice Workout Coach", route: "/voice-coach", icon: "mic", description: "Real-time voice coaching (S40/41)." },
  { id: "mental_wellness", name: "Mental Wellness", route: "/mental", icon: "brain", description: "Mood, meditation, CBT exercises." },
  { id: "vaccinations",    name: "Vaccinations", route: "/vaccines", icon: "syringe", description: "Schedule, reminders, records." },
  { id: "records_vault",   name: "Health Records Vault", route: "/records", icon: "folder", description: "EHR sync, lab results, imaging (S65)." },
  { id: "family_dashboard", name: "Family Dashboard", route: "/family", icon: "users", description: "Dependents, caregivers, sharing." },
  { id: "sos",             name: "Emergency SOS", route: "/sos", icon: "siren", description: "One-tap emergency, fall detection (S73)." },
  { id: "telemedicine",    name: "Telemedicine", route: "/telehealth", icon: "video", description: "Video visits with digital-human intake (S62)." },
  { id: "doctor_booking",  name: "Doctor Booking", route: "/providers", icon: "calendar", description: "Provider search, scheduling." },
  { id: "lab_booking",     name: "Lab Booking", route: "/labs", icon: "flask-conical", description: "Lab orders, at-home kits, results." },
  { id: "pharmacy",        name: "Pharmacy", route: "/pharmacy", icon: "pill", description: "Rx delivery, coupons (S79-80)." },
  { id: "insurance",       name: "Insurance", route: "/insurance", icon: "shield", description: "Claims, benefits, EOBs (S81)." },
] as const;
