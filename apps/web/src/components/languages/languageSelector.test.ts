/**
 * Session 201 — language selector logic tests (first web component-logic suite).
 *
 * Exercises the pure search / recents / favorites / row-layout helpers that
 * power the LanguagePicker, so its behavior with hundreds of languages is
 * verified without a DOM.
 */
import { describe, it, expect } from "vitest";
import type { LlLanguage } from "@/lib/languageLearning";
import {
  DETECT_CODE, MAX_RECENTS,
  matchesLanguage, buildRecents, toggleFavorite, buildPickerRows, selectableIndices,
  type PickerRow,
} from "./languageSelector";

function lang(over: Partial<LlLanguage> = {}): LlLanguage {
  return {
    code: "en", name: "English", nativeName: "English", iso6391: "en", bcp47: "en",
    writingSystem: "LATIN", textDirection: "LTR", family: "Germanic",
    supportedFeatures: [], active: true, scriptNotes: null,
    translationSupported: true, learningSupported: true, region: null, variantLabel: null,
    aliases: [],
    ...over,
  } as LlLanguage;
}

const EN = lang({ code: "en", name: "English", nativeName: "English", aliases: [] });
const ES = lang({ code: "es", name: "Spanish", nativeName: "Español", aliases: ["castellano", "espanol"] });
const ZH = lang({ code: "zh-Hant", name: "Chinese (Traditional)", nativeName: "繁體中文", bcp47: "zh-Hant", family: "Sinitic", aliases: ["mandarin"] });
const AR = lang({ code: "ar", name: "Arabic", nativeName: "العربية", bcp47: "ar", textDirection: "RTL", family: "Semitic" });
const CATALOG: LlLanguage[] = [EN, ES, ZH, AR];

const langNames = (rows: PickerRow[]) => rows.filter((r): r is Extract<PickerRow, { kind: "lang" }> => r.kind === "lang").map((r) => r.lang.name);
const headers = (rows: PickerRow[]) => rows.filter((r): r is Extract<PickerRow, { kind: "header" }> => r.kind === "header").map((r) => r.label);

describe("matchesLanguage", () => {
  it("matches on English name, native name, code, bcp47, family and aliases", () => {
    expect(matchesLanguage(ES, "spanish")).toBe(true);
    expect(matchesLanguage(ES, "Español")).toBe(true);
    expect(matchesLanguage(ES, "es")).toBe(true);
    expect(matchesLanguage(ES, "castellano")).toBe(true); // alias
    expect(matchesLanguage(ZH, "zh-Hant")).toBe(true);   // bcp47
    expect(matchesLanguage(ZH, "sinitic")).toBe(true);   // family
    expect(matchesLanguage(ZH, "繁體")).toBe(true);       // native script
  });
  it("is case-insensitive and treats blank as match-all", () => {
    expect(matchesLanguage(EN, "ENGLISH")).toBe(true);
    expect(matchesLanguage(EN, "   ")).toBe(true);
    expect(matchesLanguage(EN, "")).toBe(true);
  });
  it("rejects a non-match", () => {
    expect(matchesLanguage(EN, "swahili")).toBe(false);
  });
});

describe("buildRecents", () => {
  it("prepends, de-duplicates and caps at MAX_RECENTS", () => {
    let r: string[] = [];
    r = buildRecents(r, "es");
    r = buildRecents(r, "fr");
    r = buildRecents(r, "es"); // move es to front, no dupe
    expect(r).toEqual(["es", "fr"]);
    for (const c of ["a", "b", "c", "d", "e", "f", "g"]) r = buildRecents(r, c);
    expect(r.length).toBe(MAX_RECENTS);
    expect(r[0]).toBe("g"); // newest first
  });
  it("never records the detect pseudo-code or an empty code", () => {
    expect(buildRecents(["es"], DETECT_CODE)).toEqual(["es"]);
    expect(buildRecents(["es"], "")).toEqual(["es"]);
  });
});

describe("toggleFavorite", () => {
  it("adds when absent and removes when present", () => {
    expect(toggleFavorite([], "es")).toEqual(["es"]);
    expect(toggleFavorite(["es", "fr"], "es")).toEqual(["fr"]);
  });
});

describe("buildPickerRows", () => {
  it("with no query, emits detect + Favorites + Recently used + All languages sections", () => {
    const rows = buildPickerRows({ languages: CATALOG, query: "", favorites: ["ar"], recents: ["es"], allowDetect: true });
    expect(rows[0]).toEqual({ kind: "detect" });
    expect(headers(rows)).toEqual(["Favorites", "Recently used", "All languages"]);
    // Arabic appears under Favorites; Spanish under Recently used; all four under All languages.
    expect(langNames(rows).filter((n) => n === "Arabic").length).toBeGreaterThanOrEqual(2);
  });

  it("excludes a favorite from the recently-used section (no dupe within recents)", () => {
    const rows = buildPickerRows({ languages: CATALOG, query: "", favorites: ["es"], recents: ["es", "ar"], allowDetect: false });
    // find the Recently used slice
    const recentsHeaderIdx = rows.findIndex((r) => r.kind === "header" && r.label === "Recently used");
    const allHeaderIdx = rows.findIndex((r) => r.kind === "header" && r.label === "All languages");
    const recentSlice = rows.slice(recentsHeaderIdx + 1, allHeaderIdx).filter((r) => r.kind === "lang") as Array<Extract<PickerRow, { kind: "lang" }>>;
    expect(recentSlice.map((r) => r.lang.code)).toEqual(["ar"]); // es is a favorite, filtered out
  });

  it("with a query, returns only matching languages and no section headers", () => {
    const rows = buildPickerRows({ languages: CATALOG, query: "chinese", favorites: [], recents: [], allowDetect: true });
    expect(headers(rows)).toEqual([]);
    expect(langNames(rows)).toEqual(["Chinese (Traditional)"]);
    expect(rows.some((r) => r.kind === "detect")).toBe(false); // "chinese" doesn't match detect
  });

  it("keeps the Detect row when the query matches 'detect'/'auto'", () => {
    const rows = buildPickerRows({ languages: CATALOG, query: "detect", favorites: [], recents: [], allowDetect: true });
    expect(rows[0]).toEqual({ kind: "detect" });
  });

  it("omits Detect entirely when allowDetect is false", () => {
    const rows = buildPickerRows({ languages: CATALOG, query: "", favorites: [], recents: [], allowDetect: false });
    expect(rows.some((r) => r.kind === "detect")).toBe(false);
  });

  it("ignores unknown favorite/recent codes", () => {
    const rows = buildPickerRows({ languages: CATALOG, query: "", favorites: ["ghost"], recents: ["missing"], allowDetect: false });
    expect(headers(rows)).toEqual(["All languages"]); // no Favorites/Recently used sections
  });
});

describe("selectableIndices", () => {
  it("returns indices of detect + lang rows, skipping headers", () => {
    const rows = buildPickerRows({ languages: CATALOG, query: "", favorites: [], recents: [], allowDetect: true });
    const idxs = selectableIndices(rows);
    // every selectable index points at a detect or lang row
    for (const i of idxs) expect(["detect", "lang"]).toContain(rows[i]!.kind);
    // headers are not selectable
    const headerIdxs = rows.map((r, i) => (r.kind === "header" ? i : -1)).filter((i) => i >= 0);
    for (const h of headerIdxs) expect(idxs).not.toContain(h);
  });
});
