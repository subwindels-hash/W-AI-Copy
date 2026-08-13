/**
 * Telegram media ingestion (§9–11).
 *
 * Downloads files from the Telegram Bot API securely, enforces type/size
 * limits, and places the content in front of the SAME multimodal AI brain
 * used by the web app — no Telegram-only vision/STT system.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { logger } from "../../config/logger.js";
import { TelegramClient } from "./telegramClient.js";
import { resolveConfig, type TelegramSettings } from "./telegramConfig.js";
import type { TelegramChannel } from "@prisma/client";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "application/pdf": "pdf",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
};
const ALLOWED_MIME = new Set(Object.keys(MIME_TO_EXT));
const DEFAULT_MAX_MB = 25;

export interface IngestedMedia {
  kind: "image" | "document" | "audio" | "video" | "unsupported";
  text: string | null;
  image?: { mimeType: string; data: Buffer };
  filePath?: string;
  filename?: string;
}

export const TelegramMedia = {
  async ingest(channel: TelegramChannel, fileId: string, mimeType: string | undefined, filename: string | undefined, caption: string | null, settings: TelegramSettings): Promise<IngestedMedia> {
    if (!settings.mediaEnabled) {
      return { kind: "unsupported", text: "Media messages are not enabled on this channel. Send your question as text." };
    }
    const mime = (mimeType ?? "").toLowerCase();
    const maxBytes = (settings.maxFileMb ?? DEFAULT_MAX_MB) * 1024 * 1024;

    const cfg = resolveConfig(channel);
    if (!cfg.botToken) throw new Error("Bot token not configured");

    const info = await TelegramClient.getFile({ botToken: cfg.botToken, apiBaseUrl: cfg.apiBaseUrl }, fileId).catch((e) => {
      logger.warn("telegram getFile failed", { err: e.message });
      return null;
    });
    if (!info?.file_path) return { kind: "unsupported", text: "I couldn't read that file. Please re-send it or describe it in text." };
    if (info.file_size && info.file_size > maxBytes) {
      return { kind: "unsupported", text: `That file is too large (limit ${settings.maxFileMb ?? DEFAULT_MAX_MB} MB).` };
    }
    if (mime && !ALLOWED_MIME.has(mime)) {
      return { kind: "unsupported", text: `File type ${mime} isn't supported. Send an image, PDF, audio or video.` };
    }

    const data = await TelegramClient.downloadFile({ botToken: cfg.botToken, apiBaseUrl: cfg.apiBaseUrl }, info.file_path);
    if (data.length > maxBytes) return { kind: "unsupported", text: "That file exceeds the size limit." };

    const kind = kindFromMime(mime, info.file_path);
    if (kind === "image" && settings.imageVision) {
      return { kind, text: caption, image: { mimeType: mime || "image/jpeg", data }, filename };
    }
    // For audio/video/docs: persist to a temp path the existing file pipeline can read.
    if (kind !== "unsupported") {
      const ext = MIME_TO_EXT[mime] ?? path.extname(info.file_path).slice(1) ?? "bin";
      const tmp = path.join(os.tmpdir(), `tg-${randomBytes(8).toString("hex")}.${ext}`);
      await fs.writeFile(tmp, data);
      return { kind, text: caption, filePath: tmp, filename };
    }
    return { kind: "unsupported", text: "I received the file but couldn't process it." };
  },
};

function kindFromMime(mime: string, filePath?: string): IngestedMedia["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "document";
  if (filePath?.match(/\.(jpg|jpeg|png|webp|gif)$/i)) return "image";
  if (filePath?.match(/\.(ogg|mp3|wav|m4a)$/i)) return "audio";
  if (filePath?.match(/\.(mp4|mov|webm)$/i)) return "video";
  return "unsupported";
}
