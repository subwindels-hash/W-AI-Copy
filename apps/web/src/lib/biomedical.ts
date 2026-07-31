/** Session 65 — Biomedical & Healthcare Intelligence client */
import { api } from "./api";
import type { BiomedicalDashboard, ImagingStudy } from "@windels/shared";
export type { BiomedicalDashboard, ImagingStudy } from "@windels/shared";

export const bioApi = {
  dashboard: () => api<BiomedicalDashboard>("/biomedical/dashboard/rollup"),
  submitStudy: (input: { modality: ImagingStudy["modality"]; bodyPart: string }) =>
    api<ImagingStudy>("/biomedical/studies", { method: "POST", json: input }),
};
