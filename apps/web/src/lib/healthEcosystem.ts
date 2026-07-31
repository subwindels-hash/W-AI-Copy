/** Session 75 — Health, Wellness & Digital Healthcare Ecosystem client */
import { api } from "./api";
import type { HealthDashboard, HealthMetric, FitnessSession, Medication, DailyNote, EmergencyAlert, HealthInsight } from "@windels/shared";
export type { HealthDashboard, HealthMetric, FitnessSession, Medication, DailyNote, EmergencyAlert, HealthInsight } from "@windels/shared";

export const hecApi = {
  dashboard: () => api<HealthDashboard>("/health-ecosystem/dashboard/rollup"),

  listMetrics: (params?: { kind?: string; limit?: number }) =>
    api.get<HealthMetric[]>(`/health-ecosystem/metrics`, params),
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
    api.get<HealthInsight[]>(`/health-ecosystem/insights`, label ? { label } : undefined),

  modules: () => api.get<any[]>("/health-ecosystem/modules"),
  disclaimer: () => api.get<{ disclaimer: string; rule: string }>("/health-ecosystem/disclaimer"),
};
