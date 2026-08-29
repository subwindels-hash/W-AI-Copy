/**
 * Session 199 — translation + language-detection tests.
 *
 * The AI fabric is mocked so the suite is deterministic (no network) while
 * still exercising the full prompt/parse/validate/fallback path and the
 * honesty guarantees (never silently return a wrong translation; report the
 * engine source; preserve regional/script variants).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Controllable mock of aiRegistry.complete(). Each test sets `impl`.
const state: { impl: ((req: any) => Promise<any>) | null } = { impl: null };
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: {
    complete: (req: any) => (state.impl ? state.impl(req) : Promise.reject(new Error("no impl set"))),
  },
}));
vi.mock("../config/logger.js", () => ({ logger: { warn() {}, info() {}, error() {} } }));

const { translate, detectLanguage, guessWritingSystem } = await import("./translate.js");

function realJson(obj: unknown) {
  return { content: JSON.stringify(obj), modelSource: "real" as const, model: "test-model" };
}
function demoJson(obj: unknown) {
  return { content: JSON.stringify(obj), modelSource: "echo-demo" as const, model: "windels-assistant" };
}

beforeEach(() => { state.impl = null; });

describe("writing-system heuristics", () => {
  it("classifies non-Latin scripts", () => {
    expect(guessWritingSystem("こんにちは")).toBe("HIRAGANA_KANJI");
    expect(guessWritingSystem("안녕하세요")).toBe("HANGUL");
    expect(guessWritingSystem("Здравствуйте")).toBe("CYRILLIC");
    expect(guessWritingSystem("مرحبا")).toBe("ARABIC");
    expect(guessWritingSystem("שלום")).toBe("HEBREW");
    expect(guessWritingSystem("สวัสดี")).toBe("THAI");
    expect(guessWritingSystem("नमस्ते")).toBe("DEVANAGARI");
    expect(guessWritingSystem("Hello")).toBe("LATIN");
    expect(guessWritingSystem("12345")).toBe(null);
  });
});

describe("language detection", () => {
  it("detects a unique-script language offline without calling the model", async () => {
    state.impl = () => Promise.reject(new Error("model should not be called"));
    const d = await detectLanguage("こんにちは、元気ですか");
    expect(d.code).toBe("ja");
    expect(d.name).toBe("Japanese");
    expect(d.reliable).toBe(true);
    expect(d.source).toBe("HEURISTIC");
  });

  it("uses the model for Latin-script text and validates the returned code", async () => {
    state.impl = () => Promise.resolve(realJson({ code: "es", confidence: 0.96, alternatives: [{ code: "pt-PT", confidence: 0.2 }] }));
    const d = await detectLanguage("Hola, ¿cómo estás hoy?");
    expect(d.code).toBe("es");
    expect(d.confidence).toBeGreaterThan(0.9);
    expect(d.reliable).toBe(true);
    expect(d.alternatives[0]?.code).toBe("pt-PT");
    expect(d.source).toBe("REAL");
  });

  it("rejects a hallucinated (non-catalog) code from the model", async () => {
    state.impl = () => Promise.resolve(realJson({ code: "zzz-not-real", confidence: 0.99, alternatives: [] }));
    const d = await detectLanguage("some latin words here");
    expect(d.code).toBe(null);
    expect(d.reliable).toBe(false);
  });

  it("falls back to a script heuristic when the model fails", async () => {
    state.impl = () => Promise.reject(new Error("provider down"));
    const d = await detectLanguage("Καλημέρα φίλε μου");
    // Greek is a unique script → resolved before the model is even needed.
    expect(d.code).toBe("el");
  });

  it("rejects empty input", async () => {
    await expect(detectLanguage("   ")).rejects.toMatchObject({ code: "EMPTY_TEXT" });
  });
});

describe("translation", () => {
  it("produces a natural translation and reports REAL source", async () => {
    state.impl = (req) => {
      // The translate call requests JSON mode.
      expect(req.responseFormat?.type).toBe("json_object");
      return Promise.resolve(realJson({ translation: "Bonjour, comment ça va aujourd'hui ?", alternatives: [], note: null }));
    };
    const out = await translate({
      text: "Hello, how are you today?",
      targetLanguage: "fr",
      sourceLanguage: "en",
      formality: "AUTO",
      preserveFormatting: true,
      includeAlternatives: false,
    });
    expect(out.translatedText).toContain("Bonjour");
    expect(out.targetLanguage.code).toBe("fr");
    expect(out.sourceLanguage.code).toBe("en");
    expect(out.source).toBe("REAL");
  });

  it("preserves a regional variant in the target locale sent to the model", async () => {
    let seenSystem = "";
    state.impl = (req) => {
      seenSystem = req.messages.find((m: any) => m.role === "system")?.content ?? "";
      return Promise.resolve(realJson({ translation: "Olá, tudo bem?", alternatives: [], note: null }));
    };
    const out = await translate({
      text: "Hi, all good?",
      targetLanguage: "pt-BR",
      sourceLanguage: "en",
      formality: "AUTO",
      preserveFormatting: true,
      includeAlternatives: false,
    });
    expect(out.targetLanguage.bcp47).toBe("pt-BR");
    expect(seenSystem).toContain("pt-BR");
    expect(seenSystem).toContain("Brazil");
  });

  it("instructs RTL output for right-to-left targets", async () => {
    let seenSystem = "";
    state.impl = (req) => {
      seenSystem = req.messages.find((m: any) => m.role === "system")?.content ?? "";
      return Promise.resolve(realJson({ translation: "مرحبا بالعالم", alternatives: [], note: null }));
    };
    const out = await translate({
      text: "Hello world",
      targetLanguage: "ar",
      sourceLanguage: "en",
      formality: "FORMAL",
      preserveFormatting: true,
      includeAlternatives: false,
    });
    expect(out.translatedText).toBe("مرحبا بالعالم");
    expect(seenSystem.toLowerCase()).toContain("right-to-left");
    expect(seenSystem).toContain("formal");
  });

  it("auto-detects the source when set to auto", async () => {
    const calls: string[] = [];
    state.impl = (req) => {
      const sys = req.messages.find((m: any) => m.role === "system")?.content ?? "";
      calls.push(sys.slice(0, 24));
      if (/language identification/i.test(sys)) {
        return Promise.resolve(realJson({ code: "de", confidence: 0.95, alternatives: [] }));
      }
      return Promise.resolve(realJson({ translation: "Good morning", alternatives: [], note: null }));
    };
    const out = await translate({
      text: "Guten Morgen",
      targetLanguage: "en",
      sourceLanguage: "auto",
      formality: "AUTO",
      preserveFormatting: true,
      includeAlternatives: false,
    });
    expect(out.sourceLanguage.code).toBe("de");
    expect(out.translatedText).toBe("Good morning");
    // detection + translation = two model calls
    expect(calls.length).toBe(2);
  });

  it("returns text unchanged when source and target are identical", async () => {
    state.impl = () => Promise.reject(new Error("model should not be called for a no-op"));
    const out = await translate({
      text: "Bonjour",
      targetLanguage: "fr",
      sourceLanguage: "fr",
      formality: "AUTO",
      preserveFormatting: true,
      includeAlternatives: false,
    });
    expect(out.translatedText).toBe("Bonjour");
    expect(out.note).toMatch(/same/i);
  });

  it("includes alternatives when requested", async () => {
    state.impl = () => Promise.resolve(realJson({ translation: "Estoy bien", alternatives: ["Me encuentro bien", "Todo bien"], note: "informal register" }));
    const out = await translate({
      text: "I'm doing well",
      targetLanguage: "es",
      sourceLanguage: "en",
      formality: "INFORMAL",
      preserveFormatting: true,
      includeAlternatives: true,
    });
    expect(out.alternatives.length).toBe(2);
    expect(out.note).toBe("informal register");
  });

  it("marks a DEMO/echo result as DEMO, never as real", async () => {
    state.impl = () => Promise.resolve(demoJson({ translation: "[demo] ciao", alternatives: [], note: null }));
    const out = await translate({
      text: "hello",
      targetLanguage: "it",
      sourceLanguage: "en",
      formality: "AUTO",
      preserveFormatting: true,
      includeAlternatives: false,
    });
    expect(out.source).toBe("DEMO");
  });

  it("NEVER silently returns the input when the provider is unavailable", async () => {
    const err: any = new Error("no provider");
    err.code = "AI_PROVIDER_CONFIGURATION_REQUIRED";
    state.impl = () => Promise.reject(err);
    await expect(translate({
      text: "translate me",
      targetLanguage: "ja",
      sourceLanguage: "en",
      formality: "AUTO",
      preserveFormatting: true,
      includeAlternatives: false,
    })).rejects.toMatchObject({ code: "TRANSLATION_PROVIDER_UNAVAILABLE", status: 503 });
  });

  it("fails clearly when the model returns unparseable output (no wrong result leaks)", async () => {
    state.impl = () => Promise.resolve(realJson({ notTranslation: "oops" }));
    await expect(translate({
      text: "translate me",
      targetLanguage: "ko",
      sourceLanguage: "en",
      formality: "AUTO",
      preserveFormatting: true,
      includeAlternatives: false,
    })).rejects.toMatchObject({ code: "TRANSLATION_FAILED" });
  });

  it("rejects an unknown target language", async () => {
    state.impl = () => Promise.resolve(realJson({ translation: "x", alternatives: [], note: null }));
    await expect(translate({
      text: "hi",
      targetLanguage: "not-a-language",
      sourceLanguage: "en",
      formality: "AUTO",
      preserveFormatting: true,
      includeAlternatives: false,
    })).rejects.toMatchObject({ code: "LANGUAGE_NOT_SUPPORTED" });
  });

  it("translates into a less-common, non-Latin catalog language (Amharic)", async () => {
    state.impl = () => Promise.resolve(realJson({ translation: "ሰላም ለዓለም", alternatives: [], note: null }));
    const out = await translate({
      text: "Hello world",
      targetLanguage: "am",
      sourceLanguage: "en",
      formality: "AUTO",
      preserveFormatting: true,
      includeAlternatives: false,
    });
    expect(out.targetLanguage.code).toBe("am");
    expect(out.translatedText).toBe("ሰላም ለዓለም");
  });

  it("handles a script variant target (Chinese Traditional) distinctly from Simplified", async () => {
    let seenSystem = "";
    state.impl = (req) => {
      seenSystem = req.messages.find((m: any) => m.role === "system")?.content ?? "";
      return Promise.resolve(realJson({ translation: "你好，世界", alternatives: [], note: null }));
    };
    const out = await translate({
      text: "Hello world",
      targetLanguage: "zh-Hant",
      sourceLanguage: "en",
      formality: "AUTO",
      preserveFormatting: true,
      includeAlternatives: false,
    });
    expect(out.targetLanguage.bcp47).toBe("zh-Hant");
    expect(seenSystem).toContain("zh-Hant");
    expect(seenSystem).toContain("Traditional");
  });
});
