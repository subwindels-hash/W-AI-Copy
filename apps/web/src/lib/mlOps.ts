/**
 * Session 30 — AI Infrastructure (MLOps) API client.
 */
import { api } from "./api";
import type { MlOpsDashboard, ModelArtifact, ModelDeployment, ModelMonitor, ModelAlert, ModelPolicy, PromptDef, PromptVersion, PromptTestCase, PromptTestRun, RagPolicy, VectorIndex, EmbeddingModel, KnowledgeSource } from "@windels/shared";
export type { MlOpsDashboard, ModelArtifact, ModelDeployment, ModelMonitor, ModelAlert, ModelPolicy, PromptDef, PromptVersion, PromptTestCase, PromptTestRun, RagPolicy, VectorIndex, EmbeddingModel, KnowledgeSource } from "@windels/shared";


export const mlApi = {
  dashboard: () => api<MlOpsDashboard>("/ml-ops/dashboard/rollup"),

  // models
  listModels: (filter?: { kind?: string; stage?: string; status?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (filter?.kind) p.set("kind", filter.kind);
    if (filter?.stage) p.set("stage", filter.stage);
    if (filter?.status) p.set("status", filter.status);
    if (filter?.q) p.set("q", filter.q);
    const qs = p.toString();
    return api<ModelArtifact[]>(`/ml-ops/models${qs?`?${qs}`:""}`);
  },
  getModel: (id: string) => api<ModelArtifact>(`/ml-ops/models/${id}`),
  addModelVersion: (id: string, input: { version: string; metrics?: any[]; notes?: string }) =>
    api<ModelArtifact>(`/ml-ops/models/${id}/versions`, { method:"POST", json:input }),
  promoteModel: (id: string, versionId: string, to: string, actor="admin") =>
    api<ModelArtifact>(`/ml-ops/models/${id}/promote/${versionId}`, { method:"POST", json:{ to, actor } }),

  // deployments
  listDeployments: (filter?: { env?: string; status?: string; modelId?: string }) => {
    const p = new URLSearchParams();
    if (filter?.env) p.set("env", filter.env);
    if (filter?.status) p.set("status", filter.status);
    if (filter?.modelId) p.set("modelId", filter.modelId);
    const qs = p.toString();
    return api<ModelDeployment[]>(`/ml-ops/deployments${qs?`?${qs}`:""}`);
  },
  getDeployment: (id: string) => api<ModelDeployment>(`/ml-ops/deployments/${id}`),
  createDeployment: (input: any) => api<ModelDeployment>("/ml-ops/deployments", { method:"POST", json: input }),
  setDeploymentStatus: (id: string, status: string) =>
    api<ModelDeployment>(`/ml-ops/deployments/${id}/status`, { method:"POST", json:{ status } }),

  // monitors
  listMonitors: (filter?: { type?: string; modelId?: string; firing?: boolean }) => {
    const p = new URLSearchParams();
    if (filter?.type) p.set("type", filter.type);
    if (filter?.modelId) p.set("modelId", filter.modelId);
    if (filter?.firing !== undefined) p.set("firing", String(filter.firing));
    const qs = p.toString();
    return api<ModelMonitor[]>(`/ml-ops/monitors${qs?`?${qs}`:""}`);
  },
  getMonitor: (id: string) => api<ModelMonitor>(`/ml-ops/monitors/${id}`),
  createMonitor: (input: any) => api<ModelMonitor>("/ml-ops/monitors", { method:"POST", json: input }),
  reportMetric: (id: string, value: number) =>
    api<ModelMonitor>(`/ml-ops/monitors/${id}/metrics`, { method:"POST", json:{ value } }),

  // model policies
  listModelPolicies: () => api<ModelPolicy[]>("/ml-ops/model-policies"),
  createModelPolicy: (input: any) => api<ModelPolicy>("/ml-ops/model-policies", { method:"POST", json: input }),
  setPolicyEnforced: (id: string, enforced: boolean) =>
    api<ModelPolicy>(`/ml-ops/model-policies/${id}/enforce`, { method:"POST", json:{ enforced } }),

  // prompts
  listPrompts: (filter?: { kind?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (filter?.kind) p.set("kind", filter.kind);
    if (filter?.q) p.set("q", filter.q);
    const qs = p.toString();
    return api<PromptDef[]>(`/ml-ops/prompts${qs?`?${qs}`:""}`);
  },
  getPrompt: (id: string) => api<PromptDef>(`/ml-ops/prompts/${id}`),
  addPromptVersion: (id: string, input: Partial<PromptVersion>) =>
    api<PromptDef>(`/ml-ops/prompts/${id}/versions`, { method:"POST", json:input }),
  addTestCase: (id: string, input: any) =>
    api<PromptDef>(`/ml-ops/prompts/${id}/tests`, { method:"POST", json:input }),
  runTests: (id: string, model = "claude-3.5-sonnet") =>
    api<{ prompt: PromptDef; run: PromptTestRun }>(`/ml-ops/prompts/${id}/run-tests`, { method:"POST", json:{ model } }),

  // RAG
  getRagPolicy: () => api<RagPolicy>("/ml-ops/rag/policy"),
  updateRagPolicy: (patch: Partial<RagPolicy>) =>
    api<RagPolicy>("/ml-ops/rag/policy", { method:"PATCH", json:patch }),

  listIndexes: (filter?: { status?: string }) => {
    const p = new URLSearchParams();
    if (filter?.status) p.set("status", filter.status);
    const qs = p.toString();
    return api<VectorIndex[]>(`/ml-ops/indexes${qs?`?${qs}`:""}`);
  },
  createIndex: (input: any) => api<VectorIndex>("/ml-ops/indexes", { method:"POST", json: input }),
  reindex: (id: string) => api<VectorIndex>(`/ml-ops/indexes/${id}/reindex`, { method:"POST" }),

  listEmbeddings: (filter?: { provider?: string; status?: string }) => {
    const p = new URLSearchParams();
    if (filter?.provider) p.set("provider", filter.provider);
    if (filter?.status) p.set("status", filter.status);
    const qs = p.toString();
    return api<EmbeddingModel[]>(`/ml-ops/embeddings${qs?`?${qs}`:""}`);
  },
  registerEmbedding: (input: any) => api<EmbeddingModel>("/ml-ops/embeddings", { method:"POST", json: input }),

  listKnowledge: (filter?: { kind?: string; status?: string }) => {
    const p = new URLSearchParams();
    if (filter?.kind) p.set("kind", filter.kind);
    if (filter?.status) p.set("status", filter.status);
    const qs = p.toString();
    return api<KnowledgeSource[]>(`/ml-ops/knowledge${qs?`?${qs}`:""}`);
  },
  getKnowledge: (id: string) => api<KnowledgeSource>(`/ml-ops/knowledge/${id}`),
  addKnowledge: (input: any) => api<KnowledgeSource>("/ml-ops/knowledge", { method:"POST", json: input }),
  quarantineSource: (id: string, reason?: string) =>
    api<KnowledgeSource>(`/ml-ops/knowledge/${id}/quarantine`, { method:"POST", json:{ reason } }),
  approveSource: (id: string) => api<KnowledgeSource>(`/ml-ops/knowledge/${id}/approve`, { method:"POST" }),
};
