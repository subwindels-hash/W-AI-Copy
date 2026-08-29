/** Session 42 — Universal Media Generation. */
import { api } from "./api";
import type { MgDashboard, MgJob, MgCapability } from "@windels/shared";
export type { MgDashboard, MgJob, MgCapability } from "@windels/shared";

export const mgApi = {
  dashboard: () => api<MgDashboard>("/media-generation/dashboard/rollup"),
  capabilities: (modality?: "image"|"audio"|"video") => api<MgCapability[]>("/media-generation/capabilities", modality ? { params: { modality } } : {}),
  generate: (input: { modality: "image"|"audio"|"video"; op: string; prompt: string; childTargeted?: boolean }) =>
    api<MgJob>("/media-generation/generate", { method: "POST", json: input }),
  jobs: () => api<MgJob[]>("/media-generation/jobs"),
};
