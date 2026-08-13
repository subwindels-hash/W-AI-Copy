/**
 * HTTP WMPC adapter — speaks to the real WMPC commerce API (§5, §6).
 *
 * This is the production adapter. It is fully implemented against the
 * documented WMPC API contract (docs/WMPC_API_CONTRACT.md) and becomes live the
 * moment WMPC_API_BASE_URL and WMPC_API_KEY are configured — no code change.
 *
 * Stage 1 note: WMPC itself is not built yet, so in this repository the adapter
 * has no live endpoint to talk to. It is nevertheless real code, not a stub: it
 * performs genuine HTTP requests, honest error mapping and idempotency-key
 * propagation. With no credentials configured it is never constructed — the
 * factory fails closed with WMPC_UNAVAILABLE rather than inventing data.
 *
 * Security: the API key is sent in the Authorization header and is never
 * logged. Only method, path, status, latency and correlation id are logged.
 */
import type {
  CommerceCustomerContext,
  CommerceResult,
  WmpcCart,
  WmpcCheckoutSession,
  WmpcGiftCardApplication,
  WmpcGiftCardValidation,
  WmpcOrder,
  WmpcPaymentMethod,
  WmpcPaymentStatus,
  WmpcProduct,
  WmpcProductSearchRequest,
  WmpcProductSearchResult,
  WmpcTrackingInformation,
} from "@windels/shared";
import { logger } from "../../config/logger.js";
import {
  codeFromHttpStatus,
  commerceErrorFromException,
  commerceFailure,
  commerceOk,
} from "../commerceErrors.js";
import type {
  WmpcCallOptions,
  WmpcCommerceConnector,
  WmpcOrderListRequest,
  WmpcOrderListResult,
} from "./wmpcConnector.types.js";

export interface HttpWmpcAdapterConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

export class HttpWmpcAdapter implements WmpcCommerceConnector {
  readonly name = "wmpc-http-adapter";
  readonly isProduction = true;

  constructor(private readonly config: HttpWmpcAdapterConfig) {
    if (!config.baseUrl || !config.apiKey) {
      throw new Error("HttpWmpcAdapter requires WMPC_API_BASE_URL and WMPC_API_KEY.");
    }
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    ctx: CommerceCustomerContext,
    opts: WmpcCallOptions,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<CommerceResult<T>> {
    const url = new URL(path.replace(/^\//, ""), this.config.baseUrl.endsWith("/") ? this.config.baseUrl : `${this.config.baseUrl}/`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Correlation-Id": opts.correlationId,
      "X-Windels-Organization-Id": ctx.organizationId,
      "X-Windels-User-Id": ctx.userId,
    };
    if (ctx.wmpcCustomerId) headers["X-Wmpc-Customer-Id"] = ctx.wmpcCustomerId;
    // Idempotency-Key is mandatory for mutations (§20).
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.config.timeoutMs);
    const started = Date.now();

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        signal: controller.signal,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const latencyMs = Date.now() - started;
      const text = await res.text();

      // Never log the Authorization header or the response body (may contain PII).
      logger.info("[wmpc] request", {
        method,
        path: url.pathname,
        status: res.status,
        latencyMs,
        correlationId: opts.correlationId,
        ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
      });

      if (!res.ok) {
        let upstreamCode: string | undefined;
        let message: string | undefined;
        try {
          const parsed = JSON.parse(text) as { code?: string; error?: { code?: string; message?: string }; message?: string };
          upstreamCode = parsed.error?.code || parsed.code;
          message = parsed.error?.message || parsed.message;
        } catch {
          // Non-JSON error body — keep the status-derived classification only.
        }
        return commerceFailure(codeFromHttpStatus(res.status), message, {
          ...(upstreamCode ? { upstreamCode } : {}),
          correlationId: opts.correlationId,
        });
      }

      if (!text) return commerceOk(undefined as T);
      const parsed = JSON.parse(text) as { data?: T } & T;
      // WMPC responses are enveloped as {data: …}; accept a bare body too.
      return commerceOk((parsed && typeof parsed === "object" && "data" in parsed ? parsed.data : parsed) as T);
    } catch (err) {
      logger.warn("[wmpc] request failed", {
        method,
        path: url.pathname,
        correlationId: opts.correlationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, error: commerceErrorFromException(err, opts.correlationId) };
    } finally {
      clearTimeout(timer);
    }
  }

  async searchProducts(ctx: CommerceCustomerContext, req: WmpcProductSearchRequest, opts: WmpcCallOptions) {
    return this.request<WmpcProductSearchResult>("POST", "/products/search", ctx, opts, req);
  }

  async getProduct(ctx: CommerceCustomerContext, productId: string, opts: WmpcCallOptions) {
    return this.request<WmpcProduct>("GET", `/products/${encodeURIComponent(productId)}`, ctx, opts);
  }

  async getCart(ctx: CommerceCustomerContext, opts: WmpcCallOptions) {
    return this.request<WmpcCart>("GET", "/cart", ctx, opts);
  }

  async addToCart(
    ctx: CommerceCustomerContext,
    input: { productId: string; quantity: number; variantId?: string },
    opts: WmpcCallOptions,
  ) {
    return this.request<WmpcCart>("POST", "/cart/items", ctx, opts, input);
  }

  async updateCartItem(ctx: CommerceCustomerContext, input: { itemId: string; quantity: number }, opts: WmpcCallOptions) {
    return this.request<WmpcCart>("PATCH", `/cart/items/${encodeURIComponent(input.itemId)}`, ctx, opts, {
      quantity: input.quantity,
    });
  }

  async removeCartItem(ctx: CommerceCustomerContext, input: { itemId: string }, opts: WmpcCallOptions) {
    return this.request<WmpcCart>("DELETE", `/cart/items/${encodeURIComponent(input.itemId)}`, ctx, opts);
  }

  async clearCart(ctx: CommerceCustomerContext, opts: WmpcCallOptions) {
    return this.request<WmpcCart>("DELETE", "/cart", ctx, opts);
  }

  async createCheckout(ctx: CommerceCustomerContext, input: { cartId?: string }, opts: WmpcCallOptions) {
    return this.request<WmpcCheckoutSession>("POST", "/checkout/sessions", ctx, opts, input);
  }

  async getCheckout(ctx: CommerceCustomerContext, checkoutId: string, opts: WmpcCallOptions) {
    return this.request<WmpcCheckoutSession>("GET", `/checkout/sessions/${encodeURIComponent(checkoutId)}`, ctx, opts);
  }

  async getPaymentMethods(ctx: CommerceCustomerContext, opts: WmpcCallOptions) {
    return this.request<WmpcPaymentMethod[]>("GET", "/payment-methods", ctx, opts);
  }

  async getPaymentStatus(ctx: CommerceCustomerContext, paymentId: string, opts: WmpcCallOptions) {
    return this.request<WmpcPaymentStatus>("GET", `/payments/${encodeURIComponent(paymentId)}`, ctx, opts);
  }

  async listOrders(ctx: CommerceCustomerContext, req: WmpcOrderListRequest, opts: WmpcCallOptions) {
    return this.request<WmpcOrderListResult>("GET", "/orders", ctx, opts, undefined, {
      status: req.status,
      limit: req.limit,
      cursor: req.cursor,
    });
  }

  async getOrder(ctx: CommerceCustomerContext, orderId: string, opts: WmpcCallOptions) {
    return this.request<WmpcOrder>("GET", `/orders/${encodeURIComponent(orderId)}`, ctx, opts);
  }

  async getOrderTracking(ctx: CommerceCustomerContext, orderId: string, opts: WmpcCallOptions) {
    return this.request<WmpcTrackingInformation>("GET", `/orders/${encodeURIComponent(orderId)}/tracking`, ctx, opts);
  }

  async validateGiftCard(ctx: CommerceCustomerContext, code: string, opts: WmpcCallOptions) {
    return this.request<WmpcGiftCardValidation>("POST", "/gift-cards/validate", ctx, opts, { code });
  }

  async applyGiftCard(
    ctx: CommerceCustomerContext,
    input: { code: string; checkoutId?: string; cartId?: string },
    opts: WmpcCallOptions,
  ) {
    return this.request<WmpcGiftCardApplication>("POST", "/gift-cards/apply", ctx, opts, input);
  }

  async health(): Promise<{ healthy: boolean; adapter: string; detail?: string }> {
    try {
      const res = await fetch(new URL("health", this.config.baseUrl.endsWith("/") ? this.config.baseUrl : `${this.config.baseUrl}/`).toString(), {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return { healthy: res.ok, adapter: this.name, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { healthy: false, adapter: this.name, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}
