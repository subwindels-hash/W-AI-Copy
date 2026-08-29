/**
 * Public Telegram webhook.
 *
 * Mounted WITHOUT authenticate (Telegram cannot present a JWT). Security is the
 * per-channel X-Telegram-Bot-Api-Secret-Token constant-time check. The handler
 * validates, deduplicates by update_id (idempotency), enqueues and ACKs fast;
 * all AI work runs in the worker.
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { prisma } from "../../db/client.js";
import { logger } from "../../config/logger.js";
import { rateLimit } from "../../http/middleware/rateLimit.js";
import { verifyWebhookSecret } from "./telegramClient.js";
import { TelegramChannelService } from "./telegramChannel.service.js";
import { TelegramQueue } from "./telegramQueue.js";
import { normalizeUpdate } from "./telegramPayload.js";
import { resolveConfig } from "./telegramConfig.js";
import type { TgUpdate } from "./telegramClient.js";

const ACK = { ok: true };

export function registerTelegramWebhookRoutes(router: Router): void {
  router.post("/", rateLimit("webhookIngest"), async (req: Request, res: Response) => {
    const update = req.body as TgUpdate;
    if (!update || typeof update.update_id !== "number") {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST" } });
    }

    // Identify the channel. Telegram updates carry the bot in the message
    // recipient (message.from for the bot is not present; use bot id from the
    // channel we configured). We resolve by iterating enabled channels and
    // verifying the secret header against each — secrets are per-channel.
    const channels = await prisma.telegramChannel.findMany({ where: { enabled: true, deletedAt: null } }).catch(() => []);
    let matched: typeof channels[number] | null = null;
    for (const c of channels) {
      const cfg = resolveConfig(c);
      const header = req.header("x-telegram-bot-api-secret-token");
      if (verifyWebhookSecret(header ?? undefined, cfg.webhookSecret)) { matched = c; break; }
    }

    if (!matched) {
      logger.warn("telegram webhook rejected: secret mismatch");
      // Still 200 so Telegram does not disable, but do no work.
      return res.status(200).json(ACK);
    }
    if (!matched.enabled) return res.status(200).json(ACK);

    await TelegramChannelService.recordWebhookSeen(matched.id);

    const normalized = normalizeUpdate(update);
    if (!normalized) return res.status(200).json(ACK);

    // Idempotency on update_id.
    const payloadHash = createHash("sha256").update(JSON.stringify(update)).digest("hex");
    try {
      await prisma.telegramWebhookEvent.create({
        data: {
          organizationId: matched.organizationId,
          channelId: matched.id,
          updateId: BigInt(update.update_id),
          eventType: normalized.messageType,
          payloadHash,
          processingStatus: "RECEIVED",
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") return res.status(200).json(ACK); // duplicate redelivery
      logger.error("telegram webhook could not persist event", { err: e?.message });
      return res.status(200).json(ACK);
    }

    // Persist the inbound message row (idempotent on telegram update id).
    let chat = await prisma.telegramChat.findUnique({
      where: { channelId_telegramChatId: { channelId: matched.id, telegramChatId: BigInt(normalized.telegramChatId) } },
    });
    if (!chat) {
      chat = await prisma.telegramChat.create({
        data: { organizationId: matched.organizationId, channelId: matched.id, telegramChatId: BigInt(normalized.telegramChatId), chatType: normalized.chatType },
      }).catch(async () => prisma.telegramChat.findUniqueOrThrow({ where: { channelId_telegramChatId: { channelId: matched.id, telegramChatId: BigInt(normalized.telegramChatId) } } }));
    }

    await prisma.telegramMessage.create({
      data: {
        organizationId: matched.organizationId, channelId: matched.id, chatId: chat.id,
        telegramUpdateId: BigInt(update.update_id),
        telegramMessageId: BigInt(normalized.telegramMessageId),
        direction: "INBOUND", messageType: normalized.messageType, text: normalized.text,
        mediaId: normalized.mediaFileId, mimeType: normalized.mimeType, fileSize: normalized.fileSize ?? null,
        metadata: (normalized.metadata ?? {}) as any,
        status: "DELIVERED", deliveredAt: new Date(normalized.timestamp * 1000),
      },
    }).catch((e) => { if (e?.code !== "P2002") throw e; });

    await TelegramQueue.enqueue({
      eventRowId: update.update_id.toString(),
      updateId: update.update_id,
      organizationId: matched.organizationId,
      channelId: matched.id,
      message: normalized,
    });

    return res.status(200).json({ ok: true, queued: 1 });
  });
}
