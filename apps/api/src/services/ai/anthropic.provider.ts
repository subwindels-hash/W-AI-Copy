import type { AIProvider, ChatMessage, CompletionChunk, CompletionRequest, ModelHealth, ModelInfo } from "./types.js";

/**
 * Anthropic Messages API streaming provider.
 * Uses SSE over the /v1/messages endpoint with the "anthropic-version" header.
 * Parses content_block_delta events and the final message_stop event for accurate
 * token usage (input/output tokens are provided by the API).
 */

const COST_PER_1K: Record<string, { prompt: number; completion: number }> = {
  "claude-3-5-sonnet": { prompt: 0.003,  completion: 0.015 },
  "claude-3-5-haiku":  { prompt: 0.0008, completion: 0.004 },
  "claude-3-opus":     { prompt: 0.015,  completion: 0.075 },
  "claude-3-sonnet":   { prompt: 0.003,  completion: 0.015 },
  "claude-3-haiku":    { prompt: 0.00025,completion: 0.00125 },
};

function costFor(model: string, tokensIn: number, tokensOut: number): number {
  const key = Object.keys(COST_PER_1K).find((k) => model.toLowerCase().startsWith(k));
  const { prompt, completion } = key ? COST_PER_1K[key] : { prompt: 0, completion: 0 };
  return Math.round(((tokensIn / 1000) * prompt + (tokensOut / 1000) * completion) * 1e8);
}

/** Character count for a content field that may be a string or block array. */
function approxLength(content: unknown): number {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  return content.reduce((acc: number, block: any) => {
    if (typeof block?.text === "string") return acc + block.text.length;
    // Base64 image payloads: ~750 tokens for a typical image, expressed in chars.
    if (block?.type === "image") return acc + 3000;
    return acc;
  }, 0);
}

/**
 * Maps a universal ChatMessage to Anthropic's wire format. Turns carrying
 * images become a content-block array with base64 image sources; text-only
 * turns keep the plain-string form.
 */
function toAnthropicMessage(m: ChatMessage) {
  if (!m.images?.length) return { role: m.role, content: m.content };
  return {
    role: m.role,
    content: [
      ...m.images.map((img) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: img.mimeType, data: img.dataBase64 },
      })),
      ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
    ],
  };
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly displayName = "Anthropic";
  private static readonly API_VERSION = "2023-06-01";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = "https://api.anthropic.com",
    private readonly defaultModel: string = "claude-3-5-sonnet-latest"
  ) {}

  async health(signal?: AbortSignal): Promise<ModelHealth> {
    // Anthropic has no unauthenticated ping; use an ultra-short messages call
    // with max_tokens=1 as a health probe (bills ~2 tokens). Faster path: we
    // simply treat GET / as a connectivity test and accept 404 as "service up".
    const started = Date.now();
    try {
      const ctrl = AbortSignal.timeout?.(5000);
      const merged = signal && ctrl ? AbortSignal.any([signal, ctrl]) : (ctrl ?? signal);
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": AnthropicProvider.API_VERSION,
        },
        signal: merged,
      });
      if (!res.ok && res.status !== 404 && res.status !== 403) {
        return { healthy: false, latencyMs: Date.now() - started, checkedAt: Date.now(), error: `HTTP ${res.status}` };
      }
      return { healthy: true, latencyMs: Date.now() - started, checkedAt: Date.now() };
    } catch (e: any) {
      return { healthy: false, latencyMs: Date.now() - started, checkedAt: Date.now(), error: e?.message ?? "health failed" };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "claude-3-5-sonnet-latest", provider: this.id, displayName: "Claude 3.5 Sonnet", contextWindow: 200000, maxOutput: 8192, capabilities: ["stream", "vision"], costInputPer1k: COST_PER_1K["claude-3-5-sonnet"].prompt, costOutputPer1k: COST_PER_1K["claude-3-5-sonnet"].completion },
      { id: "claude-3-5-haiku-latest",  provider: this.id, displayName: "Claude 3.5 Haiku",  contextWindow: 200000, maxOutput: 8192, capabilities: ["stream"],          costInputPer1k: COST_PER_1K["claude-3-5-haiku"].prompt,  costOutputPer1k: COST_PER_1K["claude-3-5-haiku"].completion },
      { id: "claude-3-opus-latest",     provider: this.id, displayName: "Claude 3 Opus",      contextWindow: 200000, maxOutput: 4096, capabilities: ["stream", "vision"], costInputPer1k: COST_PER_1K["claude-3-opus"].prompt,     costOutputPer1k: COST_PER_1K["claude-3-opus"].completion },
    ];
  }

  async *chatStream(req: CompletionRequest): AsyncGenerator<CompletionChunk, void> {
    // Anthropic uses a flat "system" string, not a system message.
    const sysMsg = req.messages.find((m) => m.role === "system");
    const system = req.system ?? sysMsg?.content ?? undefined;
    const messages = req.messages.filter((m) => m.role !== "system").map(toAnthropicMessage);
    const model = req.model && req.model.startsWith("claude-") ? req.model : this.defaultModel;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(new DOMException("Anthropic request timed out", "TimeoutError")), 60_000);
    if (req.signal) req.signal.addEventListener("abort", () => ctrl.abort(req.signal?.reason));
    const started = Date.now();

    try {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": AnthropicProvider.API_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.7,
          stream: true,
          ...(system ? { system } : {}),
          messages,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        yield { type: "error", error: `Anthropic error (${res.status}): ${txt.slice(0, 300)}`, errorCode: "AI_PROVIDER_ERROR" };
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let tokensIn = 0, tokensOut = 0;
      let eventName = "";
      let eventData = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep;
          while ((sep = buffer.indexOf("\n\n")) >= 0) {
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            // Parse SSE event
            eventName = "";
            eventData = "";
            for (const line of rawEvent.split("\n")) {
              if (line.startsWith("event: ")) eventName = line.slice(7).trim();
              else if (line.startsWith("data: ")) eventData += line.slice(6);
            }
            if (!eventData) continue;
            if (eventName === "content_block_delta") {
              try {
                const j = JSON.parse(eventData);
                const text = j.delta?.text;
                if (text) yield { type: "token", text };
              } catch { /* skip malformed */ }
            } else if (eventName === "message_start") {
              try {
                const j = JSON.parse(eventData);
                tokensIn = j.message?.usage?.input_tokens ?? tokensIn;
              } catch { /* noop */ }
            } else if (eventName === "message_delta") {
              try {
                const j = JSON.parse(eventData);
                tokensOut = j.usage?.output_tokens ?? tokensOut;
              } catch { /* noop */ }
            } else if (eventName === "message_stop") {
              const realIn = tokensIn || Math.ceil((req.system?.length ?? 0) / 4) + Math.ceil(messages.reduce((a, m) => a + approxLength(m.content), 0) / 4);
              const realOut = tokensOut || 0;
              yield {
                type: "done",
                usage: { tokensIn: realIn, tokensOut: realOut, costMicros: costFor(model, realIn, realOut), model },
                durationMs: Date.now() - started,
              };
              return;
            }
          }
        }
        // If stream ended without message_stop
        const realIn = tokensIn || Math.ceil((req.system?.length ?? 0) / 4) + Math.ceil(messages.reduce((a, m) => a + approxLength(m.content), 0) / 4);
        yield {
          type: "done",
          usage: { tokensIn: realIn, tokensOut, costMicros: costFor(model, realIn, tokensOut), model },
          durationMs: Date.now() - started,
        };
      } finally {
        try { reader.releaseLock(); } catch { /* noop */ }
      }
    } catch (e: any) {
      if (e?.name === "AbortError" || e?.name === "TimeoutError") {
        yield { type: "error", error: "Anthropic timeout after 60s", errorCode: "AI_TIMEOUT" };
      } else {
        yield { type: "error", error: e?.message ?? "stream error", errorCode: "AI_PROVIDER_ERROR" };
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
