import { api } from "./api";
import type {
  FinancialDashboard,
  FinancialDecisionRequest,
  FinancialDecisionResponse,
  FinancialLedgerEntry,
  FinancialProvenance,
  FinancialProvenanceInput,
} from "@windels/shared";
export type {
  FinancialDashboard,
  FinancialDecisionRequest,
  FinancialDecisionResponse,
  FinancialLedgerEntry,
  FinancialProvenance,
  FinancialProvenanceInput,
} from "@windels/shared";

export const financialApi = {
  dashboard: () => api<FinancialDashboard>("/financial/dashboard/rollup"),
  status: () => api<{ runtimeMode: string; demoData: boolean }>("/financial/status"),
  ledger: (limit = 100) => api<FinancialLedgerEntry[]>(`/financial/ledger?limit=${limit}`),
  check: (input: FinancialDecisionRequest) =>
    api<FinancialDecisionResponse>("/financial/check", { method: "POST", json: input }),
  decide: (input: FinancialDecisionRequest) =>
    api<FinancialDecisionResponse>("/financial/decide", { method: "POST", json: input }),
  createReal: (input: FinancialProvenanceInput) =>
    api<FinancialProvenance>("/financial/provenance/real", { method: "POST", json: input }),
  createSimulated: (input: FinancialProvenanceInput) =>
    api<FinancialProvenance>("/financial/provenance/simulated", { method: "POST", json: input }),
  createUnavailable: (input: FinancialProvenanceInput) =>
    api<FinancialProvenance>("/financial/provenance/unavailable", { method: "POST", json: input }),
  record: (input: {
    source: string; provider?: string | null; status: string;
    safe: boolean; reason?: string | null;
  }) => api<FinancialLedgerEntry>("/financial/ledger", { method: "POST", json: input }),
  remove: (id: string) => api<void>(`/financial/ledger/${id}`, { method: "DELETE" }),
};
