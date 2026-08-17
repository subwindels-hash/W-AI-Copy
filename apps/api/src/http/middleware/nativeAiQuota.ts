import type { Request, Response, NextFunction } from "express";
import { prisma } from "../../db/client.js";

interface QuotaFailure {
  status: 402 | 429;
  code: "billing_inactive" | "quota_exceeded";
  message: string;
}

/**
 * One lookup shared by API-key and signed-in member Native AI entry points.
 * This intentionally only checks the current counter; successful request
 * accounting is performed by the durable usage ledger after the response.
 */
export async function productQuotaFailure(organizationId: string, productSlug: string): Promise<QuotaFailure | null> {
  const billing = await prisma.billingSubscription.findFirst({
    where: { organizationId },
    select: { status: true, plan: true },
  });
  if (billing && ["past_due", "cancelled", "canceled", "suspended"].includes(billing.status)) {
    return {
      status: 402,
      code: "billing_inactive",
      message: `Organization billing status is ${billing.status}`,
    };
  }
  const product = await prisma.apiProduct.findFirst({
    where: { organizationId: null, slug: productSlug, enabled: true },
    select: { id: true },
  });
  if (!product) return null;
  const subscription = await prisma.apiSubscription.findFirst({
    where: { organizationId, productId: product.id, status: "active" },
    select: { quota: true, usedThisMonth: true },
  });
  if (subscription?.quota && subscription.usedThisMonth >= subscription.quota) {
    return {
      status: 429,
      code: "quota_exceeded",
      message: `${productSlug} monthly API quota exceeded`,
    };
  }
  return null;
}

/** Existing API-key product quota gate. Public `/v1` keeps its native error shape. */
export function apiProductQuota(productSlug: string) {
 return async function quota(req: Request, res: Response, next: NextFunction) {
  try {
    const organizationId = (req as any).apiOrganization?.id;
    if (!organizationId) return res.status(401).json({ error: { message: "Organization context missing", type: "authentication_error", code: "invalid_api_key", param: null }, request_id: req.requestId });
    const failure = await productQuotaFailure(organizationId, productSlug);
    if (failure) {
      return res.status(failure.status).json({
        error: {
          message: failure.message,
          type: failure.status === 402 ? "billing_error" : "rate_limit_error",
          code: failure.code,
          param: null,
        },
        request_id: req.requestId,
      });
    }
    next();
  } catch (error) { next(error); }
 };
}
export const nativeAiQuota = apiProductQuota("native-ai");

/**
 * Session-authenticated gate for the first-party Native AI Studio. It preserves
 * the ordinary `/api/v1` envelope and requires a JWT organization context;
 * merely possessing a user account can never bill or use another tenant.
 */
export async function nativeAiMemberQuota(req: Request, res: Response, next: NextFunction) {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Organization context required" }, meta: { requestId: req.requestId } });
    }
    const failure = await productQuotaFailure(organizationId, "native-ai");
    if (failure) {
      return res.status(failure.status).json({
        ok: false,
        error: {
          code: failure.status === 429 ? "TOO_MANY_REQUESTS" : "FORBIDDEN",
          message: failure.message,
        },
        meta: { requestId: req.requestId },
      });
    }
    next();
  } catch (error) { next(error); }
}
