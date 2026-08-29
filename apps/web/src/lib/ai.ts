import { api } from "./api";

export interface AIModel {
  id: string;
  provider: string;
  displayName: string;
  contextWindow: number;
  maxOutput: number;
  capabilities: string[];
  costInputPer1k?: number;
  costOutputPer1k?: number;
  source?: "real" | "echo-demo";
  healthy?: boolean;
  configured: boolean;
}

export interface AIProvider {
  id: string;
  displayName: string;
  healthy: boolean;
  latencyMs: number;
  checkedAt: number;
  error?: string;
  isReal: boolean;
  configured: boolean;
  models?: Array<{ id: string; displayName: string; contextWindow: number; capabilities: string[] }>;
}

export interface AIHealth {
  hasRealProvider: boolean;
  providers: AIProvider[];
  configMessage: string | null;
}

export interface AIUsage {
  periodDays: number;
  totals: {
    requests: number;
    succeeded: number;
    failed: number;
    avgLatency: number;
    totalCost: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    successRate: number;
  };
  byModel: Array<{ modelId: string; count: number; avgDurationMs: number; promptTokens: number; completionTokens: number }>;
  byChannel: Array<{ channel: string; count: number }>;
  recent: Array<{
    id: string; channel: string; provider: string; modelId: string;
    durationMs: number; promptTokens: number; completionTokens: number;
    status: string; error: string | null; feature: string | null; createdAt: string;
  }>;
}

export interface CompletionResult {
  content: string;
  usage: { tokensIn: number; tokensOut: number; costMicros: number; model: string };
  model: string;
  provider: string;
  durationMs: number;
  modelSource: "real" | "echo-demo";
}

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  tokensIn: number;
  costMicros: number;
  durationMs: number;
}

export const aiApi = {
  /** List all available models (with health & configured flags) */
  listModels(): Promise<AIModel[]> {
    return api<AIModel[]>("/ai/models");
  },
  /** List all registered providers with current health */
  listProviders(): Promise<AIProvider[]> {
    return api<AIProvider[]>("/ai/providers");
  },
  /** Quick health check: is there at least one healthy real provider configured? */
  getHealth(): Promise<AIHealth> {
    return api<AIHealth>("/ai/health");
  },
  /** Usage telemetry scoped to the caller's org */
  getUsage(periodDays = 30): Promise<AIUsage> {
    return api<AIUsage>(`/ai/usage?periodDays=${periodDays}`);
  },
  /** Non-streaming completion (JSON in → JSON out) */
  complete(input: {
    model?: string;
    messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string; name?: string }>;
    temperature?: number;
    maxTokens?: number;
    system?: string;
    responseFormat?: { type: "text" | "json_object" };
  }): Promise<CompletionResult> {
    return api<CompletionResult>("/ai/complete", { method: "POST", json: input });
  },
  /** Produce embedding vectors for one or more texts */
  embed(input: { model?: string; input: string | string[] }): Promise<EmbeddingResult> {
    return api<EmbeddingResult>("/ai/embed", { method: "POST", json: input });
  },
  /** Admin: run live connectivity probes against every provider */
  testProviders(): Promise<AIProvider[]> {
    return api<AIProvider[]>("/ai/test-providers", { method: "POST" });
  },
};
