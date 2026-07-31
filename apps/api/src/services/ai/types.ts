export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  /** Optional tool/function call result identifier */
  toolCallId?: string;
}

export interface ModelInfo {
  id: string;
  provider: string;
  displayName: string;
  contextWindow: number;
  maxOutput: number;
  /** Per-1k-token pricing in USD. Used to compute costMicros. */
  costInputPer1k?: number;
  costOutputPer1k?: number;
  capabilities: string[]; // "stream" | "vision" | "tool_use" | "embeddings" | "json_mode" | ...
}

export interface ModelHealth {
  healthy: boolean;
  latencyMs: number;
  checkedAt: number;
  error?: string;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  system?: string;
  signal?: AbortSignal;
  /** Capabilities required (e.g. "vision"). Router skips providers that can't satisfy. */
  requiredCapabilities?: string[];
  /** Response format — e.g. { type: "json_object" } for JSON mode */
  responseFormat?: { type: "text" | "json_object" };
}

export interface EmbeddingRequest {
  model?: string;
  input: string | string[];
  signal?: AbortSignal;
}

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  tokensIn: number;
  costMicros: number;
  durationMs: number;
}

export interface UsageInfo {
  tokensIn: number;
  tokensOut: number;
  /** Cost in millionths of a USD cent (i.e., costUsd * 1e8). 0 = free/unknown. */
  costMicros: number;
  model: string;
}

export interface CompletionResult {
  content: string;
  usage: UsageInfo;
  model: string;
  provider: string;
  durationMs: number;
  modelSource: "real" | "echo-demo";
}

export type AIErrorCode =
  | "AI_PROVIDER_CONFIGURATION_REQUIRED"
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_PROVIDER_ERROR"
  | "AI_PROMPT_INJECTION"
  | "AI_ABORTED"
  | "AI_BAD_REQUEST"
  | "AI_CONTEXT_LENGTH"
  | "AI_UNSUPPORTED_CAPABILITY";

export interface CompletionChunk {
  type: "token" | "done" | "error";
  /** Present when type === "token" */
  text?: string;
  /** Present when type === "done" */
  usage?: UsageInfo;
  /** Present when type === "error" */
  error?: string;
  /** Machine-readable error code (stable for UI handling) */
  errorCode?: AIErrorCode;
  /** Wall-clock duration in ms, attached by the registry on completion. */
  durationMs?: number;
  /** Source classification — "real" for actual model outputs, "echo-demo" for the dev fallback. */
  modelSource?: "real" | "echo-demo";
}

export interface AIProvider {
  readonly id: string;
  readonly displayName: string;
  /** Health probe; returns {healthy, latencyMs} or throws. */
  health(signal?: AbortSignal): Promise<ModelHealth>;
  listModels(): Promise<ModelInfo[]>;
  /** Streaming completion; async generator yields tokens. */
  chatStream(req: CompletionRequest): AsyncGenerator<CompletionChunk, void, unknown>;
  /** Non-streaming completion (optional; default collects from chatStream if not overridden). */
  chatComplete?(req: CompletionRequest): Promise<CompletionResult>;
  /** Embeddings (optional; only implemented by providers that support it). */
  embed?(req: EmbeddingRequest): Promise<EmbeddingResult>;
  /**
   * Optional: true if this provider supports a given capability for a specific model.
   * Defaults to checking model.capabilities.includes(cap).
   */
  supportsCapability?(modelId: string, capability: string): boolean;
}

/** Standardized error thrown or yielded when no AI provider is configured. */
export const AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE =
  "AI PROVIDER CONFIGURATION REQUIRED — set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or OLLAMA_BASE_URL+OLLAMA_MODEL to enable real inference.";
