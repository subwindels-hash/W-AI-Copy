import { api } from "./api";

// ─── Model Registry ────────────────────────────────────────────
export interface ModelRecord {
  id: string; provider: string; modelId: string; name: string; version: string;
  description?: string | null; capabilities: string[]; contextWindow: number; maxOutputTokens: number;
  costInputPer1k: number; costOutputPer1k: number; isDefault: boolean; enabled: boolean;
  organizationId?: string | null; config: Record<string, any>; createdAt: string; updatedAt: string;
}
export const modelsApi = {
  list: () => api<ModelRecord[]>("/enterprise/models"),
  create: (input: Partial<ModelRecord> & { provider: string; modelId: string; name: string }) =>
    api<ModelRecord>("/enterprise/models", { method: "POST", json: input }),
  update: (id: string, input: Partial<ModelRecord>) =>
    api<ModelRecord>(`/enterprise/models/${id}`, { method: "PATCH", json: input }),
  del: (id: string) => api<void>(`/enterprise/models/${id}`, { method: "DELETE" }),
  setDefault: (id: string) => api<void>(`/enterprise/models/${id}/default`, { method: "POST" }),
};

// ─── AI Monitoring ─────────────────────────────────────────────
export interface AiMetrics {
  periodDays: number; since: string;
  totals: { requests: number; succeeded: number; failed: number; avgLatency: number; totalCost: number; totalPromptTokens: number; totalCompletionTokens: number; successRate: number };
  byModel: { modelId: string; count: number; avgDurationMs: number; promptTokens: number; completionTokens: number }[];
  byChannel: { channel: string; count: number }[];
  recent: any[];
}
export const monitoringApi = {
  get: (days = 30) => api<AiMetrics>(`/enterprise/ai-monitoring?days=${days}`),
};

// ─── Plugins ───────────────────────────────────────────────────
export interface PluginRecord {
  id: string; slug: string; name: string; description?: string | null; version: string; author?: string | null;
  enabled: boolean; hooks: string[]; config: Record<string, any>; isSystem?: boolean; createdAt: string;
}
export const pluginsApi = {
  list: () => api<{ system: PluginRecord[]; custom: PluginRecord[] }>("/enterprise/plugins"),
  install: (input: { slug: string; name: string; description?: string; hooks?: string[] }) =>
    api<PluginRecord>("/enterprise/plugins", { method: "POST", json: input }),
  toggle: (id: string, enabled: boolean) =>
    api<PluginRecord>(`/enterprise/plugins/${id}/toggle`, { method: "POST", json: { enabled } }),
  configure: (id: string, config: Record<string, any>) =>
    api<PluginRecord>(`/enterprise/plugins/${id}/config`, { method: "POST", json: { config } }),
  uninstall: (id: string) => api<void>(`/enterprise/plugins/${id}`, { method: "DELETE" }),
};

// ─── Integrations ──────────────────────────────────────────────
export interface IntegrationType { type: string; name: string; description: string; icon: string; }
export interface IntegrationRecord {
  id: string; type: string; name: string; config: Record<string, any>;
  status: "connected" | "disconnected" | "error"; lastSyncAt?: string | null; createdAt: string;
}
export const integrationsApi = {
  list: () => api<{ available: IntegrationType[]; installed: IntegrationRecord[] }>("/enterprise/integrations"),
  connect: (input: { type: string; name: string; config?: Record<string, any>; credentials?: Record<string, any> }) =>
    api<IntegrationRecord>("/enterprise/integrations", { method: "POST", json: input }),
  update: (id: string, input: any) =>
    api<IntegrationRecord>(`/enterprise/integrations/${id}`, { method: "PATCH", json: input }),
  disconnect: (id: string) => api<void>(`/enterprise/integrations/${id}`, { method: "DELETE" }),
};

// ─── SSO ───────────────────────────────────────────────────────
export interface SsoInfo {
  configured: boolean; id?: string; provider?: string | null; domains: string[]; enabled: boolean;
  hasEntryPoint?: boolean; hasCert?: boolean; hasClientId?: boolean; hasClientSecret?: boolean;
}
export const ssoApi = {
  get: () => api<SsoInfo>("/enterprise/sso"),
  upsert: (input: any) => api("/enterprise/sso", { method: "PUT", json: input }),
  disable: () => api<void>("/enterprise/sso/disable", { method: "POST" }),
  lookup: (email: string) => api<{ provider: string; entryPoint?: string; clientId?: string } | null>("/enterprise/sso/lookup", { params: { email } }),
};

// ─── Organization / White Label ────────────────────────────────
export interface OrgInfo {
  id: string; name: string; slug: string; logoUrl?: string | null; whiteLabel: WhiteLabelConfig; createdAt: string;
}
export interface WhiteLabelConfig {
  appName?: string; logoUrl?: string | null; primaryColor?: string; secondaryColor?: string;
  brandingHidden?: boolean; supportEmail?: string | null;
}
export const orgApi = {
  get: () => api<OrgInfo>("/enterprise/organization"),
  update: (input: { name?: string; whiteLabel?: Partial<WhiteLabelConfig> }) =>
    api<OrgInfo>("/enterprise/organization", { method: "PATCH", json: input }),
};

// ─── Session 18: Enterprise Engineering Framework ─────────────
export interface AdrRecord {
  id: string; number: number; title: string; status: string; context: string; decision: string; consequences: string;
  authors: string[]; date: string; supersededBy?: string; tags: string[];
}
export interface ArchitectureStandard {
  id: string; code: string; category: string; title: string; description: string;
  severity: "must"|"should"|"may"; enforcement: string;
}
export interface ReviewRecord {
  id: string; kind: string; targetId: string; requestedBy: string; status: string; reviewers: string[];
  comments: Array<{id:string;author:string;body:string;createdAt:string}>; createdAt: string; decidedAt?: string;
}
export const govApi = {
  listAdrs: (params: {status?:string; tag?:string} = {}) => api<AdrRecord[]>("/enterprise/governance/adrs", { params }),
  createAdr: (input: Partial<AdrRecord> & {title:string;context:string;decision:string;consequences:string}) =>
    api<AdrRecord>("/enterprise/governance/adrs", { method: "POST", json: input }),
  listStandards: (category?: string) => api<ArchitectureStandard[]>(`/enterprise/governance/standards${category?`?category=${category}`:""}`),
  listReviews: () => api<ReviewRecord[]>("/enterprise/governance/reviews"),
  requestReview: (input: {kind:string; targetId:string; reviewers?:string[]}) =>
    api<ReviewRecord>("/enterprise/governance/reviews", { method: "POST", json: input }),
  addComment: (id: string, body: string) =>
    api<ReviewRecord>(`/enterprise/governance/reviews/${id}/comment`, { method: "POST", json: { body } }),
  decideReview: (id: string, decision: "approved"|"changes_requested"|"rejected") =>
    api<ReviewRecord>(`/enterprise/governance/reviews/${id}/decide`, { method: "POST", json: { decision } }),
};

export interface ServiceRecord {
  id: string; name: string; version: string; baseUrl: string; status: string;
  capabilities: string[]; region?: string; instanceId?: string; startedAt: string; lastHeartbeat?: string;
}
export const discoveryApi = {
  list: () => api<ServiceRecord[]>("/enterprise/discovery/services"),
  query: (q: {name?:string;capability?:string;status?:string;region?:string;minVersion?:string} = {}) =>
    api<ServiceRecord[]>("/enterprise/discovery/services/query", { params: q }),
  register: (input: Partial<ServiceRecord>) => api<ServiceRecord>("/enterprise/discovery/services", { method: "POST", json: input }),
  dependencies: (serviceId?: string) =>
    api<{from:string;to:string;kind:string;criticality:string}[]>(`/enterprise/discovery/dependencies${serviceId?`?service=${serviceId}`:""}`),
  validate: () => api<{missing:string[];healthy:boolean}>("/enterprise/discovery/validate"),
};

export interface EventSchema {
  type: string; version: string; description: string; producer: string; consumers: string[];
  schema: Record<string,any>; deprecated?: boolean;
}
export interface EventRecord {
  id: string; type: string; schemaVersion: string; timestamp: string; producer: string;
  correlationId: string; causationId?: string; traceId?: string; payload: any; metadata: Record<string,any>;
}
export interface DlqEntry {
  id: string; event: EventRecord; failedConsumer: string; error: string; attempts: number;
  firstFailedAt: string; lastFailedAt: string; status: string;
}
export const eventsApi = {
  listSchemas: () => api<EventSchema[]>("/enterprise/events/schemas"),
  recent: (params: {type?:string;since?:string;correlationId?:string} = {}) =>
    api<EventRecord[]>("/enterprise/events/recent", { params }),
  listDlq: (status?: string) => api<DlqEntry[]>(`/enterprise/events/dlq${status?`?status=${status}`:""}`),
  replayDlq: (id: string) => api<{replayed:boolean}>(`/enterprise/events/dlq/${id}/replay`, { method: "POST" }),
};

export interface ApiEndpoint {
  method: string; path: string; serviceId: string; version: string; deprecated?: boolean; authRequired: boolean;
  minRole?: string; summary?: string;
}
export interface ApiVersion { version: string; introducedAt: string; sunsetAt?: string; status: string; }
export const apiGovApi = {
  endpoints: (params: {method?:string;version?:string;serviceId?:string} = {}) =>
    api<ApiEndpoint[]>("/enterprise/api-governance/endpoints", { params }),
  versions: () => api<ApiVersion[]>("/enterprise/api-governance/versions"),
  openapi: () => api<Record<string,any>>("/enterprise/api-governance/openapi"),
};
