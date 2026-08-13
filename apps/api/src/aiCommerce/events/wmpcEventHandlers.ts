/**
 * Handlers for verified WMPC events (§18).
 *
 * What a handler MAY do:
 *   - update the AI's conversation/session pointers so the next turn is aware
 *   - emit an analytics event (§28)
 *   - raise a notification through the EXISTING notification system
 *   - write an audit record
 *
 * What a handler MUST NOT do:
 *   - write a second copy of the order, payment or ledger
 *   - decide that a payment succeeded (only WMPC decides that; we relay it)
 *   - run expensive AI work inline
 */
import type { WmpcEventType } from "@windels/shared";
import { logger } from "../../observability/logger.js";
import { EventBus, Events } from "../../services/eventBus.js";
import { recordCommerceAnalytics } from "../commerceAnalytics.service.js";

export interface WmpcBusPayload {
  eventId: string;
  type: WmpcEventType;
  occurredAt: string;
  customerId?: string;
  orderId?: string;
  checkoutId?: string;
  paymentId?: string;
  data: Record<string, unknown>;
}

/** Extract an organization id if WMPC supplied one; otherwise undefined. */
function orgIdOf(payload: WmpcBusPayload): string | undefined {
  const raw = payload.data?.organizationId ?? payload.data?.organization_id;
  return typeof raw === "string" && raw ? raw : undefined;
}

function userIdOf(payload: WmpcBusPayload): string | undefined {
  const raw = payload.data?.windelsUserId ?? payload.data?.userId;
  return typeof raw === "string" && raw ? raw : undefined;
}

async function notify(
  payload: WmpcBusPayload,
  title: string,
  body: string,
): Promise<void> {
  const organizationId = orgIdOf(payload);
  const userId = userIdOf(payload);
  if (!organizationId || !userId) {
    // Without a resolved WINDELS identity we must not broadcast marketplace
    // details to anyone — silently skip rather than guess a recipient.
    logger.debug("[aiCommerce] event has no resolved WINDELS recipient; not notifying", {
      eventId: payload.eventId,
      type: payload.type,
    });
    return;
  }
  try {
    const { notificationsService } = await import("../../notifications/notifications.service.js");
    await (notificationsService as any).create?.({
      organizationId,
      userId,
      type: "commerce",
      title,
      body,
      metadata: { eventId: payload.eventId, orderId: payload.orderId, source: "wmpc" },
    });
  } catch (err) {
    logger.debug("[aiCommerce] notification dispatch skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const HANDLERS: Array<{ event: string; handle: (payload: WmpcBusPayload) => Promise<void> }> = [
  {
    event: Events.COMMERCE_PAYMENT_COMPLETED,
    async handle(payload) {
      // We RELAY WMPC's verdict. WINDELS does not mark anything paid itself.
      logger.info("[aiCommerce] payment completed (per WMPC)", {
        eventId: payload.eventId,
        paymentId: payload.paymentId,
        orderId: payload.orderId,
      });
      await recordCommerceAnalytics("commerce.payment_completed", {
        organizationId: orgIdOf(payload),
        userId: userIdOf(payload),
        properties: { orderId: payload.orderId, paymentId: payload.paymentId, eventId: payload.eventId },
      });
      await notify(payload, "Payment confirmed", "The marketplace has confirmed your payment.");
    },
  },
  {
    event: Events.COMMERCE_PAYMENT_FAILED,
    async handle(payload) {
      const reason = typeof payload.data?.reason === "string" ? payload.data.reason : undefined;
      logger.warn("[aiCommerce] payment failed (per WMPC)", {
        eventId: payload.eventId,
        paymentId: payload.paymentId,
        reason,
      });
      await recordCommerceAnalytics("commerce.payment_failed", {
        organizationId: orgIdOf(payload),
        userId: userIdOf(payload),
        properties: { paymentId: payload.paymentId, reason, eventId: payload.eventId },
      });
      await notify(
        payload,
        "Payment could not be completed",
        reason ? `The marketplace reported: ${reason}` : "The marketplace could not complete your payment.",
      );
    },
  },
  {
    event: Events.COMMERCE_ORDER_CREATED,
    async handle(payload) {
      await recordCommerceAnalytics("commerce.order_created", {
        organizationId: orgIdOf(payload),
        userId: userIdOf(payload),
        properties: { orderId: payload.orderId, eventId: payload.eventId },
      });
      await notify(payload, "Order placed", "Your marketplace order has been created.");
    },
  },
  {
    event: Events.COMMERCE_ORDER_UPDATED,
    async handle(payload) {
      await recordCommerceAnalytics("commerce.order_updated", {
        organizationId: orgIdOf(payload),
        userId: userIdOf(payload),
        properties: { orderId: payload.orderId, status: payload.data?.status, eventId: payload.eventId },
      });
    },
  },
  {
    event: Events.COMMERCE_ORDER_SHIPPED,
    async handle(payload) {
      await recordCommerceAnalytics("commerce.order_shipped", {
        organizationId: orgIdOf(payload),
        userId: userIdOf(payload),
        properties: { orderId: payload.orderId, eventId: payload.eventId },
      });
      await notify(payload, "Order shipped", "Your order has been shipped by the marketplace.");
    },
  },
  {
    event: Events.COMMERCE_ORDER_DELIVERED,
    async handle(payload) {
      await recordCommerceAnalytics("commerce.order_delivered", {
        organizationId: orgIdOf(payload),
        userId: userIdOf(payload),
        properties: { orderId: payload.orderId, eventId: payload.eventId },
      });
      await notify(payload, "Order delivered", "The marketplace has marked your order delivered.");
    },
  },
  {
    event: Events.COMMERCE_ORDER_CANCELLED,
    async handle(payload) {
      await recordCommerceAnalytics("commerce.order_cancelled", {
        organizationId: orgIdOf(payload),
        userId: userIdOf(payload),
        properties: { orderId: payload.orderId, eventId: payload.eventId },
      });
      await notify(payload, "Order cancelled", "Your marketplace order was cancelled.");
    },
  },
  {
    event: Events.COMMERCE_REFUND_COMPLETED,
    async handle(payload) {
      await recordCommerceAnalytics("commerce.refund_completed", {
        organizationId: orgIdOf(payload),
        userId: userIdOf(payload),
        properties: { orderId: payload.orderId, eventId: payload.eventId },
      });
      await notify(payload, "Refund completed", "The marketplace has completed your refund.");
    },
  },
  {
    event: Events.COMMERCE_GIFTCARD_APPLIED,
    async handle(payload) {
      await recordCommerceAnalytics("commerce.giftcard_applied", {
        organizationId: orgIdOf(payload),
        userId: userIdOf(payload),
        properties: { checkoutId: payload.checkoutId, eventId: payload.eventId },
      });
    },
  },
  {
    event: Events.COMMERCE_CHECKOUT_COMPLETED,
    async handle(payload) {
      await recordCommerceAnalytics("commerce.checkout_completed", {
        organizationId: orgIdOf(payload),
        userId: userIdOf(payload),
        properties: { checkoutId: payload.checkoutId, orderId: payload.orderId, eventId: payload.eventId },
      });
    },
  },
];

let registered = false;

/** Subscribe all commerce event handlers to the shared EventBus. */
export function registerWmpcEventHandlers(): void {
  if (registered) return;
  for (const { event, handle } of HANDLERS) {
    EventBus.on(event, (payload: WmpcBusPayload) => {
      handle(payload).catch((err) => {
        logger.error("[aiCommerce] WMPC event handler failed", {
          event,
          eventId: payload?.eventId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
  }
  registered = true;
  logger.info(`[aiCommerce] registered ${HANDLERS.length} WMPC event handlers`);
}

export function __resetWmpcEventHandlerRegistration(): void {
  registered = false;
}

export const WMPC_EVENT_HANDLER_COUNT = HANDLERS.length;
