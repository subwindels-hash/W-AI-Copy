/**
 * Telegram outbound delivery. Sends messages through the real Bot API and
 * records OUTBOUND message rows. Supports typing indicators and generated-file
 * sending (documents/photos/audio/video) when a URL or buffer is supplied.
 */
import { promises as fs } from "node:fs";
import { prisma } from "../../db/client.js";
import { logger } from "../../config/logger.js";
import { TelegramClient } from "./telegramClient.js";
import { resolveConfig } from "./telegramConfig.js";
import type { TelegramChannel } from "@prisma/client";

export interface SendResult { ok: boolean; error?: { code: string; message: string; retryable?: boolean }; messageId?: number; }

export const TelegramOutbound = {
  async sendText(channel: TelegramChannel, chatId: number, text: string, opts: { replyToMessageId?: number; windelsMessageId?: string; parseMode?: "HTML" | "MarkdownV2" } = {}): Promise<SendResult> {
    const cfg = resolveConfig(channel);
    if (!cfg.botToken) return { ok: false, error: { code: "TELEGRAM_CONFIGURATION_REQUIRED", message: "Bot token not configured" } };
    try {
      await TelegramClient.sendChatAction({ botToken: cfg.botToken, apiBaseUrl: cfg.apiBaseUrl }, chatId, "typing");
      const sent = await TelegramClient.sendMessage({ botToken: cfg.botToken, apiBaseUrl: cfg.apiBaseUrl }, {
        chatId, text: text.slice(0, 4096), parseMode: opts.parseMode ?? "HTML", replyToMessageId: opts.replyToMessageId,
      });
      await this.recordOutbound(channel, chatId, "TEXT", text.slice(0, 4096), sent.message_id, opts.windelsMessageId);
      return { ok: true, messageId: sent.message_id };
    } catch (e: any) {
      const result: SendResult = { ok: false, error: { code: e.code ?? "TELEGRAM_SEND_FAILED", message: e.message, retryable: e.retryable } };
      logger.warn("telegram send failed", { channelId: channel.id, err: e.message, retryable: e.retryable });
      return result;
    }
  },

  async sendDocument(channel: TelegramChannel, chatId: number, filePath: string, filename: string, opts: { caption?: string } = {}): Promise<SendResult> {
    // For binary uploads we use a direct multipart POST rather than the JSON client.
    const cfg = resolveConfig(channel);
    if (!cfg.botToken) return { ok: false, error: { code: "TELEGRAM_CONFIGURATION_REQUIRED", message: "Bot token not configured" } };
    try {
      const buf = await fs.readFile(filePath);
      const form = new FormData();
      form.append("chat_id", String(chatId));
      form.append("document", new Blob([buf]), filename);
      if (opts.caption) form.append("caption", opts.caption.slice(0, 1024));
      const base = (cfg.apiBaseUrl ?? "https://api.telegram.org").replace(/\/$/, "");
      const res = await fetch(`${base}/bot${cfg.botToken}/sendDocument`, { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { message_id?: number } };
      if (!res.ok || !json.ok) {
        return { ok: false, error: { code: "TELEGRAM_SEND_FAILED", message: json.description ?? `HTTP ${res.status}`, retryable: res.status >= 500 } };
      }
      return { ok: true, messageId: json.result?.message_id };
    } catch (e: any) {
      return { ok: false, error: { code: "TELEGRAM_SEND_FAILED", message: e.message, retryable: true } };
    }
  },

  async recordOutbound(channel: TelegramChannel, chatId: number, messageType: string, text: string | null, telegramMessageId: number, windelsMessageId?: string) {
    try {
      const tgChat = await prisma.telegramChat.findFirst({ where: { channelId: channel.id, telegramChatId: BigInt(chatId) } });
      if (!tgChat) return;
      await prisma.telegramMessage.create({
        data: {
          organizationId: channel.organizationId, channelId: channel.id, chatId: tgChat.id,
          telegramUpdateId: BigInt(Date.now()) ^ BigInt(telegramMessageId),
          telegramMessageId: BigInt(telegramMessageId),
          direction: "OUTBOUND", messageType, text,
          windelsMessageId, status: "DELIVERED", deliveredAt: new Date(),
        },
      });
    } catch (e) {
      logger.warn("telegram outbound record failed", { err: (e as Error).message });
    }
  },
};
