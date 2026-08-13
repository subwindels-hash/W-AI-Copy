/**
 * AI Commerce analytics (§28).
 *
 * Eleven named events, emitted through the EXISTING events/analytics pipeline.
 * This is not a second analytics platform — it is a thin, typed helper that
 * ensures the commerce events are named consistently and never carry payment
 * credentials, tokens or raw PII (§31).
 */
import { logger } from "../observability/logger.js";

/** The 11 analytics events required by §28. */
export const COMMERCE_ANALYTICS_EVENTS = [
  "commerce.search_performed",
  "commerce.product_viewed",
  "commerce.recommendation_shown",
  "commerce.comparison_requested",
  "commerce.image_search_performed",
  "commerce.voice_command_received",
  "commerce.cart_updated",
  "commerce.checkout_started",
  "commerce.payment_completed",
  "commerce.order_tracked",
  "commerce.support_requested",
] as const;
export type CommerceAnalyticsEvent = (typeof COMMERCE_ANALYTICS_EVENTS)[number];

/**
 * Additional event names emitted by the WMPC event consumer. These mirror
 * marketplace lifecycle events rather than user actions.
 */
export type CommerceLifecycleEvent =
  | "commerce.payment_failed"
  | "commerce.order_created"
  | "commerce.order_updated"
  | "commerce.order_shipped"
  | "commerce.order_delivered"
  | "commerce.order_cancelled"
  | "commerce.refund_completed"
  | "commerce.giftcard_applied"
  | "commerce.checkout_completed";

export type AnyCommerceEvent = CommerceAnalyticsEvent | CommerceLifecycleEvent;

/**
 * Property keys that must never reach analytics storage. Values under these
 * keys are dropped, not masked, so they cannot be reconstructed.
 */
const FORBIDDEN_KEYS = new Set([
  "cardNumber", "card_number", "pan", "cvv", "cvc", "expiry",
  "password", "token", "accessToken", "access_token", "apiKey", "api_key",
  "secret", "authorization", "signature", "giftCardCode", "gift_card_code",
  "code", "email", "phone", "phoneNumber", "address",
]);

function sanitize(properties: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!properties) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    if (v === undefined || v === null) continue;
    // Only scalars and small arrays of scalars are recorded.
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = typeof v === "string" && v.length > 200 ? `${v.slice(0, 200)}…` : v;
    } else if (Array.isArray(v) && v.length <= 25) {
      out[k] = v.filter((x) => typeof x === "string" || typeof x === "number").slice(0, 25);
    }
  }
  return out;
}

export interface CommerceAnalyticsContext {
  organizationId?: string;
  userId?: string;
  sessionId?: string;
  agentId?: string;
  channel?: string;
  correlationId?: string;
  properties?: Record<string, unknown>;
}

/**
 * Record a commerce analytics event. Never throws — analytics failures must
 * not break a shopping flow.
 */
export async function recordCommerceAnalytics(
  event: AnyCommerceEvent,
  ctx: CommerceAnalyticsContext = {},
): Promise<void> {
  const payload = {
    ...sanitize(ctx.properties),
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
    ...(ctx.agentId ? { agentId: ctx.agentId } : {}),
    ...(ctx.channel ? { channel: ctx.channel } : {}),
    ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
  };

  logger.info(`[aiCommerce] analytics ${event}`, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    ...payload,
  });

  if (!ctx.organizationId) return; // The events store is organization-scoped.

  try {
    const { EventsService } = await import("../events/events.service.js");
    await EventsService.recordEvent({
      id: `${event}:${Date.now()}:${Math.trunc(performance.now() * 1000)}`,
      event,
      organizationId: ctx.organizationId,
      timestamp: new Date().toISOString(),
      data: { ...payload, ...(ctx.userId ? { userId: ctx.userId } : {}) },
    });
  } catch (err) {
    logger.debug("[aiCommerce] analytics recording skipped", {
      event,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
