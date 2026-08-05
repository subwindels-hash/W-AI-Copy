// WINDELS AI OS — AI Advertising Platform routes.
// ONE advertising module exposed under /advertising. Request contracts come from
// @windels/shared/advertising (single source of truth shared with the web client).
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
  CampaignIdSchema,
  AiGenerateSchema,
  ConversionEventSchema,
  IngestMetricsSchema,
  AddVariantSchema,
  ChooseVariantSchema,
} from "@windels/shared/advertising";
import { AdvertisingService } from "../../advertising/advertising.service.js";

const campaignParams = CampaignIdSchema;

export function registerAdvertisingRoutes(router: Router) {
  router.use(authenticate);
  const oid = (req: any) => req.user!.organizationId!;
  const uid = (req: any) => req.user!.id!;

  router.get("/campaigns", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await AdvertisingService.list(oid(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/campaigns", validate({ body: CreateCampaignSchema }), async (req, res, next) => {
    try {
      const data = await AdvertisingService.create(oid(req), uid(req), req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/campaigns/:id", validate({ params: campaignParams }), async (req, res, next) => {
    try {
      const data = await AdvertisingService.get(oid(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Campaign not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/campaigns/:id", validate({ params: campaignParams, body: UpdateCampaignSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await AdvertisingService.update(oid(req), req.params.id, req.body), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Lifecycle / approval workflow
  router.post("/campaigns/:id/launch", validate({ params: campaignParams }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvertisingService.launch(oid(req), req.params.id, uid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/campaigns/:id/pause", validate({ params: campaignParams }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvertisingService.pause(oid(req), req.params.id, uid(req), (req.body as any)?.reason), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/campaigns/:id/submit", validate({ params: campaignParams }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvertisingService.submitForApproval(oid(req), req.params.id, uid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/campaigns/:id/approve", validate({ params: campaignParams }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvertisingService.approve(oid(req), req.params.id, uid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/campaigns/:id/reject", validate({ params: campaignParams }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvertisingService.reject(oid(req), req.params.id, uid(req), (req.body as any)?.reason ?? "Rejected"), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // AI generation (smart + autonomous)
  router.post("/campaigns/:id/generate", validate({ params: campaignParams, body: AiGenerateSchema }), async (req, res, next) => {
    try {
      const data = await AdvertisingService.generate(oid(req), req.params.id, req.body.contentType, req.body.brief, uid(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Recommendations (metric heuristics)
  router.post("/campaigns/:id/recommend", validate({ params: campaignParams }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvertisingService.recommend(oid(req), req.params.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Autonomous cycle (mode 4)
  router.post("/campaigns/:id/autonomous", validate({ params: campaignParams }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvertisingService.autonomousCycle(oid(req), req.params.id, uid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Performance billing: report a conversion for verification
  router.post("/campaigns/:id/conversions", validate({ params: campaignParams, body: ConversionEventSchema }), async (req, res, next) => {
    try {
      const data = await AdvertisingService.reportConversion(oid(req), req.params.id, uid(req), req.body);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Dashboard (extended existing dashboard)
  router.get("/campaigns/:id/dashboard", validate({ params: campaignParams }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await AdvertisingService.dashboard(oid(req), req.params.id), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Metrics ingestion (real delivery data)
  router.post("/campaigns/:id/metrics", validate({ params: campaignParams, body: IngestMetricsSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await AdvertisingService.ingestMetrics(oid(req), req.params.id, uid(req), req.body), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // A/B creative variants
  router.post("/campaigns/:id/variants", validate({ params: campaignParams, body: AddVariantSchema }), async (req, res, next) => {
    try {
      res.status(201).json({ ok: true, data: await AdvertisingService.addVariant(oid(req), req.params.id, uid(req), req.body), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.post("/campaigns/:id/variants/:variantId/metrics", validate({ params: campaignParams, body: IngestMetricsSchema }), async (req, res, next) => {
    try {
      const data = await AdvertisingService.recordVariantMetrics(oid(req), req.params.id, req.params.variantId, req.body);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.post("/campaigns/:id/variants/choose", validate({ params: campaignParams, body: ChooseVariantSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await AdvertisingService.chooseVariant(oid(req), req.params.id, req.body.variantId, uid(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Portfolio / org analytics
  router.get("/analytics", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await AdvertisingService.portfolioAnalytics(oid(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Org-level advertising settings
  router.get("/settings", async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvertisingService.getOrgSetting(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.patch("/settings", async (req, res, next) => {
    try { res.json({ ok: true, data: await AdvertisingService.setOrgSetting(oid(req), req.body ?? {}), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
}
