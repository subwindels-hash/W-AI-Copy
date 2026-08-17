/** Session 75 / 175 — Health, Wellness & Digital Healthcare Ecosystem client */
import { api } from "./api";
import type {
  HealthDashboard,
  HealthProfile,
  HealthMetric,
  FitnessSession,
  Medication,
  DailyNote,
  EmergencyAlert,
  HealthInsight,
  WearableDevice,
  MedicalDevice,
  Vaccination,
  Screening,
} from "@windels/shared";
export type {
  HealthDashboard,
  HealthProfile,
  HealthMetric,
  FitnessSession,
  Medication,
  DailyNote,
  EmergencyAlert,
  HealthInsight,
  WearableDevice,
  MedicalDevice,
  Vaccination,
  Screening,
} from "@windels/shared";

export const hecApi = {
  dashboard: () => api<HealthDashboard>("/health-ecosystem/dashboard/rollup"),

  getProfile: () => api.get<HealthProfile | null>("/health-ecosystem/profile"),
  upsertProfile: (input: Partial<HealthProfile>) => api.post<HealthProfile>("/health-ecosystem/profile", input),

  listMetrics: (params?: { kind?: string; limit?: number }) =>
    api.get<HealthMetric[]>("/health-ecosystem/metrics", params),
  addMetric: (input: Partial<HealthMetric>) => api.post<HealthMetric>("/health-ecosystem/metrics", input),

  listSessions: () => api.get<FitnessSession[]>("/health-ecosystem/fitness-sessions"),
  addSession: (input: Partial<FitnessSession>) => api.post<FitnessSession>("/health-ecosystem/fitness-sessions", input),

  listMedications: () => api.get<Medication[]>("/health-ecosystem/medications"),
  addMedication: (input: Partial<Medication>) => api.post<Medication>("/health-ecosystem/medications", input),
  deleteMedication: (id: string) => api<void>(`/health-ecosystem/medications/${id}`, { method: "DELETE" }),

  listNotes: () => api.get<DailyNote[]>("/health-ecosystem/notes"),
  addNote: (input: Partial<DailyNote>) => api.post<DailyNote>("/health-ecosystem/notes", input),

  listAlerts: () => api.get<EmergencyAlert[]>("/health-ecosystem/emergency-alerts"),
  addAlert: (input: Partial<EmergencyAlert>) => api.post<EmergencyAlert>("/health-ecosystem/emergency-alerts", input),
  ackAlert: (id: string) => api.post<EmergencyAlert>(`/health-ecosystem/emergency-alerts/${id}/acknowledge`, {}),

  listInsights: (label?: string) =>
    api.get<HealthInsight[]>("/health-ecosystem/insights", label ? { label } : undefined),

  listWearables: () => api.get<WearableDevice[]>("/health-ecosystem/wearables"),
  addWearable: (input: Partial<WearableDevice>) => api.post<WearableDevice>("/health-ecosystem/wearables", input),

  listMedicalDevices: () => api.get<MedicalDevice[]>("/health-ecosystem/medical-devices"),
  addMedicalDevice: (input: Partial<MedicalDevice>) => api.post<MedicalDevice>("/health-ecosystem/medical-devices", input),

  listVaccinations: () => api.get<Vaccination[]>("/health-ecosystem/vaccinations"),
  addVaccination: (input: Partial<Vaccination>) => api.post<Vaccination>("/health-ecosystem/vaccinations", input),

  listScreenings: () => api.get<Screening[]>("/health-ecosystem/screenings"),
  addScreening: (input: Partial<Screening>) => api.post<Screening>("/health-ecosystem/screenings", input),

  modules: () => api.get<any[]>("/health-ecosystem/modules"),
  disclaimer: () => api.get<{ disclaimer: string; rule: string }>("/health-ecosystem/disclaimer"),
};
