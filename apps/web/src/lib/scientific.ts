/** Session 68 — Scientific Research client */
import { api } from "./api";
import type { ScientificDashboard, LiteratureRef } from "@windels/shared";
export type { ScientificDashboard, LiteratureRef } from "@windels/shared";
export const sciApi = {
  dashboard: () => api<ScientificDashboard>("/scientific/dashboard/rollup"),
  papers: (q?: string) => api<LiteratureRef[]>(`/scientific/papers${q?`?q=${encodeURIComponent(q)}`:""}`),
};
