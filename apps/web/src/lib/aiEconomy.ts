/** Session 71 — AI Economy client */
import { api } from "./api";
import type { EconomyDashboard } from "@windels/shared";
export type { EconomyDashboard } from "@windels/shared";
export const ecoApi = {
  dashboard: () => api<EconomyDashboard>("/ai-economy/dashboard/rollup"),
};
