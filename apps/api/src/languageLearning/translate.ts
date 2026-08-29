/**
 * WINDELS AI — context-aware translation + automatic language detection.
 * Session 199.
 *
 * Powered by the shared AI fabric (`aiRegistry`) so translations are natural,
 * context-aware and idiom-aware (comparable to ChatGPT / Google Translate),
 * not word-for-word substitution. The engine:
 *
 *  - Detects the source language when asked (heuristic script pass + AI),
 *  - Preserves the selected regional/script variant end-to-end (the target
 *    BCP-47 locale is passed to the model, e.g. pt-BR vs pt-PT, zh-Hant),
 *  - Honours formality, formatting, names/proper nouns, tone and register,
 *  - Reports the engine source (REAL vs DEMO) and NEVER silently returns an
 *    incorrect translation: on provider failure / unsupported direction it
 *    throws a typed error the route surfaces as a clear message.
 */

import type {
  LlDetectedLanguage,
  LlLanguage,
  LlTranslateInput,
  LlTranslation,
  LlTranslationFormality,
} from "@windels/shared/languageLearning";
import { AUTO_DETECT_CODE } from "@windels/shared/languageLearning";
import { aiRegistry } from "../services/ai/registry.js";
import { logger } from "../config/logger.js";
import { getLanguage, listLanguages, requireLanguage } from "./registry.js";

function deny(code: string, message: string, status = 400): never {
  const err: any = new Error(message);
  err.code = code;
  err.status = status;
  throw err;
}

/* ───────────────────────────── Script heuristics ─────────────────────────── */
/**
 * A fast, offline first pass that narrows the source language by Unicode block.
 * It is intentionally conservative: it returns a *writing system* guess used to
 * (a) short-circuit obvious cases and (b) constrain / sanity-check the AI guess.
 * It never fabricates a confident language on its own for Latin-script text
 * (too many languages share it) — that goes to the model.
 */
const SCRIPT_RANGES: Array<{ ws: string; re: RegExp }> = [
  // Kana first: Japanese text mixes kana with kanji (which live in the HAN
  // block), so the presence of any kana is a decisive signal for Japanese.
  { ws: "HIRAGANA_KANJI", re: /[\u3040-\u30FF]/ },
  { ws: "HANGUL", re: /[\uAC00-\uD7AF\u1100-\u11FF]/ },
  { ws: "HAN", re: /[\u4E00-\u9FFF\u3400-\u4DBF]/ },
  { ws: "CYRILLIC", re: /[\u0400-\u04FF]/ },
  { ws: "GREEK", re: /[\u0370-\u03FF]/ },
  { ws: "HEBREW", re: /[\u0590-\u05FF]/ },
  { ws: "ARABIC", re: /[\u0600-\u06FF\u0750-\u077F]/ },
  { ws: "DEVANAGARI", re: /[\u0900-\u097F]/ },
  { ws: "BENGALI", re: /[\u0980-\u09FF]/ },
  { ws: "GURMUKHI", re: /[\u0A00-\u0A7F]/ },
  { ws: "GUJARATI", re: /[\u0A80-\u0AFF]/ },
  { ws: "ODIA", re: /[\u0B00-\u0B7F]/ },
  { ws: "TAMIL", re: /[\u0B80-\u0BFF]/ },
  { ws: "TELUGU", re: /[\u0C00-\u0C7F]/ },
  { ws: "KANNADA", re: /[\u0C80-\u0CFF]/ },
  { ws: "MALAYALAM", re: /[\u0D00-\u0D7F]/ },
  { ws: "SINHALA", re: /[\u0D80-\u0DFF]/ },
  { ws: "THAI", re: /[\u0E00-\u0E7F]/ },
  { ws: "LAO", re: /[\u0E80-\u0EFF]/ },
  { ws: "TIBETAN", re: /[\u0F00-\u0FFF]/ },
  { ws: "MYANMAR", re: /[\u1000-\u109F]/ },
  { ws: "GEORGIAN", re: /[\u10A0-\u10FF]/ },
  { ws: "ETHIOPIC", re: /[\u1200-\u137F]/ },
  { ws: "KHMER", re: /[\u1780-\u17FF]/ },
  { ws: "ARMENIAN", re: /[\u0530-\u058F]/ },
  { ws: "THAANA", re: /[\u0780-\u07BF]/ },
  { ws: "NKO", re: /[\u07C0-\u07FF]/ },
  { ws: "OL_CHIKI", re: /[\u1C50-\u1C7F]/ },
  { ws: "TIFINAGH", re: /[\u2D30-\u2D7F]/ },
  { ws: "SYLLABICS", re: /[\u1400-\u167F]/ },
  { ws: "MEITEI", re: /[\uABC0-\uABFF]/ },
];

export function guessWritingSystem(text: string): string | null {
  for (const { ws, re } of SCRIPT_RANGES) {
    if (re.test(text)) return ws;
  }
  // Latin fallback only when the text has letters at all.
  if (/[A-Za-zÀ-ÿ]/.test(text)) return "LATIN";
  return null;
}

/**
 * Languages that uniquely (or near-uniquely) own a script — a strong offline
 * signal we can act on without the model.
 */
const UNIQUE_SCRIPT_LANG: Record<string, string> = {
  HIRAGANA_KANJI: "ja",
  HANGUL: "ko",
  GREEK: "el",
  HEBREW: "he",
  THAI: "th",
  LAO: "lo",
  KHMER: "km",
  MYANMAR: "my",
  GEORGIAN: "ka",
  ARMENIAN: "hy",
  SINHALA: "si",
  TAMIL: "ta",
  TELUGU: "te",
  KANNADA: "kn",
  MALAYALAM: "ml",
  GUJARATI: "gu",
  ODIA: "or",
  BENGALI: "bn",
  GURMUKHI: "pa",
  THAANA: "dv",
  TIBETAN: "bo",
  ETHIOPIC: "am",
};

function toDetected(lang: LlLanguage | null, confidence: number, source: LlDetectedLanguage["source"], alternatives: LlDetectedLanguage["alternatives"] = []): LlDetectedLanguage {
  return {
    code: lang?.code ?? null,
    name: lang?.name ?? null,
    confidence: Math.max(0, Math.min(1, confidence)),
    reliable: Boolean(lang) && confidence >= 0.5,
    alternatives,
    source,
  };
}

/* ─────────────────────────────── AI plumbing ─────────────────────────────── */

function extractJson(raw: string): any | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function aiComplete(system: string, user: string, opts: { org?: string; userId?: string; feature: string }): Promise<{ content: string; source: "REAL" | "DEMO"; model: string }> {
  const res = await aiRegistry.complete(
    {
      model: "default",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      maxTokens: 2000,
      responseFormat: { type: "json_object" },
    },
    { organizationId: opts.org, userId: opts.userId, feature: opts.feature, channel: "api" },
  );
  return {
    content: res.content ?? "",
    source: res.modelSource === "real" ? "REAL" : "DEMO",
    model: res.model,
  };
}

/* ────────────────────────────── Detection API ────────────────────────────── */

export async function detectLanguage(
  text: string,
  opts: { org?: string; userId?: string } = {},
): Promise<LlDetectedLanguage> {
  const trimmed = text.trim();
  if (!trimmed) deny("EMPTY_TEXT", "Provide text to detect the language of.");

  const ws = guessWritingSystem(trimmed);

  // 1) Strong offline signal: a script only one language uses.
  if (ws && UNIQUE_SCRIPT_LANG[ws]) {
    const lang = getLanguage(UNIQUE_SCRIPT_LANG[ws]!);
    if (lang) {
      // Short text in a unique script is still reliable; long text more so.
      const confidence = trimmed.length >= 4 ? 0.97 : 0.85;
      return toDetected(lang, confidence, "HEURISTIC");
    }
  }

  // 2) Ask the model. It sees the whole catalog is available and must answer
  //    with a catalog code (or null). We validate its answer against the
  //    registry so a hallucinated code cannot leak through.
  const catalogHint = ws ? `The text appears to be written in the ${ws} script.` : "";
  const system =
    "You are a precise language identification engine. Identify the language of the user's text. " +
    "Respond ONLY as compact JSON: {\"code\": <BCP-47 or ISO code or null>, \"confidence\": <0..1>, " +
    "\"alternatives\": [{\"code\": <code>, \"confidence\": <0..1>}]}. " +
    "Prefer a specific regional/script variant when the text makes it clear (e.g. pt-BR vs pt-PT, zh-Hans vs zh-Hant). " +
    "If you cannot tell, use null with low confidence. Do not translate or add commentary.";
  const user = `${catalogHint}\nText:\n"""${trimmed.slice(0, 4000)}"""`;

  try {
    const { content, source } = await aiComplete(system, user, { org: opts.org, userId: opts.userId, feature: "language-detection" });
    const parsed = extractJson(content);
    if (parsed && (parsed.code === null || typeof parsed.code === "string")) {
      const lang = parsed.code ? getLanguage(String(parsed.code)) : null;
      const alts: LlDetectedLanguage["alternatives"] = Array.isArray(parsed.alternatives)
        ? parsed.alternatives
            .map((a: any) => {
              const alt = a?.code ? getLanguage(String(a.code)) : null;
              return alt ? { code: alt.code, name: alt.name, confidence: Number(a.confidence) || 0 } : null;
            })
            .filter((x: unknown): x is { code: string; name: string; confidence: number } => Boolean(x))
            .slice(0, 4)
        : [];
      const confidence = typeof parsed.confidence === "number" ? parsed.confidence : lang ? 0.7 : 0.2;
      return toDetected(lang, lang ? confidence : Math.min(confidence, 0.3), source === "REAL" ? "REAL" : "DEMO", alts);
    }
  } catch (e: any) {
    logger.warn("[ll-translate] AI detection failed; falling back to script heuristic", { err: e?.message });
  }

  // 3) Heuristic fallback: report the script guess (best-effort, low confidence).
  if (ws && ws !== "LATIN") {
    const first = listLanguages().find((l) => l.writingSystem === ws);
    if (first) return toDetected(first, 0.45, "HEURISTIC");
  }
  return toDetected(null, 0, "HEURISTIC");
}

/* ───────────────────────────── Translation API ───────────────────────────── */

function formalityInstruction(f: LlTranslationFormality): string {
  switch (f) {
    case "FORMAL":
      return "Use a formal register (polite/respectful forms, e.g. usted/vous/Sie, formal verb endings).";
    case "INFORMAL":
      return "Use an informal, casual register (familiar forms, e.g. tú/tu/du) as a fluent native peer would.";
    default:
      return "Match the register and tone of the source text (formal stays formal, casual stays casual).";
  }
}

export async function translate(
  input: LlTranslateInput,
  opts: { org?: string; userId?: string } = {},
): Promise<LlTranslation> {
  const text = input.text.trim();
  if (!text) deny("EMPTY_TEXT", "Provide text to translate.");

  // Target must be a real, active, translation-enabled catalog language.
  const target = requireLanguage(input.targetLanguage);
  if (!target.translationSupported) {
    deny(
      "TRANSLATION_UNAVAILABLE",
      `Translation into ${target.name} is temporarily unavailable.`,
      409,
    );
  }

  // Resolve / detect the source.
  let detected: LlDetectedLanguage;
  if (!input.sourceLanguage || input.sourceLanguage === AUTO_DETECT_CODE) {
    detected = await detectLanguage(text, opts);
  } else {
    const src = requireLanguage(input.sourceLanguage);
    detected = toDetected(src, 1, "HEURISTIC");
  }

  // Same-language no-op guard: if source and target resolve to the same catalog
  // entry, return the text unchanged rather than round-tripping the model.
  if (detected.code && detected.code === target.code) {
    return {
      sourceText: text,
      translatedText: text,
      sourceLanguage: detected,
      targetLanguage: { code: target.code, name: target.name, bcp47: target.bcp47 },
      formality: input.formality,
      alternatives: [],
      note: "Source and target languages are the same; text returned unchanged.",
      source: detected.source === "REAL" ? "REAL" : "DEMO",
      model: "n/a",
      createdAt: new Date().toISOString(),
    };
  }

  const sourceLabel = detected.code
    ? `${detected.name} (${detected.code})`
    : "an automatically detected language";

  const system = [
    "You are an expert human translator and localiser producing natural, publication-quality translations",
    "on par with the best professional services. You never do word-for-word substitution.",
    "You faithfully preserve meaning and intent while rendering the result as a fluent native speaker of the",
    "target language would naturally write it — handling grammar, tense, idioms, slang, cultural expressions,",
    "proper nouns/names (transliterate only when idiomatic), punctuation, tone and writing style.",
    `Translate INTO ${target.name} using the ${target.bcp47} locale/variant specifically`,
    target.variantLabel ? `(script/regional variant: ${target.variantLabel}).` : ".",
    target.textDirection === "RTL" ? "The target language is written right-to-left; output natural RTL text." : "",
    formalityInstruction(input.formality),
    input.preserveFormatting
      ? "Preserve the original formatting: line breaks, lists, spacing and any markup."
      : "You may normalise formatting for readability.",
    "Respond ONLY as compact JSON with this exact shape:",
    '{"translation": <string>, "alternatives": [<string>, ...], "note": <string or null>}.',
    input.includeAlternatives
      ? "Include 1-2 alternative renderings in \"alternatives\" when a meaningfully different natural phrasing exists."
      : "Leave \"alternatives\" as an empty array.",
    "Use \"note\" only for a brief, useful remark (e.g. an idiom you adapted); otherwise null.",
  ]
    .filter(Boolean)
    .join(" ");

  const user = `Source language: ${sourceLabel}.\nText to translate:\n"""${text}"""`;

  let content = "";
  let source: "REAL" | "DEMO" = "DEMO";
  let model = "unknown";
  try {
    const res = await aiComplete(system, user, { org: opts.org, userId: opts.userId, feature: "translation" });
    content = res.content;
    source = res.source;
    model = res.model;
  } catch (e: any) {
    // Never silently return the input. Surface a clear, typed error.
    const code = e?.code === "AI_PROVIDER_CONFIGURATION_REQUIRED" ? "TRANSLATION_PROVIDER_UNAVAILABLE" : "TRANSLATION_FAILED";
    logger.warn("[ll-translate] translation provider failed", { err: e?.message, code });
    deny(
      code,
      code === "TRANSLATION_PROVIDER_UNAVAILABLE"
        ? `Translation is temporarily unavailable: no AI translation provider is configured. Set an AI provider key to enable ${target.name} translation.`
        : `Translation into ${target.name} failed and was not returned to avoid an incorrect result. Please try again.`,
      503,
    );
  }

  const parsed = extractJson(content);
  const translated = parsed && typeof parsed.translation === "string" ? parsed.translation.trim() : "";
  if (!translated) {
    deny(
      "TRANSLATION_FAILED",
      `Translation into ${target.name} could not be produced reliably and was not returned. Please try again.`,
      502,
    );
  }

  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives.filter((a: unknown): a is string => typeof a === "string" && a.trim().length > 0).slice(0, 3)
    : [];
  const note = typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim() : null;

  return {
    sourceText: text,
    translatedText: translated,
    sourceLanguage: detected,
    targetLanguage: { code: target.code, name: target.name, bcp47: target.bcp47 },
    formality: input.formality,
    alternatives,
    note,
    source,
    model,
    createdAt: new Date().toISOString(),
  };
}
