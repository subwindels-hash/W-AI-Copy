/**
 * Standardized commerce errors (§21).
 *
 * Every failure anywhere in AI Commerce — connector, tool, route, event
 * consumer — is normalised into exactly one of the thirteen codes. Agents
 * therefore only ever have to reason about a closed set, and no raw upstream
 * error text is ever presented to a user as if it were a WINDELS fact.
 */
import type { CommerceError, CommerceErrorCode, CommerceResult } from "@windels/shared";

/** Codes where retrying the identical request is safe and may succeed. */
const RETRYABLE: ReadonlySet<CommerceErrorCode> = new Set<CommerceErrorCode>([
  "RATE_LIMITED",
  "WMPC_UNAVAILABLE",
  "PAYMENT_PENDING",
]);

/** Human-facing defaults. Deliberately free of invented specifics. */
const DEFAULT_MESSAGES: Record<CommerceErrorCode, string> = {
  PRODUCT_NOT_FOUND: "That product could not be found in the marketplace.",
  OUT_OF_STOCK: "That product is not currently available in the requested quantity.",
  CART_UPDATE_FAILED: "The cart could not be updated.",
  CHECKOUT_FAILED: "The checkout could not be created.",
  PAYMENT_FAILED: "The payment did not go through.",
  PAYMENT_PENDING: "The payment is still being processed and has not completed.",
  ORDER_NOT_FOUND: "That order could not be found.",
  UNAUTHORIZED: "Authentication is required for this commerce action.",
  FORBIDDEN: "You do not have permission to perform this commerce action.",
  RATE_LIMITED: "Too many commerce requests. Please try again shortly.",
  WMPC_UNAVAILABLE: "The marketplace is temporarily unreachable.",
  INVALID_REQUEST: "The commerce request was not valid.",
  UNKNOWN_COMMERCE_ERROR: "An unexpected commerce error occurred.",
};

export function commerceError(
  code: CommerceErrorCode,
  message?: string,
  extra?: { upstreamCode?: string; correlationId?: string; details?: Record<string, unknown> },
): CommerceError {
  return {
    code,
    message: message || DEFAULT_MESSAGES[code],
    retryable: RETRYABLE.has(code),
    ...(extra?.upstreamCode ? { upstreamCode: extra.upstreamCode } : {}),
    ...(extra?.correlationId ? { correlationId: extra.correlationId } : {}),
    ...(extra?.details ? { details: extra.details } : {}),
  };
}

export function commerceFailure<T = never>(
  code: CommerceErrorCode,
  message?: string,
  extra?: { upstreamCode?: string; correlationId?: string; details?: Record<string, unknown> },
): CommerceResult<T> {
  return { ok: false, error: commerceError(code, message, extra) };
}

export function commerceOk<T>(data: T): CommerceResult<T> {
  return { ok: true, data };
}

/**
 * Map an HTTP status returned by WMPC onto a commerce error code.
 * Used by the Stage 2 HTTP adapter and by contract tests.
 */
export function codeFromHttpStatus(status: number): CommerceErrorCode {
  if (status === 400 || status === 422) return "INVALID_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "PRODUCT_NOT_FOUND";
  if (status === 409) return "CART_UPDATE_FAILED";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "WMPC_UNAVAILABLE";
  return "UNKNOWN_COMMERCE_ERROR";
}

/**
 * Normalise a thrown exception. Network-level failures become
 * WMPC_UNAVAILABLE (retryable); everything else is UNKNOWN_COMMERCE_ERROR so
 * we never present an unclassified failure as a success.
 */
export function commerceErrorFromException(err: unknown, correlationId?: string): CommerceError {
  const msg = err instanceof Error ? err.message : String(err);
  const networkish =
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed|aborted|timeout/i.test(msg);
  return commerceError(
    networkish ? "WMPC_UNAVAILABLE" : "UNKNOWN_COMMERCE_ERROR",
    networkish ? "The marketplace is temporarily unreachable." : undefined,
    { correlationId, details: { cause: msg } },
  );
}

/** HTTP status for a commerce error, used by the route layer. */
export function httpStatusForCommerceError(code: CommerceErrorCode): number {
  switch (code) {
    case "INVALID_REQUEST":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "PRODUCT_NOT_FOUND":
    case "ORDER_NOT_FOUND":
      return 404;
    case "OUT_OF_STOCK":
    case "CART_UPDATE_FAILED":
    case "CHECKOUT_FAILED":
    case "PAYMENT_FAILED":
      return 409;
    case "PAYMENT_PENDING":
      return 202;
    case "RATE_LIMITED":
      return 429;
    case "WMPC_UNAVAILABLE":
      return 503;
    default:
      return 500;
  }
}
