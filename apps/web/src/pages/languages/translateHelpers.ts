/**
 * WINDELS AI — pure helpers for the Translate workspace (Session 201).
 *
 * Framework-free logic extracted from TranslateView.tsx so the document-upload
 * validation and detected-language label formatting can be unit-tested without
 * a DOM. The component imports these.
 */
import type { LlDetectedLanguage } from "@/lib/languageLearning";

export const MAX_TRANSLATE_CHARS = 20000;

/** File types that can be read in the browser as text for translation. */
export function isReadableTextDocument(file: { type?: string; name: string }): boolean {
  const byMime = /text\/|application\/(json|xml|csv)/.test(file.type ?? "");
  const byExt = /\.(txt|md|csv|json|xml|srt|vtt|log)$/i.test(file.name);
  return byMime || byExt;
}

/**
 * Label shown next to the "Detect language" option:
 *  - null while nothing has been detected and we're not mid-detection
 *  - "detecting…" while a detection request is in flight
 *  - "<Name> (NN%)" once a language is detected (percent omitted when 0)
 */
export function detectedLabel(detected: LlDetectedLanguage | null, detecting: boolean): string | null {
  if (detected?.code) {
    const pct = detected.confidence ? ` (${Math.round(detected.confidence * 100)}%)` : "";
    return `${detected.name ?? detected.code}${pct}`;
  }
  return detecting ? "detecting…" : null;
}
