/**
 * Central language registry. New languages are added here — never scattered
 * as string literals across routes or UI.
 */

import type { LlFeature, LlLanguage, LlWritingSystem, LlTextDirection } from "@windels/shared/languageLearning";

const CORE_FEATURES: LlFeature[] = [
  "LESSONS",
  "ASSESSMENT",
  "CONVERSATION",
  "VOCABULARY",
  "GRAMMAR",
  "WRITING",
  "LISTENING_TEXT",
  "SPEAKING_TRANSCRIPT",
  "DAILY_PLAN",
  "WEAKNESS_DETECTION",
];

const AUDIO_FEATURES: LlFeature[] = ["LISTENING_AUDIO", "SPEAKING_PRONUNCIATION"];

function lang(partial: {
  code: string;
  name: string;
  nativeName: string;
  iso6391: string;
  writingSystem: LlWritingSystem;
  textDirection?: LlTextDirection;
  family: string;
  scriptNotes?: string;
  extraFeatures?: LlFeature[];
}): LlLanguage {
  return {
    code: partial.code,
    name: partial.name,
    nativeName: partial.nativeName,
    iso6391: partial.iso6391,
    writingSystem: partial.writingSystem,
    textDirection: partial.textDirection ?? "LTR",
    family: partial.family,
    supportedFeatures: [...CORE_FEATURES, ...(partial.extraFeatures ?? [])],
    active: true,
    scriptNotes: partial.scriptNotes ?? null,
  };
}

const CATALOG: LlLanguage[] = [
  lang({ code: "nl", name: "Dutch", nativeName: "Nederlands", iso6391: "nl", writingSystem: "LATIN", family: "Germanic" }),
  lang({ code: "es", name: "Spanish", nativeName: "Español", iso6391: "es", writingSystem: "LATIN", family: "Romance" }),
  lang({ code: "it", name: "Italian", nativeName: "Italiano", iso6391: "it", writingSystem: "LATIN", family: "Romance" }),
  lang({ code: "fr", name: "French", nativeName: "Français", iso6391: "fr", writingSystem: "LATIN", family: "Romance" }),
  lang({ code: "de", name: "German", nativeName: "Deutsch", iso6391: "de", writingSystem: "LATIN", family: "Germanic" }),
  lang({ code: "en", name: "English", nativeName: "English", iso6391: "en", writingSystem: "LATIN", family: "Germanic" }),
  lang({ code: "pt", name: "Portuguese", nativeName: "Português", iso6391: "pt", writingSystem: "LATIN", family: "Romance" }),
  lang({
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    iso6391: "ar",
    writingSystem: "ARABIC",
    textDirection: "RTL",
    family: "Semitic",
    scriptNotes: "Modern Standard Arabic for reading; dialect notes appear in conversation practice.",
  }),
  lang({ code: "zh", name: "Chinese", nativeName: "中文", iso6391: "zh", writingSystem: "HAN", family: "Sinitic", scriptNotes: "Simplified characters." }),
  lang({ code: "ja", name: "Japanese", nativeName: "日本語", iso6391: "ja", writingSystem: "HIRAGANA_KANJI", family: "Japonic" }),
  lang({ code: "ko", name: "Korean", nativeName: "한국어", iso6391: "ko", writingSystem: "HANGUL", family: "Koreanic" }),
  lang({ code: "ru", name: "Russian", nativeName: "Русский", iso6391: "ru", writingSystem: "CYRILLIC", family: "Slavic" }),
  lang({ code: "hi", name: "Hindi", nativeName: "हिन्दी", iso6391: "hi", writingSystem: "DEVANAGARI", family: "Indo-Aryan" }),
  lang({ code: "tr", name: "Turkish", nativeName: "Türkçe", iso6391: "tr", writingSystem: "LATIN", family: "Turkic" }),
  lang({ code: "sw", name: "Swahili", nativeName: "Kiswahili", iso6391: "sw", writingSystem: "LATIN", family: "Bantu" }),
  lang({ code: "yo", name: "Yoruba", nativeName: "Yorùbá", iso6391: "yo", writingSystem: "LATIN", family: "Volta-Niger" }),
  lang({ code: "ig", name: "Igbo", nativeName: "Igbo", iso6391: "ig", writingSystem: "LATIN", family: "Volta-Niger" }),
  lang({ code: "ha", name: "Hausa", nativeName: "Hausa", iso6391: "ha", writingSystem: "LATIN", family: "Chadic" }),
  lang({ code: "af", name: "Afrikaans", nativeName: "Afrikaans", iso6391: "af", writingSystem: "LATIN", family: "Germanic" }),
  lang({ code: "zu", name: "Zulu", nativeName: "isiZulu", iso6391: "zu", writingSystem: "LATIN", family: "Bantu" }),
  lang({ code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", iso6391: "id", writingSystem: "LATIN", family: "Austronesian" }),
  lang({ code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", iso6391: "vi", writingSystem: "LATIN", family: "Austroasiatic" }),
  lang({ code: "pl", name: "Polish", nativeName: "Polski", iso6391: "pl", writingSystem: "LATIN", family: "Slavic" }),
  lang({ code: "sv", name: "Swedish", nativeName: "Svenska", iso6391: "sv", writingSystem: "LATIN", family: "Germanic" }),
  lang({ code: "el", name: "Greek", nativeName: "Ελληνικά", iso6391: "el", writingSystem: "GREEK", family: "Hellenic" }),
  lang({
    code: "he",
    name: "Hebrew",
    nativeName: "עברית",
    iso6391: "he",
    writingSystem: "HEBREW",
    textDirection: "RTL",
    family: "Semitic",
  }),
  lang({ code: "th", name: "Thai", nativeName: "ไทย", iso6391: "th", writingSystem: "THAI", family: "Tai" }),
  lang({ code: "uk", name: "Ukrainian", nativeName: "Українська", iso6391: "uk", writingSystem: "CYRILLIC", family: "Slavic" }),
  lang({ code: "fil", name: "Filipino", nativeName: "Filipino", iso6391: "tl", writingSystem: "LATIN", family: "Austronesian" }),
];

const extras = new Map<string, LlLanguage>();

export function listLanguages(opts?: { includeInactive?: boolean }): LlLanguage[] {
  const all = [...CATALOG, ...extras.values()];
  return opts?.includeInactive ? all : all.filter((l) => l.active);
}

export function getLanguage(code: string): LlLanguage | null {
  const key = code.trim().toLowerCase();
  return listLanguages({ includeInactive: true }).find((l) => l.code === key || l.iso6391 === key) ?? null;
}

export function requireLanguage(code: string): LlLanguage {
  const found = getLanguage(code);
  if (!found) {
    const err: any = new Error(`Language '${code}' is not in the WINDELS language registry`);
    err.code = "LANGUAGE_NOT_SUPPORTED";
    err.status = 400;
    throw err;
  }
  if (!found.active) {
    const err: any = new Error(`Language '${code}' is registered but inactive`);
    err.code = "LANGUAGE_INACTIVE";
    err.status = 400;
    throw err;
  }
  return found;
}

export function registerLanguage(input: LlLanguage): LlLanguage {
  if (!input.code || !input.name || !input.iso6391) {
    const err: any = new Error("Language registry entries require code, name and iso6391");
    err.code = "INVALID_LANGUAGE";
    err.status = 400;
    throw err;
  }
  const existing = getLanguage(input.code);
  if (existing && CATALOG.some((l) => l.code === existing.code)) {
    const err: any = new Error(`Built-in language '${input.code}' cannot be overwritten`);
    err.code = "LANGUAGE_LOCKED";
    err.status = 409;
    throw err;
  }
  extras.set(input.code.toLowerCase(), { ...input, code: input.code.toLowerCase() });
  return extras.get(input.code.toLowerCase())!;
}

export function languageSupports(code: string, feature: LlFeature): boolean {
  const found = getLanguage(code);
  return Boolean(found?.supportedFeatures.includes(feature));
}

export function markAudioFeatures(code: string, enabled: boolean): void {
  const found = getLanguage(code);
  if (!found) return;
  const next = new Set(found.supportedFeatures);
  for (const f of AUDIO_FEATURES) {
    if (enabled) next.add(f);
    else next.delete(f);
  }
  found.supportedFeatures = [...next];
}

export const REQUIRED_CATALOG_CODES = [
  "nl", "es", "it", "fr", "de", "en", "pt", "ar", "zh", "ja",
  "ko", "ru", "hi", "tr", "sw", "yo", "ig", "ha", "af", "zu",
] as const;
