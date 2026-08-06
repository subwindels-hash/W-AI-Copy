/** Session 100 — typed client for org-scoped Enterprise FinOps depth. */
import { api } from "./api";
import type {
  EfoAllocation,
  EfoAllocationCreateInput,
  EfoBudget,
  EfoBudgetCreateInput,
  EfoChargeback,
  EfoChargebackQuery,
  EfoCostCenter,
  EfoCostCenterCreateInput,
  EfoCostEntry,
  EfoCostEntryCreateInput,
  EfoRollup,
} from "@windels/shared/enterpriseFinOps";

export type {
  EfoAllocation,
  EfoAllocationCreateInput,
  EfoAllocationMethod,
  EfoBudget,
  EfoBudgetCreateInput,
  EfoBudgetPeriod,
  EfoChargeback,
  EfoChargebackQuery,
  EfoCostCenter,
  EfoCostCenterCreateInput,
  EfoCostEntry,
  EfoCostEntryCreateInput,
  EfoRollup,
} from "@windels/shared/enterpriseFinOps";

export const enterpriseFinOpsApi = {
  rollup: () => api<EfoRollup>("/finops/dashboard/rollup"),
  listCostCenters: (status?: string) => api<EfoCostCenter[]>("/finops/cost-centers", { params: { status } }),
  createCostCenter: (input: EfoCostCenterCreateInput) => api<EfoCostCenter>("/finops/cost-centers", { method: "POST", json: input }),
  updateCostCenter: (id: string, patch: Partial<EfoCostCenterCreateInput>) => api<EfoCostCenter>(`/finops/cost-centers/${id}`, { method: "PATCH", json: patch }),
  deleteCostCenter: (id: string) => api<{ deleted: boolean; id: string }>(`/finops/cost-centers/${id}`, { method: "DELETE" }),

  listBudgets: (costCenterId?: string) => api<EfoBudget[]>("/finops/budgets", { params: { costCenterId } }),
  createBudget: (input: EfoBudgetCreateInput) => api<EfoBudget>("/finops/budgets", { method: "POST", json: input }),
  updateBudget: (id: string, patch: Partial<EfoBudgetCreateInput>) => api<EfoBudget>(`/finops/budgets/${id}`, { method: "PATCH", json: patch }),
  deleteBudget: (id: string) => api<{ deleted: boolean; id: string }>(`/finops/budgets/${id}`, { method: "DELETE" }),

  listCosts: (filter?: { provider?: string; category?: string; costCenterId?: string; currency?: string }) => api<EfoCostEntry[]>("/finops/costs", { params: filter }),
  createCost: (input: EfoCostEntryCreateInput) => api<EfoCostEntry>("/finops/costs", { method: "POST", json: input }),
  deleteCost: (id: string) => api<{ deleted: boolean; id: string }>(`/finops/costs/${id}`, { method: "DELETE" }),

  listAllocations: (filter?: { costId?: string; costCenterId?: string }) => api<EfoAllocation[]>("/finops/allocations", { params: filter }),
  createAllocation: (input: EfoAllocationCreateInput) => api<EfoAllocation>("/finops/allocations", { method: "POST", json: input }),
  deleteAllocation: (id: string) => api<{ deleted: boolean; id: string }>(`/finops/allocations/${id}`, { method: "DELETE" }),

  chargebacks: (query?: EfoChargebackQuery) => api<EfoChargeback[]>("/finops/chargebacks", { params: query }),
};
