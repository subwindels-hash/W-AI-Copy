/** Session 82 — Cybersecurity Academy & Multi-Cloud Security client */
import { api } from "./api";
import type { CyberDashboard, CyberLab } from "@windels/shared";
export type { CyberDashboard, CyberLab } from "@windels/shared";
export const cybApi = {
  dashboard: () => api<CyberDashboard>("/cyber/dashboard/rollup"),
  startLab: (input: { domain: string; difficulty: string; cloud?: string }) => api<CyberLab>("/cyber/labs", { method: "POST", json: input }),
};
