// WINDELS AI OS — AI Marketing Intelligence & Campaign Management routes.
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import {
  CreateMarketingCampaignSchema, GenerateCopySchema, CreatePersonaSchema, CreateAbTestSchema,
  IngestCampaignMetricsSchema, MarketingCampaignIdSchema, MarketingAgentKeySchema,
  MARKETING_PLATFORMS,
} from "@windels/shared/marketing";
import { MarketingService, MARKETING_AGENT_KEYS } from "../../marketing/marketing.service.js";

const campaignId = MarketingCampaignIdSchema;
const agentKey = MarketingAgentKeySchema;

export function registerMarketingRoutes(router: Router) {
  router.use(authenticate);
  const oid = (req: any) => req.user!.organizationId!;
  const uid = (req: any) => req.user!.id!;

  // Agents (28 specialized marketing workforce)
  router.get("/marketing/agents", async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.listAgents(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/marketing/agents/:key/heartbeat", validate({ params: agentKey }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.heartbeatAgent(oid(req), (req.params as any).key), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/marketing/agents/:key/run", validate({ params: agentKey, body: z.record(z.any()).optional() }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.runAgent(oid(req), (req.params as any).key, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Dashboard
  router.get("/marketing/dashboard", async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.dashboard(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Campaigns
  router.get("/marketing/campaigns", async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.listCampaigns(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/marketing/campaigns", validate({ body: CreateMarketingCampaignSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await MarketingService.createCampaign(oid(req), uid(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/marketing/campaigns/:id", validate({ params: campaignId }), async (req, res, next) => {
    try {
      const rec = await MarketingService.getCampaign(oid(req), req.params.id);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Campaign not found" } });
      res.json({ ok: true, data: rec, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.patch("/marketing/campaigns/:id/status", validate({ params: campaignId, body: z.object({ status: z.enum(["draft", "active", "paused", "completed", "archived"]) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.updateCampaignStatus(oid(req), req.params.id, req.body.status), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/marketing/campaigns/:id/metrics", validate({ params: campaignId, body: IngestCampaignMetricsSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.ingestMetrics(oid(req), req.params.id, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.delete("/marketing/campaigns/:id", validate({ params: campaignId }), async (req, res, next) => {
    try { await MarketingService.removeCampaign(oid(req), req.params.id); res.json({ ok: true, meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Copywriting engine
  router.post("/marketing/copy", validate({ body: GenerateCopySchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.generateCopy(oid(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Personas
  router.get("/marketing/personas", async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.listPersonas(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/marketing/personas", validate({ body: CreatePersonaSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await MarketingService.createPersona(oid(req), uid(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.delete("/marketing/personas/:id", validate({ params: z.object({ id: z.string().min(1).max(64) }) }), async (req, res, next) => {
    try { await MarketingService.removePersona(oid(req), req.params.id); res.json({ ok: true, meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // A/B tests
  router.get("/marketing/ab-tests", async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.listAbTests(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/marketing/ab-tests", validate({ body: CreateAbTestSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await MarketingService.createAbTest(oid(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/marketing/ab-tests/:id/variants/:variantId/metrics", validate({ params: z.object({ id: z.string().min(1).max(64), variantId: z.string().min(1).max(64) }), body: z.object({ impressions: z.number().int().nonnegative().optional(), clicks: z.number().int().nonnegative().optional(), conversions: z.number().int().nonnegative().optional() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.recordAbVariantMetrics(oid(req), req.params.id, req.params.variantId, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/marketing/ab-tests/:id/winner", validate({ params: z.object({ id: z.string().min(1).max(64) }), body: z.object({ variantId: z.string().min(1).max(64).optional() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.declareWinner(oid(req), req.params.id, req.body.variantId), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Recommendations
  router.post("/marketing/recommendations", async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.generateRecommendations(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/marketing/recommendations", async (req, res, next) => {
    try { res.json({ ok: true, data: await MarketingService.listRecommendations(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Platforms
  router.get("/marketing/platforms", async (_req, res) => {
    res.json({ ok: true, data: MARKETING_PLATFORMS.map((p) => ({ id: p, label: p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) })) });
  });
}
