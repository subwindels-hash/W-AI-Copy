/** Session 46 — Enterprise AI Model Factory. */
import { api } from "./api";
import type { Mf2BenchmarkResult, Mf2Dashboard, Mf2FineTuneJob, Mf2Model, Mf2Stage } from "@windels/shared";
export type { Mf2BenchmarkResult, Mf2Dashboard, Mf2FineTuneJob, Mf2Model, Mf2Stage } from "@windels/shared";

export const mf2Api = {
  dashboard: () => api<Mf2Dashboard>("/model-factory/dashboard/rollup"),
  models: (stage?: Mf2Stage) => api<Mf2Model[]>("/model-factory/models", stage ? { params: { stage } } : {}),
  create: (input: { name: string; builder: Mf2Model["builder"]; size: string; quant: string; vramMb: number }) =>
    api<Mf2Model>("/model-factory/models", { method: "POST", json: input }),
  advance: (id: string, to: Mf2Stage) => api<Mf2Model>(`/model-factory/models/${id}/advance`, { method: "POST", json: { to } }),
  benchmark: (id: string, bench: string) => api<Mf2BenchmarkResult>(`/model-factory/models/${id}/benchmark`, { method: "POST", json: { benchmark: bench } }),
  safety: (id: string, passed: boolean) => api<Mf2Model>(`/model-factory/models/${id}/safety`, { method: "POST", json: { passed } }),
  approve: (id: string) => api<Mf2Model>(`/model-factory/models/${id}/governance-approve`, { method: "POST" }),
  fineTunes: () => api<Mf2FineTuneJob[]>("/model-factory/fine-tunes"),
  startFineTune: (input: { modelId?: string; dataset: string; method: Mf2FineTuneJob["method"] }) =>
    api<Mf2FineTuneJob>("/model-factory/fine-tunes", { method: "POST", json: input }),
};
