import type { AIProvider, ChatMessage, CompletionChunk, CompletionRequest, ModelHealth, ModelInfo } from "./types.js";

/**
 * Minimal streaming OpenAI-compatible chat provider. Works with OpenAI
 * and any endpoint exposing /v1/chat/completions with stream:true.
 * No SDK dependency — uses fetch to avoid bloating the bundle.
 *
 * With stream_options.include_usage the OpenAI API emits a final chunk
 * containing accurate prompt_tokens/completion_tokens; we use that when
 * present and fall back to character-based estimates otherwise.
 */

// Per-1k-token pricing in USD. Values are best-effort public pricing as of
// 2025; kept intentionally conservative.
const COST_PER_1K: Record<string, { prompt: number; completion: number; embedding?: number }> = {
  "gpt-4o-mini":  { prompt: 0.00015, completion: 0.00060 },
  "gpt-4o":       { prompt: 0.0025,  completion: 0.010 },
  "gpt-4":        { prompt: 0.03,    completion: 0.06 },
  "gpt-4-turbo":  { prompt: 0.01,    completion: 0.03 },
  "gpt-3.5-turbo":{ prompt: 0.0005,  completion: 0.0015 },
  "text-embedding-3-small":  { prompt: 0.00002, completion: 0, embedding: 0.00002 },
  "text-embedding-3-large":  { prompt: 0.00013, completion: 0, embedding: 0.00013 },
  "text-embedding-ada-002":  { prompt: 0.00010, completion: 0, embedding: 0.00010 },
};

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

function costFor(model: string, tokensIn: number, tokensOut: number): number {
  const key = Object.keys(COST_PER_1K).find((k) => model.toLowerCase().startsWith(k));
  const { prompt, completion } = key ? COST_PER_1K[key] : { prompt: 0, completion: 0 };
  // costMicros = costUsd * 1e8 → millionths of a cent precision.
  return Math.round(((tokensIn / 1000) * prompt + (tokensOut / 1000) * completion) * 1e8);
}

export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  readonly displayName = "OpenAI";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = "https://api.openai.com/v1",
    private readonly defaultModel: string = "gpt-4o-mini"
  ) {}

  async health(signal?: AbortSignal): Promise<ModelHealth> {
    const started = Date.now();
    try {
      const ctrl = AbortSignal.timeout?.(5000);
      const merged = signal && ctrl ? AbortSignal.any([signal, ctrl]) : (ctrl ?? signal);
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: merged,
      });
      if (!res.ok) {
        return { healthy: false, latencyMs: Date.now() - started, checkedAt: Date.now(), error: `HTTP ${res.status}` };
      }
      return { healthy: true, latencyMs: Date.now() - started, checkedAt: Date.now() };
    } catch (e: any) {
      return { healthy: false, latencyMs: Date.now() - started, checkedAt: Date.now(), error: e?.message ?? "health failed" };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "gpt-4o-mini", provider: this.id, displayName: "GPT-4o Mini", contextWindow: 128000, maxOutput: 16384, capabilities: ["stream", "vision", "json_mode"], costInputPer1k: COST_PER_1K["gpt-4o-mini"].prompt, costOutputPer1k: COST_PER_1K["gpt-4o-mini"].completion },
      { id: "gpt-4o",      provider: this.id, displayName: "GPT-4o",      contextWindow: 128000, maxOutput: 16384, capabilities: ["stream", "vision", "json_mode"], costInputPer1k: COST_PER_1K["gpt-4o"].prompt, costOutputPer1k: COST_PER_1K["gpt-4o"].completion },
      { id: DEFAULT_EMBEDDING_MODEL, provider: this.id, displayName: "Embeddings v3 Small", contextWindow: 8191, maxOutput: 0, capabilities: ["embeddings"], costInputPer1k: COST_PER_1K[DEFAULT_EMBEDDING_MODEL].prompt, costOutputPer1k: 0 },
      { id: "text-embedding-3-large", provider: this.id, displayName: "Embeddings v3 Large", contextWindow: 8191, maxOutput: 0, capabilities: ["embeddings"], costInputPer1k: COST_PER_1K["text-embedding-3-large"].prompt, costOutputPer1k: 0 },
    ];
  }

  async *chatStream(req: CompletionRequest): AsyncGenerator<CompletionChunk, void> {
    const model = req.model && req.model.startsWith("gpt-") ? req.model : this.defaultModel;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(new DOMException("OpenAI request timed out", "TimeoutError")), 60_000);
    if (req.signal) req.signal.addEventListener("abort", () => ctrl.abort(req.signal?.reason));
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
            ...req.messages.map((m: ChatMessage) => ({ role: m.role, content: m.content })),
          ],
          temperature: req.temperature ?? 0.7,
          max_tokens: req.maxTokens ?? 1024,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        yield { type: "error", error: `OpenAI error (${res.status}): ${txt.slice(0, 300)}`, errorCode: "AI_PROVIDER_ERROR" };
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let tokensOut = 0;
      let tokensIn = 0;
      const started = Date.now();
      let finalUsageSeen = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                tokensOut += delta.length; // rough char-based running count until final usage
                yield { type: "token", text: delta };
              }
              if (json.usage) {
                finalUsageSeen = true;
                tokensIn = json.usage.prompt_tokens ?? tokensIn;
                // completion_tokens in the final usage includes all output tokens
                if (json.usage.completion_tokens) tokensOut = 0; // will use completion_tokens below
                const realOut = json.usage.completion_tokens ?? Math.ceil(tokensOut / 4);
                const realIn = tokensIn || Math.ceil(req.messages.reduce((a, m) => a + m.content.length, 0) / 4);
                yield {
                  type: "done",
                  usage: { tokensIn: realIn, tokensOut: realOut, costMicros: costFor(model, realIn, realOut), model },
                  durationMs: Date.now() - started,
                };
                return;
              }
            } catch {
              /* skip malformed */
            }
          }
        }
        if (!finalUsageSeen) {
          const realIn = Math.ceil(req.messages.reduce((a, m) => a + m.content.length, 0) / 4);
          const realOut = Math.ceil(tokensOut / 4);
          yield {
            type: "done",
            usage: { tokensIn: realIn, tokensOut: realOut, costMicros: costFor(model, realIn, realOut), model },
            durationMs: Date.now() - started,
          };
        }
      } catch (e: any) {
        if (e?.name === "AbortError" || e?.name === "TimeoutError") {
          yield { type: "error", error: `OpenAI timeout after 60s`, errorCode: "AI_TIMEOUT" };
        } else {
          yield { type: "error", error: e?.message ?? "stream error", errorCode: "AI_PROVIDER_ERROR" };
        }
      } finally {
        try { reader.releaseLock(); } catch { /* noop */ }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async chatComplete(req: CompletionRequest): Promise<import("./types.js").CompletionResult> {
    const model = req.model && req.model.startsWith("gpt-") ? req.model : this.defaultModel;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(new DOMException("OpenAI request timed out", "TimeoutError")), 60_000);
    if (req.signal) req.signal.addEventListener("abort", () => ctrl.abort(req.signal?.reason));
    const started = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
            ...req.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
          temperature: req.temperature ?? 0.7,
          max_tokens: req.maxTokens ?? 1024,
          stream: false,
          ...(req.responseFormat?.type === "json_object" ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 401 || res.status === 403) {
          const e: any = new Error(`OpenAI auth error (${res.status}): ${txt.slice(0, 200)}`); e.code = "AI_PROVIDER_ERROR"; throw e;
        }
        if (res.status === 429) {
          const e: any = new Error(`OpenAI rate limited (${res.status}): ${txt.slice(0, 200)}`); e.code = "AI_RATE_LIMITED"; throw e;
        }
        if (res.status === 400 && /context_length|too many tokens/i.test(txt)) {
          const e: any = new Error(`Context length exceeded`); e.code = "AI_CONTEXT_LENGTH"; throw e;
        }
        const e: any = new Error(`OpenAI error (${res.status}): ${txt.slice(0, 300)}`); e.code = "AI_PROVIDER_ERROR"; throw e;
      }
      const j = await res.json() as any;
      const content = j.choices?.[0]?.message?.content ?? "";
      const u = j.usage ?? {};
      const tokensIn = u.prompt_tokens ?? Math.ceil(req.messages.reduce((a, m) => a + m.content.length, 0) / 4);
      const tokensOut = u.completion_tokens ?? Math.ceil(content.length / 4);
      return {
        content,
        usage: { tokensIn, tokensOut, costMicros: costFor(model, tokensIn, tokensOut), model },
        model,
        provider: this.id,
        durationMs: Date.now() - started,
        modelSource: "real",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async embed(req: import("./types.js").EmbeddingRequest): Promise<import("./types.js").EmbeddingResult> {
    const model = req.model && req.model.startsWith("text-embedding") ? req.model : DEFAULT_EMBEDDING_MODEL;
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(new DOMException("OpenAI embed timed out", "TimeoutError")), 30_000);
    if (req.signal) req.signal.addEventListener("abort", () => ctrl.abort(req.signal?.reason));
    const started = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model, input: inputs }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        const e: any = new Error(`OpenAI embeddings error (${res.status}): ${txt.slice(0, 200)}`);
        e.code = res.status === 429 ? "AI_RATE_LIMITED" : "AI_PROVIDER_ERROR";
        throw e;
      }
      const j = await res.json() as any;
      const embeddings = (j.data ?? []).sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding as number[]);
      const tokensIn = j.usage?.prompt_tokens ?? Math.ceil(inputs.reduce((a, t) => a + t.length, 0) / 4);
      return {
        embeddings,
        model,
        tokensIn,
        costMicros: Math.round((tokensIn / 1000) * (COST_PER_1K[model]?.prompt ?? 0) * 1e8),
        durationMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
