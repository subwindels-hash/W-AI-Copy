/**
 * Session 29 — Enterprise Platform Services API client.
 */
import { api } from "./api";
import type { ConfigEntry, FeatureFlag, Policy, PolicyEvaluationResult, Tenant, License, BillingAccount, CapabilityRecord, OntologyClass, Blueprint, PlatformServicesDashboard } from "@windels/shared";
export type { ConfigEntry, FeatureFlag, Policy, PolicyEvaluationResult, Tenant, License, BillingAccount, CapabilityRecord, OntologyClass, Blueprint, PlatformServicesDashboard } from "@windels/shared";


export const psvcApi = {
  dashboard: () => api<PlatformServicesDashboard>("/platform-services/dashboard/rollup"),

  // config
  listConfig: (params?: { scope?: string; hotReload?: boolean; q?: string }) => {
    const p = new URLSearchParams();
    if (params?.scope) p.set("scope", params.scope);
    if (params?.hotReload !== undefined) p.set("hotReload", String(params.hotReload));
    if (params?.q) p.set("q", params.q);
    const qs = p.toString();
    return api<ConfigEntry[]>(`/platform-services/config${qs?`?${qs}`:""}`);
  },
  runtimeOverrides: () => api<Record<string, unknown>>("/platform-services/config/runtime"),
  setRuntime: (key: string, value: unknown, actor = "admin") =>
    api<ConfigEntry>(`/platform-services/config/${encodeURIComponent(key)}/runtime`, { method:"POST", json:{ value, actor } }),
  upsertConfig: (c: Partial<ConfigEntry> & { key: string; scope: string; valueType: string; value: unknown; description: string }) =>
    api<ConfigEntry>("/platform-services/config", { method:"POST", json:c }),

  // flags
  listFlags: (filter?: { status?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (filter?.status) p.set("status", filter.status);
    if (filter?.q) p.set("q", filter.q);
    const qs = p.toString();
    return api<FeatureFlag[]>(`/platform-services/flags${qs?`?${qs}`:""}`);
  },
  getFlag: (id: string) => api<FeatureFlag>(`/platform-services/flags/${id}`),
  createFlag: (f: Partial<FeatureFlag>) => api<FeatureFlag>("/platform-services/flags", { method:"POST", json:f }),
  toggleFlag: (id: string) => api<FeatureFlag>(`/platform-services/flags/${id}/toggle`, { method:"POST" }),
  patchFlag: (id: string, patch: Partial<FeatureFlag>) => api<FeatureFlag>(`/platform-services/flags/${id}`, { method:"PATCH", json:patch }),
  deleteFlag: (id: string) => api<{removed:boolean}>(`/platform-services/flags/${id}`, { method:"DELETE" }),
  evaluateFlag: (key: string, ctx: { userId?: string; orgId?: string; tenantId?: string; segment?: string }) =>
    api<{key:string; enabled:boolean}>(`/platform-services/flags/evaluate/${encodeURIComponent(key)}`, { method:"POST", json:ctx }),

  // policies
  listPolicies: (filter?: { type?: string; status?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (filter?.type) p.set("type", filter.type);
    if (filter?.status) p.set("status", filter.status);
    if (filter?.q) p.set("q", filter.q);
    const qs = p.toString();
    return api<Policy[]>(`/platform-services/policies${qs?`?${qs}`:""}`);
  },
  getPolicy: (id: string) => api<Policy>(`/platform-services/policies/${id}`),
  createPolicy: (p: Partial<Policy>) => api<Policy>("/platform-services/policies", { method:"POST", json:p }),
  patchPolicy: (id: string, patch: Partial<Policy>) => api<Policy>(`/platform-services/policies/${id}`, { method:"PATCH", json:patch }),
  deletePolicy: (id: string) => api<{removed:boolean}>(`/platform-services/policies/${id}`, { method:"DELETE" }),
  evaluatePolicies: (context: Record<string, unknown>) =>
    api<{ allow: boolean; results: PolicyEvaluationResult[]; deniedBy: PolicyEvaluationResult | null }>("/platform-services/policies/evaluate", { method:"POST", json:{ context } }),

  // tenants
  listTenants: (filter?: { status?: string; plan?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (filter?.status) p.set("status", filter.status);
    if (filter?.plan) p.set("plan", filter.plan);
    if (filter?.q) p.set("q", filter.q);
    const qs = p.toString();
    return api<Tenant[]>(`/platform-services/tenants${qs?`?${qs}`:""}`);
  },
  getTenant: (id: string) => api<Tenant>(`/platform-services/tenants/${id}`),
  createTenant: (t: Partial<Tenant>) => api<Tenant>("/platform-services/tenants", { method:"POST", json:t }),
  patchTenant: (id: string, patch: Partial<Tenant>) => api<Tenant>(`/platform-services/tenants/${id}`, { method:"PATCH", json:patch }),

  // licenses
  listLicenses: (filter?: { status?: string; tier?: string }) => {
    const p = new URLSearchParams();
    if (filter?.status) p.set("status", filter.status);
    if (filter?.tier) p.set("tier", filter.tier);
    const qs = p.toString();
    return api<License[]>(`/platform-services/licenses${qs?`?${qs}`:""}`);
  },
  getLicense: (id: string) => api<License>(`/platform-services/licenses/${id}`),
  issueLicense: (l: any) => api<License>("/platform-services/licenses", { method:"POST", json:l }),
  revokeLicense: (id: string) => api<License>(`/platform-services/licenses/${id}/revoke`, { method:"POST" }),
  verifyLicense: (key: string) => api<{valid:boolean;license?:License;reason?:string}>(`/platform-services/licenses/verify/${encodeURIComponent(key)}`, { method:"POST" }),

  // billing
  listBilling: (filter?: { status?: string; plan?: string }) => {
    const p = new URLSearchParams();
    if (filter?.status) p.set("status", filter.status);
    if (filter?.plan) p.set("plan", filter.plan);
    const qs = p.toString();
    return api<BillingAccount[]>(`/platform-services/billing${qs?`?${qs}`:""}`);
  },
  getBilling: (id: string) => api<BillingAccount>(`/platform-services/billing/${id}`),
  createBilling: (b: any) => api<BillingAccount>("/platform-services/billing", { method:"POST", json:b }),

  // capabilities
  listCapabilities: (filter?: { kind?: string; health?: string; producer?: string }) => {
    const p = new URLSearchParams();
    if (filter?.kind) p.set("kind", filter.kind);
    if (filter?.health) p.set("health", filter.health);
    if (filter?.producer) p.set("producer", filter.producer);
    const qs = p.toString();
    return api<CapabilityRecord[]>(`/platform-services/capabilities${qs?`?${qs}`:""}`);
  },
  getCapability: (id: string) => api<CapabilityRecord>(`/platform-services/capabilities/${id}`),
  reportCapabilityHealth: (name: string, health: string, extra?: { p95Ms?: number; errorRatePct?: number; requestsPerMin?: number }) =>
    api<CapabilityRecord>(`/platform-services/capabilities/${encodeURIComponent(name)}/health`, { method:"POST", json:{ health, ...extra } }),

  // ontology
  listOntology: (filter?: { parentUri?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (filter?.parentUri) p.set("parentUri", filter.parentUri);
    if (filter?.q) p.set("q", filter.q);
    const qs = p.toString();
    return api<OntologyClass[]>(`/platform-services/ontology${qs?`?${qs}`:""}`);
  },
  getOntology: (id: string) => api<OntologyClass>(`/platform-services/ontology/${id}`),
  defineOntology: (o: any) => api<OntologyClass>("/platform-services/ontology", { method:"POST", json:o }),

  // blueprints
  listBlueprints: (filter?: { category?: string; industry?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (filter?.category) p.set("category", filter.category);
    if (filter?.industry) p.set("industry", filter.industry);
    if (filter?.q) p.set("q", filter.q);
    const qs = p.toString();
    return api<Blueprint[]>(`/platform-services/blueprints${qs?`?${qs}`:""}`);
  },
  getBlueprint: (id: string) => api<Blueprint>(`/platform-services/blueprints/${id}`),
  installBlueprint: (id: string) => api<Blueprint>(`/platform-services/blueprints/${id}/install`, { method:"POST" }),
};
