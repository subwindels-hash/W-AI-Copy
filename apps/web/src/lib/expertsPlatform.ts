/**
 * Session 77A — Professional Intelligence Platform (Expert Agents) API client.
 */
import { api } from "./api";
import type { EpDashboard, EpExpertAgent, EpCourse, EpExpertPackage, EpExpertQueryResult } from "@windels/shared";
export type { EpDashboard, EpExpertAgent, EpCourse, EpExpertPackage, EpExpertQueryResult, EpExpertAnswer, EpExpertNoAnswer } from "@windels/shared";

export const epApi = {
  dashboard: () => api<EpDashboard>("/experts/dashboard/rollup"),
  agents: () => api<EpExpertAgent[]>("/experts/agents"),
  query: (id: string, question: string) =>
    api<EpExpertQueryResult>(`/experts/agents/${id}/query`, { method: "POST", json: { question } }),
  courses: () => api<EpCourse[]>("/experts/courses"),
  packages: () => api<EpExpertPackage[]>("/experts/packages"),
};
