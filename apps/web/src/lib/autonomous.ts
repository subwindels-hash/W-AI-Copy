/** Session 72 — Autonomous Organization client */
import { api } from "./api";
import type { AutonomousDashboard } from "@windels/shared";
export type { AutonomousDashboard } from "@windels/shared";
export const autApi = {
  dashboard: () => api<AutonomousDashboard>("/autonomous/dashboard/rollup"),
};
