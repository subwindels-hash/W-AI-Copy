/** Session 106 — typed Autonomous Organization approval client. */
import { api } from "./api";
import type { AutDecisionCreateInput, AutDecisionListQuery, AutDecisionResolveInput, AutonomousDashboard, BoardDecision } from "@windels/shared/autonomous";

export type { AutDecisionCreateInput, AutDecisionListQuery, AutDecisionResolveInput, AutonomousDashboard, BoardDecision } from "@windels/shared/autonomous";

export const autApi = {
  dashboard: () => api<AutonomousDashboard>("/autonomous/dashboard/rollup"),
  decisions: (query?: AutDecisionListQuery) => api<BoardDecision[]>("/autonomous/decisions", { params: query }),
  getDecision: (id: string) => api<BoardDecision>(`/autonomous/decisions/${id}`),
  propose: (input: AutDecisionCreateInput) => api<BoardDecision>("/autonomous/decisions", { method: "POST", json: input }),
  resolve: (id: string, input: AutDecisionResolveInput) => api<BoardDecision>(`/autonomous/decisions/${id}/resolve`, { method: "POST", json: input }),
  deleteDecision: (id: string) => api<{ deleted: boolean; id: string }>(`/autonomous/decisions/${id}`, { method: "DELETE" }),
};
