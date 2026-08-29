/**
 * Developer / API Platform routes (authenticated, org-scoped).
 *
 * Serves the Developer Portal UI: applications, API products (marketplace),
 * subscriptions, and the usage dashboard. All reads/mutations go through the
 * existing Prisma services and are scoped to the caller's organization.
 */
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import {
  DeveloperAppCreateSchema,
  DeveloperAppUpdateSchema,
  ApiUsageQuerySchema,
} from "@windels/shared/developerPlatform";
import {
  createDeveloperApp,
  deleteDeveloperApp,
  listDeveloperApps,
  updateDeveloperApp,
  listApiProducts,
  getApiProduct,
  subscribeToProduct,
  listSubscriptions,
  cancelSubscription,
} from "../../devportal/developerApp.service.js";
import {
  apiDashboardMetrics,
  listUsageRecords,
} from "../../publicApi/apiUsage.service.js";
import { resolveUserContext } from "../../services/workspace.service.js";
import { nativeModelCatalog } from "../../nativeAi/nativeAi.service.js";
import { nativeAiOpenApi } from "../../nativeAi/openapi.js";

const Id = z.object({ id: z.string().cuid() });
const SubscribeSchema = z.object({ appId: z.string().cuid().optional(), productId: z.string().cuid() });

function meta(req: any) { return { requestId: req.requestId ?? "", tookMs: Date.now() - (req.startedAt ?? Date.now()) }; }

export function registerDeveloperPlatformRoutes(router: Router) {
  const dp = Router();
  dp.use(authenticate);

  /* ── Native AI provider catalog/documentation ──────────────────────── */
  dp.get("/native-ai/models", async (req, res, next) => {
    try { res.json({ ok: true, data: (await nativeModelCatalog(true)).public, meta: meta(req) }); } catch (e) { next(e); }
  });
  dp.get("/native-ai/openapi", (req, res) => res.json({ ok: true, data: nativeAiOpenApi(process.env.WINDELS_PUBLIC_API_ORIGIN || "https://api.windels.ai"), meta: meta(req) }));

  /* ── Applications ───────────────────────────────────────────────────── */
  dp.get("/apps", async (req, res, next) => { try { res.json({ ok: true, data: await listDeveloperApps(req.user!.id), meta: meta(req) }); } catch (e) { next(e); } });
  dp.post("/apps", validate({ body: DeveloperAppCreateSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await createDeveloperApp(req.user!.id, req.body), meta: meta(req) }); } catch (e) { next(e); }
  });
  dp.patch("/apps/:id", validate({ params: Id, body: DeveloperAppUpdateSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await updateDeveloperApp(req.user!.id, req.params.id, req.body), meta: meta(req) }); } catch (e) { next(e); }
  });
  dp.delete("/apps/:id", validate({ params: Id }), async (req, res, next) => {
    try { res.json({ ok: true, data: await deleteDeveloperApp(req.user!.id, req.params.id), meta: meta(req) }); } catch (e) { next(e); }
  });

  /* ── API products (marketplace) ─────────────────────────────────────── */
  dp.get("/products", async (req, res, next) => { try { res.json({ ok: true, data: await listApiProducts(req.user!.id), meta: meta(req) }); } catch (e) { next(e); } });
  dp.get("/products/:id", validate({ params: Id }), async (req, res, next) => { try { res.json({ ok: true, data: await getApiProduct(req.user!.id, req.params.id), meta: meta(req) }); } catch (e) { next(e); } });

  /* ── Subscriptions ──────────────────────────────────────────────────── */
  dp.post("/subscriptions", validate({ body: SubscribeSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await subscribeToProduct(req.user!.id, req.body), meta: meta(req) }); } catch (e) { next(e); }
  });
  dp.get("/subscriptions", async (req, res, next) => { try { res.json({ ok: true, data: await listSubscriptions(req.user!.id), meta: meta(req) }); } catch (e) { next(e); } });
  dp.post("/subscriptions/:id/cancel", validate({ params: Id }), async (req, res, next) => {
    try { res.json({ ok: true, data: await cancelSubscription(req.user!.id, req.params.id), meta: meta(req) }); } catch (e) { next(e); }
  });

  /* ── Usage dashboard & ledger ───────────────────────────────────────── */
  dp.get("/usage/dashboard", validate({ query: ApiUsageQuerySchema }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      res.json({ ok: true, data: await apiDashboardMetrics(ctx.organizationId, req.query as any), meta: meta(req) });
    } catch (e) { next(e); }
  });
  dp.get("/usage/records", validate({ query: ApiUsageQuerySchema }), async (req, res, next) => {
    try {
      const ctx = await resolveUserContext(req.user!.id);
      const data = await listUsageRecords(ctx.organizationId, req.query as any);
      res.json({ ok: true, data, meta: { ...meta(req), pagination: { page: data.page, perPage: data.perPage, total: data.total, totalPages: Math.ceil(data.total / data.perPage) } } });
    } catch (e) { next(e); }
  });

  router.use("/developer", dp);
}
