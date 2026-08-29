/**
 * Session 38 — Self-Hosted AI Infrastructure API client.
 */
import { api } from "./api";
import type { GpuNode, RegisteredModel, InferenceJob, VectorStore, SelfHostedDashboard, NodeKind, InferenceBackend, ModelFormat, ModelOrigin, VectorBackend, SchedulingClass } from "@windels/shared";
export type { GpuNode, RegisteredModel, InferenceJob, VectorStore, SelfHostedDashboard, NodeKind, InferenceBackend, ModelFormat, ModelOrigin, VectorBackend, SchedulingClass } from "@windels/shared";

export const shApi = {
  dashboard: () => api<SelfHostedDashboard>("/self-hosted/dashboard/rollup"),
  nodes: () => api<GpuNode[]>("/self-hosted/nodes"),
  addNode: (input: Partial<GpuNode>) => api<GpuNode>("/self-hosted/nodes", { method: "POST", json: input }),
  models: () => api<RegisteredModel[]>("/self-hosted/models"),
  addModel: (input: any) => api<RegisteredModel>("/self-hosted/models", { method: "POST", json: input }),
  loadModel: (id: string, input: { nodeId?: string } = {}) =>
    api<RegisteredModel | null>(`/self-hosted/models/${id}/load`, { method: "POST", json: input }),
  inference: (input: { modelId: string; prompt: string; maxTokens?: number; temperature?: number; schedulingClass?: SchedulingClass }) =>
    api<InferenceJob>("/self-hosted/inference", { method: "POST", json: input }),
  jobs: () => api<InferenceJob[]>("/self-hosted/inference/jobs"),
  vectorStores: () => api<VectorStore[]>("/self-hosted/vector-stores"),
  addVectorStore: (input: any) => api<VectorStore>("/self-hosted/vector-stores", { method: "POST", json: input }),
};
