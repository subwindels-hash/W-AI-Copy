/** Session 63 / 157 — Quantum Readiness client */
import { api } from "./api";
import type {
  QuantumDashboard, CryptoInventoryEntry, QuantumConnector, QuantumOptimizationJob,
  CreateCryptoEntryInput, UpdateCryptoEntryInput, SubmitQuantumJobInput,
} from "@windels/shared";

export type {
  QuantumDashboard, CryptoInventoryEntry, QuantumConnector, QuantumOptimizationJob,
  CreateCryptoEntryInput, UpdateCryptoEntryInput, SubmitQuantumJobInput,
};
export { PQ_ALGORITHMS, QUANTUM_VENDORS, QUANTUM_JOB_KINDS, QUANTUM_JOB_PROBLEMS, CRYPTO_MIGRATION_STATUS } from "@windels/shared";

export const qApi = {
  dashboard: () => api<QuantumDashboard>("/quantum/dashboard/rollup"),
  inventory: () => api<CryptoInventoryEntry[]>("/quantum/inventory"),
  getInventory: (id: string) => api<CryptoInventoryEntry>(`/quantum/inventory/${id}`),
  createInventory: (input: CreateCryptoEntryInput) =>
    api<CryptoInventoryEntry>("/quantum/inventory", { method: "POST", json: input }),
  updateInventory: (id: string, input: UpdateCryptoEntryInput) =>
    api<CryptoInventoryEntry>(`/quantum/inventory/${id}`, { method: "PATCH", json: input }),
  removeInventory: (id: string) =>
    api<{ deleted: boolean; id: string }>(`/quantum/inventory/${id}`, { method: "DELETE" }),
  connectors: () => api<QuantumConnector[]>("/quantum/connectors"),
  jobs: () => api<QuantumOptimizationJob[]>("/quantum/jobs"),
  submitJob: (input: SubmitQuantumJobInput) =>
    api<QuantumOptimizationJob>("/quantum/jobs", { method: "POST", json: input }),
};
