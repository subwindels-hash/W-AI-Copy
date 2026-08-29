/**
 * WMPC connector selection (§5, §32, §36).
 *
 * Exactly one adapter is active per process, chosen by configuration:
 *
 *   1. WMPC_API_BASE_URL + WMPC_API_KEY set  → HttpWmpcAdapter   (production)
 *   2. WINDELS_ALLOW_MOCK_WMPC=true, non-prod → MockWmpcAdapter   (Stage 1 dev/test)
 *   3. otherwise                              → UnavailableAdapter (fails closed)
 *
 * Case 3 is the important one: with nothing configured, every commerce call
 * returns WMPC_UNAVAILABLE. AI Commerce degrades honestly instead of inventing
 * a marketplace. The mock is never reachable in production — both the factory
 * and the adapter's own constructor refuse.
 */
import type { CommerceResult } from "@windels/shared";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { commerceFailure } from "../commerceErrors.js";
import { HttpWmpcAdapter } from "./httpWmpcAdapter.js";
import { MockWmpcAdapter } from "./mockWmpcAdapter.js";
import type { WmpcCommerceConnector } from "./wmpcConnector.types.js";

const NOT_CONFIGURED_MESSAGE =
  "The marketplace connection is not configured. Set WMPC_API_BASE_URL and WMPC_API_KEY to enable AI Commerce.";

/**
 * Fail-closed adapter used when no WMPC connection is configured. It answers
 * every operation with the same honest error — it never returns empty results,
 * because "no products" and "we cannot reach the marketplace" are different
 * facts and conflating them would mislead the user and the AI.
 */
export class UnavailableWmpcAdapter implements WmpcCommerceConnector {
  readonly name = "wmpc-unconfigured";
  readonly isProduction = false;

  private fail<T>(): Promise<CommerceResult<T>> {
    return Promise.resolve(commerceFailure<T>("WMPC_UNAVAILABLE", NOT_CONFIGURED_MESSAGE));
  }

  searchProducts() { return this.fail<any>(); }
  getProduct() { return this.fail<any>(); }
  getCart() { return this.fail<any>(); }
  addToCart() { return this.fail<any>(); }
  updateCartItem() { return this.fail<any>(); }
  removeCartItem() { return this.fail<any>(); }
  clearCart() { return this.fail<any>(); }
  createCheckout() { return this.fail<any>(); }
  getCheckout() { return this.fail<any>(); }
  getPaymentMethods() { return this.fail<any>(); }
  getPaymentStatus() { return this.fail<any>(); }
  listOrders() { return this.fail<any>(); }
  getOrder() { return this.fail<any>(); }
  getOrderTracking() { return this.fail<any>(); }
  validateGiftCard() { return this.fail<any>(); }
  applyGiftCard() { return this.fail<any>(); }

  async health() {
    return { healthy: false, adapter: this.name, detail: NOT_CONFIGURED_MESSAGE };
  }
}

let cached: WmpcCommerceConnector | null = null;

export function createWmpcConnector(): WmpcCommerceConnector {
  const nodeEnv = env.NODE_ENV;

  if (env.WMPC_API_BASE_URL && env.WMPC_API_KEY) {
    logger.info("[aiCommerce] WMPC connector: real HTTP adapter", { baseUrl: env.WMPC_API_BASE_URL });
    return new HttpWmpcAdapter({
      baseUrl: env.WMPC_API_BASE_URL,
      apiKey: env.WMPC_API_KEY,
      timeoutMs: env.WMPC_TIMEOUT_MS,
    });
  }

  if (env.WINDELS_ALLOW_MOCK_WMPC) {
    if (nodeEnv === "production") {
      logger.error(
        "[aiCommerce] WINDELS_ALLOW_MOCK_WMPC is set in production and was REFUSED. " +
          "AI Commerce will report the marketplace as unavailable until real WMPC credentials are configured.",
      );
      return new UnavailableWmpcAdapter();
    }
    logger.warn(
      "[aiCommerce] WMPC connector: MOCK adapter active (development/test fixtures, NOT a real marketplace).",
    );
    return new MockWmpcAdapter(nodeEnv);
  }

  logger.warn("[aiCommerce] WMPC connector: not configured — commerce operations will report WMPC_UNAVAILABLE.");
  return new UnavailableWmpcAdapter();
}

/** Process-wide connector. */
export function getWmpcConnector(): WmpcCommerceConnector {
  if (!cached) cached = createWmpcConnector();
  return cached;
}

/** Test seam — lets suites install a specific adapter. */
export function setWmpcConnector(connector: WmpcCommerceConnector | null): void {
  cached = connector;
}

/**
 * Describe the active connector for the admin surface (§30). Deliberately
 * exposes NO credentials — only which mode is live, so an operator can see at
 * a glance whether they are looking at real marketplace data or fixtures.
 */
export function getWmpcConnectorInfo(): {
  mode: "http" | "mock" | "unavailable";
  isProductionData: boolean;
  baseUrlConfigured: boolean;
  apiKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  warning?: string;
} {
  const connector = getWmpcConnector();
  const mode: "http" | "mock" | "unavailable" =
    connector.name === "wmpc-http-adapter" ? "http" : connector.name === "wmpc-mock-adapter" ? "mock" : "unavailable";
  return {
    mode,
    isProductionData: mode === "http",
    baseUrlConfigured: Boolean(env.WMPC_API_BASE_URL),
    apiKeyConfigured: Boolean(env.WMPC_API_KEY),
    webhookSecretConfigured: Boolean(env.WMPC_WEBHOOK_SECRET),
    warning:
      mode === "mock"
        ? "MOCK WMPC ADAPTER ACTIVE — all products, carts, orders and payments are development fixtures and are not real."
        : mode === "unavailable"
          ? "WMPC is not configured. Commerce operations will report WMPC_UNAVAILABLE."
          : undefined,
  };
}
