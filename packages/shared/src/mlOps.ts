/**
 * Session 30 — Phase 29: AI Infrastructure types (Slices 258–270).
 * Covers Enterprise MLOps, Model Registry/Lifecycle/Deployment/Monitoring/Governance,
 * Prompt Registry/Versioning/Testing, and RAG Governance + Vector + Embedding + Knowledge.
 */

// ─── Slice 258: Enterprise MLOps platform (summary types) ────────
export interface MlOpsDashboard {
  models: number;
  modelsInProduction: number;
  deployments: number;
  deploymentsHealthy: number;
  activeMonitors: number;
  alertsOpen: number;
  policies: number;
  policiesEnforced: number;
  prompts: number;
  promptVersions: number;
  promptTests: number;
  ragIndices: number;
  vectorsIndexed: number;
  embeddingsModels: number;
  knowledgeSources: number;
  knowledgeDocuments: number;
}

// ─── Slice 259 + 260: Model Registry + Model Lifecycle ───────────
export type ModelKind = "llm" | "embedding" | "reranker" | "vision" | "audio" | "custom";
export type ModelProvider =
  | "openai" | "anthropic" | "google" | "cohere" | "mistral" | "meta"
  | "windels-self-hosted" | "huggingface" | "azure-openai" | "bedrock" | "custom";
export type ModelStage =
  | "draft" | "registering" | "staging" | "approval" | "production"
  | "shadow" | "canary" | "deprecated" | "retired" | "rejected";
export type ModelStatus = "active" | "training" | "deploying" | "error" | "paused";
export type ModelFramework = "pytorch" | "tensorflow" | "onnx" | "gguf" | "transformers" | "vllm" | "triton" | "custom";

export interface ModelMetric {
  name: string;
  value: number;
  threshold?: number;
  unit?: string;
  pass: boolean;
}

export interface ModelVersionRec {
  id: string;
  version: string;
  stage: ModelStage;
  artifactUri: string;
  /** Undefined until the artifact has actually been measured/uploaded. */
  sizeMb?: number;
  /** Content hash of the real artifact. Undefined until one exists — a
   *  synthesised hash is worse than none, since it looks verifiable. */
  hash?: string;
  metrics: ModelMetric[];
  createdAt: string;
  promotedAt?: string;
  promotedBy?: string;
  notes?: string;
}

export interface ModelArtifact {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: ModelKind;
  provider: ModelProvider;
  framework: ModelFramework;
  status: ModelStatus;
  currentStage: ModelStage;
  currentVersion?: string;
  owner: string;
  tags: string[];
  license: "proprietary" | "open-source" | "apache-2.0" | "mit" | "enterprise";
  contextWindow?: number;
  parametersB?: number;
  modalities: ("text"|"image"|"audio"|"video"|"code")[];
  versions: ModelVersionRec[];
  stars: number;
  installs: number;
  /** Observed serving telemetry. Undefined until inference traffic is measured. */
  avgLatencyMs?: number;
  errorRatePct?: number;
  costPer1kTokens?: number;
  color: "azure"|"violet"|"teal"|"fuchsia"|"amber"|"emerald"|"crimson"|"slate";
  certified: "official"|"partner"|"community";
  sliceNumber?: number;
  updatedAt: string;
}

// ─── Slice 261: Model Deployment ─────────────────────────────────
export type MlDeploymentEnv = "dev" | "staging" | "prod" | "canary" | "edge";
export type MlDeploymentStatus = "provisioning" | "scaling" | "healthy" | "degraded" | "rolling-back" | "scaled-to-zero" | "failed";
export type MlDeploymentStrategy = "recreate" | "rolling" | "blue-green" | "canary" | "shadow";

export interface ModelDeployment {
  id: string;
  modelId: string;
  modelVersionId: string;
  name: string;
  environment: MlDeploymentEnv;
  strategy: MlDeploymentStrategy;
  status: MlDeploymentStatus;
  region: string;
  replicas: number;
  cpu: string;
  memory: string;
  gpu?: string;
  endpoint: string;
  trafficPct: number;
  /** Runtime metrics reported by the serving layer. Undefined until observed —
   *  these were previously invented at deploy time. */
  qps?: number;
  p95Ms?: number;
  errorRatePct?: number;
  costPerHour?: number;
  canaryParentId?: string;
  deployedAt: string;
  updatedAt: string;
  deployedBy: string;
}

// ─── Slice 262: Model Monitoring ─────────────────────────────────
export type MonitorType = "drift" | "latency" | "error" | "quality" | "fairness" | "cost" | "safety" | "usage";
export type MonitorSeverity = "info" | "warn" | "critical";
export type AlertStatus = "open" | "acknowledged" | "mitigated" | "closed";

export interface ModelMonitor {
  id: string;
  modelId: string;
  deploymentId?: string;
  name: string;
  type: MonitorType;
  threshold: number;
  metric: string;
  severity: MonitorSeverity;
  enabled: boolean;
  currentValue: number;
  firing: boolean;
  window: "5m" | "1h" | "24h" | "7d";
  alerts: ModelAlert[];
  lastFiredAt?: string;
}

export interface ModelAlert {
  id: string;
  monitorId: string;
  value: number;
  threshold: number;
  severity: MonitorSeverity;
  status: AlertStatus;
  openedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  notes?: string;
}

// ─── Slice 263: Model Governance ─────────────────────────────────
export type ModelPolicyType =
  | "approval-required" | "red-team" | "bias-scan"
  | "pii-scan" | "cost-quota" | "latency-slo"
  | "region-lock" | "model-allowlist" | "prompt-injection-scan";

export interface ModelPolicy {
  id: string;
  key: string;
  name: string;
  description: string;
  type: ModelPolicyType;
  enforced: boolean;
  threshold?: number;
  appliesToStages: ModelStage[];
  failures24h: number;
  passes24h: number;
  owner: string;
  updatedAt: string;
}

// ─── Slice 264 + 265 + 266: Prompt Registry + Versioning + Testing
export type PromptKind = "system" | "user" | "few-shot" | "tool" | "rag-context" | "eval";

export interface PromptVariable {
  name: string;
  type: "string" | "number" | "boolean" | "object";
  required: boolean;
  default?: string;
  description: string;
}

export interface PromptVersion {
  id: string;
  version: string;
  template: string;
  variables: PromptVariable[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
  author: string;
  changelog: string;
  createdAt: string;
  deployed: boolean;
  score?: number; // from A/B tests
}

export interface PromptTestCase {
  id: string;
  input: Record<string, string>;
  expected?: string;
  expectedContains?: string[];
  rubric?: "exact" | "contains" | "llm-judge" | "semantic";
  tags: string[];
}

export interface PromptTestRun {
  id: string;
  versionId: string;
  model: string;
  startedAt: string;
  finishedAt?: string;
  casesTotal: number;
  casesPassed: number;
  casesFailed: number;
  avgLatencyMs: number;
  passPct: number;
}

export interface PromptDef {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: PromptKind;
  owner: string;
  tags: string[];
  versions: PromptVersion[];
  testCases: PromptTestCase[];
  testRuns: PromptTestRun[];
  stars: number;
  uses: number;
  color: "azure"|"violet"|"teal"|"fuchsia"|"amber"|"emerald"|"crimson"|"slate";
  updatedAt: string;
}

// ─── Slice 267: RAG Governance ───────────────────────────────────
export type RAGMode = "hybrid" | "dense" | "sparse" | "keyword" | "graph";

export interface RagPolicy {
  id: string;
  key: string;
  name: string;
  description: string;
  enforced: boolean;
  mode: RAGMode;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  minScore: number;
  citationRequired: boolean;
  piiRedact: boolean;
  maxDocsPerQuery: number;
  sourcesAllowed: string[];
  updatedAt: string;
}

// ─── Slice 268: Vector Registry ──────────────────────────────────
export type IndexStatus = "creating" | "ready" | "reindexing" | "error" | "frozen";
export type VectorMetric = "cosine" | "dot" | "euclidean";

export interface VectorIndex {
  id: string;
  name: string;
  dimensions: number;
  metric: VectorMetric;
  embeddingModelId: string;
  namespace: string;
  status: IndexStatus;
  documents: number;
  vectors: number;
  sizeMb: number;
  shards: number;
  replicas: number;
  region: string;
  avgLatencyMs: number;
  qps: number;
  lastIndexedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Slice 269: Embedding Registry ───────────────────────────────
export type EmbeddingProvider = "openai" | "cohere" | "voyage" | "mistral" | "windels" | "huggingface" | "custom";

export interface EmbeddingModel {
  id: string;
  slug: string;
  name: string;
  provider: EmbeddingProvider;
  dimensions: number;
  contextWindow: number;
  avgLatencyMs: number;
  costPer1kTokens: number;
  normalized: boolean;
  multilingual: boolean;
  status: "active" | "deprecated" | "beta";
  benchmarks: Record<string, number>; // MTEB, BEIR, etc.
  color: "azure"|"violet"|"teal"|"fuchsia"|"amber"|"emerald"|"crimson"|"slate";
  updatedAt: string;
}

// ─── Slice 270: Knowledge Governance ─────────────────────────────
export type KnowledgeSourceKind = "document" | "wiki" | "web" | "db" | "s3" | "api" | "conversation" | "workflow";
export type KnowledgeStatus = "indexed" | "indexing" | "failed" | "stale" | "quarantined";

export interface KnowledgeSource {
  id: string;
  name: string;
  kind: KnowledgeSourceKind;
  uri: string;
  description: string;
  status: KnowledgeStatus;
  documents: number;
  chunks: number;
  vectors: number;
  sizeMb: number;
  embeddingModelId: string;
  indexId?: string;
  owner: string;
  permissions: string[];
  freshnessHours: number;
  lastIndexedAt?: string;
  lastError?: string;
  piiScanned: boolean;
  approved: boolean;
  updatedAt: string;
}
