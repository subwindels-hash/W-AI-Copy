/**
 * AI Ecosystem routes (Session 33, Phase 32, Slices 288–290).
 * Provider Abstraction, Personality Studio, Trust/Explainability.
 * Mounted at /ai-ecosystem behind authenticate + ORG_ADMIN.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ProviderAbstractionService } from "../../aiEcosystem/providerAbstraction.service.js";
import { PersonalityStudioService } from "../../aiEcosystem/personalityStudio.service.js";
import { TrustExplainabilityService } from "../../aiEcosystem/trustExplainability.service.js";

const providerCreate = z.object({
  name: z.string(), vendor: z.string(), displayVendor: z.string().optional(),
  status: z.enum(["healthy","degraded","throttled","offline","maintenance"]).default("healthy"),
  endpoint: z.string().optional(), region: z.string().optional(),
  deployment: z.enum(["cloud","self-hosted","hybrid","edge","dedicated"]).default("cloud"),
  authMethod: z.enum(["api-key","oauth","iam-role","mTLS","vpc-peering","local-no-auth"]).default("api-key"),
  capabilities: z.array(z.string()).default(["chat"]),
  dataResidency: z.array(z.string()).default([]),
  costPer1kInputUsd: z.number().default(2.5), costPer1kOutputUsd: z.number().default(10),
  tags: z.array(z.string()).default([]),
});
const providerStatus = z.object({ status: z.enum(["healthy","degraded","throttled","offline","maintenance"]), reason: z.string().optional() });
const modelCreate = z.object({
  providerId: z.string(), modelId: z.string(), displayName: z.string(), vendor: z.string(),
  capabilities: z.array(z.string()).default(["chat"]), contextWindow: z.number().int().default(128000),
  maxOutputTokens: z.number().int().default(4096),
  costPer1kInputUsd: z.number().default(1), costPer1kOutputUsd: z.number().default(3),
  avgLatencyMs: z.number().int().default(300), qualityScore: z.number().default(85), safetyScore: z.number().default(90),
  multilingual: z.boolean().default(true), vision: z.boolean().default(false), streaming: z.boolean().default(true),
  toolUse: z.boolean().default(true), fineTunable: z.boolean().default(false),
  deployment: z.enum(["cloud","self-hosted","hybrid","edge","dedicated"]).default("cloud"),
  enabled: z.boolean().default(true), tags: z.array(z.string()).default([]),
});
const policyCreate = z.object({
  name: z.string(), strategy: z.enum(["cost","latency","quality","balanced","data-residency","capability","custom"]),
  preferredProviders: z.array(z.string()).default([]), forbiddenProviders: z.array(z.string()).default([]),
  requiredCapabilities: z.array(z.string()).default(["chat"]),
  requiredRegions: z.array(z.string()).optional(), maxLatencyMs: z.number().int().optional(),
  maxCostPer1kUsd: z.number().optional(),
  fallbackMode: z.enum(["fail-open","fail-closed","graceful-degrade"]).default("graceful-degrade"),
  fallbackChain: z.array(z.string()).default([]), defaultModelId: z.string().optional(),
  enabled: z.boolean().default(true), description: z.string().default(""),
});
const routeReq = z.object({
  capabilities: z.array(z.string()).default(["chat"]),
  strategy: z.enum(["cost","latency","quality","balanced","data-residency","capability","custom"]).optional(),
  region: z.string().optional(), maxLatencyMs: z.number().int().optional(), maxCostPer1kUsd: z.number().optional(),
});
const benchmarkCreate = z.object({ name: z.string(), kind: z.enum(["latency","throughput","quality","cost-efficiency","safety","multiling"]), providerIds: z.array(z.string()).min(1), samples: z.number().int().default(200) });

const profileCreate = z.object({
  name: z.string(), kind: z.enum(["default","exec-assistant","support","sales","engineering","legal","marketing","hr","finance","custom"]).default("custom"),
  description: z.string(), toneDimensions: z.array(z.string()).default([]), formality: z.number().int().min(1).max(5).default(3),
  empathy: z.number().min(0).max(1).default(0.5), humor: z.number().min(0).max(1).default(0.2),
  verbosity: z.number().min(0).max(1).default(0.5), assertiveness: z.number().min(0).max(1).default(0.5),
  forbiddenPhrases: z.array(z.string()).default([]), requiredSignoff: z.string().optional(),
  languageStyleGuideRef: z.string().optional(), voicePersonaId: z.string().optional(), avatarConfigId: z.string().optional(),
  regionOverrides: z.record(z.object({ formality: z.number().int().min(1).max(5).optional(), toneDimensions: z.array(z.string()).optional(), empathy: z.number().optional(), verbosity: z.number().optional() })).default({}),
  departmentScopes: z.array(z.string()).default([]), enabled: z.boolean().default(true),
});
const voiceCreate = z.object({
  name: z.string(), voiceId: z.string().optional(), gender: z.enum(["feminine","masculine","neutral"]).optional(),
  accent: z.string().optional(), pace: z.number().default(1), pitch: z.number().default(0),
  warmth: z.number().min(0).max(1).default(0.6), clarity: z.number().min(0).max(1).default(0.9),
  providerTtsVendor: z.string().optional(), enabled: z.boolean().default(true),
});
const avatarCreate = z.object({
  name: z.string(), style: z.enum(["realistic","illustrated","abstract","brand-mascot","none"]),
  primaryColor: z.string(), secondaryColor: z.string(), shape: z.enum(["circle","squircle","hex"]),
  imageUrl: z.string().optional(), emoji: z.string().optional(),
});
const deptSet = z.object({ department: z.string(), defaultProfileId: z.string(), overrideProfileId: z.string().optional(), regionalDefault: z.record(z.string()).optional(), approvedBy: z.string().optional() });

const reportCreate = z.object({
  responseId: z.string(), modelId: z.string(), reasoningSummary: z.string(),
  dataFreshnessAt: z.string().optional(), tokenUsage: z.object({ input: z.number().int(), output: z.number().int() }),
  processingLatencyMs: z.number().int(), steps: z.array(z.object({ step: z.number(), description: z.string(), tool: z.string().optional(), input: z.string().optional(), output: z.string().optional() })).optional(),
  guardrailsTriggered: z.array(z.string()).default([]),
});
const evidenceCreate = z.object({
  sourceId: z.string(), sourceLabel: z.string(), sourceUri: z.string().optional(),
  sourceQuality: z.enum(["gold","peer-reviewed","trusted-publisher","user-content","llm-synthetic","unknown"]),
  freshnessDays: z.number().int().optional(), snippet: z.string(),
  supports: z.enum(["supports","contradicts","contextualizes"]).default("supports"), confidence: z.number().min(0).max(1).default(0.8),
});
const viewpointCreate = z.object({ label: z.string(), summary: z.string(), plausibility: z.number().min(0).max(1).default(0.5), evidenceRefs: z.array(z.string()).default([]) });
const uncertaintyCreate = z.object({ kind: z.enum(["ambiguous-query","conflicting-sources","out-of-scope","hallucination-risk","stale-data","low-confidence"]), detail: z.string(), severity: z.enum(["info","warn","critical"]).default("warn") });
const complianceCreate = z.object({ policy: z.string(), status: z.enum(["pass","warn","fail","pending"]), detail: z.string(), ruleId: z.string().optional() });
const scoreCreate = z.object({ responseId: z.string(), overallConfidence: z.number().min(0).max(1).optional(), verification: z.enum(["unverified","verified","partially-verified","disputed","retracted"]).optional(), verifiedBy: z.string().optional() });
const reviewUpdate = z.object({ state: z.enum(["not-needed","queued","in-review","approved","rejected"]), by: z.string().optional() });

export function registerAiEcosystemRoutes(router: Router) {
  // dashboard
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try {
      const [p, per, t] = await Promise.all([
        ProviderAbstractionService.summary(),
        PersonalityStudioService.summary(),
        TrustExplainabilityService.summary(),
      ]);
      res.json({ ok: true, data: { ...p, ...per, ...t } });
    } catch (e) { next(e); }
  });

  // providers
  router.get("/providers", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      const deployment = typeof req.query.deployment === "string" ? req.query.deployment as any : undefined;
      res.json({ ok: true, data: await ProviderAbstractionService.listProviders({ status, deployment }) });
    } catch (e) { next(e); }
  });
  router.post("/providers", validate({ body: providerCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProviderAbstractionService.registerProvider(req.body) }); } catch (e) { next(e); }
  });
  router.get("/providers/:id", async (req, res, next) => {
    try { const p = await ProviderAbstractionService.getProvider(req.params.id); if (!p) return res.status(404).json({ok:false,error:{code:"NOT_FOUND"}}); res.json({ok:true,data:p}); } catch (e) { next(e); }
  });
  router.post("/providers/:id/status", validate({ body: providerStatus }), async (req, res, next) => {
    try { const p = await ProviderAbstractionService.setProviderStatus(req.params.id, req.body.status, req.body.reason); if (!p) return res.status(404).json({ok:false,error:{code:"NOT_FOUND"}}); res.json({ok:true,data:p}); } catch (e) { next(e); }
  });
  router.get("/providers/:id/health", async (req, res, next) => {
    try { res.json({ok:true,data:await ProviderAbstractionService.listHealth(req.params.id)}); } catch (e) { next(e); }
  });

  // models
  router.get("/models", async (req, res, next) => {
    try {
      const providerId = typeof req.query.providerId === "string" ? req.query.providerId : undefined;
      const capability = typeof req.query.capability === "string" ? req.query.capability as any : undefined;
      const enabled = req.query.enabled === "false" ? false : req.query.enabled === "true" ? true : undefined;
      res.json({ok:true,data:await ProviderAbstractionService.listModels({ providerId, capability, enabled })});
    } catch (e) { next(e); }
  });
  router.post("/models", validate({ body: modelCreate }), async (req, res, next) => {
    try { res.json({ok:true,data:await ProviderAbstractionService.registerModel(req.body)}); } catch (e) { next(e); }
  });

  // routing policies
  router.get("/routing-policies", async (_req, res, next) => {
    try { res.json({ok:true,data:await ProviderAbstractionService.listPolicies()}); } catch (e) { next(e); }
  });
  router.post("/routing-policies", validate({ body: policyCreate }), async (req, res, next) => {
    try { res.json({ok:true,data:await ProviderAbstractionService.createPolicy(req.body)}); } catch (e) { next(e); }
  });
  router.post("/route", validate({ body: routeReq }), async (req, res, next) => {
    try {
      const r = await ProviderAbstractionService.routeRequest(req.body.capabilities, req.body);
      res.json({ok:true,data:r});
    } catch (e: any) { if (e?.code === "NO_PROVIDER") return res.status(503).json({ok:false,error:{code:"NO_PROVIDER",message:e.message}}); next(e); }
  });

  // benchmarks
  router.get("/benchmarks", async (_req, res, next) => {
    try { res.json({ok:true,data:await ProviderAbstractionService.listBenchmarks()}); } catch (e) { next(e); }
  });
  router.post("/benchmarks", validate({ body: benchmarkCreate }), async (req, res, next) => {
    try { res.json({ok:true,data:await ProviderAbstractionService.runBenchmark(req.body)}); } catch (e) { next(e); }
  });

  // personality profiles
  router.get("/personalities", async (req, res, next) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind as any : undefined;
      const enabled = req.query.enabled === "false" ? false : req.query.enabled === "true" ? true : undefined;
      res.json({ok:true,data:await PersonalityStudioService.listProfiles({ kind, enabled })});
    } catch (e) { next(e); }
  });
  router.post("/personalities", validate({ body: profileCreate }), async (req, res, next) => {
    try { res.json({ok:true,data:await PersonalityStudioService.createProfile(req.body)}); } catch (e) { next(e); }
  });
  router.get("/personalities/:id", async (req, res, next) => {
    try { const p = await PersonalityStudioService.getProfile(req.params.id); if (!p) return res.status(404).json({ok:false,error:{code:"NOT_FOUND"}}); res.json({ok:true,data:p}); } catch (e) { next(e); }
  });
  router.get("/resolve-persona", async (req, res, next) => {
    try {
      const department = (typeof req.query.department === "string" ? req.query.department : "engineering") as any;
      const region = typeof req.query.region === "string" ? req.query.region : undefined;
      res.json({ok:true,data:await PersonalityStudioService.resolvePersonaFor(department, region)});
    } catch (e) { next(e); }
  });

  router.get("/voice-personas", async (_req, res, next) => {
    try { res.json({ok:true,data:await PersonalityStudioService.listVoicePersonas()}); } catch (e) { next(e); }
  });
  router.post("/voice-personas", validate({ body: voiceCreate }), async (req, res, next) => {
    try { res.json({ok:true,data:await PersonalityStudioService.createVoicePersona(req.body)}); } catch (e) { next(e); }
  });

  router.get("/avatars", async (_req, res, next) => {
    try { res.json({ok:true,data:await PersonalityStudioService.listAvatars()}); } catch (e) { next(e); }
  });
  router.post("/avatars", validate({ body: avatarCreate }), async (req, res, next) => {
    try { res.json({ok:true,data:await PersonalityStudioService.createAvatar(req.body)}); } catch (e) { next(e); }
  });

  router.get("/departments", async (_req, res, next) => {
    try { res.json({ok:true,data:await PersonalityStudioService.listDepartments()}); } catch (e) { next(e); }
  });
  router.post("/departments", validate({ body: deptSet }), async (req, res, next) => {
    try { res.json({ok:true,data:await PersonalityStudioService.setDepartment(req.body)}); } catch (e) { next(e); }
  });

  // trust / explainability
  router.get("/trust/reports", async (_req, res, next) => {
    try { res.json({ok:true,data:await TrustExplainabilityService.listReports()}); } catch (e) { next(e); }
  });
  router.post("/trust/reports", validate({ body: reportCreate }), async (req, res, next) => {
    try { res.json({ok:true,data:await TrustExplainabilityService.createReport(req.body)}); } catch (e) { next(e); }
  });
  router.get("/trust/scores", async (req, res, next) => {
    try {
      const humanReview = typeof req.query.humanReview === "string" ? req.query.humanReview as any : undefined;
      const verification = typeof req.query.verification === "string" ? req.query.verification as any : undefined;
      res.json({ok:true,data:await TrustExplainabilityService.listScores({ humanReview, verification })});
    } catch (e) { next(e); }
  });
  router.post("/trust/scores", validate({ body: scoreCreate }), async (req, res, next) => {
    try { res.json({ok:true,data:await TrustExplainabilityService.scoreResponse(req.body)}); } catch (e) { next(e); }
  });
  router.post("/trust/scores/:id/review", validate({ body: reviewUpdate }), async (req, res, next) => {
    try { const t = await TrustExplainabilityService.setHumanReview(req.params.id, req.body.state, req.body.by); if (!t) return res.status(404).json({ok:false,error:{code:"NOT_FOUND"}}); res.json({ok:true,data:t}); } catch (e) { next(e); }
  });
  router.get("/trust/reports/:rid/evidence", async (req, res, next) => {
    try { res.json({ok:true,data:await TrustExplainabilityService.listEvidence(req.params.rid)}); } catch (e) { next(e); }
  });
  router.post("/trust/reports/:rid/evidence", validate({ body: evidenceCreate }), async (req, res, next) => {
    try { res.json({ok:true,data:await TrustExplainabilityService.addEvidence(req.params.rid, req.body)}); } catch (e) { next(e); }
  });
  router.get("/trust/reports/:rid/viewpoints", async (req, res, next) => {
    try { res.json({ok:true,data:await TrustExplainabilityService.listViewpoints(req.params.rid)}); } catch (e) { next(e); }
  });
  router.post("/trust/reports/:rid/viewpoints", validate({ body: viewpointCreate }), async (req, res, next) => {
    try { res.json({ok:true,data:await TrustExplainabilityService.addViewpoint(req.params.rid, req.body)}); } catch (e) { next(e); }
  });
  router.get("/trust/reports/:rid/uncertainty", async (req, res, next) => {
    try { res.json({ok:true,data:await TrustExplainabilityService.listUncertainty(req.params.rid)}); } catch (e) { next(e); }
  });
  router.post("/trust/reports/:rid/uncertainty", validate({ body: uncertaintyCreate }), async (req, res, next) => {
    try { res.json({ok:true,data:await TrustExplainabilityService.addUncertainty(req.params.rid, req.body)}); } catch (e) { next(e); }
  });
  router.get("/trust/reports/:rid/compliance", async (req, res, next) => {
    try { res.json({ok:true,data:await TrustExplainabilityService.listCompliance(req.params.rid)}); } catch (e) { next(e); }
  });
  router.post("/trust/reports/:rid/compliance", validate({ body: complianceCreate }), async (req, res, next) => {
    try { res.json({ok:true,data:await TrustExplainabilityService.addCompliance(req.params.rid, req.body)}); } catch (e) { next(e); }
  });
}
