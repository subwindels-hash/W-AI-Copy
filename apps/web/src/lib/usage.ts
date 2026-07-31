/** Session 55 — Usage Intelligence client */
import { api } from "./api";
import type { UsageDashboard } from "@windels/shared";
export type { UsageDashboard } from "@windels/shared";

export const usageApi = {
  dashboard: () => api<UsageDashboard>("/usage-intel/dashboard/rollup"),
};
