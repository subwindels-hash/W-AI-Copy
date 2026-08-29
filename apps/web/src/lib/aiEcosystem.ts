/**
 * Session 33 — Vendor-Agnostic AI Ecosystem API client.
 */
import { api } from "./api";
import type { AiEcosystemDashboard, AiProviderAdapter, AiModel, RoutingPolicy, ProviderHealthEvent, BenchmarkRun, PersonalityProfile, VoicePersona, AvatarConfig, DepartmentPersonality, TrustScore, ExplainabilityReport, Evidence, AlternativeViewpoint, UncertaintySignal, ComplianceCheck } from "@windels/shared";
export type { AiEcosystemDashboard, AiProviderAdapter, AiModel, RoutingPolicy, ProviderHealthEvent, BenchmarkRun, PersonalityProfile, VoicePersona, AvatarConfig, DepartmentPersonality, TrustScore, ExplainabilityReport, Evidence, AlternativeViewpoint, UncertaintySignal, ComplianceCheck } from "@windels/shared";


export const aiEcoApi = {
  dashboard: () => api<AiEcosystemDashboard>("/ai-ecosystem/dashboard/rollup"),

  // providers
  listProviders: (filter?: { status?: string; deployment?: string }) => {
    const p = new URLSearchParams();
    if (filter?.status) p.set("status", filter.status);
    if (filter?.deployment) p.set("deployment", filter.deployment);
    const qs = p.toString();
    return api<AiProviderAdapter[]>(`/ai-ecosystem/providers${qs ? `?${qs}` : ""}`);
  },
  getProvider: (id: string) => api<AiProviderAdapter>(`/ai-ecosystem/providers/${id}`),
  setProviderStatus: (id: string, status: string, reason?: string) =>
    api<AiProviderAdapter>(`/ai-ecosystem/providers/${id}/status`, { method: "POST", json: { status, reason } }),
  providerHealth: (id: string) => api<ProviderHealthEvent[]>(`/ai-ecosystem/providers/${id}/health`),

  // models
  listModels: (filter?: { providerId?: string; capability?: string; enabled?: boolean }) => {
    const p = new URLSearchParams();
    if (filter?.providerId) p.set("providerId", filter.providerId);
    if (filter?.capability) p.set("capability", filter.capability);
    if (filter?.enabled !== undefined) p.set("enabled", String(filter.enabled));
    const qs = p.toString();
    return api<AiModel[]>(`/ai-ecosystem/models${qs ? `?${qs}` : ""}`);
  },

  // routing
  listPolicies: () => api<RoutingPolicy[]>("/ai-ecosystem/routing-policies"),
  route: (input: { capabilities: string[]; strategy?: string; region?: string; maxLatencyMs?: number; maxCostPer1kUsd?: number }) =>
    api<{ provider: AiProviderAdapter; model: AiModel; viaFallback: boolean; chosenPolicy?: string }>("/ai-ecosystem/route", { method: "POST", json: input }),
  runBenchmark: (input: { name: string; kind: string; providerIds: string[]; samples?: number }) =>
    api<BenchmarkRun>("/ai-ecosystem/benchmarks", { method: "POST", json: input }),
  listBenchmarks: () => api<BenchmarkRun[]>("/ai-ecosystem/benchmarks"),

  // personalities
  listPersonalities: (filter?: { kind?: string; enabled?: boolean }) => {
    const p = new URLSearchParams();
    if (filter?.kind) p.set("kind", filter.kind);
    if (filter?.enabled !== undefined) p.set("enabled", String(filter.enabled));
    const qs = p.toString();
    return api<PersonalityProfile[]>(`/ai-ecosystem/personalities${qs ? `?${qs}` : ""}`);
  },
  resolvePersona: (department: string, region?: string) =>
    api<PersonalityProfile | null>(`/ai-ecosystem/resolve-persona?department=${encodeURIComponent(department)}${region ? `&region=${encodeURIComponent(region)}` : ""}`),
  listVoicePersonas: () => api<VoicePersona[]>("/ai-ecosystem/voice-personas"),
  listAvatars: () => api<AvatarConfig[]>("/ai-ecosystem/avatars"),
  listDepartments: () => api<DepartmentPersonality[]>("/ai-ecosystem/departments"),

  // trust & explainability
  listReports: () => api<ExplainabilityReport[]>("/ai-ecosystem/trust/reports"),
  listScores: (filter?: { humanReview?: string; verification?: string }) => {
    const p = new URLSearchParams();
    if (filter?.humanReview) p.set("humanReview", filter.humanReview);
    if (filter?.verification) p.set("verification", filter.verification);
    const qs = p.toString();
    return api<TrustScore[]>(`/ai-ecosystem/trust/scores${qs ? `?${qs}` : ""}`);
  },
  reviewScore: (id: string, state: string, by?: string) =>
    api<TrustScore>(`/ai-ecosystem/trust/scores/${id}/review`, { method: "POST", json: { state, by } }),
  listEvidence: (rid: string) => api<Evidence[]>(`/ai-ecosystem/trust/reports/${rid}/evidence`),
  listViewpoints: (rid: string) => api<AlternativeViewpoint[]>(`/ai-ecosystem/trust/reports/${rid}/viewpoints`),
  listUncertainty: (rid: string) => api<UncertaintySignal[]>(`/ai-ecosystem/trust/reports/${rid}/uncertainty`),
  listCompliance: (rid: string) => api<ComplianceCheck[]>(`/ai-ecosystem/trust/reports/${rid}/compliance`),
};
