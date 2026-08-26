/**
 * Central language registry — the single source of truth for the WINDELS
 * language library.
 *
 * Session 199 — the catalog now covers the full ~250-language library. Entries
 * are declared once in `catalog.data.ts` (generated) and turned into
 * `LlLanguage` records here. New languages are added by editing the generator
 * data, never by scattering string literals across routes or UI. Every entry
 * supports TRANSLATION + LANGUAGE_DETECTION (AI-fabric powered); the full
 * learning curriculum (LESSONS/VOCABULARY/GRAMMAR/…) is enabled only where a
 * curriculum pack is authored (`learningSupported`).
 */

import type { LlFeature, LlLanguage } from "@windels/shared/languageLearning";
import { CATALOG_ROWS, type CatalogRow } from "./catalog.data.js";

const LEARNING_FEATURES: LlFeature[] = [
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

// Available for every catalog entry.
const UNIVERSAL_FEATURES: LlFeature[] = ["TRANSLATION", "LANGUAGE_DETECTION"];

const AUDIO_FEATURES: LlFeature[] = ["LISTENING_AUDIO", "SPEAKING_PRONUNCIATION"];

/**
 * Catalog code → curriculum pack code. Only differs where a script/regional
 * variant carries the authored pack: the Brazilian Portuguese and Simplified
 * Chinese entries reuse the base `pt` / `zh` packs.
 */
const PACK_CODE_OVERRIDES: Record<string, string> = {
  "pt-BR": "pt",
  "zh-Hans": "zh",
};

export function curriculumPackCode(code: string): string {
  return PACK_CODE_OVERRIDES[code] ?? code;
}

function toLanguage(row: CatalogRow): LlLanguage {
  const supportedFeatures = row.learningSupported
    ? [...LEARNING_FEATURES, ...UNIVERSAL_FEATURES]
    : [...UNIVERSAL_FEATURES];
  return {
    code: row.code,
    name: row.name,
    nativeName: row.nativeName,
    iso6391: row.iso6391,
    bcp47: row.bcp47,
    writingSystem: row.writingSystem,
    textDirection: row.textDirection,
    family: row.family,
    supportedFeatures,
    active: true,
    scriptNotes: row.region || row.variantLabel
      ? `Regional/script variant preserved end-to-end (${row.variantLabel ?? row.region}). Translation targets the ${row.bcp47} locale.`
      : null,
    translationSupported: true,
    learningSupported: row.learningSupported,
    region: row.region,
    variantLabel: row.variantLabel,
    aliases: row.aliases,
  };
}

const CATALOG: LlLanguage[] = CATALOG_ROWS.map(toLanguage);
const CATALOG_CODES = new Set(CATALOG.map((l) => l.code));

const extras = new Map<string, LlLanguage>();

export function listLanguages(opts?: { includeInactive?: boolean }): LlLanguage[] {
  const all = [...CATALOG, ...extras.values()];
  return opts?.includeInactive ? all : all.filter((l) => l.active);
}

/**
 * Resolve a language by catalog code, BCP-47 tag, ISO 639 code, or a known
 * alias (all case-insensitive). Exact code/bcp47 wins; ISO/alias fall back to a
 * deterministic "primary" entry (a learning-enabled or non-variant form) so
 * base lookups such as `getLanguage("pt")` stay stable.
 */
export function getLanguage(code: string): LlLanguage | null {
  if (!code) return null;
  const key = code.trim().toLowerCase();
  const all = listLanguages({ includeInactive: true });

  const byCode = all.find((l) => l.code.toLowerCase() === key);
  if (byCode) return byCode;

  const byBcp47 = all.find((l) => l.bcp47.toLowerCase() === key);
  if (byBcp47) return byBcp47;

  const byAlias = all.find((l) => l.aliases.some((a) => a.toLowerCase() === key));
  if (byAlias) return byAlias;

  const byIso = all.filter((l) => l.iso6391.toLowerCase() === key);
  if (byIso.length) {
    return (
      byIso.find((l) => l.learningSupported) ??
      byIso.find((l) => !l.region && !l.variantLabel) ??
      byIso[0]
    );
  }
  return null;
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
  if (CATALOG_CODES.has(input.code)) {
    const err: any = new Error(`Built-in language '${input.code}' cannot be overwritten`);
    err.code = "LANGUAGE_LOCKED";
    err.status = 409;
    throw err;
  }
  const normalized: LlLanguage = {
    ...input,
    code: input.code,
    bcp47: input.bcp47 || input.code,
    translationSupported: input.translationSupported ?? true,
    learningSupported: input.learningSupported ?? false,
    region: input.region ?? null,
    variantLabel: input.variantLabel ?? null,
    aliases: input.aliases ?? [],
    supportedFeatures:
      input.supportedFeatures && input.supportedFeatures.length
        ? Array.from(new Set([...input.supportedFeatures, ...UNIVERSAL_FEATURES]))
        : [...UNIVERSAL_FEATURES],
  };
  extras.set(input.code.toLowerCase(), normalized);
  return normalized;
}

export function setLanguageActive(code: string, active: boolean): LlLanguage {
  const found = requireLanguage.length ? getLanguage(code) : null;
  if (!found) {
    const err: any = new Error(`Language '${code}' is not in the WINDELS language registry`);
    err.code = "LANGUAGE_NOT_SUPPORTED";
    err.status = 400;
    throw err;
  }
  found.active = active;
  return found;
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

/**
 * Catalog codes that must always be present with a full learning curriculum.
 * These are the authored-pack languages (base packs `pt`/`zh` surface through
 * the Brazilian-Portuguese and Simplified-Chinese catalog entries).
 */
export const REQUIRED_CATALOG_CODES = [
  "nl", "es", "it", "fr", "de", "en", "pt-BR", "ar", "zh-Hans", "ja",
  "ko", "ru", "hi", "tr", "sw", "yo", "ig", "ha", "af", "zu",
] as const;
