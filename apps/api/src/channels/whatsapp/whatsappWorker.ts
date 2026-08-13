/**
 * WhatsApp background worker (Phase 1 §16).
 *
 * The webhook only persists a WhatsAppWebhookEvent audit row and enqueues the
 * normalised event. This worker performs the expensive part — orchestration,
 * AI generation and the outbound send — outside the request/response cycle so
 * Meta always gets a fast 200.
 */
import { prisma } from "../../db/client.js";
import { logger } from "../../observability/logger.js";
import { WhatsAppQueue, type QueuedJob } from "./whatsappQueue.js";
import { WhatsAppPipeline } from "./whatsappPipeline.js";
import { WhatsAppMessageService } from "./whatsappMessage.service.js";
import { emitKernelEvent } from "./whatsappKernel.js";

/** Upper bound on events handled per tick so one tick can't monopolise the loop. */
const MAX_PER_TICK = 10;

async function markEvent(
  eventRowId: string,
  status: "PROCESSING" | "PROCESSED" | "FAILED" | "IGNORED",
  error?: string | null,
): Promise<void> {
  await prisma.whatsAppWebhookEvent.update({
    where: { id: eventRowId },
    data: {
      processingStatus: status as any,
      ...(status === "PROCESSING" ? { attempts: { increment: 1 } } : {}),
      ...(status === "PROCESSED" ? { processedAt: new Date() } : {}),
      ...(error !== undefined ? { errorMessage: error ? error.slice(0, 500) : null } : {}),
    },
  }).catch((e: any) => {
    // The audit row failing to update must not abort processing.
    logger.warn("whatsapp: could not update webhook event row", { eventRowId, err: e?.message });
  });
}

/**
 * Processes exactly one queued job.
 * Returns true when the job reached a terminal state (no retry needed).
 */
export async function processQueuedJob(job: QueuedJob): Promise<boolean> {
  await markEvent(job.eventRowId, "PROCESSING");
  const parsed = job.event;

  try {
    if (parsed.kind === "message") {
      const result = await WhatsAppPipeline.processInboundMessage(parsed);

      if (result.status === "failed") {
        await markEvent(job.eventRowId, "FAILED", result.reason ?? "pipeline failure");
        // Config/provider problems are not fixed by retrying the same event.
        const permanent = result.reason === "AI_PROVIDER_CONFIGURATION_REQUIRED"
          || result.reason === "could not bind a WINDELS conversation";
        return permanent;
      }
      if (result.status === "ignored" || result.status === "rate_limited") {
        await markEvent(job.eventRowId, "IGNORED", result.reason ?? null);
        return true;
      }
      await markEvent(job.eventRowId, "PROCESSED", null);
      return true;
    }

    if (parsed.kind === "status") {
      // ── Step 15: delivery status tracking ────────────────────────────
      await WhatsAppMessageService.applyStatusUpdate({
        whatsappMessageId: parsed.messageId,
        status: parsed.status,
        timestamp: parsed.timestamp,
        errorCode: parsed.errorCode,
        errorMessage: parsed.errorMessage,
      });
      await markEvent(job.eventRowId, "PROCESSED", null);
      return true;
    }

    // Unknown change types (account updates, template status, quality
    // signals). Recorded and surfaced, never silently discarded.
    logger.info("whatsapp non-message event observed", { field: parsed.field });
    await emitKernelEvent("whatsapp.event.unhandled", { field: parsed.field });
    await markEvent(job.eventRowId, "IGNORED", `Unhandled field: ${parsed.field}`);
    return true;
  } catch (e: any) {
    logger.error("whatsapp event processing error", {
      eventRowId: job.eventRowId, kind: parsed.kind, err: e?.message,
    });
    await markEvent(job.eventRowId, "FAILED", e?.message ?? "unknown error");
    return false; // Transient — let the queue retry.
  }
}

/**
 * Drains up to MAX_PER_TICK queued jobs.
 * Never throws — the caller is an interval timer.
 */
export async function runWhatsAppWorkerTick(): Promise<{ handled: number; failed: number }> {
  let handled = 0;
  let failed = 0;

  for (let i = 0; i < MAX_PER_TICK; i++) {
    let job: QueuedJob | null = null;
    try {
      job = await WhatsAppQueue.claim();
    } catch (e: any) {
      // Redis unavailable — stop quietly; the next tick retries.
      logger.warn("whatsapp queue claim failed", { err: e?.message });
      break;
    }
    if (!job) break;

    try {
      const done = await processQueuedJob(job);
      if (done) {
        await WhatsAppQueue.release(job);
        handled++;
      } else {
        await WhatsAppQueue.retryOrPark(job);
        failed++;
      }
    } catch (e: any) {
      logger.error("whatsapp worker tick error", { eventRowId: job.eventRowId, err: e?.message });
      await WhatsAppQueue.retryOrPark(job).catch(() => { /* best effort */ });
      failed++;
    }
  }

  return { handled, failed };
}

/**
 * Starts the periodic worker. Returns a stop function.
 * The interval is unref'd so it never holds the process open.
 */
export function startWhatsAppWorker(intervalMs = 2000): () => void {
  const timer = setInterval(() => {
    runWhatsAppWorkerTick().catch((e) => logger.warn("whatsapp worker tick failed", { err: e?.message }));
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
