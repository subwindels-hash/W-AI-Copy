import type { Request, Response, NextFunction } from "express";
import { prisma } from "../../db/client.js";

/** Existing billing/API-product quota gate for the new /v1 surface. */
export function apiProductQuota(productSlug: string) {
 return async function quota(req: Request, res: Response, next: NextFunction) {
  try {
    const organizationId = (req as any).apiOrganization?.id;
    if (!organizationId) return res.status(401).json({ error: { message: "Organization context missing", type: "authentication_error", code: "invalid_api_key", param: null }, request_id: req.requestId });
    const billing = await prisma.billingSubscription.findFirst({ where: { organizationId }, select: { status: true, plan: true } });
    if (billing && ["past_due", "cancelled", "canceled", "suspended"].includes(billing.status)) {
      return res.status(402).json({ error: { message: `Organization billing status is ${billing.status}`, type: "billing_error", code: "billing_inactive", param: null }, request_id: req.requestId });
    }
    const product = await prisma.apiProduct.findFirst({ where: { organizationId: null, slug: productSlug, enabled: true }, select: { id: true } });
    if (product) {
      const subscription = await prisma.apiSubscription.findFirst({ where: { organizationId, productId: product.id, status: "active" }, select: { quota: true, usedThisMonth: true } });
      if (subscription?.quota && subscription.usedThisMonth >= subscription.quota) {
        return res.status(429).json({ error: { message: `${productSlug} monthly API quota exceeded`, type: "rate_limit_error", code: "quota_exceeded", param: null }, request_id: req.requestId });
      }
    }
    next();
  } catch (error) { next(error); }
 };
}
export const nativeAiQuota = apiProductQuota("native-ai");
