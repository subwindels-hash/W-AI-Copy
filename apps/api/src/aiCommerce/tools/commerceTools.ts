/**
 * The 17 AI Commerce tools (§4).
 *
 * These are registered into the EXISTING `ToolRegistry` — there is no second
 * tool system. Every one of them follows the same chain:
 *
 *   Agent -> Tool -> commerceGuard -> WMPC connector -> WMPC
 *
 * Hard rules enforced here:
 *   - No tool touches the database directly. Commerce data lives in WMPC.
 *   - No tool computes a price, tax, shipping amount, discount or total.
 *   - Every state-changing tool passes an idempotency key (§20).
 *   - Every tool is authorized before it acts, and a denial is returned as a
 *     failure — never as an empty result that an agent might narrate as
 *     "you have no orders".
 */
import { createHash, randomUUID } from "node:crypto";
import type {
  CommerceChannel,
  CommerceCustomerContext,
  CommerceError,
  CommerceResult,
} from "@windels/shared";
import { logger } from "../../observability/logger.js";
import {
  ToolRegistry,
  type Tool,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "../../services/tools/toolRegistry.js";
import {
  commerceGuard,
  type CommerceCapability,
  type CommerceGuardDecision,
} from "../commerceGuard.service.js";
import {
  compareProducts,
  describeProductFacts,
  intentFiltersToSearchRequest,
  rankProducts,
} from "../commerceDiscovery.service.js";
import { getWmpcConnector } from "../wmpc/connectorFactory.js";
import type { WmpcCallOptions } from "../wmpc/wmpcConnector.types.js";

const CATEGORY = "commerce";

/**
 * Explicit narrowing helpers. `apps/api` compiles with `strictNullChecks:false`,
 * under which a negated discriminant (`if (!result.ok)`) does NOT narrow a
 * union, so these predicates do the narrowing instead of a bare cast.
 */
function isCommerceFailure<T>(r: CommerceResult<T>): r is { ok: false; error: CommerceError } {
  return r.ok !== true;
}

function isGuardDenied(d: CommerceGuardDecision): d is Extract<CommerceGuardDecision, { allowed: false }> {
  return d.allowed !== true;
}

/** Build the WMPC-facing customer identity from the tool context. */
function customerContext(ctx: ToolContext, channel: CommerceChannel = "chat"): CommerceCustomerContext {
  return {
    userId: ctx.userId!,
    organizationId: ctx.organizationId!,
    channel,
  };
}

function correlationId(): string {
  return `cmrc_${randomUUID()}`;
}

/**
 * Deterministic idempotency key (§20).
 *
 * Derived from the user, the operation and its arguments, so a retry of the
 * SAME logical action reuses the key while a genuinely new action gets a new
 * one. No randomness: a random key would defeat the purpose on retry.
 */
function idempotencyKey(ctx: ToolContext, operation: string, payload: unknown): string {
  const material = JSON.stringify({
    u: ctx.userId,
    o: ctx.organizationId,
    c: ctx.conversationId ?? null,
    op: operation,
    p: payload,
  });
  return `win_${createHash("sha256").update(material).digest("hex").slice(0, 40)}`;
}

function fail(error: CommerceError): ToolResult {
  return {
    success: false,
    error: error.message,
    metadata: {
      code: error.code,
      retryable: error.retryable,
      ...(error.correlationId ? { correlationId: error.correlationId } : {}),
      ...(error.upstreamCode ? { upstreamCode: error.upstreamCode } : {}),
    },
  };
}

function ok(data: unknown, metadata?: Record<string, unknown>): ToolResult {
  return { success: true, data, ...(metadata ? { metadata } : {}) };
}

/**
 * Shared prologue for every tool: authorize, then hand over the connector and
 * a correlation id. Returns a ToolResult when the action must not proceed.
 */
async function guarded(
  capability: CommerceCapability,
  ctx: ToolContext,
  run: (args: {
    connector: Awaited<ReturnType<typeof getWmpcConnector>>;
    customer: CommerceCustomerContext;
    opts: WmpcCallOptions;
  }) => Promise<ToolResult>,
  resource?: { type: "cart" | "order" | "checkout" | "payment"; id: string },
): Promise<ToolResult> {
  const corr = correlationId();
  const decision = await commerceGuard.authorize({
    capability,
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    channel: "chat",
    agentId: ctx.agentId,
    correlationId: corr,
    isAdmin: ctx.isAdmin,
    ...(resource ? { resource } : {}),
  });

  if (isGuardDenied(decision)) return fail(decision.error);

  const started = Date.now();
  try {
    const connector = await getWmpcConnector();
    const result = await run({
      connector,
      customer: customerContext(ctx),
      opts: { correlationId: corr },
    });
    logger.debug("[aiCommerce] tool complete", {
      capability,
      success: result.success,
      latencyMs: Date.now() - started,
      correlationId: corr,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[aiCommerce] tool threw", { capability, error: message, correlationId: corr });
    return {
      success: false,
      error: "The marketplace request could not be completed.",
      metadata: { code: "UNKNOWN_COMMERCE_ERROR", retryable: true, correlationId: corr },
    };
  }
}

/** Unwrap a connector result into a tool result. */
function unwrap<T>(result: CommerceResult<T>, map?: (data: T) => unknown, metadata?: Record<string, unknown>): ToolResult {
  if (isCommerceFailure(result)) return fail(result.error);
  return ok(map ? map(result.data) : result.data, metadata);
}

// ─── 1. search_products ──────────────────────────────────────────────────────

const searchProductsTool: Tool = {
  definition: {
    name: "search_products",
    description:
      "Search the WMPC marketplace catalogue for products. Returns only products the marketplace actually lists, with the marketplace's own prices and stock status. Use this whenever the user asks to find, browse or shop for something.",
    category: CATEGORY,
    parameters: {
      query: { type: "string", description: "Product terms only, e.g. 'black running shoe'. Omit intent words like 'find me'." },
      category: { type: "string", description: "Category filter, if the user named one." },
      brand: { type: "string", description: "Brand filter, if the user named one." },
      color: { type: "string", description: "Colour the user asked for." },
      min_price: { type: "number", description: "Minimum price in major currency units (e.g. 5000 for NGN 5,000)." },
      max_price: { type: "number", description: "Maximum price in major currency units." },
      currency: { type: "string", description: "ISO currency code, e.g. NGN. Defaults to the user's currency." },
      sort: { type: "string", description: "Result ordering.", enum: ["relevance", "price_asc", "price_desc", "rating", "newest"] },
      limit: { type: "number", description: "Maximum number of products to return (1-25, default 10)." },
    },
    required: [],
    timeoutMs: 20000,
  },
  async execute(params, ctx) {
    return guarded("search", ctx, async ({ connector, customer, opts }) => {
      const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 25);
      const request = intentFiltersToSearchRequest(
        params.query ? String(params.query) : undefined,
        {
          ...(params.category ? { category: String(params.category) } : {}),
          ...(params.brand ? { brand: String(params.brand) } : {}),
          ...(params.color ? { color: String(params.color) } : {}),
          ...(typeof params.min_price === "number" ? { min_price: params.min_price } : {}),
          ...(typeof params.max_price === "number" ? { max_price: params.max_price } : {}),
          ...(params.currency ? { currency: String(params.currency) } : {}),
        },
        { limit, ...(params.sort ? { sort: params.sort } : {}) },
      );

      const result = await connector.searchProducts(customer, request, opts);
      if (isCommerceFailure(result)) return fail(result.error);

      const ranked = rankProducts(result.data.products, {
        query: params.query ? String(params.query) : undefined,
        filters: {
          ...(params.color ? { color: String(params.color) } : {}),
          ...(params.brand ? { brand: String(params.brand) } : {}),
          ...(typeof params.max_price === "number" ? { max_price: params.max_price } : {}),
        },
      });

      return ok(
        {
          products: ranked.map((r) => ({ ...describeProductFacts(r.product), id: r.product.id, reasons: r.reasons })),
          total: result.data.total,
          cursor: result.data.cursor,
          appliedFilters: result.data.appliedFilters,
          note:
            result.data.products.length === 0
              ? "The marketplace returned no products for this search. Do not suggest products that were not returned."
              : "All prices, stock levels and details above come from the marketplace. Do not add facts that are not listed.",
        },
        { source: connector.name, count: ranked.length, correlationId: opts.correlationId },
      );
    });
  },
};

// ─── 2. get_product ──────────────────────────────────────────────────────────

const getProductTool: Tool = {
  definition: {
    name: "get_product",
    description:
      "Fetch the full marketplace record for one product by its WMPC product id. Fields the marketplace has not published are returned as unavailable — never fill them in yourself.",
    category: CATEGORY,
    parameters: {
      product_id: { type: "string", description: "The WMPC product id." },
    },
    required: ["product_id"],
    timeoutMs: 15000,
  },
  async execute(params, ctx) {
    return guarded("view_product", ctx, async ({ connector, customer, opts }) => {
      const result = await connector.getProduct(customer, String(params.product_id), opts);
      if (isCommerceFailure(result)) return fail(result.error);
      return ok(
        {
          id: result.data.id,
          ...describeProductFacts(result.data),
          specs: result.data.specs,
          images: result.data.images,
          url: result.data.url,
          note: "Any field marked as not published by the marketplace must be reported as unavailable, not guessed.",
        },
        { source: connector.name, correlationId: opts.correlationId },
      );
    });
  },
};

// ─── 3. compare_products ─────────────────────────────────────────────────────

const compareProductsTool: Tool = {
  definition: {
    name: "compare_products",
    description:
      "Build a side-by-side comparison of 2-4 marketplace products. Specs the marketplace did not publish are listed as unavailable rather than guessed. Does not declare a winner.",
    category: CATEGORY,
    parameters: {
      product_ids: { type: "array", description: "2-4 WMPC product ids to compare.", items: { type: "string", description: "WMPC product id" } },
    },
    required: ["product_ids"],
    timeoutMs: 25000,
  },
  async execute(params, ctx) {
    return guarded("compare", ctx, async ({ connector, customer, opts }) => {
      const ids: string[] = Array.isArray(params.product_ids) ? params.product_ids.map(String) : [];
      if (ids.length < 2 || ids.length > 4) {
        return { success: false, error: "Provide between 2 and 4 product ids to compare.", metadata: { code: "INVALID_REQUEST" } };
      }

      const fetched = await Promise.all(ids.map((id) => connector.getProduct(customer, id, opts)));
      const missing = ids.filter((_, i) => !fetched[i]!.ok);
      if (missing.length === ids.length) {
        const firstError = fetched.find((f) => !f.ok);
        return fail((firstError as { ok: false; error: CommerceError }).error);
      }

      const products = fetched.filter((f) => f.ok).map((f) => (f as { ok: true; data: any }).data);
      const comparison = compareProducts(products);

      return ok(
        {
          products: products.map((p) => ({ id: p.id, name: p.name })),
          rows: comparison.rows.map((row) => ({
            attribute: row.label,
            values: row.values.map((v) => v ?? "Not published by the marketplace"),
          })),
          unavailableSpecs: comparison.unavailableSpecs,
          summary: comparison.summary,
          ...(missing.length ? { unavailableProductIds: missing } : {}),
          note: "Report unavailable rows as unavailable. Do not infer a missing spec from the other product or from general knowledge.",
        },
        { source: connector.name, correlationId: opts.correlationId },
      );
    });
  },
};

// ─── 4. get_cart ─────────────────────────────────────────────────────────────

const getCartTool: Tool = {
  definition: {
    name: "get_cart",
    description:
      "Retrieve the user's current marketplace cart, including the marketplace's own subtotal, tax, shipping and total. Never recalculate these numbers.",
    category: CATEGORY,
    parameters: {},
    required: [],
    timeoutMs: 15000,
  },
  async execute(_params, ctx) {
    return guarded("view_cart", ctx, async ({ connector, customer, opts }) => {
      const result = await connector.getCart(customer, opts);
      return unwrap(result, (cart) => ({
        ...cart,
        note: "Subtotal, tax, shipping, discount and total are the marketplace's figures. Quote them exactly.",
      }), { source: connector.name, correlationId: opts.correlationId });
    });
  },
};

// ─── 5. add_to_cart ──────────────────────────────────────────────────────────

const addToCartTool: Tool = {
  definition: {
    name: "add_to_cart",
    description:
      "Add a product to the user's marketplace cart. Returns the updated cart as the marketplace reports it. Confirm the product with the user before calling this.",
    category: CATEGORY,
    parameters: {
      product_id: { type: "string", description: "The WMPC product id to add." },
      quantity: { type: "number", description: "How many units to add (default 1)." },
      variant_id: { type: "string", description: "Variant id, when the product has variants." },
    },
    required: ["product_id"],
    hasSideEffects: true,
    timeoutMs: 20000,
  },
  async execute(params, ctx) {
    return guarded("modify_cart", ctx, async ({ connector, customer, opts }) => {
      const quantity = Math.min(Math.max(Number(params.quantity) || 1, 1), 999);
      const input = {
        productId: String(params.product_id),
        quantity,
        ...(params.variant_id ? { variantId: String(params.variant_id) } : {}),
      };
      const result = await connector.addToCart(customer, input, {
        ...opts,
        idempotencyKey: idempotencyKey(ctx, "add_to_cart", input),
      });
      return unwrap(result, (cart) => ({
        ...cart,
        note: "The cart totals above are the marketplace's own figures.",
      }), { source: connector.name, correlationId: opts.correlationId });
    });
  },
};

// ─── 6. update_cart ──────────────────────────────────────────────────────────

const updateCartTool: Tool = {
  definition: {
    name: "update_cart",
    description: "Change the quantity of an item already in the user's marketplace cart.",
    category: CATEGORY,
    parameters: {
      item_id: { type: "string", description: "The cart item id (not the product id)." },
      quantity: { type: "number", description: "New quantity. Must be at least 1; use remove_from_cart to delete." },
    },
    required: ["item_id", "quantity"],
    hasSideEffects: true,
    timeoutMs: 20000,
  },
  async execute(params, ctx) {
    return guarded("modify_cart", ctx, async ({ connector, customer, opts }) => {
      const quantity = Number(params.quantity);
      if (!Number.isFinite(quantity) || quantity < 1) {
        return { success: false, error: "Quantity must be 1 or more. Use remove_from_cart to delete an item.", metadata: { code: "INVALID_REQUEST" } };
      }
      const input = { itemId: String(params.item_id), quantity: Math.min(Math.round(quantity), 999) };
      const result = await connector.updateCartItem(customer, input, {
        ...opts,
        idempotencyKey: idempotencyKey(ctx, "update_cart", input),
      });
      return unwrap(result, undefined, { source: connector.name, correlationId: opts.correlationId });
    });
  },
};

// ─── 7. remove_from_cart ─────────────────────────────────────────────────────

const removeFromCartTool: Tool = {
  definition: {
    name: "remove_from_cart",
    description: "Remove one item from the user's marketplace cart.",
    category: CATEGORY,
    parameters: {
      item_id: { type: "string", description: "The cart item id to remove." },
    },
    required: ["item_id"],
    hasSideEffects: true,
    timeoutMs: 20000,
  },
  async execute(params, ctx) {
    return guarded("modify_cart", ctx, async ({ connector, customer, opts }) => {
      const input = { itemId: String(params.item_id) };
      const result = await connector.removeCartItem(customer, input, {
        ...opts,
        idempotencyKey: idempotencyKey(ctx, "remove_from_cart", input),
      });
      return unwrap(result, undefined, { source: connector.name, correlationId: opts.correlationId });
    });
  },
};

// ─── 8. clear_cart ───────────────────────────────────────────────────────────

const clearCartTool: Tool = {
  definition: {
    name: "clear_cart",
    description: "Empty the user's marketplace cart entirely. Always confirm with the user before calling this.",
    category: CATEGORY,
    parameters: {
      confirmed: { type: "boolean", description: "Set true only after the user has explicitly confirmed they want the cart emptied." },
    },
    required: ["confirmed"],
    hasSideEffects: true,
    timeoutMs: 20000,
  },
  async execute(params, ctx) {
    return guarded("modify_cart", ctx, async ({ connector, customer, opts }) => {
      if (params.confirmed !== true) {
        return { success: false, error: "Ask the user to confirm before clearing the cart.", metadata: { code: "INVALID_REQUEST" } };
      }
      const result = await connector.clearCart(customer, {
        ...opts,
        idempotencyKey: idempotencyKey(ctx, "clear_cart", { at: new Date().toISOString().slice(0, 16) }),
      });
      return unwrap(result, undefined, { source: connector.name, correlationId: opts.correlationId });
    });
  },
};

// ─── 9. create_checkout ──────────────────────────────────────────────────────

const createCheckoutTool: Tool = {
  definition: {
    name: "create_checkout",
    description:
      "Start a marketplace checkout for the user's cart. Returns the marketplace's checkout session, its totals and its hosted payment URL. WINDELS never collects payment details itself — direct the user to the marketplace payment URL.",
    category: CATEGORY,
    parameters: {
      cart_id: { type: "string", description: "Cart to check out. Omit to use the user's active cart." },
      confirmed: { type: "boolean", description: "Set true only after the user has reviewed the cart and agreed to check out." },
    },
    required: ["confirmed"],
    hasSideEffects: true,
    timeoutMs: 30000,
  },
  async execute(params, ctx) {
    return guarded("checkout", ctx, async ({ connector, customer, opts }) => {
      if (params.confirmed !== true) {
        return { success: false, error: "Ask the user to review the cart and confirm before starting checkout.", metadata: { code: "INVALID_REQUEST" } };
      }
      const input = params.cart_id ? { cartId: String(params.cart_id) } : {};
      const result = await connector.createCheckout(customer, input, {
        ...opts,
        idempotencyKey: idempotencyKey(ctx, "create_checkout", input),
      });
      return unwrap(result, (session) => ({
        ...session,
        note: "Payment happens on the marketplace. Never tell the user a payment succeeded — only the marketplace can confirm that.",
      }), { source: connector.name, correlationId: opts.correlationId });
    });
  },
};

// ─── 10. get_checkout ────────────────────────────────────────────────────────

const getCheckoutTool: Tool = {
  definition: {
    name: "get_checkout",
    description: "Read the current state of a marketplace checkout session by id.",
    category: CATEGORY,
    parameters: {
      checkout_id: { type: "string", description: "The WMPC checkout session id." },
    },
    required: ["checkout_id"],
    timeoutMs: 15000,
  },
  async execute(params, ctx) {
    const checkoutId = String(params.checkout_id);
    return guarded(
      "checkout",
      ctx,
      async ({ connector, customer, opts }) => {
        const result = await connector.getCheckout(customer, checkoutId, opts);
        return unwrap(result, undefined, { source: connector.name, correlationId: opts.correlationId });
      },
      { type: "checkout", id: checkoutId },
    );
  },
};

// ─── 11. get_payment_methods ─────────────────────────────────────────────────

const getPaymentMethodsTool: Tool = {
  definition: {
    name: "get_payment_methods",
    description:
      "List the payment methods the marketplace offers this customer. Only these may be mentioned — WINDELS does not choose or add payment providers.",
    category: CATEGORY,
    parameters: {},
    required: [],
    timeoutMs: 15000,
  },
  async execute(_params, ctx) {
    return guarded("view_payment", ctx, async ({ connector, customer, opts }) => {
      const result = await connector.getPaymentMethods(customer, opts);
      return unwrap(result, (methods) => ({
        methods,
        note: "Offer only the methods listed here. Do not suggest any other payment provider.",
      }), { source: connector.name, correlationId: opts.correlationId });
    });
  },
};

// ─── 12. get_payment_status ──────────────────────────────────────────────────

const getPaymentStatusTool: Tool = {
  definition: {
    name: "get_payment_status",
    description:
      "Read the marketplace's payment status for a payment id. Report the status exactly as returned. Never claim a payment succeeded on any other basis.",
    category: CATEGORY,
    parameters: {
      payment_id: { type: "string", description: "The WMPC payment id." },
    },
    required: ["payment_id"],
    timeoutMs: 15000,
  },
  async execute(params, ctx) {
    const paymentId = String(params.payment_id);
    return guarded(
      "view_payment",
      ctx,
      async ({ connector, customer, opts }) => {
        const result = await connector.getPaymentStatus(customer, paymentId, opts);
        return unwrap(result, (status) => ({
          ...status,
          note: "This status is the marketplace's record. Quote it exactly; do not soften a failure or predict success.",
        }), { source: connector.name, correlationId: opts.correlationId });
      },
      { type: "payment", id: paymentId },
    );
  },
};

// ─── 13. get_orders ──────────────────────────────────────────────────────────

const getOrdersTool: Tool = {
  definition: {
    name: "get_orders",
    description: "List the user's marketplace orders, most recent first.",
    category: CATEGORY,
    parameters: {
      status: { type: "string", description: "Filter by order status.", enum: ["created", "confirmed", "processing", "shipped", "out_for_delivery", "delivered", "cancelled", "refunded", "returned"] },
      limit: { type: "number", description: "Maximum orders to return (1-25, default 10)." },
      cursor: { type: "string", description: "Pagination cursor from a previous call." },
    },
    required: [],
    timeoutMs: 15000,
  },
  async execute(params, ctx) {
    return guarded("view_orders", ctx, async ({ connector, customer, opts }) => {
      const result = await connector.listOrders(
        customer,
        {
          ...(params.status ? { status: params.status } : {}),
          limit: Math.min(Math.max(Number(params.limit) || 10, 1), 25),
          ...(params.cursor ? { cursor: String(params.cursor) } : {}),
        },
        opts,
      );
      return unwrap(result, undefined, { source: connector.name, correlationId: opts.correlationId });
    });
  },
};

// ─── 14. get_order ───────────────────────────────────────────────────────────

const getOrderTool: Tool = {
  definition: {
    name: "get_order",
    description: "Fetch one marketplace order by id, including its items and the marketplace's totals.",
    category: CATEGORY,
    parameters: {
      order_id: { type: "string", description: "The WMPC order id or reference." },
    },
    required: ["order_id"],
    timeoutMs: 15000,
  },
  async execute(params, ctx) {
    const orderId = String(params.order_id);
    return guarded(
      "view_orders",
      ctx,
      async ({ connector, customer, opts }) => {
        const result = await connector.getOrder(customer, orderId, opts);
        return unwrap(result, (order) => ({
          ...order,
          estimatedDelivery: order.estimatedDelivery ?? "Not published by the marketplace",
        }), { source: connector.name, correlationId: opts.correlationId });
      },
      { type: "order", id: orderId },
    );
  },
};

// ─── 15. track_order ─────────────────────────────────────────────────────────

const trackOrderTool: Tool = {
  definition: {
    name: "track_order",
    description:
      "Get delivery tracking for a marketplace order: carrier, tracking number and the scan history. If the marketplace has no delivery estimate, say so rather than predicting one.",
    category: CATEGORY,
    parameters: {
      order_id: { type: "string", description: "The WMPC order id to track." },
    },
    required: ["order_id"],
    timeoutMs: 15000,
  },
  async execute(params, ctx) {
    const orderId = String(params.order_id);
    return guarded(
      "track_order",
      ctx,
      async ({ connector, customer, opts }) => {
        const result = await connector.getOrderTracking(customer, orderId, opts);
        return unwrap(result, (tracking) => ({
          ...tracking,
          carrier: tracking.carrier ?? "Not published by the marketplace",
          trackingNumber: tracking.trackingNumber ?? "Not published by the marketplace",
          estimatedDelivery: tracking.estimatedDelivery ?? "Not published by the marketplace",
          note: "Do not estimate a delivery date the marketplace has not given.",
        }), { source: connector.name, correlationId: opts.correlationId });
      },
      { type: "order", id: orderId },
    );
  },
};

// ─── 16. validate_gift_card ──────────────────────────────────────────────────

const validateGiftCardTool: Tool = {
  definition: {
    name: "validate_gift_card",
    description:
      "Check a marketplace gift card code and its remaining balance. This is a read-only check; it does not apply the card.",
    category: CATEGORY,
    parameters: {
      code: { type: "string", description: "The gift card code supplied by the user." },
    },
    required: ["code"],
    timeoutMs: 15000,
  },
  async execute(params, ctx) {
    return guarded("gift_card", ctx, async ({ connector, customer, opts }) => {
      const result = await connector.validateGiftCard(customer, String(params.code), opts);
      return unwrap(result, (validation) => ({
        valid: validation.valid,
        balance: validation.balance,
        expiresAt: validation.expiresAt,
        reason: validation.reason,
        note: "Balance and validity are the marketplace's. Never state a balance the marketplace did not return.",
      }), { source: connector.name, correlationId: opts.correlationId });
    });
  },
};

// ─── 17. apply_gift_card ─────────────────────────────────────────────────────

const applyGiftCardTool: Tool = {
  definition: {
    name: "apply_gift_card",
    description:
      "Apply a marketplace gift card to a checkout or cart. The marketplace decides how much is applied and what the new total is — never compute it yourself.",
    category: CATEGORY,
    parameters: {
      code: { type: "string", description: "The gift card code to apply." },
      checkout_id: { type: "string", description: "Checkout session to apply it to." },
      cart_id: { type: "string", description: "Cart to apply it to, when there is no checkout yet." },
    },
    required: ["code"],
    hasSideEffects: true,
    timeoutMs: 20000,
  },
  async execute(params, ctx) {
    return guarded("gift_card", ctx, async ({ connector, customer, opts }) => {
      const input = {
        code: String(params.code),
        ...(params.checkout_id ? { checkoutId: String(params.checkout_id) } : {}),
        ...(params.cart_id ? { cartId: String(params.cart_id) } : {}),
      };
      const result = await connector.applyGiftCard(customer, input, {
        ...opts,
        idempotencyKey: idempotencyKey(ctx, "apply_gift_card", input),
      });
      return unwrap(result, (application) => ({
        ...application,
        note: "The amount applied and the new total are the marketplace's figures.",
      }), { source: connector.name, correlationId: opts.correlationId });
    });
  },
};

// ─── Registration ────────────────────────────────────────────────────────────

/** All 17 tools, in the order they appear in the specification (§4). */
export const COMMERCE_TOOLS: Tool[] = [
  searchProductsTool,
  getProductTool,
  compareProductsTool,
  getCartTool,
  addToCartTool,
  updateCartTool,
  removeFromCartTool,
  clearCartTool,
  createCheckoutTool,
  getCheckoutTool,
  getPaymentMethodsTool,
  getPaymentStatusTool,
  getOrdersTool,
  getOrderTool,
  trackOrderTool,
  validateGiftCardTool,
  applyGiftCardTool,
];

export const COMMERCE_TOOL_NAMES: string[] = COMMERCE_TOOLS.map((t) => t.definition.name);

let registered = false;

/** Register the commerce tools into the existing shared ToolRegistry. */
export function registerCommerceTools(): void {
  if (registered) return;
  for (const tool of COMMERCE_TOOLS) ToolRegistry.register(tool);
  registered = true;
  logger.info(`[aiCommerce] registered ${COMMERCE_TOOLS.length} commerce tools`, {
    tools: COMMERCE_TOOL_NAMES,
  });
}

/** Test seam: allow re-registration in a fresh registry. */
export function __resetCommerceToolRegistration(): void {
  registered = false;
}

export function commerceToolDefinitions(): ToolDefinition[] {
  return COMMERCE_TOOLS.map((t) => t.definition);
}
