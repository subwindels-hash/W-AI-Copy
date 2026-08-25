import { env } from "../../config/env.js";
import { EchoProvider } from "./echo.provider.js";
import { OpenAIProvider } from "./openai.provider.js";
import { OllamaProvider } from "./ollama.provider.js";
import { AnthropicProvider } from "./anthropic.provider.js";
import { GeminiProvider } from "./gemini.provider.js";
import {
  AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE,
  type AIProvider,
  type CompletionChunk,
  type CompletionRequest,
  type CompletionResult,
  type EmbeddingRequest,
  type EmbeddingResult,
  type ModelHealth,
  type ModelInfo,
} from "./types.js";
import { logger } from "../../config/logger.js";
import { scanPrompt } from "../../security/promptGuard.js";
import { Metrics } from "../../observability/metrics.js";
import { takeToken, Limits } from "../../security/rateLimit.js";
import { recordAiRequest } from "../aiMonitoring.service.js";

/**
 * Provider registry — the single point of AI model selection and execution.
 * See types.ts for the AIProvider interface.
 *
 * Runtime modes:
 *   - Production default (AI_REQUIRE_REAL_MODEL !== "false"): if no real provider
 *     is registered, every call fails fast with an AI_PROVIDER_CONFIGURATION_REQUIRED
 *     error — no echo/canned responses are returned.
 *   - Development mode (AI_REQUIRE_REAL_MODEL=false): Echo is registered as a
 *     fallback, and every streamed response is prefixed with a clearly-labeled
 *     DEMO banner so the UI can never mistake it for real AI.
 *
 * Telemetry (AiRequest row) is recorded in a `finally` block so it fires even
 * when the consumer throws mid-iteration, the request is aborted, or an early
 * error is yielded.
 */

const HEALTH_INTERVAL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 300;

interface ProviderState {
  provider: AIProvider;
  health: ModelHealth;
  isReal: boolean;
}

export class ProviderRegistry {
  private providers = new Map<string, ProviderState>();
  private echoProvider = new EchoProvider();
  private modelToProvider = new Map<string, { provider: AIProvider; model: ModelInfo }>();
  private hasRealProvider = false;
  private strictMode: boolean;
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.strictMode = process.env.AI_REQUIRE_REAL_MODEL !== undefined
      ? process.env.AI_REQUIRE_REAL_MODEL === "true"
      : env.NODE_ENV === "production";

    if (process.env.OPENAI_API_KEY) {
      try { this.registerProvider(new OpenAIProvider(process.env.OPENAI_API_KEY), true); logger.info("registered AI provider", { provider: "openai" }); }
      catch (e) { logger.warn("failed to register OpenAI provider", { err: e }); }
    }
    if (process.env.ANTHROPIC_API_KEY) {
      try { this.registerProvider(new AnthropicProvider(process.env.ANTHROPIC_API_KEY), true); logger.info("registered AI provider", { provider: "anthropic" }); }
      catch (e) { logger.warn("failed to register Anthropic provider", { err: e }); }
    }
    if (process.env.GEMINI_API_KEY) {
      try { this.registerProvider(new GeminiProvider(process.env.GEMINI_API_KEY), true); logger.info("registered AI provider", { provider: "gemini" }); }
      catch (e) { logger.warn("failed to register Gemini provider", { err: e }); }
    }
    if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL) {
      try {
        this.registerProvider(new OllamaProvider({
          baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
          model: process.env.OLLAMA_MODEL || "llama3",
        }), true);
        logger.info("registered AI provider", { provider: "ollama", model: process.env.OLLAMA_MODEL || "llama3" });
      } catch (e) { logger.warn("failed to register Ollama provider", { err: e }); }
    }
    if (process.env.OPENAI_COMPAT_BASE_URL && process.env.OPENAI_COMPAT_API_KEY) {
      try {
        this.registerProvider(new OpenAIProvider(process.env.OPENAI_COMPAT_API_KEY, process.env.OPENAI_COMPAT_BASE_URL, process.env.OPENAI_COMPAT_MODEL || "default"), true);
        logger.info("registered AI provider", { provider: "openai-compat", baseUrl: process.env.OPENAI_COMPAT_BASE_URL });
      } catch (e) { logger.warn("failed to register OpenAI-compat provider", { err: e }); }
    }

    this.hasRealProvider = [...this.providers.values()].some((s) => s.isReal);

    if (!this.strictMode) {
      this.providers.set(this.echoProvider.id, {
        provider: this.echoProvider,
        health: { healthy: true, latencyMs: 0, checkedAt: Date.now() },
        isReal: false,
      });
    }

    if (!this.hasRealProvider) {
      if (this.strictMode) {
        logger.warn("no real AI provider configured — strict mode enabled; AI calls will return AI_PROVIDER_CONFIGURATION_REQUIRED. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or OLLAMA_BASE_URL+OLLAMA_MODEL to enable real inference.");
      } else {
        logger.warn("no real AI provider configured — using Windels Echo demo assistant. Set OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY / OLLAMA_BASE_URL for real inference.");
      }
    }

    this.rebuildModelIndex().catch(() => {});
    this.startHealthLoop();
  }

  private registerProvider(provider: AIProvider, isReal: boolean) {
    this.providers.set(provider.id, {
      provider,
      health: { healthy: true, latencyMs: 0, checkedAt: 0 },
      isReal,
    });
  }

  private startHealthLoop() {
    if (this.healthTimer) clearInterval(this.healthTimer);
    setTimeout(() => { this.healthSweep().catch((e) => logger.warn("initial health sweep failed", { err: e })); }, 2000);
    this.healthTimer = setInterval(() => { this.healthSweep().catch((e) => logger.warn("health sweep failed", { err: e })); }, HEALTH_INTERVAL_MS);
    if (this.healthTimer && typeof (this.healthTimer as any).unref === "function") (this.healthTimer as any).unref();
  }

  private async healthSweep() {
    let changed = false;
    for (const state of this.providers.values()) {
      try {
        const h = await state.provider.health();
        const wasHealthy = state.health.healthy;
        state.health = h;
        if (wasHealthy && !h.healthy) { logger.warn("AI provider became unhealthy", { provider: state.provider.id, error: h.error }); changed = true; }
        else if (!wasHealthy && h.healthy) { logger.info("AI provider recovered", { provider: state.provider.id, latencyMs: h.latencyMs }); changed = true; }
      } catch (e: any) {
        if (state.health.healthy) {
          state.health = { healthy: false, latencyMs: 0, checkedAt: Date.now(), error: e?.message ?? "health exception" };
          logger.warn("AI provider health probe threw", { provider: state.provider.id, err: e?.message });
          changed = true;
        }
      }
    }
    if (changed) {
      this.hasRealProvider = [...this.providers.values()].some((s) => s.isReal && s.health.healthy);
      await this.rebuildModelIndex().catch(() => {});
    }
  }

  private async rebuildModelIndex() {
    this.modelToProvider.clear();
    for (const s of this.providers.values()) {
      try {
        const models = await s.provider.listModels();
        for (const m of models) this.modelToProvider.set(m.id, { provider: s.provider, model: m });
      } catch (e) { logger.warn("failed to list provider models", { err: e, provider: s.provider.id }); }
    }
  }

  listModels(): Array<ModelInfo & { source: "real" | "echo-demo"; healthy?: boolean; configured: boolean }> {
    const fromRegistry = [...this.modelToProvider.values()].map((x) => {
      const state = this.providers.get(x.provider.id);
      return { ...x.model, source: x.provider.id === "windels-echo" ? "echo-demo" as const : "real" as const, healthy: state?.health.healthy, configured: true };
    });
    // When no real provider is configured in strict mode, surface the default
    // assistant entry so UI surfaces can show an honest "not configured" state
    // instead of an empty model list.
    if (!this.hasRealProvider && this.strictMode) {
      fromRegistry.push({
        id: "windels-assistant",
        provider: "windels",
        displayName: "Windels Assistant",
        contextWindow: 128000,
        maxOutput: 4096,
        capabilities: ["stream"],
        source: "real",
        healthy: false,
        configured: false,
      });
    }
    return fromRegistry;
  }

  providerHealth(): Array<{ id: string; displayName: string; healthy: boolean; latencyMs: number; checkedAt: number; error?: string; isReal: boolean; configured: boolean }> {
    const out = [...this.providers.values()].map((s) => ({
      id: s.provider.id, displayName: s.provider.displayName, healthy: s.health.healthy,
      latencyMs: s.health.latencyMs, checkedAt: s.health.checkedAt, error: s.health.error, isReal: s.isReal, configured: true,
    }));
    if (!this.hasRealProvider && this.strictMode) {
      out.unshift({
        id: "windels", displayName: "Windels Assistant", healthy: false, latencyMs: 0,
        checkedAt: Date.now(), error: "No AI provider configured — set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or OLLAMA_BASE_URL+OLLAMA_MODEL",
        isReal: false, configured: false,
      });
    }
    return out;
  }

  hasRealModelConfigured(): boolean { return this.hasRealProvider; }

  /**
   * Super Admin dashboard overlay. Replaces or removes a provider without
   * restarting the process. Environment-registered providers remain if the
   * dashboard slot is cleared.
   */
  applyDashboardProvider(slot: string, opts: { enabled: boolean; apiKey?: string | null; baseUrl?: string | null; model?: string | null }): void {
    const enabled = opts.enabled && Boolean(opts.apiKey || (slot === "ollama" && opts.baseUrl));
    if (!enabled) {
      if (slot === "openai" || slot === "openai-compat") this.providers.delete("openai");
      else this.providers.delete(slot);
      if (process.env.OPENAI_API_KEY && (slot === "openai" || slot === "openai-compat")) {
        try { this.registerProvider(new OpenAIProvider(process.env.OPENAI_API_KEY), true); } catch { /* keep going */ }
      }
      if (process.env.ANTHROPIC_API_KEY && slot === "anthropic") {
        try { this.registerProvider(new AnthropicProvider(process.env.ANTHROPIC_API_KEY), true); } catch { /* keep going */ }
      }
      if (process.env.GEMINI_API_KEY && slot === "gemini") {
        try { this.registerProvider(new GeminiProvider(process.env.GEMINI_API_KEY), true); } catch { /* keep going */ }
      }
      this.hasRealProvider = [...this.providers.values()].some((s) => s.isReal);
      this.rebuildModelIndex().catch(() => {});
      return;
    }
    try {
      if (slot === "openai" || slot === "openai-compat") {
        if (!opts.apiKey) return;
        this.registerProvider(new OpenAIProvider(opts.apiKey, opts.baseUrl || "https://api.openai.com/v1", opts.model || "default"), true);
      } else if (slot === "anthropic" && opts.apiKey) {
        this.registerProvider(new AnthropicProvider(opts.apiKey), true);
      } else if (slot === "gemini" && opts.apiKey) {
        this.registerProvider(new GeminiProvider(opts.apiKey), true);
      } else if (slot === "ollama") {
        this.registerProvider(new OllamaProvider({
          baseUrl: opts.baseUrl || "http://127.0.0.1:11434",
          model: opts.model || process.env.OLLAMA_MODEL || "llama3",
        }), true);
      }
    } catch (e) {
      logger.warn("failed to apply dashboard AI provider", { slot, err: e });
    }
    this.hasRealProvider = [...this.providers.values()].some((s) => s.isReal);
    this.rebuildModelIndex().catch(() => {});
  }

  /** Refresh and return only configured, healthy, real model entries for public routing. */
  async listPublicRoutableModels(): Promise<ModelInfo[]> {
    await this.healthSweep();
    await this.rebuildModelIndex();
    return this.listModels()
      .filter((model) => model.source === "real" && model.configured && model.healthy === true && model.provider !== "windels")
      .map(({ source: _source, healthy: _healthy, configured: _configured, ...model }) => model);
  }

  resolve(modelId?: string): { provider: AIProvider; model: ModelInfo; source: "real" | "echo-demo" } | null {
    if (modelId) {
      const hit = this.modelToProvider.get(modelId);
      if (hit) {
        const state = this.providers.get(hit.provider.id);
        if (!state || state.health.healthy || hit.provider.id === "windels-echo") {
          return { ...hit, source: hit.provider.id === "windels-echo" ? "echo-demo" : "real" };
        }
      }
    }
    const ordered = [...this.providers.values()];
    const healthyReal = ordered.find((s) => s.isReal && s.health.healthy);
    if (healthyReal) {
      const firstModel = [...this.modelToProvider.values()].find((m) => m.provider.id === healthyReal.provider.id);
      return {
        provider: healthyReal.provider,
        model: firstModel?.model ?? { id: `${healthyReal.provider.id}:default`, provider: healthyReal.provider.id, displayName: healthyReal.provider.displayName, contextWindow: 128000, maxOutput: 4096, capabilities: ["stream"] },
        source: "real",
      };
    }
    if (!this.strictMode) {
      return {
        provider: this.echoProvider,
        model: { id: "windels-assistant", provider: this.echoProvider.id, displayName: "Windels Assistant (DEMO)", contextWindow: 32000, maxOutput: 2048, capabilities: ["stream"] },
        source: "echo-demo",
      };
    }
    return null;
  }

  resolveSafe(modelId?: string): { provider: AIProvider; model: ModelInfo; source: "real" | "echo-demo" } | null {
    if (!modelId) return null;
    const hit = this.modelToProvider.get(modelId);
    return hit ? { ...hit, source: hit.provider.id === "windels-echo" ? "echo-demo" : "real" } : null;
  }

  /**
   * Non-streaming completion. Uses the provider's native chatComplete() when
   * available; otherwise collects the streamed tokens via guardedStream() and
   * returns the assembled result. This is the entry point used by workflows,
   * agents, tool execution, and any non-UI consumer.
   */
  async complete(
    req: CompletionRequest,
    opts?: { userId?: string; organizationId?: string; agentId?: string; conversationId?: string; workflowRunId?: string; channel?: "chat" | "agent" | "workflow" | "api" | "talk"; feature?: string },
  ): Promise<CompletionResult> {
    const started = Date.now();
    // Config / rate-limit / prompt-guard checks run inside guardedStream. If the
    // provider implements native chatComplete we try that first after our own
    // pre-flight; otherwise we stream and aggregate.
    const resolved = this.resolve(req.model);
    if (this.strictMode && !this.hasRealProvider) {
      const err: any = new Error(AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE);
      err.code = "AI_PROVIDER_CONFIGURATION_REQUIRED";
      throw err;
    }
    if (!resolved) {
      const err: any = new Error(AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE);
      err.code = "AI_PROVIDER_CONFIGURATION_REQUIRED";
      throw err;
    }
    // Required-capability check
    if (req.requiredCapabilities?.length) {
      for (const cap of req.requiredCapabilities) {
        if (!resolved.model.capabilities.includes(cap)) {
          const err: any = new Error(`Model ${resolved.model.id} does not support required capability "${cap}"`);
          err.code = "AI_UNSUPPORTED_CAPABILITY";
          throw err;
        }
      }
    }
    // Prompt guard (same as streaming path)
    const userContent = req.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n\n");
    const guard = scanPrompt(userContent);
    if (guard.score >= 80) {
      const err: any = new Error("Prompt rejected: possible injection attempt detected.");
      err.code = "AI_PROMPT_INJECTION";
      throw err;
    }
    // Rate limit
    if (opts?.userId) {
      const rl = await this.rateLimit(opts.userId);
      if (rl.limited) {
        const err: any = new Error(`AI rate limit exceeded. Retry after ${Math.ceil(rl.retryAfterMs / 1000)}s.`);
        err.code = "AI_RATE_LIMITED"; err.retryAfterMs = rl.retryAfterMs; throw err;
      }
    }

    // Try provider-native complete() if implemented
    if (resolved.provider.chatComplete) {
      try {
        return await resolved.provider.chatComplete({ ...req, model: resolved.model.id });
      } catch (e: any) {
        // Fall through to streaming aggregation on error
        logger.warn("native chatComplete failed; falling back to stream aggregation", { provider: resolved.provider.id, err: e?.message });
      }
    }

    // Stream & collect
    let text = "";
    let usage = { tokensIn: 0, tokensOut: 0, costMicros: 0, model: resolved.model.id };
    let fatal: { code: string; msg: string } | null = null;
    const ac = new AbortController();
    if (req.signal) req.signal.addEventListener("abort", () => ac.abort(req.signal?.reason));
    try {
      for await (const chunk of this.guardedStream({ ...req, model: resolved.model.id, signal: ac.signal, stream: true }, opts)) {
        if (chunk.type === "token" && chunk.text) text += chunk.text;
        else if (chunk.type === "done" && chunk.usage) usage = chunk.usage;
        else if (chunk.type === "error") {
          fatal = { code: chunk.errorCode ?? "AI_PROVIDER_ERROR", msg: chunk.error ?? "stream error" };
          break;
        }
      }
    } catch (e: any) {
      fatal = { code: e.code ?? "AI_PROVIDER_ERROR", msg: e?.message ?? "stream error" };
    }
    if (fatal) {
      const err: any = new Error(fatal.msg);
      err.code = fatal.code;
      throw err;
    }
    return {
      content: text,
      usage,
      model: resolved.model.id,
      provider: resolved.provider.id,
      durationMs: Date.now() - started,
      modelSource: resolved.source,
    };
  }

  /**
   * Produce text embeddings for semantic search / RAG. Routes to the first
   * provider that implements embed() and reports the "embeddings" capability.
   */
  async embed(
    req: EmbeddingRequest,
    opts?: { userId?: string; organizationId?: string; feature?: string },
  ): Promise<EmbeddingResult> {
    const started = Date.now();
    const inputs = Array.isArray(req.input) ? req.input : [req.input];

    // Prefer the requested model; otherwise find the first capable healthy provider.
    const candidates: Array<{ provider: AIProvider; model: ModelInfo }> = [];
    if (req.model) {
      const hit = this.modelToProvider.get(req.model);
      if (hit && hit.provider.embed) candidates.push(hit);
    }
    if (candidates.length === 0) {
      for (const [, mp] of this.modelToProvider) {
        const state = this.providers.get(mp.provider.id);
        if (!state) continue;
        if (state.isReal && !state.health.healthy) continue;
        if (mp.model.capabilities.includes("embeddings") && typeof mp.provider.embed === "function") {
          candidates.push(mp);
          break;
        }
      }
    }
    // If no real provider supports embeddings, fall back to a deterministic hash
    // embedding (dim 128). Embeddings are used for knowledge/memory search; a
    // degraded-but-functional fallback is better than a hard failure so product
    // surfaces don't crash while the operator configures a real provider.
    if (candidates.length === 0) {
      const dims = 128;
      const embeddings = inputs.map((txt) => {
        const v = new Float32Array(dims);
        const text = (txt || "").toLowerCase();
        for (let i = 0; i < text.length; i++) {
          const ch = text.charCodeAt(i);
          v[ch % dims] += 1;
          if (i + 1 < text.length) v[(ch * 31 + text.charCodeAt(i + 1)) % dims] += 0.5;
        }
        const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
        return Array.from(v).map((x) => x / norm);
      });
      const tokensIn = Math.ceil(inputs.reduce((a, t) => a + t.length, 0) / 4);
      return { embeddings, model: "fallback-hash-128", tokensIn, costMicros: 0, durationMs: Date.now() - started };
    }
    const lastErr: any[] = [];
    for (const cand of candidates) {
      try {
        if (!cand.provider.embed) continue;
        return await cand.provider.embed({ ...req, model: cand.model.id, input: inputs });
      } catch (e: any) { lastErr.push(e); }
    }
    const err: any = new Error(lastErr[0]?.message ?? "embeddings failed");
    err.code = lastErr[0]?.code ?? "AI_PROVIDER_ERROR";
    throw err;
  }

  /**
   * Run a live connectivity test against every registered provider and
   * return detailed results (latency, error, capabilities, models). Used by
   * the admin "Test connection" UI.
   */
  async testProviders(): Promise<Array<{
    id: string; displayName: string; isReal: boolean; healthy: boolean; latencyMs: number;
    error?: string; models: Array<Pick<ModelInfo, "id" | "displayName" | "contextWindow" | "capabilities">>;
  }>> {
    await this.healthSweep();
    await this.rebuildModelIndex();
    const out = [];
    for (const s of this.providers.values()) {
      const models = [];
      for (const [, mp] of this.modelToProvider) {
        if (mp.provider.id === s.provider.id) {
          models.push({ id: mp.model.id, displayName: mp.model.displayName, contextWindow: mp.model.contextWindow, capabilities: mp.model.capabilities });
        }
      }
      out.push({
        id: s.provider.id, displayName: s.provider.displayName, isReal: s.isReal,
        healthy: s.health.healthy, latencyMs: s.health.latencyMs, error: s.health.error, models,
      });
    }
    return out;
  }

  private async rateLimit(userId: string | undefined): Promise<{ allowed: boolean; retryAfterMs: number; limited: boolean }> {
    if (!userId) return { allowed: true, retryAfterMs: 0, limited: false };
    try { const r = await takeToken(Limits.ai, `ai:${userId}`, 1); return { allowed: r.allowed, retryAfterMs: r.retryAfterMs, limited: !r.allowed }; }
    catch { return { allowed: true, retryAfterMs: 0, limited: false }; }
  }

  private async resolveOrganizationId(opts?: { userId?: string; organizationId?: string }): Promise<string | null> {
    if (opts?.organizationId) return opts.organizationId;
    if (!opts?.userId) return null;
    try { const { resolveUserContext } = await import("../workspace.service.js"); const ctx = await resolveUserContext(opts.userId); return ctx.organizationId; }
    catch { return null; }
  }

  async *guardedStream(req: CompletionRequest, opts?: { userId?: string; organizationId?: string; agentId?: string; conversationId?: string; workflowRunId?: string; channel?: "chat" | "agent" | "workflow" | "api" | "talk"; feature?: string }): AsyncGenerator<CompletionChunk & { modelSource?: "real" | "echo-demo" }, void, unknown> {
    const started = Date.now();
    let finalUsage = { tokensIn: 0, tokensOut: 0, costMicros: 0, model: "none" };
    let streamError: string | null = null;
    let errorCode: CompletionChunk["errorCode"] = undefined;
    let modelSource: "real" | "echo-demo" = "echo-demo";
    let completed = false;
    let telemetryFlushed = false;

    // Helper to record telemetry once, even if the consumer throws / breaks.
    const flushTelemetry = async () => {
      if (telemetryFlushed) return;
      telemetryFlushed = true;
      const durationMs = Date.now() - started;
      const organizationId = await this.resolveOrganizationId(opts);
      if (!organizationId) return;
      try {
        await recordAiRequest({
          userId: opts?.userId ?? null,
          agentId: opts?.agentId ?? null,
          conversationId: opts?.conversationId ?? null,
          workflowRunId: opts?.workflowRunId ?? null,
          channel: (opts?.channel as any) ?? "api",
          provider: (finalUsage.model.split(":")[0] || "unknown").split("-")[0],
          modelId: finalUsage.model,
          feature: opts?.feature ?? undefined,
          durationMs,
          promptTokens: finalUsage.tokensIn,
          completionTokens: finalUsage.tokensOut,
          status: completed ? "succeeded" : "failed",
          error: completed ? null : (streamError ?? null),
          organizationId,
        });
      } catch (e: any) {
        logger.warn("failed to record ai request telemetry", { err: e?.message });
      }
    };

    try {
      // ── 1. Config check ─────────────────────────────────────────────
      if (this.strictMode && !this.hasRealProvider) {
        streamError = AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE;
        errorCode = "AI_PROVIDER_CONFIGURATION_REQUIRED";
        yield { type: "error", error: AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE, errorCode, modelSource: "echo-demo", durationMs: Date.now() - started };
        return;
      }

      // ── 2. Rate limit ───────────────────────────────────────────────
      const rl = await this.rateLimit(opts?.userId);
      if (rl.limited) {
        streamError = `AI rate limit exceeded. Retry after ${Math.ceil(rl.retryAfterMs / 1000)}s.`;
        errorCode = "AI_RATE_LIMITED";
        finalUsage.model = "none";
        Metrics.increment("ai.rate_limited", 1, { feature: opts?.feature ?? "unknown" } as any);
        yield { type: "error", error: streamError, errorCode, durationMs: Date.now() - started };
        return;
      }

      // ── 3. Prompt injection guard ──────────────────────────────────
      const userContent = req.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n\n");
      const guard = scanPrompt(userContent);
      if (guard.score >= 80) {
        Metrics.increment("security.prompt_injection.blocked", 1, { feature: opts?.feature ?? "unknown" } as any);
        logger.warn("prompt injection blocked", { score: guard.score, reasons: guard.reasons, userId: opts?.userId, feature: opts?.feature });
        streamError = "Prompt rejected: possible injection attempt detected.";
        errorCode = "AI_PROMPT_INJECTION";
        finalUsage.model = "none";
        yield { type: "error", error: streamError, errorCode, durationMs: Date.now() - started };
        return;
      } else if (guard.score >= 50) {
        Metrics.increment("security.prompt_injection.warned", 1, { feature: opts?.feature ?? "unknown" } as any);
        logger.warn("prompt injection warning", { score: guard.score, reasons: guard.reasons, userId: opts?.userId, feature: opts?.feature });
      }

      // ── 4. Select provider ──────────────────────────────────────────
      const resolved = this.resolve(req.model);
      if (!resolved) {
        streamError = AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE;
        errorCode = "AI_PROVIDER_CONFIGURATION_REQUIRED";
        yield { type: "error", error: AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE, errorCode, modelSource: "echo-demo", durationMs: Date.now() - started };
        return;
      }
      modelSource = resolved.source;
      finalUsage.model = resolved.model.id;

      // ── 5. Demo banner (non-strict, echo) ──────────────────────────
      if (modelSource === "echo-demo") {
        yield { type: "token", text: "[DEMO RESPONSE — NO AI MODEL CONFIGURED. Configure OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or OLLAMA_BASE_URL for real inference.]\n\n", modelSource };
      }

      // ── 6. Stream with retry + failover ─────────────────────────────
      const failoverOrder: Array<{ provider: AIProvider; model: ModelInfo; source: "real" | "echo-demo" }> = [resolved];
      for (const s of this.providers.values()) {
        if (s.provider.id === resolved.provider.id) continue;
        if (!s.health.healthy && s.isReal) continue;
        const firstModel = [...this.modelToProvider.values()].find((m) => m.provider.id === s.provider.id);
        failoverOrder.push({
          provider: s.provider,
          model: firstModel?.model ?? { id: `${s.provider.id}:default`, provider: s.provider.id, displayName: s.provider.displayName, contextWindow: 128000, maxOutput: 4096, capabilities: ["stream"] },
          source: s.provider.id === "windels-echo" ? "echo-demo" : "real",
        });
      }

      let attempts = 0;
      for (const candidate of failoverOrder) {
        if (completed) break;
        if (candidate.provider.id === resolved.provider.id && attempts > MAX_RETRIES) break;
        if (candidate.provider.id !== resolved.provider.id && candidate.source === "echo-demo" && modelSource === "real" && this.strictMode) continue;
        attempts++;

        const perCallTimeout = candidate.provider.id === "ollama" ? 120_000 : DEFAULT_TIMEOUT_MS;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(new DOMException("timeout", "TimeoutError")), perCallTimeout);
        if (req.signal) req.signal.addEventListener("abort", () => ctrl.abort(req.signal?.reason));

        try {
          const gen = candidate.provider.chatStream({ ...req, model: candidate.model.id, signal: ctrl.signal });
          for await (const chunk of gen) {
            if (chunk.type === "token" && chunk.text) {
              yield { ...chunk, modelSource: candidate.source };
            } else if (chunk.type === "done") {
              finalUsage = {
                tokensIn: chunk.usage?.tokensIn ?? 0,
                tokensOut: chunk.usage?.tokensOut ?? 0,
                costMicros: chunk.usage?.costMicros ?? 0,
                model: candidate.model.id,
              };
              modelSource = candidate.source;
              yield { ...chunk, modelSource: candidate.source };
              completed = true;
              break;
            } else if (chunk.type === "error") {
              streamError = chunk.error ?? "provider error";
              errorCode = chunk.errorCode ?? "AI_PROVIDER_ERROR";
              break;
            }
          }
        } catch (e: any) {
          if (e?.name === "AbortError" || e?.name === "TimeoutError") {
            streamError = `timeout after ${perCallTimeout / 1000}s`;
            errorCode = "AI_TIMEOUT";
          } else {
            streamError = e?.message ?? "stream error";
            errorCode = "AI_PROVIDER_ERROR";
          }
        } finally {
          clearTimeout(timer);
        }

        if (!completed && candidate.source === "real") {
          const backoff = BASE_RETRY_DELAY_MS * Math.pow(2, Math.min(attempts - 1, 3));
          await new Promise((r) => setTimeout(r, backoff));
        }
      }

      if (!completed) {
        yield {
          type: "error",
          error: streamError ?? AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE,
          errorCode: (streamError ? errorCode : "AI_PROVIDER_CONFIGURATION_REQUIRED") as any,
          modelSource,
          durationMs: Date.now() - started,
        };
      }
    } finally {
      await flushTelemetry();
    }
  }
}

export const aiRegistry = new ProviderRegistry();
