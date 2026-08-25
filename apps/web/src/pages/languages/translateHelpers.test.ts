/**
 * Session 201 — Translate workspace helper tests.
 *
 * Covers the pure document-validation and detected-label logic extracted from
 * TranslateView so its behavior is verified without a DOM.
 */
import { describe, it, expect } from "vitest";
import type { LlDetectedLanguage } from "@/lib/languageLearning";
import { isReadableTextDocument, detectedLabel, MAX_TRANSLATE_CHARS } from "./translateHelpers";

describe("isReadableTextDocument", () => {
  it("accepts text mime types", () => {
    expect(isReadableTextDocument({ type: "text/plain", name: "a.bin" })).toBe(true);
    expect(isReadableTextDocument({ type: "application/json", name: "x" })).toBe(true);
    expect(isReadableTextDocument({ type: "application/xml", name: "x" })).toBe(true);
    expect(isReadableTextDocument({ type: "application/csv", name: "x" })).toBe(true);
  });
  it("accepts known text extensions even with an empty/unknown mime", () => {
    for (const name of ["notes.txt", "readme.md", "data.csv", "conf.json", "feed.xml", "subs.srt", "caps.vtt", "run.log"]) {
      expect(isReadableTextDocument({ type: "", name }), name).toBe(true);
    }
    expect(isReadableTextDocument({ name: "NO_MIME.md" })).toBe(true); // undefined type
  });
  it("rejects binary documents", () => {
    expect(isReadableTextDocument({ type: "application/pdf", name: "doc.pdf" })).toBe(false);
    expect(isReadableTextDocument({ type: "image/png", name: "pic.png" })).toBe(false);
    expect(isReadableTextDocument({ type: "application/octet-stream", name: "blob" })).toBe(false);
  });
});

describe("detectedLabel", () => {
  const det = (over: Partial<LlDetectedLanguage>): LlDetectedLanguage => ({
    code: "es", name: "Spanish", confidence: 0.9, reliable: true, alternatives: [], source: "REAL", ...over,
  });

  it("formats name + rounded percent when a language is detected", () => {
    expect(detectedLabel(det({ confidence: 0.955 }), false)).toBe("Spanish (96%)");
  });
  it("omits the percent when confidence is 0", () => {
    expect(detectedLabel(det({ confidence: 0 }), false)).toBe("Spanish");
  });
  it("falls back to the code when name is missing", () => {
    expect(detectedLabel(det({ name: null, confidence: 0 }), false)).toBe("es");
  });
  it("shows 'detecting…' while a detection is in flight and nothing is resolved", () => {
    expect(detectedLabel(null, true)).toBe("detecting…");
  });
  it("returns null when idle with no detection", () => {
    expect(detectedLabel(null, false)).toBeNull();
    expect(detectedLabel(det({ code: null }), false)).toBeNull();
  });
});

describe("MAX_TRANSLATE_CHARS", () => {
  it("is a sane positive cap", () => {
    expect(MAX_TRANSLATE_CHARS).toBeGreaterThan(1000);
  });
});
