/**
 * WMPC event consumer (§18, §19, §20).
 *
 * WMPC pushes marketplace events to WINDELS; WINDELS reacts (notify the user,
 * update conversation context, record analytics, audit). It never treats an
 * event as permission to change a financial fact — the event REPORTS what WMPC
 * already decided.
 *
 * Security layers applied to every inbound event, in order:
 *   1. signature   — HMAC-SHA256 over the raw body with WMPC_WEBHOOK_SECRET
 *   2. timestamp   — must be inside the freshness window (anti-replay)
 *   3. schema      — parsed and validated; never trusted as-is
 *   4. event id    — dedupe/replay protection via a Redis-backed seen-set
 *   5. idempotency — a duplicate id is acknowledged but not re-processed
 *   6. audit       — accepted and rejected events are both recorded
 *
 * The endpoint returns 2xx quickly and never performs expensive AI work inline,
 * matching the platform's existing webhook conventions.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  wmpcEventEnvelopeSchema,
  type WmpcEventEnvelope,
  type WmpcEventType,
} from "@windels/shared";
import { env } from "../../config/env.js";
import { redis } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import { EventBus, Events } from "../../services/eventBus.js";

/** Events older than this are rejected as replays. */
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
/** How long a processed event id is remembered. */
const EVENT_ID_TTL_SECONDS = 24 * 60 * 60;

const seenInMemory = new Map<string, number>();

function seenKey(eventId: string): string {
  return `commerce:wmpc:evt:${eventId}`;
}

/** Constant-time comparison that tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so length is not a timing oracle.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export type WmpcEventRejection =
  | "not_configured"
  | "missing_signature"
  | "invalid_signature"
  | "missing_timestamp"
  | "stale_timestamp"
  | "invalid_payload";

export type WmpcEventOutcome =
  | { accepted: true; duplicate: boolean; event: WmpcEventEnvelope }
  | { accepted: false; reason: WmpcEventRejection; detail?: string };

/** EventBus name for each WMPC event type. */
const BUS_EVENT: Record<WmpcEventType, string> = {
  "payment.completed": Events.COMMERCE_PAYMENT_COMPLETED,
  "payment.failed": Events.COMMERCE_PAYMENT_FAILED,
  "order.created": Events.COMMERCE_ORDER_CREATED,
  "order.updated": Events.COMMERCE_ORDER_UPDATED,
  "order.shipped": Events.COMMERCE_ORDER_SHIPPED,
  "order.delivered": Events.COMMERCE_ORDER_DELIVERED,
  "order.cancelled": Events.COMMERCE_ORDER_CANCELLED,
  "refund.completed": Events.COMMERCE_REFUND_COMPLETED,
  "giftcard.applied": Events.COMMERCE_GIFTCARD_APPLIED,
  "checkout.completed": Events.COMMERCE_CHECKOUT_COMPLETED,
};

async function markSeen(eventId: string): Promise<boolean> {
  const key = seenKey(eventId);
  try {
    // Read-then-NX. The NX still wins the race on a real Redis; the explicit
    // read additionally covers clients whose SET ignores the NX flag.
    const already = await redis.get(key);
    if (already) return false;
    const result = await redis.set(key, "1", "EX", EVENT_ID_TTL_SECONDS, "NX");
    if (result === "OK") return true;
    if (result === null) return false;
  } catch (err) {
    logger.debug("[aiCommerce] event dedupe fell back to memory", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  const now = Date.now();
  for (const [k, expiry] of seenInMemory) if (expiry <= now) seenInMemory.delete(k);
  if (seenInMemory.has(key)) return false;
  seenInMemory.set(key, now + EVENT_ID_TTL_SECONDS * 1000);
  return true;
}

async function audit(
  action: "commerce.webhook_received" | "commerce.webhook_rejected",
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const { auditService } = await import("../../audit/audit.service.js");
    await auditService.log({ action, resourceType: "custom", metadata });
  } catch (err) {
    logger.warn("[aiCommerce] webhook audit failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const wmpcEventConsumer = {
  /**
   * Verify the HMAC signature over the RAW request body.
   *
   * The signed material is `${timestamp}.${rawBody}` so the timestamp cannot be
   * altered independently of the payload.
   */
  verifySignature(rawBody: string, signature: string, timestamp: string): boolean {
    const secret = env.WMPC_WEBHOOK_SECRET;
    if (!secret) return false;
    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;
    return safeEqual(provided, expected);
  },

  /**
   * Full inbound pipeline. Returns an outcome; the route turns it into a
   * status code. Never throws.
   */
  async handleInbound(input: {
    rawBody: string;
    signature?: string;
    timestamp?: string;
    parsedBody?: unknown;
  }): Promise<WmpcEventOutcome> {
    // 1. Configuration. Without a secret we cannot verify anything, so we
    //    refuse rather than accept unverified financial events.
    if (!env.WMPC_WEBHOOK_SECRET) {
      logger.error("[aiCommerce] WMPC webhook received but WMPC_WEBHOOK_SECRET is not configured — rejecting");
      await audit("commerce.webhook_rejected", { reason: "not_configured" });
      return { accepted: false, reason: "not_configured" };
    }

    if (!input.signature) {
      await audit("commerce.webhook_rejected", { reason: "missing_signature" });
      return { accepted: false, reason: "missing_signature" };
    }
    if (!input.timestamp) {
      await audit("commerce.webhook_rejected", { reason: "missing_timestamp" });
      return { accepted: false, reason: "missing_timestamp" };
    }

    // 2. Timestamp freshness — checked before the HMAC so an old-but-valid
    //    capture cannot be replayed indefinitely.
    const ts = Number.isFinite(Number(input.timestamp))
      ? Number(input.timestamp) * (String(input.timestamp).length <= 10 ? 1000 : 1)
      : Date.parse(input.timestamp);
    if (!Number.isFinite(ts)) {
      await audit("commerce.webhook_rejected", { reason: "missing_timestamp" });
      return { accepted: false, reason: "missing_timestamp" };
    }
    if (Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) {
      await audit("commerce.webhook_rejected", { reason: "stale_timestamp", skewMs: Date.now() - ts });
      return { accepted: false, reason: "stale_timestamp" };
    }

    // 3. Signature.
    if (!this.verifySignature(input.rawBody, input.signature, input.timestamp)) {
      logger.warn("[aiCommerce] WMPC webhook signature verification FAILED");
      await audit("commerce.webhook_rejected", { reason: "invalid_signature" });
      return { accepted: false, reason: "invalid_signature" };
    }

    // 4. Schema. Incoming data is never trusted as-is.
    let payload: unknown = input.parsedBody;
    if (payload === undefined) {
      try {
        payload = JSON.parse(input.rawBody);
      } catch {
        await audit("commerce.webhook_rejected", { reason: "invalid_payload", detail: "not json" });
        return { accepted: false, reason: "invalid_payload", detail: "Body is not valid JSON" };
      }
    }

    const parsed = wmpcEventEnvelopeSchema.safeParse(payload);
    if (!parsed.success) {
      await audit("commerce.webhook_rejected", {
        reason: "invalid_payload",
        detail: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`),
      });
      return { accepted: false, reason: "invalid_payload", detail: "Envelope failed validation" };
    }

    const event = parsed.data as WmpcEventEnvelope;

    // 5. Replay / idempotency by event id.
    const isNew = await markSeen(event.id);
    if (!isNew) {
      logger.info("[aiCommerce] duplicate WMPC event ignored", { eventId: event.id, type: event.type });
      await audit("commerce.webhook_received", { eventId: event.id, type: event.type, duplicate: true });
      return { accepted: true, duplicate: true, event };
    }

    await audit("commerce.webhook_received", {
      eventId: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      orderId: event.orderId,
      checkoutId: event.checkoutId,
    });

    // 6. Dispatch onto the existing EventBus. Handlers are fire-and-forget so
    //    the webhook response stays fast; no AI work happens on this path.
    void this.dispatch(event);

    return { accepted: true, duplicate: false, event };
  },

  /** Publish a verified event onto the platform event bus. */
  async dispatch(event: WmpcEventEnvelope): Promise<void> {
    const busEvent = BUS_EVENT[event.type];
    if (!busEvent) {
      logger.warn("[aiCommerce] no bus mapping for WMPC event type", { type: event.type });
      return;
    }
    try {
      await EventBus.emit(busEvent, {
        eventId: event.id,
        type: event.type,
        occurredAt: event.occurredAt,
        customerId: event.customerId,
        orderId: event.orderId,
        checkoutId: event.checkoutId,
        paymentId: event.paymentId,
        data: event.data,
      });
      logger.info("[aiCommerce] WMPC event dispatched", { eventId: event.id, type: event.type, busEvent });
    } catch (err) {
      logger.error("[aiCommerce] WMPC event dispatch failed", {
        eventId: event.id,
        type: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  /** Test seam. */
  __resetSeen(): void {
    seenInMemory.clear();
  },
};

export default wmpcEventConsumer;
