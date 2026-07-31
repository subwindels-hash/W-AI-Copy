/** Session 64 — Sustainability & ESG client */
import { api } from "./api";
import type { SustainabilityDashboard } from "@windels/shared";
export type { SustainabilityDashboard } from "@windels/shared";

export const esgApi = {
  dashboard: () => api<SustainabilityDashboard>("/sustainability/dashboard/rollup"),
};
