/** Session 70 — Global Command Center client */
import { api } from "./api";
import type { GlobalCommandDashboard } from "@windels/shared";
export type { GlobalCommandDashboard } from "@windels/shared";
export const gccApi = {
  dashboard: () => api<GlobalCommandDashboard>("/command/dashboard/rollup"),
};
