/**
 * Lightweight in-process event bus — serves as the MVPs "microservice" message
 * backbone. Later sessions can swap handlers for out-of-process workers/queues
 * without changing the event names or payload shapes.
 */
type Handler = (payload: any) => void | Promise<void>;

const listeners = new Map<string, Set<Handler>>();

export const EventBus = {
  on(event: string, handler: Handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
    return () => EventBus.off(event, handler);
  },
  off(event: string, handler: Handler) {
    listeners.get(event)?.delete(handler);
  },
  async emit(event: string, payload: any) {
    const set = listeners.get(event);
    const star = listeners.get("*");
    const all: Array<() => Promise<void>> = [];
    if (set) for (const h of set) all.push(() => Promise.resolve(h(payload)).catch((e) => console.warn(`[eventBus] ${event} handler failed:`, e?.message)));
    if (star) for (const h of star) all.push(() => Promise.resolve(h({ event, payload })).catch((e) => console.warn(`[eventBus] * handler failed:`, e?.message)));
    // Run handlers concurrently but don't await them here — fire-and-forget
    await Promise.all(all.map((f) => f()));
  },
};

// Known event names (central catalogue — avoids typos)
export const Events = {
  AI_REQUEST: "ai.request",
  AI_RESPONSE: "ai.response",
  AI_ERROR: "ai.error",
  WORKFLOW_RUN_STARTED: "workflow.run.started",
  WORKFLOW_RUN_SUCCEEDED: "workflow.run.succeeded",
  WORKFLOW_RUN_FAILED: "workflow.run.failed",
  MESSAGE_CREATED: "message.created",
  TASK_CREATED: "task.created",
  TASK_COMPLETED: "task.completed",
  PLUGIN_INSTALLED: "plugin.installed",
  INTEGRATION_CONNECTED: "integration.connected",
  USER_JOINED: "user.joined",
  // AI Commerce — WMPC-originated marketplace events (§18)
  COMMERCE_PAYMENT_COMPLETED: "commerce.payment.completed",
  COMMERCE_PAYMENT_FAILED: "commerce.payment.failed",
  COMMERCE_ORDER_CREATED: "commerce.order.created",
  COMMERCE_ORDER_UPDATED: "commerce.order.updated",
  COMMERCE_ORDER_SHIPPED: "commerce.order.shipped",
  COMMERCE_ORDER_DELIVERED: "commerce.order.delivered",
  COMMERCE_ORDER_CANCELLED: "commerce.order.cancelled",
  COMMERCE_REFUND_COMPLETED: "commerce.refund.completed",
  COMMERCE_GIFTCARD_APPLIED: "commerce.giftcard.applied",
  COMMERCE_CHECKOUT_COMPLETED: "commerce.checkout.completed",
} as const;
