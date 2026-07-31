/**
 * Ollama (local/self-hosted) AI provider adapter.
 *
 * Connects to a local or networked Ollama server (default http://127.0.0.1:11434)
 * using its /api/chat streaming endpoint. Requires zero external API keys and
 * supports any model the user has pulled (llama3, qwen2.5, gemma, mistral, ...).
 *
 * This adapter enables fully self-hosted operation: set OLLAMA_BASE_URL and
 * OLLAMA_MODEL to activate.
 */
import type { AIProvider, CompletionRequest, CompletionChunk, ModelHealth, ModelInfo } from "./types.js";

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export class OllamaProvider implements AIProvider {
  readonly id = "ollama";
  readonly displayName = "Ollama (Local)";
  private baseUrl: string;
  private model: string;

  constructor(cfg: OllamaConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, "");
    this.model = cfg.model;
  }

  async health(signal?: AbortSignal): Promise<ModelHealth> {
    const started = Date.now();
    try {
      const ctrl = AbortSignal.timeout?.(4000);
      const merged = signal && ctrl ? AbortSignal.any([signal, ctrl]) : (ctrl ?? signal);
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: merged });
      if (!res.ok) {
        return { healthy: false, latencyMs: Date.now() - started, checkedAt: Date.now(), error: `HTTP ${res.status}` };
      }
      return { healthy: true, latencyMs: Date.now() - started, checkedAt: Date.now() };
    } catch (e: any) {
      return { healthy: false, latencyMs: Date.now() - started, checkedAt: Date.now(), error: e?.message ?? "health failed" };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout?.(4000) });
      if (!res.ok) return [this.defaultModel()];
      const j = (await res.json()) as { models?: Array<{ name: string }> };
      const models = (j.models ?? []).map((m) => {
        const nameLc = m.name.toLowerCase();
        const isEmbedding = /embed|nomic|bert|minilm/.test(nameLc);
        return {
          id: `ollama:${m.name}`,
          provider: this.id,
          displayName: m.name,
          contextWindow: isEmbedding ? 8192 : 8192,
          maxOutput: isEmbedding ? 0 : 2048,
          capabilities: isEmbedding ? ["embeddings"] : ["stream"],
          costInputPer1k: 0,
          costOutputPer1k: 0,
        };
      });
      return models.length ? models : [this.defaultModel()];
    } catch {
      return [this.defaultModel()];
    }
  }

  private defaultModel(): ModelInfo {
    return {
      id: `ollama:${this.model}`,
      provider: this.id,
      displayName: `${this.model} (local Ollama)`,
      contextWindow: 8192,
      maxOutput: 2048,
      capabilities: ["stream"],
      costInputPer1k: 0,
      costOutputPer1k: 0,
    };
  }

  async *chatStream(req: CompletionRequest): AsyncGenerator<CompletionChunk, void> {
    const messages = req.messages.map((m) => ({ role: m.role, content: m.content }));
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true,
      options: {
        temperature: req.temperature ?? 0.7,
        num_predict: req.maxTokens ?? 2048,
      },
    };
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(new DOMException("Ollama request timed out", "TimeoutError")), 120_000);
    if (req.signal) req.signal.addEventListener("abort", () => ctrl.abort(req.signal?.reason));
    const started = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        yield { type: "error", error: `Ollama error (HTTP ${res.status}): ${text.slice(0, 200)}`, errorCode: "AI_PROVIDER_ERROR" };
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let outChars = 0;
      const tokensIn = Math.ceil(req.messages.reduce((a, m) => a + m.content.length, 0) / 4);
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
              const evt = JSON.parse(line);
              const piece = evt.message?.content ?? "";
              if (piece) {
                outChars += piece.length;
                yield { type: "token", text: piece };
              }
              if (evt.done) {
                const evalCount = Number(evt.eval_count ?? 0);
                const promptEval = Number(evt.prompt_eval_count ?? tokensIn);
                yield {
                  type: "done",
                  usage: {
                    tokensIn: promptEval || tokensIn,
                    tokensOut: evalCount || Math.ceil(outChars / 4),
                    costMicros: 0, // self-hosted is free
                    model: req.model,
                  },
                  durationMs: Date.now() - started,
                };
                return;
              }
            } catch {
              // skip malformed line
            }
          }
        }
        yield {
          type: "done",
          usage: { tokensIn, tokensOut: Math.ceil(outChars / 4), costMicros: 0, model: req.model },
          durationMs: Date.now() - started,
        };
      } finally {
        try { reader.releaseLock(); } catch { /* noop */ }
      }
    } catch (e: any) {
      if (e?.name === "AbortError" || e?.name === "TimeoutError") {
        yield { type: "error", error: "Ollama timeout after 120s", errorCode: "AI_TIMEOUT" };
      } else {
        yield { type: "error", error: e?.message ?? "stream error", errorCode: "AI_PROVIDER_ERROR" };
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async embed(req: import("./types.js").EmbeddingRequest): Promise<import("./types.js").EmbeddingResult> {
    // Use requested model if it begins with "ollama:", else use the configured model with /api/embeddings
    // Ollama's embedding endpoint expects {model, prompt} for single, or {model, input: string[]} on newer versions.
    const model = (req.model?.startsWith("ollama:") ? req.model.slice("ollama:".length) : this.model);
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(new DOMException("Ollama embed timed out", "TimeoutError")), 30_000);
    if (req.signal) req.signal.addEventListener("abort", () => ctrl.abort(req.signal?.reason));
    const started = Date.now();
    try {
      // If single input, use /api/embeddings (widely supported). If multiple, loop.
      const embeddings: number[][] = [];
      let tokensIn = 0;
      for (const txt of inputs) {
        tokensIn += Math.ceil(txt.length / 4);
        const res = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt: txt }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          const e: any = new Error(`Ollama embeddings error (${res.status}): ${t.slice(0, 200)}`);
          e.code = "AI_PROVIDER_ERROR";
          throw e;
        }
        const j = await res.json() as any;
        embeddings.push(j.embedding ?? []);
      }
      return { embeddings, model: `ollama:${model}`, tokensIn, costMicros: 0, durationMs: Date.now() - started };
    } finally {
      clearTimeout(timeout);
    }
  }
}
