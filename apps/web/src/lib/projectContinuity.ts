/** Session 84 — Project Continuity & Codebase Import client */
import { api } from "./api";

export interface ProjectIntakeRecord {
  id: string;
  originalname: string;
  size: number;
  hash: string;
  status: "pending" | "scanning" | "quarantined" | "accepted" | "failed";
  findings: string[];
  createdAt: string;
}

export const projectContinuityApi = {
  list: () => api<ProjectIntakeRecord[]>("/projects"),
  extract: (id: string) => api<{ success: boolean; path: string }>(`/projects/${id}/extract`, { method: "POST" }),
  inventory: (id: string) => api<any>(`/projects/${id}/inventory`, { method: "POST" }),
  verify: (id: string) => api<any>(`/projects/${id}/verify`, { method: "POST" }),
};
