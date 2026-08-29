/**
 * Admin API Control Center routes (Super Admin).
 *
 * Platform-wide controls over the Developer / API Platform: enable/disable
 * API products, adjust pricing/rate limits, approve/suspend developer
 * applications, and view aggregated usage across all organizations. Every
 * mutation is audited.
 */
import { Router } from "express";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import {
  adminListApps,
  adminListProducts,
  adminSetAppActive,
  adminSetAppApproved,
  adminSetProductEnabled,
  adminUpdateProduct,
  adminUsageSummary,
} from "../../devportal/adminApiControl.service.js";

const ProductId = z.object({ id: z.string().cuid() });
const AppId = z.object({ id: z.string().cuid() });
const ToggleSchema = z.object({ enabled: z.boolean() });
const ProductUpdateSchema = z.object({
  rateLimitPerMin: z.number().int().min(1).max(10000).optional(),
  basePriceUsd: z.number().min(0).optional(),
  requiredScopes: z.array(z.string().min(3).max(64)).max(50).optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

function meta(req: any) { return { requestId: req.requestId ?? "", tookMs: Date.now() - (req.startedAt ?? Date.now()) }; }

export function registerAdminApiControlRoutes(router: Router) {
  const admin = Router();
  admin.use(authenticate, requireSuperAdmin);

  // Products / catalog
  admin.get("/products", async (req, res, next) => {
    try { res.json({ ok: true, data: await adminListProducts(req.user!.id), meta: meta(req) }); } catch (e) { next(e); }
  });
  admin.patch("/products/:id/enabled", validate({ params: ProductId, body: ToggleSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await adminSetProductEnabled(req.user!.id, req.params.id, req.body.enabled), meta: meta(req) }); } catch (e) { next(e); }
  });
  admin.patch("/products/:id", validate({ params: ProductId, body: ProductUpdateSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await adminUpdateProduct(req.user!.id, req.params.id, req.body), meta: meta(req) }); } catch (e) { next(e); }
  });

  // Applications
  admin.get("/apps", async (req, res, next) => {
    try { res.json({ ok: true, data: await adminListApps(req.user!.id), meta: meta(req) }); } catch (e) { next(e); }
  });
  admin.patch("/apps/:id/approve", validate({ params: AppId, body: ToggleSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await adminSetAppApproved(req.user!.id, req.params.id, req.body.enabled), meta: meta(req) }); } catch (e) { next(e); }
  });
  admin.patch("/apps/:id/active", validate({ params: AppId, body: ToggleSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await adminSetAppActive(req.user!.id, req.params.id, req.body.enabled), meta: meta(req) }); } catch (e) { next(e); }
  });

  // Platform usage
  admin.get("/usage", validate({ query: z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await adminUsageSummary(req.user!.id, Number((req.query as any).days ?? 7)), meta: meta(req) }); } catch (e) { next(e); }
  });

  router.use("/admin/api-platform", admin);
}
