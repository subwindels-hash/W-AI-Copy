/**
 * Mock WMPC adapter — AI Commerce Stage 1 §32.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEVELOPMENT AND TEST ONLY. NOT A PRODUCTION MARKETPLACE.                 │
 * │ Refuses to construct when NODE_ENV=production. `isProduction` is false.  │
 * │ Every id it returns is prefixed `WMPC-MOCK-`.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * It exists so the AI Commerce stack (intents, tools, agents, orchestration,
 * events, permissions) can be built and tested against the frozen connector
 * interface before the real WMPC API exists. Stage 2 replaces this class with
 * `HttpWmpcAdapter` and changes nothing else.
 *
 * It is a deterministic in-memory fixture store, not a simulator: identical
 * inputs always produce identical outputs, there is no randomness, no latency
 * jitter, and no fabricated success for work that did not happen. Cart and
 * order arithmetic here stands in for WMPC's — which is exactly why AI Commerce
 * must never do arithmetic of its own: when the real adapter lands, the numbers
 * come from WMPC and the AI layer is unchanged.
 */
import { createHash, randomUUID } from "node:crypto";
import type {
  CommerceCustomerContext,
  CommerceResult,
  WmpcCart,
  WmpcCartItem,
  WmpcCheckoutSession,
  WmpcGiftCardApplication,
  WmpcGiftCardValidation,
  WmpcMoney,
  WmpcOrder,
  WmpcPaymentMethod,
  WmpcPaymentStatus,
  WmpcProduct,
  WmpcProductSearchRequest,
  WmpcProductSearchResult,
  WmpcTrackingInformation,
} from "@windels/shared";
import { commerceFailure, commerceOk } from "../commerceErrors.js";
import { MOCK_GIFT_CARDS, MOCK_ID_PREFIX, MOCK_PRODUCTS, ngn } from "./mockWmpc.fixtures.js";
import type {
  WmpcCallOptions,
  WmpcCommerceConnector,
  WmpcOrderListRequest,
  WmpcOrderListResult,
} from "./wmpcConnector.types.js";

interface MockCartRecord {
  id: string;
  customerId: string;
  items: WmpcCartItem[];
  giftCardCode?: string;
  giftCardAppliedMinor: number;
  updatedAt: string;
}

interface MockCheckoutRecord {
  session: WmpcCheckoutSession;
  customerId: string;
}

interface MockOrderRecord {
  order: WmpcOrder;
  tracking: WmpcTrackingInformation;
}

/** Stable synthetic id derived from its inputs — no randomness. */
function stableId(kind: string, ...parts: string[]): string {
  const hash = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 12);
  return `${MOCK_ID_PREFIX}${kind}-${hash}`;
}

function money(amountMinor: number, currency = "NGN"): WmpcMoney {
  return currency === "NGN"
    ? ngn(amountMinor)
    : { amountMinor, currency, display: `${currency} ${(amountMinor / 100).toFixed(2)}` };
}

const MOCK_PAYMENT_METHODS: WmpcPaymentMethod[] = [
  { id: `${MOCK_ID_PREFIX}PM-CARD`, type: "card", label: "Debit/Credit Card (mock)", enabled: true, currencies: ["NGN"] },
  { id: `${MOCK_ID_PREFIX}PM-TRANSFER`, type: "bank_transfer", label: "Bank Transfer (mock)", enabled: true, currencies: ["NGN"] },
  { id: `${MOCK_ID_PREFIX}PM-GIFT`, type: "gift_card", label: "WMPC Gift Card (mock)", enabled: true, currencies: ["NGN"] },
];

export class MockWmpcAdapter implements WmpcCommerceConnector {
  readonly name = "wmpc-mock-adapter";
  /** Always false. Production code paths assert on this. */
  readonly isProduction = false;

  private carts = new Map<string, MockCartRecord>();
  private checkouts = new Map<string, MockCheckoutRecord>();
  private orders = new Map<string, MockOrderRecord>();
  /** idempotencyKey -> serialized prior result, so replays never double-apply. */
  private idempotency = new Map<string, string>();

  constructor(nodeEnv: string) {
    if (nodeEnv === "production") {
      throw new Error(
        "MockWmpcAdapter must never be constructed in production. " +
          "Configure WMPC_API_BASE_URL and WMPC_API_KEY to use the real WMPC connector.",
      );
    }
  }

  /** Test seam: wipe all fixture state between test cases. */
  reset(): void {
    this.carts.clear();
    this.checkouts.clear();
    this.orders.clear();
    this.idempotency.clear();
  }

  // ── idempotency (§20) ────────────────────────────────────────────────────

  private replay<T>(opts: WmpcCallOptions, scope: string): CommerceResult<T> | null {
    if (!opts.idempotencyKey) return null;
    const stored = this.idempotency.get(`${scope}:${opts.idempotencyKey}`);
    return stored ? (JSON.parse(stored) as CommerceResult<T>) : null;
  }

  private remember<T>(opts: WmpcCallOptions, scope: string, result: CommerceResult<T>): CommerceResult<T> {
    if (opts.idempotencyKey && result.ok) {
      this.idempotency.set(`${scope}:${opts.idempotencyKey}`, JSON.stringify(result));
    }
    return result;
  }

  // ── catalog ──────────────────────────────────────────────────────────────

  async searchProducts(
    _ctx: CommerceCustomerContext,
    req: WmpcProductSearchRequest,
    _opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcProductSearchResult>> {
    const terms = (req.query || "").toLowerCase().split(/\s+/).filter(Boolean);
    const f = req.filters || {};

    let hits = MOCK_PRODUCTS.filter((p) => {
      if (terms.length) {
        const haystack = [p.name, p.description || "", p.category || "", p.brand || "",
          ...p.specs.map((s) => s.value)].join(" ").toLowerCase();
        if (!terms.every((t) => haystack.includes(t))) return false;
      }
      if (f.category && p.category !== f.category) return false;
      if (f.brand && (p.brand || "").toLowerCase() !== f.brand.toLowerCase()) return false;
      if (f.vendorId && p.vendor?.id !== f.vendorId) return false;
      if (f.availability && p.availability !== f.availability) return false;
      if (typeof f.minPriceMinor === "number" && p.price.amountMinor < f.minPriceMinor) return false;
      if (typeof f.maxPriceMinor === "number" && p.price.amountMinor > f.maxPriceMinor) return false;
      if (f.attributes) {
        for (const [k, v] of Object.entries(f.attributes)) {
          const spec = p.specs.find((s) => s.key === k);
          if (!spec || spec.value.toLowerCase() !== String(v).toLowerCase()) return false;
        }
      }
      return true;
    });

    switch (req.sort) {
      case "price_asc": hits = [...hits].sort((a, b) => a.price.amountMinor - b.price.amountMinor); break;
      case "price_desc": hits = [...hits].sort((a, b) => b.price.amountMinor - a.price.amountMinor); break;
      case "rating": hits = [...hits].sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0)); break;
      default: break; // catalogue order is WMPC's relevance order
    }

    const limit = Math.min(Math.max(req.limit ?? 20, 1), 50);
    return commerceOk({
      products: hits.slice(0, limit),
      total: hits.length,
      appliedFilters: f,
    });
  }

  async getProduct(
    _ctx: CommerceCustomerContext,
    productId: string,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcProduct>> {
    const p = MOCK_PRODUCTS.find((x) => x.id === productId);
    if (!p) return commerceFailure("PRODUCT_NOT_FOUND", undefined, { correlationId: opts.correlationId });
    return commerceOk(p);
  }

  // ── cart ─────────────────────────────────────────────────────────────────

  private customerKey(ctx: CommerceCustomerContext): string {
    // Cart identity is per (org, user) so one user can never read another's.
    return `${ctx.organizationId}:${ctx.userId}`;
  }

  private ensureCart(ctx: CommerceCustomerContext): MockCartRecord {
    const key = this.customerKey(ctx);
    let cart = this.carts.get(key);
    if (!cart) {
      cart = {
        id: stableId("CART", key),
        customerId: key,
        items: [],
        giftCardAppliedMinor: 0,
        updatedAt: new Date().toISOString(),
      };
      this.carts.set(key, cart);
    }
    return cart;
  }

  /**
   * Cart totals. In production these come from WMPC; the mock computes them so
   * the shape is realistic. AI Commerce code must never do this itself.
   */
  private renderCart(rec: MockCartRecord): WmpcCart {
    const subtotalMinor = rec.items.reduce((s, i) => s + i.lineTotal.amountMinor, 0);
    const shippingMinor = rec.items.length ? 150000 : 0;
    const taxMinor = Math.round(subtotalMinor * 0.075);
    const discountMinor = Math.min(rec.giftCardAppliedMinor, subtotalMinor + shippingMinor + taxMinor);
    const totalMinor = subtotalMinor + shippingMinor + taxMinor - discountMinor;
    return {
      id: rec.id,
      customerId: rec.customerId,
      currency: "NGN",
      items: rec.items,
      subtotal: money(subtotalMinor),
      tax: money(taxMinor),
      shipping: money(shippingMinor),
      ...(discountMinor > 0 ? { discount: money(discountMinor) } : {}),
      total: money(totalMinor),
      itemCount: rec.items.reduce((s, i) => s + i.quantity, 0),
      updatedAt: rec.updatedAt,
    };
  }

  async getCart(ctx: CommerceCustomerContext, _opts: WmpcCallOptions): Promise<CommerceResult<WmpcCart>> {
    return commerceOk(this.renderCart(this.ensureCart(ctx)));
  }

  async addToCart(
    ctx: CommerceCustomerContext,
    input: { productId: string; quantity: number; variantId?: string },
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcCart>> {
    const prior = this.replay<WmpcCart>(opts, "addToCart");
    if (prior) return prior;

    const product = MOCK_PRODUCTS.find((p) => p.id === input.productId);
    if (!product) {
      return commerceFailure("PRODUCT_NOT_FOUND", undefined, { correlationId: opts.correlationId });
    }
    if (product.availability === "out_of_stock" || product.availability === "discontinued") {
      return commerceFailure("OUT_OF_STOCK", `${product.name} is not currently available.`, {
        correlationId: opts.correlationId,
      });
    }
    if (typeof product.stockQuantity === "number" && input.quantity > product.stockQuantity) {
      return commerceFailure(
        "OUT_OF_STOCK",
        `Only ${product.stockQuantity} unit(s) of ${product.name} are available.`,
        { correlationId: opts.correlationId },
      );
    }

    const cart = this.ensureCart(ctx);
    const existing = cart.items.find((i) => i.productId === input.productId && i.variantId === input.variantId);
    if (existing) {
      existing.quantity += input.quantity;
      existing.lineTotal = money(existing.unitPrice.amountMinor * existing.quantity);
    } else {
      cart.items.push({
        id: stableId("ITEM", cart.id, input.productId, input.variantId || ""),
        productId: product.id,
        ...(input.variantId ? { variantId: input.variantId } : {}),
        name: product.name,
        quantity: input.quantity,
        unitPrice: product.price,
        lineTotal: money(product.price.amountMinor * input.quantity),
        ...(product.images[0] ? { image: product.images[0] } : {}),
        availability: product.availability,
      });
    }
    cart.updatedAt = new Date().toISOString();
    return this.remember(opts, "addToCart", commerceOk(this.renderCart(cart)));
  }

  async updateCartItem(
    ctx: CommerceCustomerContext,
    input: { itemId: string; quantity: number },
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcCart>> {
    const prior = this.replay<WmpcCart>(opts, "updateCartItem");
    if (prior) return prior;

    const cart = this.ensureCart(ctx);
    const item = cart.items.find((i) => i.id === input.itemId);
    if (!item) {
      return commerceFailure("CART_UPDATE_FAILED", "That item is not in your cart.", {
        correlationId: opts.correlationId,
      });
    }
    if (input.quantity === 0) {
      cart.items = cart.items.filter((i) => i.id !== input.itemId);
    } else {
      const product = MOCK_PRODUCTS.find((p) => p.id === item.productId);
      if (product && typeof product.stockQuantity === "number" && input.quantity > product.stockQuantity) {
        return commerceFailure(
          "OUT_OF_STOCK",
          `Only ${product.stockQuantity} unit(s) of ${product.name} are available.`,
          { correlationId: opts.correlationId },
        );
      }
      item.quantity = input.quantity;
      item.lineTotal = money(item.unitPrice.amountMinor * input.quantity);
    }
    cart.updatedAt = new Date().toISOString();
    return this.remember(opts, "updateCartItem", commerceOk(this.renderCart(cart)));
  }

  async removeCartItem(
    ctx: CommerceCustomerContext,
    input: { itemId: string },
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcCart>> {
    return this.updateCartItem(ctx, { itemId: input.itemId, quantity: 0 }, opts);
  }

  async clearCart(ctx: CommerceCustomerContext, opts: WmpcCallOptions): Promise<CommerceResult<WmpcCart>> {
    const cart = this.ensureCart(ctx);
    cart.items = [];
    cart.giftCardAppliedMinor = 0;
    delete cart.giftCardCode;
    cart.updatedAt = new Date().toISOString();
    return commerceOk(this.renderCart(cart));
  }

  // ── checkout ─────────────────────────────────────────────────────────────

  async createCheckout(
    ctx: CommerceCustomerContext,
    _input: { cartId?: string },
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcCheckoutSession>> {
    const prior = this.replay<WmpcCheckoutSession>(opts, "createCheckout");
    if (prior) return prior;

    const cartRec = this.ensureCart(ctx);
    if (!cartRec.items.length) {
      return commerceFailure("CHECKOUT_FAILED", "Your cart is empty.", { correlationId: opts.correlationId });
    }
    const cart = this.renderCart(cartRec);
    const id = stableId("CHK", cartRec.id, String(this.checkouts.size), cartRec.updatedAt);
    const session: WmpcCheckoutSession = {
      id,
      cartId: cart.id,
      customerId: cartRec.customerId,
      status: "requires_payment",
      currency: cart.currency,
      subtotal: cart.subtotal,
      ...(cart.tax ? { tax: cart.tax } : {}),
      ...(cart.shipping ? { shipping: cart.shipping } : {}),
      ...(cart.discount ? { discount: cart.discount } : {}),
      total: cart.total,
      paymentUrl: `https://fixtures.wmpc.invalid/checkout/${id}`,
      paymentMethods: MOCK_PAYMENT_METHODS,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.checkouts.set(id, { session, customerId: cartRec.customerId });
    return this.remember(opts, "createCheckout", commerceOk(session));
  }

  async getCheckout(
    ctx: CommerceCustomerContext,
    checkoutId: string,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcCheckoutSession>> {
    const rec = this.checkouts.get(checkoutId);
    // Ownership check: another customer's checkout is reported as not found,
    // never as forbidden-with-details, so ids cannot be probed.
    if (!rec || rec.customerId !== this.customerKey(ctx)) {
      return commerceFailure("CHECKOUT_FAILED", "That checkout session could not be found.", {
        correlationId: opts.correlationId,
      });
    }
    return commerceOk(rec.session);
  }

  // ── payment ──────────────────────────────────────────────────────────────

  async getPaymentMethods(
    _ctx: CommerceCustomerContext,
    _opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcPaymentMethod[]>> {
    return commerceOk(MOCK_PAYMENT_METHODS);
  }

  async getPaymentStatus(
    ctx: CommerceCustomerContext,
    paymentId: string,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcPaymentStatus>> {
    // A payment record exists only once an order was created for this customer.
    for (const rec of this.orders.values()) {
      if (rec.order.customerId !== this.customerKey(ctx)) continue;
      if (stableId("PAY", rec.order.id) !== paymentId) continue;
      return commerceOk({
        id: paymentId,
        status: rec.order.paymentStatus,
        amount: rec.order.total,
        method: "card",
        orderId: rec.order.id,
        updatedAt: rec.order.updatedAt,
      });
    }
    return commerceFailure("ORDER_NOT_FOUND", "No payment was found with that reference.", {
      correlationId: opts.correlationId,
    });
  }

  // ── orders ───────────────────────────────────────────────────────────────

  /**
   * Test seam. Orders in the mock come into existence the way they will in
   * production — because WMPC says so — so tests create them explicitly rather
   * than having checkout silently mint one.
   */
  seedOrderFromCheckout(ctx: CommerceCustomerContext, checkoutId: string): WmpcOrder | null {
    const chk = this.checkouts.get(checkoutId);
    if (!chk || chk.customerId !== this.customerKey(ctx)) return null;
    const cartRec = this.carts.get(this.customerKey(ctx));
    if (!cartRec) return null;

    const orderId = stableId("ORD", checkoutId);
    const now = new Date().toISOString();
    const order: WmpcOrder = {
      id: orderId,
      reference: `WMPC-MOCK-${orderId.slice(-8)}`,
      customerId: chk.customerId,
      status: "confirmed",
      paymentStatus: "succeeded",
      currency: chk.session.currency,
      items: cartRec.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
        ...(i.image ? { image: i.image } : {}),
      })),
      subtotal: chk.session.subtotal,
      ...(chk.session.tax ? { tax: chk.session.tax } : {}),
      ...(chk.session.shipping ? { shipping: chk.session.shipping } : {}),
      ...(chk.session.discount ? { discount: chk.session.discount } : {}),
      total: chk.session.total,
      placedAt: now,
      updatedAt: now,
      estimatedDelivery: "3-5 business days",
    };
    const tracking: WmpcTrackingInformation = {
      orderId,
      status: "confirmed",
      carrier: "Mock Logistics",
      trackingNumber: `MOCKTRK${orderId.slice(-8)}`,
      trackingUrl: `https://fixtures.wmpc.invalid/track/${orderId}`,
      estimatedDelivery: "3-5 business days",
      events: [
        { status: "created", description: "Order received by the marketplace.", occurredAt: now },
        { status: "confirmed", description: "Payment confirmed, preparing for dispatch.", location: "Lagos", occurredAt: now },
      ],
      lastUpdatedAt: now,
    };
    this.orders.set(orderId, { order, tracking });
    chk.session.status = "completed";
    chk.session.orderId = orderId;
    return order;
  }

  async listOrders(
    ctx: CommerceCustomerContext,
    req: WmpcOrderListRequest,
    _opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcOrderListResult>> {
    const key = this.customerKey(ctx);
    let mine = [...this.orders.values()].map((r) => r.order).filter((o) => o.customerId === key);
    if (req.status) mine = mine.filter((o) => o.status === req.status);
    mine.sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1));
    const limit = Math.min(Math.max(req.limit ?? 20, 1), 50);
    return commerceOk({ orders: mine.slice(0, limit), total: mine.length });
  }

  async getOrder(
    ctx: CommerceCustomerContext,
    orderId: string,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcOrder>> {
    const rec = this.orders.get(orderId);
    // Cross-customer reads are indistinguishable from a genuine miss.
    if (!rec || rec.order.customerId !== this.customerKey(ctx)) {
      return commerceFailure("ORDER_NOT_FOUND", undefined, { correlationId: opts.correlationId });
    }
    return commerceOk(rec.order);
  }

  async getOrderTracking(
    ctx: CommerceCustomerContext,
    orderId: string,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcTrackingInformation>> {
    const rec = this.orders.get(orderId);
    if (!rec || rec.order.customerId !== this.customerKey(ctx)) {
      return commerceFailure("ORDER_NOT_FOUND", undefined, { correlationId: opts.correlationId });
    }
    return commerceOk(rec.tracking);
  }

  // ── gift cards ───────────────────────────────────────────────────────────

  async validateGiftCard(
    _ctx: CommerceCustomerContext,
    code: string,
    _opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcGiftCardValidation>> {
    const card = MOCK_GIFT_CARDS[code];
    if (!card) return commerceOk({ valid: false, code, reason: "No gift card matches that code." });
    if (card.balanceMinor <= 0) {
      return commerceOk({ valid: false, code, balance: money(0, card.currency), reason: "This gift card has no remaining balance." });
    }
    return commerceOk({
      valid: true,
      code,
      balance: money(card.balanceMinor, card.currency),
      currency: card.currency,
      ...(card.expiresAt ? { expiresAt: card.expiresAt } : {}),
    });
  }

  async applyGiftCard(
    ctx: CommerceCustomerContext,
    input: { code: string; checkoutId?: string; cartId?: string },
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcGiftCardApplication>> {
    const prior = this.replay<WmpcGiftCardApplication>(opts, "applyGiftCard");
    if (prior) return prior;

    const card = MOCK_GIFT_CARDS[input.code];
    if (!card || card.balanceMinor <= 0) {
      return commerceOk({ applied: false, reason: "That gift card cannot be applied." });
    }
    const cartRec = this.ensureCart(ctx);
    if (!cartRec.items.length) {
      return commerceOk({ applied: false, reason: "Your cart is empty." });
    }
    const before = this.renderCart(cartRec);
    cartRec.giftCardCode = input.code;
    cartRec.giftCardAppliedMinor = Math.min(card.balanceMinor, before.total.amountMinor);
    cartRec.updatedAt = new Date().toISOString();
    const after = this.renderCart(cartRec);

    return this.remember(
      opts,
      "applyGiftCard",
      commerceOk({
        applied: true,
        cartId: after.id,
        ...(input.checkoutId ? { checkoutId: input.checkoutId } : {}),
        amountApplied: money(cartRec.giftCardAppliedMinor),
        remainingBalance: money(card.balanceMinor - cartRec.giftCardAppliedMinor),
        newTotal: after.total,
      }),
    );
  }

  async health(): Promise<{ healthy: boolean; adapter: string; detail?: string }> {
    return {
      healthy: true,
      adapter: this.name,
      detail: "Fixture-backed mock adapter — development and test only, not a real marketplace.",
    };
  }
}

/** Correlation ids for mock-adapter callers that do not supply one. */
export function newCorrelationId(): string {
  return randomUUID();
}
