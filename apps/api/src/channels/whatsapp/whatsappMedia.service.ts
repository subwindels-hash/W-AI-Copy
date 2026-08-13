/**
 * WhatsApp media ingestion — Phase 2 §4.
 *
 * Turns an inbound media id into real, usable content for the AI OS:
 *   1. resolve the short-lived Graph download URL   (WhatsAppClient.getMediaUrl)
 *   2. download the actual bytes under a hard cap   (WhatsAppClient.downloadMedia)
 *   3. extract real content                          (whatsappMediaExtract)
 *   4. persist the artefact + result                 (WhatsAppMedia)
 *
 * Idempotency: WhatsAppMedia has a unique (conversationId, mediaId). A Meta
 * redelivery therefore reuses the completed extraction instead of paying for a
 * second download and a second transcription.
 */
import { prisma } from "../../db/client.js";
import { logger } from "../../observability/logger.js";
import { aiRegistry } from "../../services/ai/registry.js";
import type { ChatImage } from "../../services/ai/types.js";
import { WhatsAppClient, WhatsAppApiError, type WhatsAppCredentials } from "./whatsappClient.js";
import {
  classifyMime,
  extractDocumentText,
  transcribeAudio,
  sha256,
  MAX_MEDIA_BYTES,
  type ExtractionOutcome,
} from "./whatsappMediaExtract.js";

/** Images are re-sent to the vision model inline, so keep them modest. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Parsed message type → the WhatsAppMessageType enum stored on the row. */
const TYPE_TO_MEDIA_KIND: Record<string, string> = {
  image: "IMAGE", audio: "AUDIO", video: "VIDEO", document: "DOCUMENT", sticker: "STICKER",
};

export interface IngestMediaInput {
  organizationId: string;
  /** WhatsAppConversation.id */
  conversationId: string;
  /** WhatsAppMessage.id, when the row already exists. */
  whatsappMessageId?: string | null;
  mediaId: string;
  messageType: string;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
  credentials: WhatsAppCredentials;
  /** Vision costs money; the caller passes the channel setting. */
  visionEnabled: boolean;
  /** Usage attribution — never a WhatsApp-specific meter. */
  usage: { userId: string | null; agentId?: string | null };
}

export interface IngestMediaResult {
  /** WhatsAppMedia.id */
  mediaRecordId: string;
  status: "COMPLETED" | "FAILED" | "UNSUPPORTED" | "SKIPPED";
  /** Text to inject into the prompt. Null when extraction failed. */
  text: string | null;
  /** Inline image for a multimodal turn, when the artefact is an image. */
  image: ChatImage | null;
  /** Operator/user-facing explanation when status !== COMPLETED. */
  failureMessage: string | null;
  failureCode: string | null;
  /** True when an operator can fix this with configuration. */
  configurationRequired: boolean;
  kind: string;
}

type ExtractionFailure = Extract<ExtractionOutcome, { ok: false }>;

function outcomeToStatus(o: ExtractionOutcome): "COMPLETED" | "FAILED" | "UNSUPPORTED" {
  if (o.ok) return "COMPLETED";
  return (o as ExtractionFailure).code === "UNSUPPORTED_DOCUMENT_TYPE" ? "UNSUPPORTED" : "FAILED";
}

/**
 * Analyses an image with the REAL vision model from the AI registry.
 *
 * Deliberately not services/imageRecognition.service.ts — that module derives
 * every label and bounding box from a seeded RNG.
 */
async function analyseImage(
  buf: Buffer,
  mimeType: string,
  caption: string | null,
  organizationId: string,
  usage: { userId: string | null; agentId?: string | null },
  conversationId: string,
): Promise<ExtractionOutcome> {
  const image: ChatImage = { mimeType, dataBase64: buf.toString("base64") };
  const instruction = caption?.trim()
    ? `The user sent this image with the caption: "${caption.trim()}". Describe the image accurately and address the caption.`
    : "Describe this image accurately and in detail. Transcribe any visible text verbatim.";

  try {
    const result = await aiRegistry.complete(
      {
        model: "",
        messages: [{ role: "user", content: instruction, images: [image] }],
        requiredCapabilities: ["vision"],
        maxTokens: 700,
        temperature: 0.2,
      },
      {
        // Metered through the EXISTING usage pipeline — no WhatsApp-specific meter.
        channel: "chat",
        feature: "whatsapp",
        organizationId,
        userId: usage.userId ?? undefined,
        agentId: usage.agentId ?? undefined,
        conversationId,
      },
    );
    const text = (result?.content ?? "").trim();
    if (!text) return { ok: false, code: "VISION_EMPTY", message: "The vision model returned no description." };
    return { ok: true, text, via: `vision:${result.model ?? "unknown"}`, analysis: { kind: "image", model: result.model ?? null } };
  } catch (e: any) {
    const code = String(e?.code ?? "");
    const configurationRequired =
      code === "AI_PROVIDER_CONFIGURATION_REQUIRED" || code === "NO_MODEL_AVAILABLE" || /no .*model/i.test(String(e?.message ?? ""));
    return {
      ok: false,
      configurationRequired,
      code: configurationRequired ? "WHATSAPP_VISION_CONFIGURATION_REQUIRED" : "WHATSAPP_VISION_FAILED",
      message: configurationRequired
        ? "Image understanding is not configured. Configure an AI provider with a vision-capable model (e.g. OpenAI gpt-4o, Anthropic Claude 3.5 Sonnet, or Google Gemini 1.5)."
        : `Image analysis failed: ${String(e?.message ?? e).slice(0, 200)}`,
    };
  }
}

export const WhatsAppMediaService = {
  /**
   * Downloads and extracts one media artefact. Never throws — media problems
   * must degrade into an honest reply, not a dead pipeline.
   */
  async ingest(input: IngestMediaInput): Promise<IngestMediaResult> {
    const kind = classifyMime(input.mimeType, input.filename);
    const anyPrisma = prisma as any;

    // ── Idempotency: reuse a completed extraction from a redelivery ──
    const existing = await anyPrisma.whatsAppMedia
      .findUnique({ where: { conversationId_mediaId: { conversationId: input.conversationId, mediaId: input.mediaId } } })
      .catch(() => null);

    if (existing?.extractionStatus === "COMPLETED") {
      return {
        mediaRecordId: existing.id,
        status: "COMPLETED",
        text: existing.transcript ?? existing.extractedText ?? null,
        // Images are not cached as base64; a repeat needs re-analysis text only.
        image: null,
        failureMessage: null,
        failureCode: null,
        configurationRequired: false,
        kind,
      };
    }

    const record =
      existing ??
      (await anyPrisma.whatsAppMedia.create({
        data: {
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          messageId: input.whatsappMessageId ?? null,
          mediaId: input.mediaId,
          mediaKind: (TYPE_TO_MEDIA_KIND[input.messageType] ?? "UNKNOWN") as any,
          mimeType: input.mimeType,
          filename: input.filename,
          extractionStatus: "PROCESSING",
        },
      }));

    const fail = async (
      code: string,
      message: string,
      status: "FAILED" | "UNSUPPORTED",
      configurationRequired = false,
    ): Promise<IngestMediaResult> => {
      await anyPrisma.whatsAppMedia
        .update({
          where: { id: record.id },
          data: {
            extractionStatus: status,
            errorCode: code.slice(0, 100),
            errorMessage: message.slice(0, 1000),
            processedAt: new Date(),
          },
        })
        .catch(() => { /* the reply matters more than the bookkeeping */ });
      return {
        mediaRecordId: record.id, status, text: null, image: null,
        failureMessage: message, failureCode: code, configurationRequired, kind,
      };
    };

    if (kind === "video") {
      return fail(
        "WHATSAPP_VIDEO_UNSUPPORTED",
        "WINDELS cannot analyse video yet. Send an image, a document, a voice note, or text.",
        "UNSUPPORTED",
      );
    }
    if (kind === "image" && !input.visionEnabled) {
      return fail(
        "WHATSAPP_VISION_DISABLED",
        "Image understanding is disabled on this channel.",
        "UNSUPPORTED",
      );
    }

    // ── Download the real bytes ──
    let buffer: Buffer;
    let effectiveMime: string;
    try {
      const meta = await WhatsAppClient.getMediaUrl(input.credentials, input.mediaId);
      const cap = kind === "image" ? MAX_IMAGE_BYTES : MAX_MEDIA_BYTES;
      if (meta.fileSize && meta.fileSize > cap) {
        return fail(
          "WHATSAPP_MEDIA_TOO_LARGE",
          `That file is ${(meta.fileSize / 1024 / 1024).toFixed(1)}MB. The limit is ${(cap / 1024 / 1024).toFixed(0)}MB.`,
          "FAILED",
        );
      }
      const dl = await WhatsAppClient.downloadMedia(input.credentials, meta.url, { maxBytes: cap });
      buffer = dl.buffer;
      effectiveMime = input.mimeType ?? meta.mimeType ?? dl.mimeType ?? "application/octet-stream";
    } catch (e: any) {
      const code = e instanceof WhatsAppApiError ? e.code : "WHATSAPP_MEDIA_DOWNLOAD_FAILED";
      logger.warn("whatsapp media download failed", { mediaId: input.mediaId, code, err: e?.message });
      return fail(code, "That attachment could not be downloaded from WhatsApp. Please try sending it again.", "FAILED");
    }

    const checksum = sha256(buffer);

    // ── Extract real content ──
    let outcome: ExtractionOutcome;
    if (kind === "image") {
      outcome = await analyseImage(
        buffer, effectiveMime, input.caption, input.organizationId, input.usage, input.conversationId,
      );
    } else if (kind === "audio") {
      outcome = await transcribeAudio(buffer, effectiveMime, input.filename ?? "voice-note.ogg");
    } else {
      outcome = await extractDocumentText(buffer, effectiveMime, input.filename);
    }

    const status = outcomeToStatus(outcome);

    await anyPrisma.whatsAppMedia
      .update({
        where: { id: record.id },
        data: {
          extractionStatus: status,
          mimeType: effectiveMime,
          sizeBytes: buffer.byteLength,
          checksum,
          extractedText: outcome.ok && kind !== "audio" ? outcome.text : null,
          transcript: outcome.ok && kind === "audio" ? outcome.text : null,
          analysis: outcome.ok
            ? ({ ...outcome.analysis, via: outcome.via, caption: input.caption ?? null } as any)
            : undefined,
          errorCode: outcome.ok ? null : (outcome as ExtractionFailure).code.slice(0, 100),
          errorMessage: outcome.ok ? null : (outcome as ExtractionFailure).message.slice(0, 1000),
          processedAt: new Date(),
        },
      })
      .catch((e: any) => logger.warn("whatsapp media persist failed", { err: e?.message }));

    if (!outcome.ok) {
      const failure = outcome as ExtractionFailure;
      return {
        mediaRecordId: record.id, status, text: null, image: null,
        failureMessage: failure.message, failureCode: failure.code,
        configurationRequired: failure.configurationRequired ?? false, kind,
      };
    }

    return {
      mediaRecordId: record.id,
      status: "COMPLETED",
      text: outcome.text,
      // Vision already produced a description; no need to re-send the bytes.
      image: null,
      failureMessage: null,
      failureCode: null,
      configurationRequired: false,
      kind,
    };
  },

  /** Renders an extraction result as the prompt fragment the AI OS receives. */
  toPromptFragment(result: IngestMediaResult, caption: string | null): string {
    const captionPart = caption?.trim() ? `\nThe user's caption: "${caption.trim()}"` : "";
    switch (result.kind) {
      case "image":
        return `[The user sent an image. Vision analysis:]\n${result.text}${captionPart}`;
      case "audio":
        return `[The user sent a voice note. Transcript:]\n${result.text}`;
      default:
        return `[The user sent a ${result.kind.toUpperCase()} document. Extracted content:]\n${result.text}${captionPart}`;
    }
  },
};
