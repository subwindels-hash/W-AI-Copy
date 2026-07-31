import type { AIProvider, ChatMessage, CompletionChunk, CompletionRequest, ModelHealth, ModelInfo } from "./types.js";

/**
 * Google Gemini streaming provider.
 *
 * Uses the `streamGenerateContent` endpoint with SSE-like JSON chunks.
 * Maps our universal ChatMessage format to Gemini's {role: "user"|"model", parts:[{text}]}
 * and reports usage when the API returns it.
 */

const COST_PER_1K: Record<string, { prompt: number; completion: number }> = {
  "gemini-1.5-flash": { prompt: 0.000075, completion: 0.0003 },
  "gemini-1.5-pro":   { prompt: 0.00125,  completion: 0.005 },
  "gemini-2.0-flash": { prompt: 0.0001,   completion: 0.0004 },
};

function costFor(model: string, tokensIn: number, tokensOut: number): number {
  const key = Object.keys(COST_PER_1K).find((k) => model.toLowerCase().startsWith(k));
  const { prompt, completion } = key ? COST_PER_1K[key] : { prompt: 0, completion: 0 };
  return Math.round(((tokensIn / 1000) * prompt + (tokensOut / 1000) * completion) * 1e8);
}

function mapRole(r: ChatMessage["role"]): "user" | "model" {
  if (r === "assistant") return "model";
  return "user";
}

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly displayName = "Google Gemini";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = "https://generativelanguage.googleapis.com/v1beta",
    private readonly defaultModel: string = "gemini-1.5-flash"
  ) {}

  async health(signal?: AbortSignal): Promise<ModelHealth> {
    const started = Date.now();
    try {
      const ctrl = AbortSignal.timeout?.(5000);
      const merged = signal && ctrl ? AbortSignal.any([signal, ctrl]) : (ctrl ?? signal);
      // Lightweight probe: list models.
      const res = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`, { signal: merged });
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
      { id: "gemini-1.5-flash", provider: this.id, displayName: "Gemini 1.5 Flash", contextWindow: 1_048_576, maxOutput: 8192, capabilities: ["stream", "vision"], costInputPer1k: COST_PER_1K["gemini-1.5-flash"].prompt, costOutputPer1k: COST_PER_1K["gemini-1.5-flash"].completion },
      { id: "gemini-1.5-pro",   provider: this.id, displayName: "Gemini 1.5 Pro",   contextWindow: 2_097_152, maxOutput: 8192, capabilities: ["stream", "vision"], costInputPer1k: COST_PER_1K["gemini-1.5-pro"].prompt,   costOutputPer1k: COST_PER_1K["gemini-1.5-pro"].completion },
    ];
  }

  async *chatStream(req: CompletionRequest): AsyncGenerator<CompletionChunk, void> {
    // Build system instruction from req.system or first system message.
    const sysMsg = req.messages.find((m) => m.role === "system");
    const systemInstruction = req.system ?? sysMsg?.content
      ? { role: "user", parts: [{ text: req.system ?? sysMsg!.content }] }
      : undefined;
    const messages = req.messages.filter((m) => m.role !== "system").map((m: ChatMessage) => ({
      role: mapRole(m.role), parts: [{ text: m.content }],
    }));
    const model = req.model && req.model.startsWith("gemini-") ? req.model : this.defaultModel;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(new DOMException("Gemini request timed out", "TimeoutError")), 60_000);
    if (req.signal) req.signal.addEventListener("abort", () => ctrl.abort(req.signal?.reason));
    const started = Date.now();
    try {
      const url = `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: messages,
          ...(systemInstruction ? { systemInstruction } : {}),
          generationConfig: {
            temperature: req.temperature ?? 0.7,
            maxOutputTokens: req.maxTokens ?? 1024,
          },
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        yield { type: "error", error: `Gemini error (${res.status}): ${txt.slice(0, 300)}`, errorCode: "AI_PROVIDER_ERROR" };
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let tokensIn = 0, tokensOut = 0;
      let outChars = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep;
          while ((sep = buffer.indexOf("\n\n")) >= 0) {
            const raw = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            let data = "";
            for (const line of raw.split("\n")) {
              if (line.startsWith("data: ")) data += line.slice(6);
            }
            if (!data || data === "[DONE]") continue;
            try {
              const j = JSON.parse(data);
              // j.candidates[0].content.parts[0].text
              const text = j.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
              if (text) { outChars += text.length; yield { type: "token", text }; }
              // j.usageMetadata has promptTokenCount, candidatesTokenCount
              if (j.usageMetadata) {
                tokensIn = j.usageMetadata.promptTokenCount ?? tokensIn;
                tokensOut = j.usageMetadata.candidatesTokenCount ?? tokensOut;
              }
            } catch { /* skip */ }
          }
        }
        const realIn = tokensIn || Math.ceil((req.system?.length ?? 0) / 4) + Math.ceil(req.messages.reduce((a, m) => a + m.content.length, 0) / 4);
        const realOut = tokensOut || Math.ceil(outChars / 4);
        yield {
          type: "done",
          usage: { tokensIn: realIn, tokensOut: realOut, costMicros: costFor(model, realIn, realOut), model },
          durationMs: Date.now() - started,
        };
      } finally {
        try { reader.releaseLock(); } catch { /* noop */ }
      }
    } catch (e: any) {
      if (e?.name === "AbortError" || e?.name === "TimeoutError") {
        yield { type: "error", error: "Gemini timeout after 60s", errorCode: "AI_TIMEOUT" };
      } else {
        yield { type: "error", error: e?.message ?? "stream error", errorCode: "AI_PROVIDER_ERROR" };
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
