/**
 * AI Commerce — WMPC contract types (Stage 1, §7 / §21).
 *
 * WMPC (Windels Marketplace / Payment Core) is the AUTHORITATIVE system for all
 * commerce state: catalog, pricing, stock, carts, checkout, payment and orders.
 * WINDELS never computes or overrides any monetary value — every number in the
 * types below is a value RETURNED BY WMPC and passed through unchanged.
 *
 * Anything WMPC does not supply is `undefined` and must be surfaced to the user
 * as "not available", never inferred, estimated or invented.
 *
 * These types are shared between the API connector and the web client so the
 * exact same contract is used on both sides. They are deliberately independent
 * of the legacy local `commerce.ts` module (see docs/AI_COMMERCE_STAGE1_AUDIT.md).
 */
import { z } from "zod";

// ─── Money ──────────────────────────────────────────────────────────────────

/**
 * Monetary amount exactly as WMPC reported it.
 * `amountMinor` is in the currency's minor unit (kobo, cents) to avoid float
 * drift. `display` is WMPC's own formatting; WINDELS must prefer it verbatim
 * rather than formatting the number itself.
 */
export interface WmpcMoney {
  amountMinor: number;
  currency: string;
  display?: string;
}

// ─── Product ────────────────────────────────────────────────────────────────

export interface WmpcProductSpec {
  key: string;
  label: string;
  value: string;
}

export interface WmpcProduct {
  id: string;
  name: string;
  /** Undefined when WMPC has no description — do not synthesise one. */
  description?: string;
  price: WmpcMoney;
  /** WMPC's own compare-at / list price, when it publishes one. */
  compareAtPrice?: WmpcMoney;
  currency: string;
  /** WMPC's stock verdict. `unknown` when WMPC does not disclose it. */
  availability: WmpcAvailability;
  /** Only present when WMPC exposes exact counts. */
  stockQuantity?: number;
  images: string[];
  category?: string;
  brand?: string;
  vendor?: WmpcVendor;
  /** Specifications WMPC published. Absent keys are unavailable, not false. */
  specs: WmpcProductSpec[];
  rating?: { average: number; count: number };
  /** WMPC-published policies. Undefined => "not provided by the marketplace". */
  warranty?: string;
  returnPolicy?: string;
  deliveryEstimate?: string;
  url?: string;
}

export const WMPC_AVAILABILITY = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "preorder",
  "discontinued",
  "unknown",
] as const;
export type WmpcAvailability = (typeof WMPC_AVAILABILITY)[number];

export interface WmpcVendor {
  id: string;
  name: string;
  rating?: number;
  verified?: boolean;
}

export interface WmpcProductSearchFilters {
  category?: string;
  brand?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  currency?: string;
  availability?: WmpcAvailability;
  vendorId?: string;
  attributes?: Record<string, string>;
}

export interface WmpcProductSearchRequest {
  query?: string;
  filters?: WmpcProductSearchFilters;
  sort?: "relevance" | "price_asc" | "price_desc" | "rating" | "newest";
  limit?: number;
  cursor?: string;
}

export interface WmpcProductSearchResult {
  products: WmpcProduct[];
  total: number;
  cursor?: string;
  /** Echo of the filters WMPC actually applied (may differ from requested). */
  appliedFilters?: WmpcProductSearchFilters;
}

// ─── Cart ───────────────────────────────────────────────────────────────────

export interface WmpcCartItem {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  quantity: number;
  unitPrice: WmpcMoney;
  lineTotal: WmpcMoney;
  image?: string;
  availability?: WmpcAvailability;
}

/**
 * A cart as WMPC reports it. WINDELS must never recompute `subtotal`, `tax`,
 * `shipping`, `discount` or `total` — they are WMPC's numbers.
 */
export interface WmpcCart {
  id: string;
  customerId: string;
  currency: string;
  items: WmpcCartItem[];
  subtotal: WmpcMoney;
  tax?: WmpcMoney;
  shipping?: WmpcMoney;
  discount?: WmpcMoney;
  total: WmpcMoney;
  itemCount: number;
  updatedAt: string;
}

// ─── Checkout ───────────────────────────────────────────────────────────────

export const WMPC_CHECKOUT_STATUSES = [
  "open",
  "requires_payment",
  "processing",
  "completed",
  "cancelled",
  "expired",
] as const;
export type WmpcCheckoutStatus = (typeof WMPC_CHECKOUT_STATUSES)[number];

export interface WmpcCheckoutSession {
  id: string;
  cartId: string;
  customerId: string;
  status: WmpcCheckoutStatus;
  currency: string;
  subtotal: WmpcMoney;
  tax?: WmpcMoney;
  shipping?: WmpcMoney;
  discount?: WmpcMoney;
  total: WmpcMoney;
  /** WMPC-hosted payment page. WINDELS never collects card data itself. */
  paymentUrl?: string;
  paymentMethods?: WmpcPaymentMethod[];
  expiresAt?: string;
  createdAt: string;
  orderId?: string;
}

// ─── Payment ────────────────────────────────────────────────────────────────

export interface WmpcPaymentMethod {
  id: string;
  type: string;
  label: string;
  enabled: boolean;
  currencies?: string[];
  /** WMPC's fee disclosure. Never estimated by WINDELS. */
  feeNote?: string;
}

export const WMPC_PAYMENT_STATUSES = [
  "pending",
  "processing",
  "requires_action",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
] as const;
export type WmpcPaymentStatusValue = (typeof WMPC_PAYMENT_STATUSES)[number];

export interface WmpcPaymentStatus {
  id: string;
  status: WmpcPaymentStatusValue;
  amount: WmpcMoney;
  method?: string;
  orderId?: string;
  checkoutId?: string;
  /** WMPC's own failure reason. WINDELS must not paraphrase it into success. */
  failureReason?: string;
  updatedAt: string;
}

// ─── Order ──────────────────────────────────────────────────────────────────

export const WMPC_ORDER_STATUSES = [
  "created",
  "confirmed",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refunded",
  "returned",
] as const;
export type WmpcOrderStatus = (typeof WMPC_ORDER_STATUSES)[number];

export interface WmpcOrderItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: WmpcMoney;
  lineTotal: WmpcMoney;
  image?: string;
}

export interface WmpcOrder {
  id: string;
  reference: string;
  customerId: string;
  status: WmpcOrderStatus;
  paymentStatus: WmpcPaymentStatusValue;
  currency: string;
  items: WmpcOrderItem[];
  subtotal: WmpcMoney;
  tax?: WmpcMoney;
  shipping?: WmpcMoney;
  discount?: WmpcMoney;
  total: WmpcMoney;
  placedAt: string;
  updatedAt: string;
  /** WMPC's estimate only. Absent => tell the user it is not available. */
  estimatedDelivery?: string;
  shippingAddressSummary?: string;
}

export interface WmpcTrackingEvent {
  status: string;
  description: string;
  location?: string;
  occurredAt: string;
}

export interface WmpcTrackingInformation {
  orderId: string;
  status: WmpcOrderStatus;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
  events: WmpcTrackingEvent[];
  lastUpdatedAt: string;
}

// ─── Gift cards ─────────────────────────────────────────────────────────────

/**
 * WMPC gift card validation. Distinct from the local WINDELS
 * `giftCards` module, which covers WINDELS' own billing credits.
 */
export interface WmpcGiftCardValidation {
  valid: boolean;
  code?: string;
  balance?: WmpcMoney;
  currency?: string;
  expiresAt?: string;
  /** WMPC's reason when `valid` is false. */
  reason?: string;
}

export interface WmpcGiftCardApplication {
  applied: boolean;
  cartId?: string;
  checkoutId?: string;
  amountApplied?: WmpcMoney;
  remainingBalance?: WmpcMoney;
  newTotal?: WmpcMoney;
  reason?: string;
}

// ─── Customer context ───────────────────────────────────────────────────────

/**
 * Identity WINDELS presents to WMPC. Carries no payment credentials.
 */
export interface CommerceCustomerContext {
  userId: string;
  organizationId: string;
  /** WMPC-side customer id, when the accounts are already linked. */
  wmpcCustomerId?: string;
  email?: string;
  currency?: string;
  locale?: string;
  channel: CommerceChannel;
}

export const COMMERCE_CHANNELS = [
  "chat",
  "voice",
  "whatsapp",
  "web",
  "api",
  "command_center",
] as const;
export type CommerceChannel = (typeof COMMERCE_CHANNELS)[number];

// ─── Errors (§21) ───────────────────────────────────────────────────────────

export const COMMERCE_ERROR_CODES = [
  "PRODUCT_NOT_FOUND",
  "OUT_OF_STOCK",
  "CART_UPDATE_FAILED",
  "CHECKOUT_FAILED",
  "PAYMENT_FAILED",
  "PAYMENT_PENDING",
  "ORDER_NOT_FOUND",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "WMPC_UNAVAILABLE",
  "INVALID_REQUEST",
  "UNKNOWN_COMMERCE_ERROR",
] as const;
export type CommerceErrorCode = (typeof COMMERCE_ERROR_CODES)[number];

export interface CommerceError {
  code: CommerceErrorCode;
  message: string;
  /** True when the caller may safely retry the identical request. */
  retryable: boolean;
  /** WMPC's raw error code, preserved for support/debugging. */
  upstreamCode?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

/** Discriminated result used by every connector and tool operation. */
export type CommerceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CommerceError };

// ─── Intent engine (§3) ─────────────────────────────────────────────────────

export const COMMERCE_INTENTS = [
  "PRODUCT_SEARCH",
  "PRODUCT_DETAIL",
  "PRODUCT_COMPARE",
  "RECOMMENDATION",
  "IMAGE_SEARCH",
  "CART_VIEW",
  "CART_ADD",
  "CART_UPDATE",
  "CART_REMOVE",
  "CART_CLEAR",
  "CHECKOUT_START",
  "CHECKOUT_STATUS",
  "PAYMENT_METHODS",
  "PAYMENT_STATUS",
  "ORDER_LIST",
  "ORDER_DETAIL",
  "ORDER_TRACK",
  "GIFT_CARD_VALIDATE",
  "GIFT_CARD_APPLY",
  "SUPPORT",
  "UNKNOWN",
] as const;
export type CommerceIntentName = (typeof COMMERCE_INTENTS)[number];

export interface CommerceIntentFilters {
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  min_price?: number;
  max_price?: number;
  currency?: string;
  condition?: string;
  vendor?: string;
  [key: string]: string | number | undefined;
}

/**
 * The structured output of the intent engine. It decides WHAT the user wants —
 * it never carries product data, prices or stock.
 */
export interface CommerceIntent {
  intent: CommerceIntentName;
  query?: string;
  filters?: CommerceIntentFilters;
  /** Entity ids the utterance referred to (product, order, cart item). */
  targets?: string[];
  quantity?: number;
  /** 0..1 — the engine's own confidence, not a claim about the products. */
  confidence: number;
  /** Which extraction path produced this: deterministic rules or the LLM. */
  source: "rules" | "llm";
  rawText?: string;
}

// ─── Session context (§8) ───────────────────────────────────────────────────

/**
 * AI orchestration state ONLY. This is not a cart, not an order and not a
 * ledger — it holds pointers to WMPC-owned entities so a multi-turn
 * conversation can resolve "the second one" or "that order".
 */
export interface CommerceSessionContext {
  sessionId: string;
  userId: string;
  organizationId: string;
  channel: CommerceChannel;
  lastIntent?: CommerceIntentName;
  /** Ids only — product data is always re-fetched from WMPC. */
  selectedProductIds: string[];
  activeCartId?: string;
  activeCheckoutId?: string;
  lastSearch?: { query?: string; filters?: CommerceIntentFilters; resultIds: string[]; at: string };
  lastOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Image shopping (§12) ───────────────────────────────────────────────────

export const IMAGE_MATCH_CONFIDENCE = [
  "exact_match",
  "likely_match",
  "similar_product",
  "same_category",
  "visually_related",
] as const;
export type ImageMatchConfidence = (typeof IMAGE_MATCH_CONFIDENCE)[number];

export interface ImageShoppingMatch {
  product: WmpcProduct;
  confidence: ImageMatchConfidence;
  /** Why the vision layer placed it at this level — shown to the user. */
  rationale: string;
}

export interface ImageShoppingResult {
  /** What vision saw. Used to build the WMPC search; never shown as a fact. */
  observed: { description: string; category?: string; attributes: Record<string, string> };
  matches: ImageShoppingMatch[];
  /** Set when vision could not identify the object well enough to search. */
  inconclusiveReason?: string;
}

// ─── Discovery / comparison outputs ─────────────────────────────────────────

export interface RankedProduct {
  product: WmpcProduct;
  /** Relevance ordering only — never a quality or price judgement. */
  score: number;
  reasons: string[];
}

export interface ProductComparison {
  products: WmpcProduct[];
  /** One row per spec key; `values[i]` is undefined when WMPC lacks that spec. */
  rows: Array<{ key: string; label: string; values: Array<string | undefined> }>;
  /** Spec keys missing for at least one product — surfaced as "not available". */
  unavailableSpecs: string[];
  summary?: string;
}

// ─── WMPC events (§18) ──────────────────────────────────────────────────────

export const WMPC_EVENT_TYPES = [
  "payment.completed",
  "payment.failed",
  "order.created",
  "order.updated",
  "order.shipped",
  "order.delivered",
  "order.cancelled",
  "refund.completed",
  "giftcard.applied",
  "checkout.completed",
] as const;
export type WmpcEventType = (typeof WMPC_EVENT_TYPES)[number];

export interface WmpcEventEnvelope {
  /** Unique per event — the idempotency/replay key. */
  id: string;
  type: WmpcEventType;
  /** ISO-8601 emission time, used for the timestamp-window check. */
  occurredAt: string;
  data: Record<string, unknown>;
  /** WMPC customer the event concerns, used for ownership checks. */
  customerId?: string;
  orderId?: string;
  checkoutId?: string;
  paymentId?: string;
}

export const wmpcEventEnvelopeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(WMPC_EVENT_TYPES),
  occurredAt: z.string().min(1),
  data: z.record(z.unknown()).default({}),
  customerId: z.string().optional(),
  orderId: z.string().optional(),
  checkoutId: z.string().optional(),
  paymentId: z.string().optional(),
});

// ─── Analytics events (§28) ─────────────────────────────────────────────────

export const COMMERCE_ANALYTICS_EVENTS = [
  "commerce.search",
  "commerce.product_view",
  "commerce.recommendation",
  "commerce.image_search",
  "commerce.voice_search",
  "commerce.add_to_cart",
  "commerce.checkout_started",
  "commerce.payment_started",
  "commerce.order_created",
  "commerce.order_tracking",
  "commerce.support_escalation",
] as const;
export type CommerceAnalyticsEvent = (typeof COMMERCE_ANALYTICS_EVENTS)[number];

// ─── Feature flags (§29) ────────────────────────────────────────────────────

export const COMMERCE_FEATURE_FLAGS = [
  "AI_COMMERCE_ENABLED",
  "AI_PRODUCT_SEARCH_ENABLED",
  "AI_RECOMMENDATIONS_ENABLED",
  "AI_IMAGE_SHOPPING_ENABLED",
  "AI_VOICE_COMMERCE_ENABLED",
  "AI_CART_ACTIONS_ENABLED",
  "AI_CHECKOUT_ENABLED",
  "AI_ORDER_ASSISTANT_ENABLED",
  "AI_COMMERCE_SUPPORT_ENABLED",
] as const;
export type CommerceFeatureFlag = (typeof COMMERCE_FEATURE_FLAGS)[number];

// ─── Route schemas ──────────────────────────────────────────────────────────

export const aiCommerceRoutesSchema = {
  interpret: z.object({
    text: z.string().min(1).max(2000),
    sessionId: z.string().optional(),
    channel: z.enum(COMMERCE_CHANNELS).optional(),
  }),
  search: z.object({
    query: z.string().max(500).optional(),
    filters: z.record(z.unknown()).optional(),
    sort: z.enum(["relevance", "price_asc", "price_desc", "rating", "newest"]).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    cursor: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  compare: z.object({
    productIds: z.array(z.string().min(1)).min(2).max(5),
    sessionId: z.string().optional(),
  }),
  imageSearch: z.object({
    imageBase64: z.string().min(1),
    mimeType: z.string().min(1),
    hint: z.string().max(500).optional(),
    sessionId: z.string().optional(),
  }),
  voiceSearch: z.object({
    transcript: z.string().min(1).max(2000),
    sessionId: z.string().optional(),
  }),
  addToCart: z.object({
    productId: z.string().min(1),
    quantity: z.number().int().min(1).max(999).default(1),
    variantId: z.string().optional(),
    sessionId: z.string().optional(),
    idempotencyKey: z.string().max(200).optional(),
  }),
  updateCart: z.object({
    itemId: z.string().min(1),
    quantity: z.number().int().min(0).max(999),
    sessionId: z.string().optional(),
    idempotencyKey: z.string().max(200).optional(),
  }),
  createCheckout: z.object({
    cartId: z.string().min(1).optional(),
    sessionId: z.string().optional(),
    idempotencyKey: z.string().max(200).optional(),
  }),
  giftCardValidate: z.object({ code: z.string().min(1).max(100) }),
  giftCardApply: z.object({
    code: z.string().min(1).max(100),
    checkoutId: z.string().min(1).optional(),
    cartId: z.string().min(1).optional(),
    idempotencyKey: z.string().max(200).optional(),
  }),
  productId: z.object({ id: z.string().min(1) }),
  orderId: z.object({ id: z.string().min(1) }),
  paymentId: z.object({ id: z.string().min(1) }),
  checkoutId: z.object({ id: z.string().min(1) }),
  queryOrders: z.object({
    status: z.enum(WMPC_ORDER_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    cursor: z.string().optional(),
  }),
};
