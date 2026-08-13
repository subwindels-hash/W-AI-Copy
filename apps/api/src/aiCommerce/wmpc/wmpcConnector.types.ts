/**
 * WMPC Commerce Connector — interface (§5, §6, §36).
 *
 * This is the ONLY boundary between WINDELS AI Commerce and WMPC. Agents call
 * tools, tools call this interface, and an adapter fulfils it. Two adapters
 * implement it:
 *
 *   - `MockWmpcAdapter`  — Stage 1 development/test only (§32).
 *   - `HttpWmpcAdapter`  — Stage 2, speaks to the real WMPC API.
 *
 * The interface is frozen: Stage 2 swaps the adapter and changes nothing else.
 * No method here returns a value WINDELS computed — everything originates in
 * WMPC and is passed through.
 */
import type {
  CommerceCustomerContext,
  CommerceResult,
  WmpcCart,
  WmpcCheckoutSession,
  WmpcGiftCardApplication,
  WmpcGiftCardValidation,
  WmpcOrder,
  WmpcOrderStatus,
  WmpcPaymentMethod,
  WmpcPaymentStatus,
  WmpcProduct,
  WmpcProductSearchRequest,
  WmpcProductSearchResult,
  WmpcTrackingInformation,
} from "@windels/shared";

/**
 * Per-call metadata. `idempotencyKey` is REQUIRED by the interface on every
 * state-changing operation (§20) so an adapter can never silently duplicate a
 * financial action.
 */
export interface WmpcCallOptions {
  /** Propagated to WMPC and into every log line for tracing (§31). */
  correlationId: string;
  /** Required on mutations; ignored on reads. */
  idempotencyKey?: string;
  timeoutMs?: number;
}

export interface WmpcOrderListRequest {
  status?: WmpcOrderStatus;
  limit?: number;
  cursor?: string;
}

export interface WmpcOrderListResult {
  orders: WmpcOrder[];
  total: number;
  cursor?: string;
}

/**
 * Every method takes the customer context so the adapter can scope the call to
 * one customer. Ownership is additionally enforced WINDELS-side by the
 * permission guard (§23) — the connector is never the only line of defence.
 */
export interface WmpcCommerceConnector {
  /** Adapter identity, surfaced in health checks and logs. Never "mock" in prod. */
  readonly name: string;
  /** False for the mock adapter. Production paths must assert this is true. */
  readonly isProduction: boolean;

  // ── Catalog ──────────────────────────────────────────────────────────────
  searchProducts(
    ctx: CommerceCustomerContext,
    req: WmpcProductSearchRequest,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcProductSearchResult>>;

  getProduct(
    ctx: CommerceCustomerContext,
    productId: string,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcProduct>>;

  // ── Cart ─────────────────────────────────────────────────────────────────
  getCart(ctx: CommerceCustomerContext, opts: WmpcCallOptions): Promise<CommerceResult<WmpcCart>>;

  addToCart(
    ctx: CommerceCustomerContext,
    input: { productId: string; quantity: number; variantId?: string },
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcCart>>;

  updateCartItem(
    ctx: CommerceCustomerContext,
    input: { itemId: string; quantity: number },
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcCart>>;

  removeCartItem(
    ctx: CommerceCustomerContext,
    input: { itemId: string },
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcCart>>;

  clearCart(ctx: CommerceCustomerContext, opts: WmpcCallOptions): Promise<CommerceResult<WmpcCart>>;

  // ── Checkout ─────────────────────────────────────────────────────────────
  createCheckout(
    ctx: CommerceCustomerContext,
    input: { cartId?: string },
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcCheckoutSession>>;

  getCheckout(
    ctx: CommerceCustomerContext,
    checkoutId: string,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcCheckoutSession>>;

  // ── Payment (status only — WINDELS never processes payment) ──────────────
  getPaymentMethods(
    ctx: CommerceCustomerContext,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcPaymentMethod[]>>;

  getPaymentStatus(
    ctx: CommerceCustomerContext,
    paymentId: string,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcPaymentStatus>>;

  // ── Orders ───────────────────────────────────────────────────────────────
  listOrders(
    ctx: CommerceCustomerContext,
    req: WmpcOrderListRequest,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcOrderListResult>>;

  getOrder(
    ctx: CommerceCustomerContext,
    orderId: string,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcOrder>>;

  getOrderTracking(
    ctx: CommerceCustomerContext,
    orderId: string,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcTrackingInformation>>;

  // ── Gift cards ───────────────────────────────────────────────────────────
  validateGiftCard(
    ctx: CommerceCustomerContext,
    code: string,
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcGiftCardValidation>>;

  applyGiftCard(
    ctx: CommerceCustomerContext,
    input: { code: string; checkoutId?: string; cartId?: string },
    opts: WmpcCallOptions,
  ): Promise<CommerceResult<WmpcGiftCardApplication>>;

  /** Liveness probe used by the health endpoint and the Command Center. */
  health(): Promise<{ healthy: boolean; adapter: string; detail?: string }>;
}
