/** Session 103 — typed AI Economy / GPU ledger client. */
import { api } from "./api";
import type {
  AiEconomyAllocationInput,
  AiEconomyOfferInput,
  AiEconomyResource,
  AiEconomyUsageInput,
  AiUsageEntry,
  ComputeOffer,
  EconomyDashboard,
  GpuAllocation,
} from "@windels/shared/aiEconomy";

export type { AiEconomyResource, AiEconomyUsageInput, AiEconomyAllocationInput, AiEconomyOfferInput, AiUsageEntry, ComputeOffer, EconomyDashboard, GpuAllocation } from "@windels/shared/aiEconomy";

export const ecoApi = {
  dashboard: () => api<EconomyDashboard>("/ai-economy/dashboard/rollup"),
  usage: (limit = 100) => api<AiUsageEntry[]>("/ai-economy/usage", { params: { limit } }),
  recordUsage: (input: AiEconomyUsageInput) => api<AiUsageEntry>("/ai-economy/usage", { method: "POST", json: input }),
  deleteUsage: (id: string) => api<{ deleted: boolean; id: string }>(`/ai-economy/usage/${id}`, { method: "DELETE" }),
  allocations: (limit = 100) => api<GpuAllocation[]>("/ai-economy/allocations", { params: { limit } }),
  createAllocation: (input: AiEconomyAllocationInput) => api<GpuAllocation>("/ai-economy/allocations", { method: "POST", json: input }),
  deleteAllocation: (id: string) => api<{ deleted: boolean; id: string }>(`/ai-economy/allocations/${id}`, { method: "DELETE" }),
  offers: () => api<ComputeOffer[]>("/ai-economy/offers"),
  createOffer: (input: AiEconomyOfferInput) => api<ComputeOffer>("/ai-economy/offers", { method: "POST", json: input }),
  updateOffer: (id: string, patch: Partial<AiEconomyOfferInput>) => api<ComputeOffer>(`/ai-economy/offers/${id}`, { method: "PATCH", json: patch }),
  deleteOffer: (id: string) => api<{ deleted: boolean; id: string }>(`/ai-economy/offers/${id}`, { method: "DELETE" }),
};
