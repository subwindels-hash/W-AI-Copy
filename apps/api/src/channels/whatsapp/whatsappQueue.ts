/**
 * Redis-backed work queue for WhatsApp inbound processing.
 *
 * The webhook must acknowledge Meta within seconds or delivery is retried and
 * eventually the subscription is disabled, so NO AI work happens in the
 * request. The handler validates, records and enqueues; a worker tick drains
 * the queue out-of-band.
 *
 * Follows the same Redis queue idiom as mediaGen.service.ts (LIST work queue +
 * counters) rather than introducing a new queue technology.
 *
 * The job carries the ALREADY-NORMALISED event, not the raw Meta payload:
 * WhatsAppWebhookEvent stores only a hash, so the transient Redis job is the
 * only place the envelope lives, and it disappears once processed.
 *
 * Keys:
 *   wa:queue:pending          LIST  — serialised jobs (FIFO)
 *   wa:queue:inflight:{id}    STRING with TTL — crash/duplicate guard
 *   wa:queue:attempts:{id}    STRING — retry counter
 *   wa:queue:dlq              LIST  — jobs that exhausted their retries
 */
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import type { ParsedWhatsAppEvent } from "./whatsappPayload.js";

const K = {
  pending: "wa:queue:pending",
  inflight: (id: string) => `wa:queue:inflight:${id}`,
  attempts: (id: string) => `wa:queue:attempts:${id}`,
  dlq: "wa:queue:dlq",
};

/** Max processing attempts before an event is parked in the DLQ. */
export const MAX_ATTEMPTS = 3;
/** How long a claimed item may stay in flight before it can be reclaimed. */
const INFLIGHT_TTL_SECONDS = 300;

export interface QueuedJob {
  /** WhatsAppWebhookEvent.id — the durable audit anchor. */
  eventRowId: string;
  /** Deduplication key, mirrors WhatsAppWebhookEvent.eventId. */
  eventId: string;
  /** The normalised event to act on. */
  event: ParsedWhatsAppEvent;
}

function serialize(job: QueuedJob): string {
  return JSON.stringify(job);
}

function deserialize(raw: string): QueuedJob | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.eventRowId || !parsed?.event?.kind) return null;
    // Dates survive JSON as ISO strings; restore them for the pipeline.
    if (parsed.event.timestamp) parsed.event.timestamp = new Date(parsed.event.timestamp);
    return parsed as QueuedJob;
  } catch {
    return null;
  }
}

export const WhatsAppQueue = {
  async enqueue(job: QueuedJob): Promise<void> {
    await redis.rpush(K.pending, serialize(job));
  },

  async depth(): Promise<number> {
    try {
      return await redis.llen(K.pending);
    } catch {
      return 0;
    }
  },

  async dlqDepth(): Promise<number> {
    try {
      return await redis.llen(K.dlq);
    } catch {
      return 0;
    }
  },

  /** Pops the next job, claiming it so a concurrent worker can't double-process. */
  async claim(): Promise<QueuedJob | null> {
    const raw = await redis.lpop(K.pending);
    if (!raw) return null;
    const job = deserialize(raw);
    if (!job) {
      logger.warn("whatsapp queue: discarding unparseable job");
      return null;
    }
    const key = K.inflight(job.eventRowId);
    const already = await redis.get(key);
    if (already) {
      // Another worker holds it; drop this copy rather than duplicating work.
      return null;
    }
    await redis.set(key, "1", "EX", INFLIGHT_TTL_SECONDS);
    return job;
  },

  async release(job: QueuedJob): Promise<void> {
    await redis.del(K.inflight(job.eventRowId));
    await redis.del(K.attempts(job.eventRowId));
  },

  /**
   * Records a failed attempt. Re-queues while attempts remain, otherwise moves
   * the job to the dead-letter list so it is inspectable instead of lost.
   */
  async retryOrPark(job: QueuedJob): Promise<{ requeued: boolean; attempts: number }> {
    const id = job.eventRowId;
    await redis.del(K.inflight(id));
    const attempts = await redis.incr(K.attempts(id));
    await redis.expire(K.attempts(id), 3600);
    if (attempts < MAX_ATTEMPTS) {
      await redis.rpush(K.pending, serialize(job));
      return { requeued: true, attempts };
    }
    await redis.rpush(K.dlq, serialize(job));
    await redis.del(K.attempts(id));
    logger.error("whatsapp event parked in DLQ", { eventRowId: id, attempts });
    return { requeued: false, attempts };
  },

  /** Drains the DLQ back into the pending queue (admin recovery action). */
  async replayDlq(limit = 50): Promise<number> {
    let moved = 0;
    for (let i = 0; i < limit; i++) {
      const raw = await redis.lpop(K.dlq);
      if (!raw) break;
      await redis.rpush(K.pending, raw);
      moved++;
    }
    return moved;
  },
};
