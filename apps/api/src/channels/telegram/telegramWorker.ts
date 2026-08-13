/**
 * Telegram worker — drains the Redis queue out-of-band from the webhook and
 * runs the inbound pipeline through the existing AI infrastructure.
 */
import { prisma } from "../../db/client.js";
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { TelegramChannelService } from "./telegramChannel.service.js";
import { TelegramIdentityService } from "./telegramIdentity.service.js";
import { TelegramPipeline } from "./telegramPipeline.js";
import { TelegramQueue, type QueuedTelegramJob } from "./telegramQueue.js";

let running = false;
let timer: NodeJS.Timeout | null = null;

export const TelegramWorker = {
  start(intervalMs = 2000) {
    if (running) return;
    running = true;
    const tick = async () => {
      if (!running) return;
      try { await this.drain(); } catch (e) { logger.warn("telegram worker tick failed", { err: (e as Error).message }); }
      if (running) timer = setTimeout(tick, intervalMs);
    };
    void tick();
    logger.info("telegram worker started");
  },
  stop() {
    running = false;
    if (timer) clearTimeout(timer);
  },

  async drain() {
    let job: QueuedTelegramJob | null;
    while ((job = await TelegramQueue.claim())) {
      try {
        const channel = await prisma.telegramChannel.findUnique({ where: { id: job.channelId } });
        if (!channel) { await TelegramQueue.release(job); continue; }

        const msg = job.message;
        const identity = await TelegramIdentityService.resolveConnection(channel, { id: Number(msg.telegramUserId), username: msg.username, first_name: msg.displayName });
        const result = await TelegramPipeline.process({
          channel,
          identity,
          chat: { id: msg.telegramChatId, type: msg.chatType, title: undefined },
          message: {
            id: msg.telegramMessageId,
            text: msg.text,
            media: msg.mediaFileId ? { fileId: msg.mediaFileId, mimeType: msg.mimeType, fileName: (msg.metadata as any)?.filename, caption: msg.caption, kind: msg.messageType } : undefined,
          },
        });
        await TelegramQueue.release(job);
        await prisma.telegramWebhookEvent.update({ where: { updateId: BigInt(job.updateId) }, data: { processingStatus: result.status === "processed" ? "COMPLETED" : "IGNORED", processedAt: new Date(), ...(result.reason ? { error: result.reason } : {}) } }).catch(() => {});
        await TelegramChannelService.recordWebhookSeen(channel.id).catch(() => {});
        logger.info("telegram update processed", { updateId: job.updateId, status: result.status });
      } catch (e: any) {
        logger.error("telegram worker job failed", { updateId: job.updateId, err: e?.message });
        const { requeued } = await TelegramQueue.retryOrPark(job);
        if (!requeued) {
          await prisma.telegramWebhookEvent.update({ where: { updateId: BigInt(job.updateId) }, data: { processingStatus: "FAILED", error: String(e?.message ?? e).slice(0, 1000) } }).catch(() => {});
        }
      }
    }
  },
};

void redis; // reserved for future pub/sub wake
