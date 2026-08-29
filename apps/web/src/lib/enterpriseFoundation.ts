/**
 * Session 31 — Enterprise Foundation API client.
 */
import { api } from "./api";
import type { FabricConnector, DataProduct, DataLineage, IdentityPrincipal, IdentityProviderRec, ServiceAccount, FinOpsAccount, CostAnomaly, Optimization, ResilienceIncident, SelfHealingPlaybook, BcpPlan, AiQualityScorecard, EvalRun, GlobalStatus, ExecKpi, EnterpriseFoundationDashboard } from "@windels/shared";
export type { FabricConnector, DataProduct, DataLineage, IdentityPrincipal, IdentityProviderRec, ServiceAccount, FinOpsAccount, CostAnomaly, Optimization, ResilienceIncident, SelfHealingPlaybook, BcpPlan, AiQualityScorecard, EvalRun, GlobalStatus, ExecKpi, EnterpriseFoundationDashboard } from "@windels/shared";


export const efApi = {
  dashboard: () => api<EnterpriseFoundationDashboard & { regionsHealthy:number; globalRps:number; globalP95Ms:number; globalErrorRate:number; activeUsers:number; aiRequestsPerMin:number }>("/enterprise-foundation/dashboard/rollup"),

  // data fabric
  listConnectors: (filter?: { kind?: string; status?: string }) => {
    const p = new URLSearchParams();
    if (filter?.kind) p.set("kind", filter.kind);
    if (filter?.status) p.set("status", filter.status);
    const qs = p.toString();
    return api<FabricConnector[]>(`/enterprise-foundation/connectors${qs?`?${qs}`:""}`);
  },
  listProducts: () => api<DataProduct[]>("/enterprise-foundation/products"),
  listLineage: () => api<DataLineage[]>("/enterprise-foundation/lineage"),
  setConnectorStatus: (id: string, status: string) =>
    api<FabricConnector>(`/enterprise-foundation/connectors/${id}/status`, { method:"POST", json:{ status } }),

  // identity
  listPrincipals: (filter?: { kind?: string; status?: string }) => {
    const p = new URLSearchParams();
    if (filter?.kind) p.set("kind", filter.kind);
    if (filter?.status) p.set("status", filter.status);
    const qs = p.toString();
    return api<IdentityPrincipal[]>(`/enterprise-foundation/principals${qs?`?${qs}`:""}`);
  },
  listIdps: () => api<IdentityProviderRec[]>("/enterprise-foundation/idps"),
  listServiceAccounts: () => api<ServiceAccount[]>("/enterprise-foundation/service-accounts"),

  // finops
  listAccounts: (provider?: string) =>
    api<FinOpsAccount[]>(`/enterprise-foundation/accounts${provider?`?provider=${provider}`:""}`),
  listAnomalies: (filter?: { severity?: string; status?: string }) => {
    const p = new URLSearchParams();
    if (filter?.severity) p.set("severity", filter.severity);
    if (filter?.status) p.set("status", filter.status);
    const qs = p.toString();
    return api<CostAnomaly[]>(`/enterprise-foundation/anomalies${qs?`?${qs}`:""}`);
  },
  ackAnomaly: (id: string) => api<CostAnomaly>(`/enterprise-foundation/anomalies/${id}/ack`, { method:"POST" }),
  listOptimizations: (status?: string) =>
    api<Optimization[]>(`/enterprise-foundation/optimizations${status?`?status=${status}`:""}`),
  applyOptimization: (id: string) => api<Optimization>(`/enterprise-foundation/optimizations/${id}/apply`, { method:"POST" }),

  // resilience
  listIncidents: (filter?: { status?: string; severity?: string }) => {
    const p = new URLSearchParams();
    if (filter?.status) p.set("status", filter.status);
    if (filter?.severity) p.set("severity", filter.severity);
    const qs = p.toString();
    return api<ResilienceIncident[]>(`/enterprise-foundation/incidents${qs?`?${qs}`:""}`);
  },
  updateIncident: (id: string, patch: { status: string; rca?: string; commander?: string }) =>
    api<ResilienceIncident>(`/enterprise-foundation/incidents/${id}/status`, { method:"POST", json:patch }),
  listPlaybooks: () => api<SelfHealingPlaybook[]>("/enterprise-foundation/playbooks"),
  runPlaybook: (id: string) => api<SelfHealingPlaybook>(`/enterprise-foundation/playbooks/${id}/run`, { method:"POST" }),
  listBcps: () => api<BcpPlan[]>("/enterprise-foundation/bcp"),
  recordDrill: (id: string, passed: boolean) =>
    api<BcpPlan>(`/enterprise-foundation/bcp/${id}/drill`, { method:"POST", json:{ passed } }),

  // quality
  listScorecards: (modelId?: string) =>
    api<AiQualityScorecard[]>(`/enterprise-foundation/scorecards${modelId?`?modelId=${modelId}`:""}`),
  listEvalRuns: (filter?: { modelId?: string }) => {
    const p = new URLSearchParams();
    if (filter?.modelId) p.set("modelId", filter.modelId);
    const qs = p.toString();
    return api<EvalRun[]>(`/enterprise-foundation/eval-runs${qs?`?${qs}`:""}`);
  },
  startEvalRun: (input: { name: string; modelId: string; dataset?: string; dimensions?: string[]; triggeredBy?: string }) =>
    api<EvalRun>("/enterprise-foundation/eval-runs", { method:"POST", json:input }),

  // ops center
  globalStatus: () => api<GlobalStatus>("/enterprise-foundation/global-status"),
  kpis: () => api<ExecKpi[]>("/enterprise-foundation/kpis"),
};
