/**
 * Redis-backed work queue for Telegram inbound processing (§22).
 *
 * The webhook validates, deduplicates and enqueues quickly; a worker drains
 * the queue and performs AI/orchestration work. Same Redis LIST + inflight
 * idiom used by the WhatsApp channel.
 */
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../config/logger.js";

export interface QueuedTelegramJob {
  eventRowId: string;
  updateId: number;
  organizationId: string;
  channelId: string;
  /** Normalized inbound message (already validated). */
  message: {
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
  };
}

const K = {
  pending: "tg:queue:pending",
  inflight: (id: string) => `tg:queue:inflight:${id}`,
  attempts: (id: string) => `tg:queue:attempts:${id}`,
  dlq: "tg:queue:dlq",
};
const MAX_ATTEMPTS = 3;
const INFLIGHT_TTL = 300;

function ser(j: QueuedTelegramJob): string { return JSON.stringify(j); }
function des(s: string): QueuedTelegramJob | null {
  try { return JSON.parse(s) as QueuedTelegramJob; } catch { return null; }
}

export const TelegramQueue = {
  async enqueue(job: QueuedTelegramJob): Promise<void> { await redis.rpush(K.pending, ser(job)); },
  async depth(): Promise<number> { try { return await redis.llen(K.pending); } catch { return 0; } },

  async claim(): Promise<QueuedTelegramJob | null> {
    const raw = await redis.lpop(K.pending);
    if (!raw) return null;
    const job = des(raw);
    if (!job) { logger.warn("telegram queue: discarding unparseable job"); return null; }
    const key = K.inflight(job.eventRowId);
    if (await redis.get(key)) return null;
    await redis.set(key, "1", "EX", INFLIGHT_TTL);
    return job;
  },

  async release(job: QueuedTelegramJob): Promise<void> {
    await redis.del(K.inflight(job.eventRowId));
    await redis.del(K.attempts(job.eventRowId));
  },

  async retryOrPark(job: QueuedTelegramJob): Promise<{ requeued: boolean; attempts: number }> {
    const id = job.eventRowId;
    await redis.del(K.inflight(id));
    const attempts = await redis.incr(K.attempts(id));
    await redis.expire(K.attempts(id), 3600);
    if (attempts < MAX_ATTEMPTS) {
      await redis.rpush(K.pending, ser(job));
      return { requeued: true, attempts };
    }
    await redis.rpush(K.dlq, ser(job));
    logger.error("telegram queue job moved to DLQ", { eventRowId: id, attempts });
    return { requeued: false, attempts };
  },

  async dlqDepth(): Promise<number> { try { return await redis.llen(K.dlq); } catch { return 0; } },
};
