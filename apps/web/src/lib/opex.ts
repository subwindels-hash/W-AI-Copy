/** Session 73 — Operational Excellence & Responsible AI client */
import { api } from "./api";
import type { OpexDashboard } from "@windels/shared";
export type { OpexDashboard } from "@windels/shared";
export const opexApi = {
  dashboard: () => api<OpexDashboard>("/opex/dashboard/rollup"),
};
