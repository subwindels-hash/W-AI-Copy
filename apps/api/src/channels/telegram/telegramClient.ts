/**
 * Telegram Bot API client.
 *
 * Real Bot API integration (no mock/demo mode). When the bot token is not
 * configured the client throws `TELEGRAM_CONFIGURATION_REQUIRED` so callers
 * surface the configuration gap honestly instead of pretending delivery.
 *
 * Supports: getMe, setWebhook/deleteWebhook, sendMessage (with markdown +
 * inline keyboard), sendChatAction, getFile, and file download.
 */
import { timingSafeEqual } from "node:crypto";

const DEFAULT_API = "https://api.telegram.org";

export interface TelegramCredentials {
  botToken: string;
  apiBaseUrl?: string;
}

export class TelegramApiError extends Error {
  code: string;
  httpStatus: number;
  retryable: boolean;
  description?: string;
  constructor(opts: { message: string; code?: string; httpStatus?: number; retryable?: boolean; description?: string }) {
    super(opts.message);
    this.name = "TelegramApiError";
    this.code = opts.code ?? "TELEGRAM_API_ERROR";
    this.httpStatus = opts.httpStatus ?? 0;
    this.retryable = opts.retryable ?? false;
    this.description = opts.description;
  }
}

export function configurationRequired(): TelegramApiError {
  return new TelegramApiError({
    message: "Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN (or configure a channel).",
    code: "TELEGRAM_CONFIGURATION_REQUIRED", retryable: false,
  });
}

/** Constant-time comparison of the webhook secret header. */
export function verifyWebhookSecret(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface TgResponse<T> { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } }

export interface TgUser { id: number; is_bot: boolean; first_name?: string; last_name?: string; username?: string; language_code?: string; }
export interface TgChat { id: number; type: "private" | "group" | "supergroup" | "channel"; title?: string; username?: string; first_name?: string; last_name?: string; }
export interface TgMessage { message_id: number; from?: TgUser; chat: TgChat; date: number; text?: string; caption?: string; photo?: any[]; voice?: any; audio?: any; document?: any; video?: any; sticker?: any; }
export interface TgUpdate { update_id: number; message?: TgMessage; edited_message?: TgMessage; channel_post?: TgMessage; callback_query?: any; my_chat_member?: any; }

export interface SendMessageOpts {
  chatId: number | string;
  text: string;
  parseMode?: "HTML" | "MarkdownV2";
  replyMarkup?: unknown;
  replyToMessageId?: number;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function tgFetch<T>(creds: TelegramCredentials, method: string, body?: unknown, timeoutMs = 15000): Promise<T> {
  const base = (creds.apiBaseUrl ?? DEFAULT_API).replace(/\/$/, "");
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base}/bot${creds.botToken}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    throw new TelegramApiError({ message: `Telegram API network error: ${e?.message}`, code: "TELEGRAM_NETWORK", retryable: true });
  } finally {
    clearTimeout(t);
  }
  let json: TgResponse<T>;
  try { json = (await res.json()) as TgResponse<T>; } catch { json = { ok: false }; }
  if (!res.ok || !json.ok) {
    const retryable = RETRYABLE_STATUS.has(res.status) || Boolean(json.parameters?.retry_after);
    throw new TelegramApiError({
      message: `Telegram API ${method} failed: ${json.description ?? res.statusText}`,
      code: "TELEGRAM_API_ERROR", httpStatus: res.status, retryable, description: json.description,
    });
  }
  return json.result as T;
}

export const TelegramClient = {
  async getMe(creds: TelegramCredentials) {
    if (!creds.botToken) throw configurationRequired();
    return tgFetch<{ id: number; is_bot: boolean; first_name: string; username: string; can_join_groups?: boolean }>(creds, "getMe");
  },

  async setWebhook(creds: TelegramCredentials, url: string, secretToken: string, allowedUpdates: string[] = ["message", "edited_message", "callback_query", "channel_post"]) {
    if (!creds.botToken) throw configurationRequired();
    return tgFetch<boolean>(creds, "setWebhook", { url, secret_token: secretToken, allowed_updates: allowedUpdates, drop_pending_updates: false });
  },

  async deleteWebhook(creds: TelegramCredentials, dropPending = false) {
    if (!creds.botToken) throw configurationRequired();
    return tgFetch<boolean>(creds, "deleteWebhook", { drop_pending_updates: dropPending });
  },

  async getWebhookInfo(creds: TelegramCredentials) {
    if (!creds.botToken) throw configurationRequired();
    return tgFetch<{ url: string; has_custom_certificate: boolean; pending_update_count: number; last_error_message?: string; last_error_date?: number; max_connections?: number }>(creds, "getWebhookInfo");
  },

  async sendMessage(creds: TelegramCredentials, opts: SendMessageOpts) {
    if (!creds.botToken) throw configurationRequired();
    return tgFetch<TgMessage>(creds, "sendMessage", {
      chat_id: opts.chatId, text: opts.text, parse_mode: opts.parseMode ?? "HTML",
      reply_markup: opts.replyMarkup, reply_to_message_id: opts.replyToMessageId,
      disable_web_page_preview: true,
    });
  },

  async sendChatAction(creds: TelegramCredentials, chatId: number | string, action: "typing" | "upload_photo" | "record_voice" | "upload_voice") {
    if (!creds.botToken) return;
    return tgFetch<boolean>(creds, "sendChatAction", { chat_id: chatId, action }).catch(() => false);
  },

  /** Resolves a file_path for getFile; caller downloads it from the file endpoint. */
  async getFile(creds: TelegramCredentials, fileId: string) {
    if (!creds.botToken) throw configurationRequired();
    return tgFetch<{ file_id: string; file_unique_id: string; file_size?: number; file_path?: string }>(creds, "getFile", { file_id: fileId });
  },

  async downloadFile(creds: TelegramCredentials, filePath: string, timeoutMs = 30000): Promise<Buffer> {
    const base = (creds.apiBaseUrl ?? DEFAULT_API).replace(/\/$/, "");
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}/file/bot${creds.botToken}/${filePath}`, { signal: controller.signal });
      if (!res.ok) throw new TelegramApiError({ message: `Telegram file download failed: ${res.status}`, httpStatus: res.status, retryable: res.status >= 500 });
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(t);
    }
  },
};
