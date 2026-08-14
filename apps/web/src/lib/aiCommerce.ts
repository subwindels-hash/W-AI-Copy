/**
 * AI Commerce (WMPC) web client.
 * Session 170 — wraps the /api/v1/ai-commerce surface (catalog, cart, checkout,
 * orders, payments, gift cards, image/voice shopping, admin). Every monetary
 * value is forwarded verbatim from WMPC per the honesty discipline; nothing is
 * invented locally.
 */
import { api } from "./api";
import type {
  WmpcProduct,
  WmpcProductSearchRequest,
  WmpcProductSearchResult,
  WmpcCart,
  WmpcCartItem,
  WmpcCheckoutSession,
  WmpcPaymentMethod,
  WmpcPaymentStatus,
  WmpcOrder,
  WmpcTrackingInformation,
  WmpcGiftCardValidation,
  WmpcGiftCardApplication,
  CommerceIntent,
  CommerceSessionContext,
  ImageShoppingResult,
  ProductComparison,
  CommerceResult,
} from "@windels/shared";
export type {
  WmpcProduct,
  WmpcProductSearchRequest,
  WmpcProductSearchResult,
  WmpcCart,
  WmpcCartItem,
  WmpcCheckoutSession,
  WmpcPaymentMethod,
  WmpcPaymentStatus,
  WmpcOrder,
  WmpcTrackingInformation,
  WmpcGiftCardValidation,
  WmpcGiftCardApplication,
  CommerceIntent,
  CommerceSessionContext,
  ImageShoppingResult,
  ProductComparison,
  CommerceResult,
};

const P = "/ai-commerce";

export const aiCommerceApi = {
  // ── Intent interpretation & search ──────────────────────────────────
  interpret: (input: { text: string; context?: Partial<CommerceSessionContext> }) =>
    api<CommerceResult<{ intent: CommerceIntent; products?: WmpcProduct[] }>>(
      `${P}/interpret`,
      { method: "POST", json: input },
    ),
  search: (input: WmpcProductSearchRequest) =>
    api<WmpcProductSearchResult>(`${P}/search`, { method: "POST", json: input }),
  product: (id: string) => api<WmpcProduct>(`${P}/products/${encodeURIComponent(id)}`),
  compare: (input: { productIds: string[] }) =>
    api<ProductComparison>(`${P}/compare`, { method: "POST", json: input }),

  // ── Cart ────────────────────────────────────────────────────────────
  getCart: () => api<WmpcCart>(`${P}/cart`),
  addToCart: (input: { productId: string; quantity: number }) =>
    api<WmpcCart>(`${P}/cart/items`, { method: "POST", json: input }),
  updateCartItem: (itemId: string, input: { quantity: number }) =>
    api<WmpcCart>(`${P}/cart/items`, { method: "PATCH", json: { itemId, ...input } }),
  removeCartItem: (itemId: string) =>
    api<WmpcCart>(`${P}/cart/items/${encodeURIComponent(itemId)}`, { method: "DELETE" }),
  clearCart: () => api<{ ok: true }>(`${P}/cart`, { method: "DELETE" }),

  // ── Checkout & payments ─────────────────────────────────────────────
  checkout: (input?: { cartId?: string; confirmed?: boolean }) =>
    api<WmpcCheckoutSession>(`${P}/checkout`, { method: "POST", json: input ?? {} }),
  getCheckout: (id: string) => api<WmpcCheckoutSession>(`${P}/checkout/${encodeURIComponent(id)}`),
  paymentMethods: () => api<WmpcPaymentMethod[]>(`${P}/payment-methods`),
  paymentStatus: (id: string) => api<WmpcPaymentStatus>(`${P}/payments/${encodeURIComponent(id)}`),

  // ── Orders ──────────────────────────────────────────────────────────
  listOrders: (opts?: { status?: string; limit?: number; cursor?: string }) => {
    const usp = new URLSearchParams();
    if (opts?.status) usp.set("status", opts.status);
    if (opts?.limit) usp.set("limit", String(opts.limit));
    if (opts?.cursor) usp.set("cursor", opts.cursor);
    const qs = usp.toString();
    return api<WmpcOrder[]>(`${P}/orders${qs ? `?${qs}` : ""}`);
  },
  getOrder: (id: string) => api<WmpcOrder>(`${P}/orders/${encodeURIComponent(id)}`),
  trackOrder: (id: string) =>
    api<WmpcTrackingInformation>(`${P}/orders/${encodeURIComponent(id)}/tracking`),

  // ── Gift cards ──────────────────────────────────────────────────────
  validateGiftCard: (input: { code: string }) =>
    api<WmpcGiftCardValidation>(`${P}/gift-cards/validate`, { method: "POST", json: input }),
  applyGiftCard: (input: { code: string; cartId?: string; checkoutId?: string }) =>
    api<WmpcGiftCardApplication>(`${P}/gift-cards/apply`, { method: "POST", json: input }),

  // ── Session context ─────────────────────────────────────────────────
  session: (sessionId: string) =>
    api<CommerceSessionContext>(`${P}/session/${encodeURIComponent(sessionId)}`),

  // ── Admin / provisioning ────────────────────────────────────────────
  adminStatus: () =>
    api<{
      wmpcConfigured: boolean;
      wmpcConnected: boolean;
      agentProvisioned: boolean;
      flagsProvisioned: boolean;
      connectorKind: string;
    }>(`${P}/admin/status`),
  provisionFlags: () =>
    api<{ ok: true }>(`${P}/admin/flags/provision`, { method: "POST" }),
  provisionAgent: () =>
    api<{ ok: true }>(`${P}/admin/agent/provision`, { method: "POST" }),
};
