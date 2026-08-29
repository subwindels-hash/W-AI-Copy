/**
 * Shared types — Enterprise Self-Hosted AI Infrastructure (Session 38).
 * Covers self-hosted models, GPU clusters, inference, load balancing,
 * model registry, vector databases, edge/air-gapped, HA.
 */

export type NodeKind = "gpu-server" | "cpu-node" | "edge-node" | "airgap-node";
export type NodeStatus = "online" | "draining" | "offline" | "maintenance";
export type ModelFormat = "gguf" | "onnx" | "tensorrt" | "safetensors" | "onnx-webgpu" | "custom";
export type ModelOrigin = "local" | "imported" | "fine-tuned" | "synthesized";
export type ModelState = "registered" | "downloading" | "ready" | "loaded" | "failed";
export type InferenceBackend = "llama.cpp" | "vllm" | "tensorrt-llm" | "onnxruntime" | "webgpu" | "custom";
export type VectorBackend = "qdrant" | "pgvector" | "chroma" | "weaviate" | "sqlite-vec" | "custom";
export type SchedulingClass = "interactive" | "batch" | "realtime" | "background";

export interface GpuNode {
  id: string; name: string; kind: NodeKind; status: NodeStatus;
  hostname: string; region: string; gpuCount: number; gpuType: string;
  vramGb: number; vramUsedGb: number; cpuCores: number; ramGb: number;
  utilizationPct: number; temperatureC: number; powerW: number;
  onlineSince?: string; tags: string[];
}
export interface RegisteredModel {
  id: string; name: string; version: string; format: ModelFormat;
  origin: ModelOrigin; state: ModelState;
  backend: InferenceBackend; sizeGb: number; contextWindow: number; quant: string;
  capabilities: string[]; path?: string; checksum?: string;
  loadedOnNodeId?: string; createdAt: string;
}
export interface InferenceRequest {
  modelId: string; prompt: string; maxTokens?: number; temperature?: number;
  schedulingClass?: SchedulingClass;
}
export interface InferenceJob {
  id: string; modelId: string; nodeId: string; status: "queued"|"running"|"completed"|"failed";
  scheduledAt: string; startedAt?: string; completedAt?: string;
  inputTokens: number; outputTokens: number; latencyMs?: number;
}
export interface VectorStore {
  id: string; name: string; backend: VectorBackend;
  status: "online"|"offline"|"provisioning";
  dimensions: number; vectorCount: number; sizeGb: number; endpoint?: string;
  airgapped: boolean;
}
export interface SelfHostedDashboard {
  nodes: number; nodesOnline: number; aggregateVramGb: number; aggregateVramUsedGb: number;
  models: number; modelsReady: number; modelsLoaded: number;
  inferenceJobs24h: number; avgInferenceLatencyMs: number; gpuUtilizationPct: number;
  vectorStores: number; haClusterHealthy: boolean;
  airgapMode: boolean; edgeNodes: number;
}
