/** Session 97 — Enterprise Business Intelligence client. */
import { api } from "./api";

export type BiModule = "crm" | "erp" | "email" | "social" | "helpdesk" | "builder";
export type BiPeriod = "all" | "7d" | "30d";
export type BiFormat = "number" | "currency" | "percent";

export interface BiSource {
  id: string;
  organizationId: string;
  name: string;
  module: BiModule;
  description: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BiKpi {
  id: string;
  organizationId: string;
  name: string;
  sourceModule: BiModule;
  metric: string;
  period: BiPeriod;
  format: BiFormat;
  createdAt: string;
  updatedAt: string;
}

export interface BiReportCard {
  id: string;
  title: string;
  sourceModule: BiModule;
  metric: string;
  period: BiPeriod;
}

export interface BiReport {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  cards: BiReportCard[];
  createdAt: string;
  updatedAt: string;
}

export interface BiKpiValue {
  kpiId: string;
  name: string;
  sourceModule: BiModule;
  metric: string;
  period: BiPeriod;
  value: number;
  format: BiFormat;
  sampledAt: string;
}

export interface BiReportCardValue {
  card: BiReportCard;
  value: number;
  format: BiFormat;
  sampledAt: string;
}

export interface BiReportEvaluation {
  report: BiReport;
  cards: BiReportCardValue[];
  evaluatedAt: string;
}

export interface BiRollup {
  counts: { sources: number; enabledSources: number; kpis: number; reports: number; cards: number };
  sourceHealth: Array<{ sourceId: string; name: string; module: BiModule; enabled: boolean; sampleCount: number; lastSampleAt: string | null }>;
  recentReports: BiReport[];
  lastUpdatedAt: string | null;
}

export const biApi = {
  rollup: () => api<BiRollup>("/bi/dashboard/rollup"),

  listSources: () => api<BiSource[]>("/bi/sources"),
  createSource: (input: { name: string; module: BiModule; description?: string | null; enabled?: boolean }) =>
    api<BiSource>("/bi/sources", { method: "POST", json: input }),
  updateSource: (id: string, patch: Partial<{ name: string; module: BiModule; enabled: boolean }>) =>
    api<BiSource>(`/bi/sources/${id}`, { method: "PATCH", json: patch }),
  deleteSource: (id: string) => api<{ deleted: boolean; id: string }>(`/bi/sources/${id}`, { method: "DELETE" }),

  listKpis: (params?: { sourceModule?: BiModule }) => api<BiKpi[]>("/bi/kpis", { params }),
  createKpi: (input: { name: string; sourceModule: BiModule; metric: string; period?: BiPeriod; format?: BiFormat }) =>
    api<BiKpi>("/bi/kpis", { method: "POST", json: input }),
  deleteKpi: (id: string) => api<{ deleted: boolean; id: string }>(`/bi/kpis/${id}`, { method: "DELETE" }),
  kpiValue: (id: string) => api<BiKpiValue>(`/bi/kpis/${id}/value`),

  listReports: () => api<BiReport[]>("/bi/reports"),
  createReport: (input: { name: string; description?: string | null; cards: Array<{ title: string; sourceModule: BiModule; metric: string; period?: BiPeriod }> }) =>
    api<BiReport>("/bi/reports", { method: "POST", json: input }),
  evaluateReport: (id: string) => api<BiReportEvaluation>(`/bi/reports/${id}/evaluate`),
  exportCsv: (id: string) => `${import.meta.env.VITE_API_URL ?? "/api/v1"}/bi/reports/${id}/export.csv`,
  deleteReport: (id: string) => api<{ deleted: boolean; id: string }>(`/bi/reports/${id}`, { method: "DELETE" }),
};
