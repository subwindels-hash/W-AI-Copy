/**
 * Real content extraction for WhatsApp media — Phase 2 §4.
 *
 * WHY THIS FILE EXISTS AND DOES NOT CALL services/speechRecognition.service.ts,
 * services/ocrDocumentIntelligence.service.ts OR services/imageRecognition.service.ts:
 *
 *   Those three modules are simulators. `processTranscriptionJob()` builds its
 *   "transcript" from `generateSentences(wordCount)` driven by a seeded RNG and
 *   never opens the audio; the OCR and vision services are commented
 *   "Generate simulated results" and derive every field from `_rng.next()`.
 *   Feeding a fabricated transcript into the AI OS would make WINDELS answer a
 *   question the user never asked — strictly worse than admitting we cannot
 *   hear the message. See docs/WHATSAPP_PHASE2_AUDIT.md §4.
 *
 * So this module does real work only:
 *   documents → pdf-parse / mammoth / exceljs / native UTF-8
 *   audio     → the configured provider's real transcription endpoint
 *   images    → the real vision-capable model via aiRegistry
 *
 * When a capability is not configured we return an explicit
 * `*_CONFIGURATION_REQUIRED` failure. We never invent content.
 */
import { createHash } from "node:crypto";
import { logger } from "../../observability/logger.js";

/** Hard ceiling on bytes we will pull from Meta. Matches the attachment store. */
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

/** Extracted text is truncated before it ever reaches a prompt or the DB. */
export const MAX_EXTRACTED_CHARS = 12_000;

export type ExtractionOutcome =
  | {
      ok: true;
      /** Text suitable for injection into the AI OS prompt. */
      text: string;
      /** Structured, non-sensitive facts about the artefact. */
      analysis: Record<string, unknown>;
      /** Which real backend produced this. */
      via: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      /** True when an operator can fix this by setting configuration. */
      configurationRequired?: boolean;
    };

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function truncate(text: string): { text: string; truncated: boolean } {
  const clean = text.replace(/\u0000/g, "").trim();
  if (clean.length <= MAX_EXTRACTED_CHARS) return { text: clean, truncated: false };
  return { text: `${clean.slice(0, MAX_EXTRACTED_CHARS)}\n\n[truncated]`, truncated: true };
}

/** Normalises the many mime spellings WhatsApp forwards. */
export function classifyMime(mime: string | null | undefined, filename?: string | null): string {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  const ext = (filename ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) return "docx";
  if (
    m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    m === "application/vnd.ms-excel" || ext === "xlsx" || ext === "xls"
  ) return "xlsx";
  if (m === "text/csv" || ext === "csv") return "csv";
  if (m.startsWith("text/") || m === "application/json" || ["txt", "md", "json"].includes(ext)) return "text";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "unknown";
}

// ─── Documents ───────────────────────────────────────────────────────────────

async function extractPdf(buf: Buffer): Promise<ExtractionOutcome> {
  // pdf-parse v2 exposes a class; it is pure JS and needs no native binary.
  const mod: any = await import("pdf-parse");
  const PDFParse = mod.PDFParse ?? mod.default?.PDFParse;
  if (!PDFParse) {
    return { ok: false, code: "PDF_PARSER_UNAVAILABLE", message: "pdf-parse did not expose PDFParse" };
  }
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    const { text, truncated } = truncate(String(result?.text ?? ""));
    if (!text) {
      return {
        ok: false,
        code: "PDF_NO_TEXT_LAYER",
        message: "This PDF has no extractable text layer (it is probably a scan). OCR is not configured.",
      };
    }
    return {
      ok: true, text, via: "pdf-parse",
      analysis: { kind: "pdf", pages: result?.total ?? result?.pages?.length ?? null, truncated },
    };
  } finally {
    await parser.destroy?.().catch(() => { /* best effort */ });
  }
}

async function extractDocx(buf: Buffer): Promise<ExtractionOutcome> {
  const mod: any = await import("mammoth");
  const mammoth = mod.default ?? mod;
  const result = await mammoth.extractRawText({ buffer: buf });
  const { text, truncated } = truncate(String(result?.value ?? ""));
  if (!text) return { ok: false, code: "DOCX_EMPTY", message: "The document contained no readable text." };
  return { ok: true, text, via: "mammoth", analysis: { kind: "docx", truncated } };
}

async function extractXlsx(buf: Buffer): Promise<ExtractionOutcome> {
  const mod: any = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const sheets: string[] = [];
  const lines: string[] = [];
  let totalRows = 0;

  wb.eachSheet((sheet: any) => {
    sheets.push(sheet.name);
    lines.push(`## Sheet: ${sheet.name}`);
    let rowsEmitted = 0;
    sheet.eachRow({ includeEmpty: false }, (row: any) => {
      totalRows += 1;
      // Cap per sheet so one giant workbook cannot blow the prompt budget.
      if (rowsEmitted >= 200) return;
      const values = (row.values as unknown[]).slice(1).map((v) => {
        if (v == null) return "";
        if (typeof v === "object") {
          const o = v as any;
          return String(o.text ?? o.result ?? o.hyperlink ?? JSON.stringify(o));
        }
        return String(v);
      });
      if (values.some((v) => v !== "")) {
        lines.push(values.join(" | "));
        rowsEmitted += 1;
      }
    });
    if (rowsEmitted >= 200) lines.push(`[… sheet truncated at 200 rows]`);
  });

  const { text, truncated } = truncate(lines.join("\n"));
  if (!text) return { ok: false, code: "XLSX_EMPTY", message: "The spreadsheet contained no readable cells." };
  return { ok: true, text, via: "exceljs", analysis: { kind: "xlsx", sheets, totalRows, truncated } };
}

function extractPlainText(buf: Buffer, kind: string): ExtractionOutcome {
  const { text, truncated } = truncate(buf.toString("utf8"));
  if (!text) return { ok: false, code: "TEXT_EMPTY", message: "The file was empty." };
  const analysis: Record<string, unknown> = { kind, truncated };
  if (kind === "csv") {
    const rows = text.split(/\r?\n/).filter((r) => r.trim() !== "");
    analysis.rows = rows.length;
    analysis.header = rows[0]?.slice(0, 500) ?? null;
  }
  return { ok: true, text, via: "utf8", analysis };
}

/**
 * Extracts text from a document buffer using real parsers.
 * Never throws for a bad document — returns a structured failure instead.
 */
export async function extractDocumentText(
  buf: Buffer,
  mimeType: string | null,
  filename: string | null,
): Promise<ExtractionOutcome> {
  const kind = classifyMime(mimeType, filename);
  try {
    switch (kind) {
      case "pdf":  return await extractPdf(buf);
      case "docx": return await extractDocx(buf);
      case "xlsx": return await extractXlsx(buf);
      case "csv":  return extractPlainText(buf, "csv");
      case "text": return extractPlainText(buf, "text");
      default:
        return {
          ok: false,
          code: "UNSUPPORTED_DOCUMENT_TYPE",
          message: `WINDELS cannot read ${mimeType ?? "this file type"} yet. Supported: PDF, DOCX, XLSX, CSV, TXT.`,
        };
    }
  } catch (e: any) {
    logger.warn("whatsapp document extraction failed", { kind, err: e?.message });
    return {
      ok: false,
      code: "DOCUMENT_EXTRACTION_FAILED",
      message: `The ${kind.toUpperCase()} could not be read: ${String(e?.message ?? e).slice(0, 200)}`,
    };
  }
}

// ─── Audio (real speech-to-text) ─────────────────────────────────────────────

/**
 * Resolves the transcription endpoint from the SAME provider configuration the
 * AI registry uses. There is no WhatsApp-specific AI configuration.
 */
function resolveSttConfig(): { url: string; apiKey: string; model: string } | null {
  const model = process.env.WHATSAPP_STT_MODEL || process.env.STT_MODEL || "whisper-1";
  if (process.env.OPENAI_API_KEY) {
    const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    return { url: `${base.replace(/\/$/, "")}/audio/transcriptions`, apiKey: process.env.OPENAI_API_KEY, model };
  }
  // Any OpenAI-compatible gateway (Groq, LocalAI, vLLM, …) that exposes /audio/transcriptions.
  if (process.env.OPENAI_COMPAT_BASE_URL && process.env.OPENAI_COMPAT_API_KEY) {
    const base = process.env.OPENAI_COMPAT_BASE_URL.replace(/\/$/, "");
    return { url: `${base}/audio/transcriptions`, apiKey: process.env.OPENAI_COMPAT_API_KEY, model };
  }
  return null;
}

export function sttConfigured(): boolean {
  return resolveSttConfig() !== null;
}

/**
 * Transcribes a voice note with a real STT provider.
 *
 * If no provider is configured we say so honestly. We do NOT fall back to
 * services/speechRecognition.service.ts, which fabricates transcripts.
 */
export async function transcribeAudio(
  buf: Buffer,
  mimeType: string | null,
  filename = "voice-note.ogg",
): Promise<ExtractionOutcome> {
  const cfg = resolveSttConfig();
  if (!cfg) {
    return {
      ok: false,
      configurationRequired: true,
      code: "WHATSAPP_STT_CONFIGURATION_REQUIRED",
      message:
        "Voice transcription is not configured. Set OPENAI_API_KEY (or OPENAI_COMPAT_BASE_URL + OPENAI_COMPAT_API_KEY) to enable speech-to-text.",
    };
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)], { type: mimeType || "audio/ogg" }), filename);
    form.append("model", cfg.model);
    form.append("response_format", "json");

    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        code: res.status === 401 ? "WHATSAPP_STT_UNAUTHORIZED" : "WHATSAPP_STT_FAILED",
        message: `Transcription failed (${res.status}): ${body.slice(0, 200)}`,
      };
    }

    const json: any = await res.json();
    const { text, truncated } = truncate(String(json?.text ?? ""));
    if (!text) {
      return { ok: false, code: "WHATSAPP_STT_EMPTY", message: "The voice note produced no speech." };
    }
    return {
      ok: true, text, via: `stt:${cfg.model}`,
      analysis: { kind: "audio", model: cfg.model, language: json?.language ?? null, truncated },
    };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    return {
      ok: false,
      code: aborted ? "WHATSAPP_STT_TIMEOUT" : "WHATSAPP_STT_FAILED",
      message: aborted ? "Transcription timed out after 60s." : String(e?.message ?? e).slice(0, 200),
    };
  } finally {
    clearTimeout(timeout);
  }
}
