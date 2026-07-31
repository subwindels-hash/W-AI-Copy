/** Session 69 — Cognitive Evolution & World Intelligence client */
import { api } from "./api";
import type { CognitiveDashboard } from "@windels/shared";
export type { CognitiveDashboard } from "@windels/shared";
export const cogApi = {
  dashboard: () => api<CognitiveDashboard>("/cognitive/dashboard/rollup"),
};
