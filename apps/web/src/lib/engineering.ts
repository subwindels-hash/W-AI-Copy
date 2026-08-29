/**
 * Session 26 — Engineering Observability API client.
 */
import { api } from "./api";
import type { ServiceMetric, MetricTimeseries, DeploymentRecord, DeploymentAnalytics, DebtItem, DebtSummary, PipelineRun, PipelineAnalytics, DeveloperStats, ProductivitySummary } from "@windels/shared";
export type { ServiceMetric, MetricTimeseries, DeploymentRecord, DeploymentAnalytics, DebtItem, DebtSummary, PipelineRun, PipelineAnalytics, DeveloperStats, ProductivitySummary } from "@windels/shared";


export const engApi = {
  // Metrics
  listServices: () => api<ServiceMetric[]>("/engineering/metrics/services"),
  getService: (id: string) => api<ServiceMetric>(`/engineering/metrics/services/${id}`),
  timeseries: (id: string, metric: MetricTimeseries["metric"], points = 60) =>
    api<MetricTimeseries>(`/engineering/metrics/services/${id}/timeseries?metric=${metric}&points=${points}`),

  // Deployments
  listDeployments: (limit = 50) => api<DeploymentRecord[]>(`/engineering/deployments?limit=${limit}`),
  recordDeployment: (b: Partial<DeploymentRecord>) =>
    api<DeploymentRecord>("/engineering/deployments", { method: "POST", json: b }),
  deploymentAnalytics: () => api<DeploymentAnalytics>("/engineering/deployments/analytics"),

  // Tech Debt
  listDebt: () => api<DebtItem[]>("/engineering/tech-debt"),
  createDebt: (b: Partial<DebtItem>) => api<DebtItem>("/engineering/tech-debt", { method: "POST", json: b }),
  debtSummary: () => api<DebtSummary>("/engineering/tech-debt/summary"),
  setDebtStatus: (id: string, status: DebtItem["status"]) =>
    api<DebtItem>(`/engineering/tech-debt/${id}/status`, { method: "POST", json: { status } }),

  // Pipelines
  listPipelines: (limit = 50) => api<PipelineRun[]>(`/engineering/pipelines?limit=${limit}`),
  pipelineAnalytics: () => api<PipelineAnalytics>("/engineering/pipelines/analytics"),

  // Productivity
  listDevelopers: () => api<DeveloperStats[]>("/engineering/productivity/developers"),
  productivitySummary: () => api<ProductivitySummary>("/engineering/productivity/summary"),

  // Rollup
  dashboard: () => api<{
    services: ServiceMetric[];
    deployments: DeploymentAnalytics;
    debt: DebtSummary;
    pipelines: PipelineAnalytics;
    productivity: ProductivitySummary;
  }>("/engineering/dashboard"),
};
