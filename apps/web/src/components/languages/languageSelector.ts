/**
 * WINDELS AI — pure logic for the language selector (Session 201).
 *
 * Framework-free helpers extracted from LanguagePicker.tsx so the search /
 * recents / favorites / row-layout logic can be unit-tested without a DOM.
 * The React component imports these; it owns only state + rendering.
 */
import type { LlLanguage } from "@/lib/languageLearning";

export const DETECT_CODE = "auto";
export const RECENTS_KEY = "wnd.lang.recents";
export const FAVS_KEY = "wnd.lang.favorites";
export const MAX_RECENTS = 6;

/** Substring match over name / native name / code / bcp47 / family / aliases. */
export function matchesLanguage(lang: LlLanguage, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (lang.name.toLowerCase().includes(needle)) return true;
  if (lang.nativeName.toLowerCase().includes(needle)) return true;
  if (lang.code.toLowerCase().includes(needle)) return true;
  if (lang.bcp47.toLowerCase().includes(needle)) return true;
  if (lang.family.toLowerCase().includes(needle)) return true;
  return lang.aliases.some((a) => a.toLowerCase().includes(needle));
}

/** The synthetic "Detect language" pseudo-entry used for search matching. */
export const DETECT_PSEUDO_LANG: LlLanguage = {
  name: "Detect language", nativeName: "auto", code: DETECT_CODE, bcp47: "auto",
  family: "", aliases: ["detect", "auto"],
} as LlLanguage;

/**
 * Prepend `code` to the recents list, de-duplicating and capping at MAX_RECENTS.
 * Pure — returns the next list; `auto`/empty are never recorded.
 */
export function buildRecents(existing: string[], code: string): string[] {
  if (!code || code === DETECT_CODE) return existing.slice(0, MAX_RECENTS);
  return [code, ...existing.filter((c) => c !== code)].slice(0, MAX_RECENTS);
}

/** Toggle `code` in the favorites list (add if absent, remove if present). */
export function toggleFavorite(existing: string[], code: string): string[] {
  return existing.includes(code) ? existing.filter((c) => c !== code) : [...existing, code];
}

export type PickerRow =
  | { kind: "detect" }
  | { kind: "header"; label: string }
  | { kind: "lang"; lang: LlLanguage };

/**
 * Build the flat, ordered row list the dropdown renders and navigates.
 * With no query: Detect (optional), then Favorites, Recently used, All
 * languages sections. With a query: only matching languages (+ Detect if it
 * matches). Favorites are excluded from the recents section to avoid dupes.
 */
export function buildPickerRows(opts: {
  languages: LlLanguage[];
  query: string;
  favorites: string[];
  recents: string[];
  allowDetect: boolean;
}): PickerRow[] {
  const { languages, favorites, recents, allowDetect } = opts;
  const q = opts.query.trim();
  const out: PickerRow[] = [];
  const byCode = new Map(languages.map((l) => [l.code, l]));

  if (allowDetect && (!q || matchesLanguage(DETECT_PSEUDO_LANG, q))) {
    out.push({ kind: "detect" });
  }

  const filtered = languages.filter((l) => matchesLanguage(l, q));

  if (!q) {
    const favLangs = favorites.map((c) => byCode.get(c)).filter((l): l is LlLanguage => Boolean(l));
    const recentLangs = recents
      .map((c) => byCode.get(c))
      .filter((l): l is LlLanguage => Boolean(l) && !favorites.includes(l!.code));
    if (favLangs.length) {
      out.push({ kind: "header", label: "Favorites" });
      for (const l of favLangs) out.push({ kind: "lang", lang: l });
    }
    if (recentLangs.length) {
      out.push({ kind: "header", label: "Recently used" });
      for (const l of recentLangs) out.push({ kind: "lang", lang: l });
    }
    out.push({ kind: "header", label: "All languages" });
    for (const l of filtered) out.push({ kind: "lang", lang: l });
  } else {
    for (const l of filtered) out.push({ kind: "lang", lang: l });
  }
  return out;
}

/** Indices of selectable rows (detect + lang), used for keyboard navigation. */
export function selectableIndices(rows: PickerRow[]): number[] {
  return rows
    .map((r, i) => (r.kind === "lang" || r.kind === "detect" ? i : -1))
    .filter((i) => i >= 0);
}
