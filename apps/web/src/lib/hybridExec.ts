/** Session 43 — Hybrid AI Execution. */
import { api } from "./api";
import type { HxDashboard, HxExecutionMode, HxGpuNode, HxModel, HxRouteDecision } from "@windels/shared";
export type { HxDashboard, HxExecutionMode, HxGpuNode, HxModel, HxRouteDecision } from "@windels/shared";

export const hxApi = {
  dashboard: () => api<HxDashboard>("/hybrid-execution/dashboard/rollup"),
  models: (status?: HxModel["status"]) => api<HxModel[]>("/hybrid-execution/models", status ? { params: { status } } : {}),
  registerModel: (input: { name: string; modality: HxModel["modality"]; size: string; quant: string; vramMb: number; provider: HxModel["provider"] }) =>
    api<HxModel>("/hybrid-execution/models", { method: "POST", json: input }),
  promoteCanary: (id: string, pct: number) => api<HxModel>(`/hybrid-execution/models/${id}/canary`, { method: "POST", json: { pct } }),
  rollback: (id: string) => api<HxModel>(`/hybrid-execution/models/${id}/rollback`, { method: "POST" }),
  nodes: () => api<HxGpuNode[]>("/hybrid-execution/nodes"),
  route: (input: { modality: string; requiredVramMb: number; safetyCritical?: boolean; costOptimize?: boolean }) =>
    api<HxRouteDecision>("/hybrid-execution/route", { method: "POST", json: input }),
};
