/** Session 65 / Session 174 — Biomedical & Healthcare Intelligence client */
import { api } from "./api";
import type {
  BiomedicalDashboard,
  ImagingStudy,
  PharmacyAlert,
  TelemedicineSession,
  HospitalOpsMetric,
} from "@windels/shared";
export type {
  BiomedicalDashboard,
  ImagingStudy,
  PharmacyAlert,
  TelemedicineSession,
  HospitalOpsMetric,
} from "@windels/shared";

export const bioApi = {
  dashboard: () => api<BiomedicalDashboard>("/biomedical/dashboard/rollup"),
  listStudies: (limit = 50) => api<ImagingStudy[]>(`/biomedical/studies?limit=${limit}`),
  getStudy: (id: string) => api<ImagingStudy>(`/biomedical/studies/${encodeURIComponent(id)}`),
  submitStudy: (input: { modality: ImagingStudy["modality"]; bodyPart: string }) =>
    api<ImagingStudy>("/biomedical/studies", { method: "POST", json: input }),
  recordFindings: (
    id: string,
    input: { findings: ImagingStudy["aiFindings"]; reviewedByRadiologist?: boolean },
  ) => api<ImagingStudy>(`/biomedical/studies/${encodeURIComponent(id)}/findings`, { method: "POST", json: input }),
  addPharmacyAlert: (input: Omit<PharmacyAlert, "id" | "at"> & { at?: string }) =>
    api<PharmacyAlert>("/biomedical/pharmacy-alerts", { method: "POST", json: input }),
  startTelemedSession: (input: { providerId: string; modality: TelemedicineSession["modality"]; language?: string; aiScribeActive?: boolean }) =>
    api<TelemedicineSession>("/biomedical/telemedicine/sessions", { method: "POST", json: input }),
  endTelemedSession: (id: string) =>
    api<TelemedicineSession>(`/biomedical/telemedicine/sessions/${encodeURIComponent(id)}/end`, { method: "POST" }),
  setOpsMetrics: (metrics: HospitalOpsMetric[]) =>
    api<HospitalOpsMetric[]>("/biomedical/ops-metrics", { method: "POST", json: { metrics } }),
};
