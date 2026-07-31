/** Session 57 — Robotics & Physical Automation client */
import { api } from "./api";
import type { Robot, RoboticsDashboard, PredictiveMaintAlert } from "@windels/shared";
export type { Robot, RoboticsDashboard, PredictiveMaintAlert } from "@windels/shared";

export const roboticsApi = {
  dashboard: () => api<RoboticsDashboard>("/robotics/dashboard/rollup"),
  list: () => api<Robot[]>("/robotics/robots"),
  get: (id: string) => api<Robot>(`/robotics/robots/${id}`),
  create: (input: { name: string; kind: Robot["kind"]; site: string; zone?: string; serial?: string }) =>
    api<Robot>("/robotics/robots", { method: "POST", json: input }),
  command: (id: string, action: "start"|"pause"|"stop"|"reset"|"maintenance") =>
    api<Robot>(`/robotics/robots/${id}/command`, { method: "POST", json: { action } }),
  predictiveScan: () => api<PredictiveMaintAlert[]>("/robotics/predictive/scan", { method: "POST" }),
};
