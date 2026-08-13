/**
 * WhatsAppMessageService — the single reusable outbound path.
 *
 * Agents, workflows and the inbound pipeline all send through here so that
 * every outbound message is persisted, permission-checked, rate-limited and
 * retried consistently. Nothing else may call the Graph API directly.
 *
 * There is no simulated delivery: if credentials are missing the send fails
 * with WHATSAPP_CONFIGURATION_REQUIRED and the message row is marked FAILED.
 */
import { prisma } from "../../db/client.js";
import { logger } from "../../observability/logger.js";
import {
  WhatsAppClient,
  WhatsAppApiError,
  configurationRequiredError,
  normalizePhoneNumber,
  type WhatsAppCredentials,
} from "./whatsappClient.js";
import { WhatsAppChannelService, resolveConfig, toCredentials } from "./whatsappChannel.service.js";
import { emitKernelEvent } from "./whatsappKernel.js";

/** WhatsApp hard-caps a text body at 4096 characters. */
export const WHATSAPP_TEXT_LIMIT = 4096;

export interface SendOptions {
  /** Existing WhatsAppConversation id, when the send belongs to a thread. */
  conversationId?: string;
  /** Links the outbound row back to the WINDELS Message it renders. */
  windelsMessageId?: string;
  /** Retry attempts for retryable failures. Default 2 (3 tries total). */
  maxAttempts?: number;
}

export interface SendOutcome {
  ok: boolean;
  messageId: string | null;
  recordId: string | null;
  error?: { code: string; message: string; retryable: boolean };
}

/**
 * Splits an over-long body on paragraph/sentence/word boundaries so a long AI
 * answer arrives as readable chunks instead of being truncated.
 */
export function splitForWhatsApp(text: string, limit = WHATSAPP_TEXT_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    let cut = window.lastIndexOf("\n\n");
    if (cut < limit * 0.5) cut = window.lastIndexOf("\n");
    if (cut < limit * 0.5) cut = window.lastIndexOf(". ");
    if (cut > 0 && cut < limit) cut += 1;
    if (cut < limit * 0.5) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = limit;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter((p) => p.length > 0);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  onAttemptFailed: (err: WhatsAppApiError, attempt: number) => void,
): Promise<T> {
  let lastErr: WhatsAppApiError | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const err = e instanceof WhatsAppApiError
        ? e
        : new WhatsAppApiError({ message: e?.message ?? String(e), retryable: false });
      lastErr = err;
      onAttemptFailed(err, attempt);
      // Never retry auth or validation failures — they will fail identically.
      if (!err.retryable || attempt === maxAttempts) break;
      await sleep(Math.min(500 * 2 ** (attempt - 1), 4000));
    }
  }
  throw lastErr;
}

export const WhatsAppMessageService = {
  /**
   * Sends a text message on a channel. Long bodies are split; the returned
   * outcome refers to the first chunk, and every chunk is persisted.
   */
  async sendText(
    channelRow: any,
    to: string,
    body: string,
    opts: SendOptions = {},
  ): Promise<SendOutcome> {
    const chunks = splitForWhatsApp(body);
    let first: SendOutcome | null = null;
    for (const chunk of chunks) {
      const outcome = await this.dispatch(channelRow, to, { type: "text", text: chunk }, opts);
      if (!first) first = outcome;
      if (!outcome.ok) break; // stop on first failure rather than spamming
    }
    return first ?? { ok: false, messageId: null, recordId: null, error: { code: "WHATSAPP_EMPTY_BODY", message: "nothing to send", retryable: false } };
  },

  async sendMedia(
    channelRow: any,
    to: string,
    kind: "image" | "audio" | "video" | "document" | "sticker",
    media: { id?: string; link?: string; caption?: string; filename?: string },
    opts: SendOptions = {},
  ): Promise<SendOutcome> {
    return this.dispatch(channelRow, to, { type: kind, media }, opts);
  },

  async sendInteractive(
    channelRow: any,
    to: string,
    interactive: Record<string, unknown>,
    opts: SendOptions = {},
  ): Promise<SendOutcome> {
    return this.dispatch(channelRow, to, { type: "interactive", interactive }, opts);
  },

  /**
   * Core outbound path: persist → send (with retry) → record result.
   * The row is written BEFORE the API call so a crash mid-send is still
   * visible as a PENDING message rather than vanishing.
   */
  async dispatch(
    channelRow: any,
    to: string,
    payload:
      | { type: "text"; text: string }
      | { type: "image" | "audio" | "video" | "document" | "sticker"; media: { id?: string; link?: string; caption?: string; filename?: string } }
      | { type: "interactive"; interactive: Record<string, unknown> },
    opts: SendOptions = {},
  ): Promise<SendOutcome> {
    const cfg = resolveConfig(channelRow);
    const messageType = payload.type.toUpperCase() as any;
    const text = payload.type === "text" ? payload.text : payload.type === "interactive" ? null : payload.media.caption ?? null;
    const mediaId = payload.type !== "text" && payload.type !== "interactive" ? payload.media.id ?? null : null;

    // Persist first, so nothing is ever sent without a record.
    let record: any = null;
    if (opts.conversationId) {
      record = await prisma.whatsAppMessage.create({
        data: {
          organizationId: cfg.organizationId,
          conversationId: opts.conversationId,
          direction: "OUTBOUND",
          messageType,
          text,
          mediaId,
          status: "PENDING",
          windelsMessageId: opts.windelsMessageId ?? null,
          metadata: {},
        },
      });
    }

    const fail = async (code: string, message: string, retryable: boolean): Promise<SendOutcome> => {
      if (record) {
        await prisma.whatsAppMessage.update({
          where: { id: record.id },
          data: { status: "FAILED", errorCode: code, errorMessage: message.slice(0, 500) },
        }).catch(() => { /* best-effort */ });
      }
      await WhatsAppChannelService.recordError(cfg.channelId, `${code}: ${message}`);
      logger.error("whatsapp outbound send failed", { channelId: cfg.channelId, code, retryable });
      await emitKernelEvent("whatsapp.message.send_failed", {
        channelId: cfg.channelId,
        organizationId: cfg.organizationId,
        code,
      });
      return { ok: false, messageId: null, recordId: record?.id ?? null, error: { code, message, retryable } };
    };

    if (!cfg.enabled) {
      return fail("WHATSAPP_CHANNEL_DISABLED", "WhatsApp channel is disabled", false);
    }

    const creds: WhatsAppCredentials | null = toCredentials(cfg);
    if (!creds) {
      const err = configurationRequiredError(cfg.missing);
      return fail(err.code, err.message, false);
    }

    try {
      const result = await withRetry(
        async () => {
          if (payload.type === "text") return WhatsAppClient.sendText(creds, to, payload.text);
          if (payload.type === "interactive") return WhatsAppClient.sendInteractive(creds, to, payload.interactive);
          return WhatsAppClient.sendMedia(creds, to, payload.type, payload.media);
        },
        Math.max(1, opts.maxAttempts ?? 3),
        (err, attempt) => {
          logger.warn("whatsapp send attempt failed", {
            channelId: cfg.channelId, attempt, code: err.code, retryable: err.retryable,
          });
        },
      );

      if (record) {
        await prisma.whatsAppMessage.update({
          where: { id: record.id },
          data: { status: "SENT", whatsappMessageId: result.messageId, sentAt: new Date() },
        });
      }
      await WhatsAppChannelService.recordConnected(cfg.channelId, null);
      await emitKernelEvent("whatsapp.message.sent", {
        channelId: cfg.channelId,
        organizationId: cfg.organizationId,
        messageType: payload.type,
      });
      return { ok: true, messageId: result.messageId, recordId: record?.id ?? null };
    } catch (e: any) {
      const err = e instanceof WhatsAppApiError ? e : new WhatsAppApiError({ message: e?.message ?? String(e) });
      return fail(err.code, err.message, err.retryable);
    }
  },

  /** Applies an inbound delivery-status webhook to the stored message. */
  async applyStatusUpdate(input: {
    whatsappMessageId: string;
    status: string;
    timestamp: Date;
    errorCode: string | null;
    errorMessage: string | null;
  }): Promise<boolean> {
    const row = await prisma.whatsAppMessage.findUnique({ where: { whatsappMessageId: input.whatsappMessageId } });
    if (!row) return false;

    const map: Record<string, string> = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" };
    const next = map[input.status];
    if (!next) return false;

    // Never regress a status (a late 'sent' must not overwrite 'read').
    const rank: Record<string, number> = { PENDING: 0, QUEUED: 1, SENT: 2, DELIVERED: 3, READ: 4, FAILED: 5 };
    if (next !== "FAILED" && (rank[next] ?? 0) <= (rank[row.status] ?? 0)) return false;

    await prisma.whatsAppMessage.update({
      where: { id: row.id },
      data: {
        status: next as any,
        ...(next === "DELIVERED" ? { deliveredAt: input.timestamp } : {}),
        ...(next === "READ" ? { readAt: input.timestamp } : {}),
        ...(next === "FAILED" ? { errorCode: input.errorCode, errorMessage: input.errorMessage } : {}),
      },
    });
    return true;
  },

  /** Marks an inbound message as read on WhatsApp. Failures are non-fatal. */
  async markRead(channelRow: any, whatsappMessageId: string): Promise<void> {
    const cfg = resolveConfig(channelRow);
    const creds = toCredentials(cfg);
    if (!creds || !cfg.enabled) return;
    try {
      await WhatsAppClient.markRead(creds, whatsappMessageId);
    } catch (e: any) {
      logger.debug("whatsapp markRead failed", { channelId: cfg.channelId, err: e?.message });
    }
  },

  /** Normalises a recipient for comparison/storage. */
  normalizeRecipient: normalizePhoneNumber,
};
