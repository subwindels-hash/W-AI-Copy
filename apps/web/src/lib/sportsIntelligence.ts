/** WINDELS Sports Intelligence client. */
import { api } from "./api";
import type {
  SiDashboard,
  SiTicket,
  SiTicketConfig,
  SiTicketConfigPatch,
  SiMatch,
  SiOdds,
  SiPrediction,
  SiDecisionReport,
  SiResult,
  SiPerformanceSnapshot,
  SiBacktestRun,
  SiBacktestParams,
  SiProviderHealth,
  SiJobRun,
  SiAuditEntry,
  SiModelVersion,
  SiModelMetrics,
  SiDriftAlert,
  SiApproveTicketInput,
  SiOverrideSettlementInput,
} from "@windels/shared/sportsIntelligence";

export type {
  SiDashboard,
  SiTicket,
  SiTicketConfig,
  SiTicketConfigPatch,
  SiMatch,
  SiOdds,
  SiPrediction,
  SiDecisionReport,
  SiResult,
  SiPerformanceSnapshot,
  SiBacktestRun,
  SiProviderHealth,
  SiJobRun,
  SiAuditEntry,
};

export const sportsApi = {
  dashboard: () => api<SiDashboard>("/sports-intel/dashboard"),
  config: () => api<SiTicketConfig>("/sports-intel/config"),
  updateConfig: (patch: SiTicketConfigPatch) =>
    api<SiTicketConfig>("/sports-intel/config", { method: "PATCH", json: patch }),

  matches: (params?: { live?: boolean; upcoming?: boolean; status?: string }) =>
    api<SiMatch[]>("/sports-intel/matches", { params }),
  match: (id: string) =>
    api<{ match: SiMatch; odds: SiOdds[]; predictions: SiPrediction[] }>(`/sports-intel/matches/${id}`),

  odds: (matchId?: string) => api<SiOdds[]>("/sports-intel/odds", { params: { matchId } }),
  predictions: (params?: { matchId?: string; decision?: string }) =>
    api<SiPrediction[]>("/sports-intel/predictions", { params }),
  prediction: (id: string) => api<SiDecisionReport>(`/sports-intel/predictions/${id}`),

  tickets: (date?: string) => api<SiTicket[]>("/sports-intel/tickets", { params: { date } }),
  dailyTickets: (date?: string) => api<SiTicket[]>("/sports-intel/tickets/daily", { params: { date } }),
  ticket: (id: string) => api<SiTicket>(`/sports-intel/tickets/${id}`),
  generateTicket: () => api<SiTicket>("/sports-intel/tickets/generate", { method: "POST", json: {} }),
  approveTicket: (id: string, input: SiApproveTicketInput) =>
    api<SiTicket>(`/sports-intel/tickets/${id}/approve`, { method: "POST", json: input }),
  overrideTicket: (id: string, input: SiOverrideSettlementInput) =>
    api<SiTicket>(`/sports-intel/tickets/${id}/override`, { method: "POST", json: input }),

  results: () => api<SiResult[]>("/sports-intel/results"),
  performance: (params?: { range?: string; from?: string; to?: string }) =>
    api<SiPerformanceSnapshot>("/sports-intel/performance", { params }),
  runBacktest: (params: SiBacktestParams) =>
    api<SiBacktestRun>("/sports-intel/backtests", { method: "POST", json: params }),
  backtests: () => api<SiBacktestRun[]>("/sports-intel/backtests"),
  models: () =>
    api<{ versions: SiModelVersion[]; metrics: SiModelMetrics[]; alerts: SiDriftAlert[] }>("/sports-intel/models"),
  providers: () => api<SiProviderHealth[]>("/sports-intel/providers"),
  jobs: () => api<SiJobRun[]>("/sports-intel/jobs"),
  runJob: (kind: string) => api<SiJobRun>(`/sports-intel/jobs/${kind}`, { method: "POST" }),
  pipeline: () => api<{ jobs: SiJobRun[]; ticket: SiTicket | null }>("/sports-intel/pipeline", { method: "POST" }),
  audit: () => api<SiAuditEntry[]>("/sports-intel/audit"),
};
