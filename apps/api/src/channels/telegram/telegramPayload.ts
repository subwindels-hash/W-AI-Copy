/**
 * Normalizes a Telegram Update into a canonical inbound message for the queue.
 * Only text and supported media messages are processed; other updates are ignored.
 */
import type { TgUpdate, TgMessage } from "./telegramClient.js";

export interface NormalizedInbound {
  telegramMessageId: number;
  telegramChatId: number;
  chatType: string;
  telegramUserId: number;
  username?: string;
  displayName?: string;
  text: string | null;
  messageType: string;
  mediaFileId?: string;
  mimeType?: string;
  fileSize?: number;
  caption?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

function mediaOf(m: TgMessage): { kind: string; fileId?: string; mimeType?: string; fileSize?: number } | null {
  if (m.photo) {
    // photo is an array of sizes; pick the largest.
    const largest = [...m.photo].sort((a: any, b: any) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];
    return largest ? { kind: "image", fileId: largest.file_id, fileSize: largest.file_size, mimeType: "image/jpeg" } : null;
  }
  if (m.voice) return { kind: "voice", fileId: m.voice.file_id, mimeType: m.voice.mime_type, fileSize: m.voice.file_size };
  if (m.audio) return { kind: "audio", fileId: m.audio.file_id, mimeType: m.audio.mime_type, fileSize: m.audio.file_size };
  if (m.video) return { kind: "video", fileId: m.video.file_id, mimeType: m.video.mime_type, fileSize: m.video.file_size };
  if (m.document) return { kind: "document", fileId: m.document.file_id, mimeType: m.document.mime_type, fileSize: m.document.file_size };
  return null;
}

export function normalizeUpdate(update: TgUpdate): NormalizedInbound | null {
  const m: TgMessage | undefined = update.message ?? update.edited_message ?? update.channel_post;
  if (!m || !m.from || !m.chat) return null;
  // Ignore bots, groups without a tagged mention (handled below), and non-message updates.
  if (m.from.is_bot) return null;

  const media = mediaOf(m);
  const text = m.text ?? m.caption ?? null;
  const messageType = media ? media.kind : (text?.startsWith("/") ? "command" : "text");

  return {
    telegramMessageId: m.message_id,
    telegramChatId: m.chat.id,
    chatType: m.chat.type,
    telegramUserId: m.from.id,
    username: m.from.username,
    displayName: [m.from.first_name, m.from.last_name].filter(Boolean).join(" ") || null,
    text,
    messageType,
    mediaFileId: media?.fileId,
    mimeType: media?.mimeType,
    fileSize: media?.fileSize,
    caption: m.caption ?? null,
    metadata: {},
    timestamp: m.date,
  };
}
