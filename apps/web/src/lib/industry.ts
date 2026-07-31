/** Session 74 — Semantic Intelligence, Industry Solutions & Digital Operations client */
import { api } from "./api";
import type { IndustryDashboard } from "@windels/shared";
export type { IndustryDashboard } from "@windels/shared";
export const indApi = {
  dashboard: () => api<IndustryDashboard>("/industry/dashboard/rollup"),
};
