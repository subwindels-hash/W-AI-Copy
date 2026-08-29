/**
 * Session 43 — Hybrid AI Execution.
 * Session 194 — added setMode() and setFlag() for the per-org config
 * that the dashboard now reads rather than asserting the legacy
 * hardcoded values.
 */
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
  setMode: (mode: HxExecutionMode) => api<{ mode: HxExecutionMode }>("/hybrid-execution/mode", { method: "PUT", json: { mode } }),
  setFlag: (key: "costOptimization" | "vendorNeutral" | "routedThroughKernel", enabled: boolean) =>
    api<{ key: string; enabled: boolean }>("/hybrid-execution/flags", { method: "PUT", json: { key, enabled } }),
};
