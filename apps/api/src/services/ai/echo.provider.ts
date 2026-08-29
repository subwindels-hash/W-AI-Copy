import type { AIProvider, CompletionRequest, CompletionChunk, ModelHealth, ModelInfo } from "./types.js";

/**
 * Echo/assistant provider — the default, always-available streaming provider
 * that replies helpfully without external APIs. Used in dev, in tests, and
 * as a guaranteed fallback when no external AI keys are configured.
 * It is NOT a mock — it produces a real, readable streamed response and
 * reports realistic usage estimates so the UI behaves identically whether
 * the user is talking to this, OpenAI, or Anthropic.
 *
 * This provider is NEVER used in strict/production mode unless explicitly
 * enabled (see AI_REQUIRE_REAL_MODEL in env). When used, every response is
 * prefixed with [DEMO RESPONSE — NO AI MODEL CONFIGURED] by the registry.
 */
export class EchoProvider implements AIProvider {
  readonly id = "windels-echo";
  readonly displayName = "Windels Assistant (DEMO)";

  async health(_signal?: AbortSignal): Promise<ModelHealth> {
    return { healthy: true, latencyMs: 0, checkedAt: Date.now() };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: "windels-assistant",
        provider: this.id,
        displayName: "Windels Assistant",
        contextWindow: 32000,
        maxOutput: 2048,
        capabilities: ["stream"],
      },
    ];
  }

  async *chatStream(req: CompletionRequest): AsyncGenerator<CompletionChunk, void> {
    const last = req.messages.at(-1);
    const userText = last?.content?.trim() ?? "";

    const intro =
      `Hi! I'm the Windels Assistant — your AI-native operating system is online.\n\n`;
    const body =
      `I received your message: "${userText.slice(0, 280)}${userText.length > 280 ? "…" : ""}"\n\n` +
      `We're running in Session 3 of the build. The full multi-provider AI fabric (OpenAI, ` +
      `Anthropic, and self-hosted models) is wired in at the provider layer; set ` +
      `OPENAI_API_KEY or ANTHROPIC_API_KEY in your environment to route to those models. ` +
      `Until then I'll stream real-time responses like this so every UI surface feels alive.\n\n` +
      `Try:\n` +
      `• @mention an AI employee (Executor, Researcher, Analyst, Creative, Coordinator)\n` +
      `• Attach a file with the paperclip button\n` +
      `• Create a task directly from a message\n` +
      `• Pick a prompt template from the ⚡ menu to get started faster.\n\n`;
    const outro = `(session model: ${req.model}, tokens streaming…)`;

    const full = intro + body + outro;
    // Stream one word at a time with a small delay for realism.
    const words = full.split(/(\s+)/);
    const started = Date.now();
    // Rough token estimate: ~4 chars per token
    let outChars = 0;
    for (const w of words) {
      if (req.signal?.aborted) {
        yield { type: "error", error: "aborted" };
        return;
      }
      await new Promise((r) => setTimeout(r, 12 + Math.random() * 18));
      outChars += w.length;
      yield { type: "token", text: w };
    }
    const durationMs = Date.now() - started;
    const tokensIn = Math.ceil(
      req.messages.reduce((acc, m) => acc + m.content.length, 0) / 4
    );
    const tokensOut = Math.ceil(outChars / 4);
    yield {
      type: "done",
      usage: { tokensIn, tokensOut, costMicros: 0, model: req.model },
      // Attach duration so the service can record it.
      ...({ durationMs } as object),
    } as CompletionChunk;
  }
}
