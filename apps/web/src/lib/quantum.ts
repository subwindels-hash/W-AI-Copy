/** Session 63 — Quantum Readiness client */
import { api } from "./api";
import type { QuantumDashboard, CryptoInventoryEntry, QuantumConnector, QuantumOptimizationJob } from "@windels/shared";
export type { QuantumDashboard, CryptoInventoryEntry, QuantumConnector, QuantumOptimizationJob } from "@windels/shared";

export const qApi = {
  dashboard: () => api<QuantumDashboard>("/quantum/dashboard/rollup"),
  inventory: () => api<CryptoInventoryEntry[]>("/quantum/inventory"),
  connectors: () => api<QuantumConnector[]>("/quantum/connectors"),
  jobs: () => api<QuantumOptimizationJob[]>("/quantum/jobs"),
  submitJob: (input: { kind: QuantumOptimizationJob["kind"]; problem: QuantumOptimizationJob["problem"]; vendor?: QuantumConnector["vendor"] }) =>
    api<QuantumOptimizationJob>("/quantum/jobs", { method: "POST", json: input }),
};
