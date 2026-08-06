import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "../config/env.js";
import { requestId } from "./middleware/requestId.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authenticate } from "./middleware/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerMfaRoutes } from "./routes/mfa.js";
import { registerGoogleAuthRoutes } from "./routes/googleAuth.js";
import { registerDerivativesRoutes } from "./routes/derivatives.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerWebhookRoutes } from "./routes/webhook.js";
import { registerApiKeyRoutes } from "./routes/apikey.js";
import { registerProfileRoutes } from "./routes/profile.js";
import { registerWorkspaceRoutes } from "./routes/workspace.js";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
import { registerProjectContinuityRoutes } from "./routes/projectContinuity.js";
import { registerLeadDiscoveryRoutes } from "./routes/leadDiscovery.js";
import { registerPromptTemplateRoutes } from "./routes/promptTemplates.js";
import { registerAIRoutes } from "./routes/ai.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerAgentMemoryRoutes } from "./routes/agentMemories.js";
import { registerAgentKnowledgeRoutes } from "./routes/agentKnowledge.js";
import { registerAgentCommRoutes } from "./routes/agentComm.js";
import { registerCanvasRoutes } from "./routes/canvases.js";
import { registerCanvasCollabRoutes } from "./routes/canvasCollab.js";
import { registerTalkRoutes } from "./routes/talk.js";
import { registerWorkflowRoutes } from "./routes/workflows.js";
import { registerDeveloperRoutes } from "./routes/developers.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerEnterpriseRoutes } from "./routes/enterprise.js";
import { registerDataPlatformRoutes } from "./routes/dataPlatform.js";
import { registerGovernanceRoutes } from "./routes/governance.js";
import { registerPlatformRoutes } from "./routes/platform.js";
import { registerSecurityRoutes } from "./routes/security.js";
import { registerPublicApiRoutes } from "./routes/publicApi.js";
import { registerMobileRoutes } from "./routes/mobile.js";
import { registerQaRoutes } from "./routes/qa.js";
import { registerReleaseRoutes } from "./routes/release.js";
import { registerProgramRoutes } from "./routes/program.js";
import { registerEngineeringRoutes } from "./routes/engineering.js";
import { registerDevPortalRoutes } from "./routes/devPortal.js";
import { registerExtensionRoutes } from "./routes/extensions.js";
import { registerPlatformServicesRoutes } from "./routes/platformServices.js";
import { registerMlOpsRoutes } from "./routes/mlOps.js";
import { registerEnterpriseFoundationRoutes } from "./routes/enterpriseFoundation.js";
import { registerCollaborationRoutes } from "./routes/collaboration.js";
import { registerAiEcosystemRoutes } from "./routes/aiEcosystem.js";
import { registerMarketplaceRoutes } from "./routes/marketplace.js";
import { registerCryptoIntelligenceRoutes } from "./routes/cryptoIntelligence.js";
import { registerWakeIntelRoutes } from "./routes/wakeIntel.js";
import { registerArchitectureRoutes } from "./routes/architecture.js";
import { registerSelfHostedRoutes } from "./routes/selfHosted.js";
import { registerKernelRoutes } from "./routes/kernel.js";
import { registerVoiceStudioRoutes } from "./routes/voiceStudio.js";
import { registerTradingIntelRoutes } from "./routes/tradingIntel.js";
import { registerVoiceFoundryRoutes } from "./routes/voiceFoundry.js";
import { registerExpertsPlatformRoutes } from "./routes/expertsPlatform.js";
import { registerMediaFactoryRoutes } from "./routes/mediaFactory.js";
import { registerUxIntelligenceRoutes } from "./routes/uxIntelligence.js";
import { registerGiftCardsRoutes } from "./routes/giftCards.js";
import { registerGlobalCurrencyRoutes } from "./routes/globalCurrency.js";
import { registerV76ValidationRoutes } from "./routes/v76validation.js";
import { registerMediaGenRoutes } from "./routes/mediaGen.js";
import { registerHybridExecRoutes } from "./routes/hybridExec.js";
import { registerVoiceOwnershipRoutes } from "./routes/voiceOwnership.js";
import { registerCoreIntegrationRoutes } from "./routes/coreIntegration.js";
import { registerModelFactoryRoutes } from "./routes/modelFactory.js";
import { registerMemoryEvolutionRoutes } from "./routes/memoryEvolution.js";
import { registerConstitutionRoutes } from "./routes/constitution.js";
import { registerComposerRoutes } from "./routes/composer.js";
import { registerBenchmarksRoutes } from "./routes/benchmarks.js";
import { registerDisasterRecoveryRoutes } from "./routes/disasterRecovery.js";
import { registerLicensingRoutes } from "./routes/licensing.js";
import { registerDeploymentRoutes } from "./routes/deployment.js";
import { registerUpdateRoutes } from "./routes/updates.js";
import { registerUsageRoutes } from "./routes/usage.js";
import { registerFabricRoutes } from "./routes/fabric.js";
import { registerRoboticsRoutes } from "./routes/robotics.js";
import { registerSpatialRoutes } from "./routes/spatial.js";
import { registerSdkRoutes } from "./routes/sdk.js";
import { registerTrainingRoutes } from "./routes/training.js";
import { registerDataMarketplaceRoutes } from "./routes/dataMarketplace.js";
import { registerDigitalHumanRoutes } from "./routes/digitalHumans.js";
import { registerQuantumRoutes } from "./routes/quantum.js";
import { registerSustainabilityRoutes } from "./routes/sustainability.js";
import { registerBiomedicalRoutes } from "./routes/biomedical.js";
import { registerLegalRoutes } from "./routes/legal.js";
import { registerEducationRoutes } from "./routes/education.js";
import { registerScientificRoutes } from "./routes/scientific.js";
import { registerCognitiveRoutes } from "./routes/cognitive.js";
import { registerCommandRoutes } from "./routes/command.js";
import { registerAiEconomyRoutes } from "./routes/aiEconomy.js";
import { registerAutonomousRoutes } from "./routes/autonomous.js";
import { registerCyberRoutes } from "./routes/cyber.js";
import { registerOpexRoutes } from "./routes/opex.js";
import { registerIndustryRoutes } from "./routes/industry.js";
import { registerHealthEcosystemRoutes } from "./routes/healthEcosystem.js";
import { registerEtlRoutes } from "./routes/etl.js";
import { registerCameraRoutes } from "./routes/camera.js";
import { registerAdvertisingRoutes } from "./routes/advertising.js";
import { registerTenantIsolationRoutes } from "./routes/tenantIsolation.js";
import { registerCrmRoutes } from "./routes/crm.js";
import { registerMusicGenRoutes } from "./routes/musicGen.js";
import { registerMusicVideoRoutes } from "./routes/musicVideo.js";
import { registerBrokerIntegrationRoutes } from "./routes/brokerIntegration.js";
import { registerMarketingRoutes } from "./routes/marketing.js";
import { verifySignature, resolveCallbackOrgId, getWebhookConfig } from "../mediaFactory/publishing/webhooks.js";
import { PublishingService } from "../mediaFactory/publishing.service.js";
import { logger } from "../observability/logger.js";
import { observabilityMiddleware } from "./middleware/observability.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { csrfMiddleware } from "../security/csrf.js";
import { orgScope } from "./middleware/orgScope.js";
import { registerSSERoutes } from "./routes/events.js";
import type { ApiEnvelope } from "@windels/shared/api";

export function createApp() {
  const app = express();

  app.set("trust proxy", true);
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"], // needed for Vite HMR / Tailwind dev; tighten in prod
        "img-src": ["'self'", "data:", "blob:"],
        "connect-src": ["'self'", "ws:", "wss:"],
        "manifest-src": ["'self'"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
      },
    },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-site" },
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
    xPoweredBy: false,
  }));
  app.disable("x-powered-by");
  app.use(
    cors({
      origin: env.API_CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    })
  );
  // `verify` stashes the raw body so HMAC webhook receivers can sign-verify
  // the exact bytes the platform sent (media publishing callbacks, S77B).
  app.use(express.json({ limit: "5mb", verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(requestId());
  app.use(observabilityMiddleware());
  // Global rate limit (per-IP) on /api
  app.use("/api", rateLimit("apiGlobal"));
  // CSRF double-submit for all cookie-authed routes.
  app.use(csrfMiddleware());
  app.use(
    morgan(env.NODE_ENV === "production" ? "combined" : "dev", {
      stream: { write: (msg) => logger.debug(msg.trimEnd()) },
    })
  );

  const v1 = express.Router();
  registerHealthRoutes(v1);
  registerAuthRoutes(v1);
  registerMfaRoutes(v1);
  registerGoogleAuthRoutes(v1);
  registerDerivativesRoutes(v1);
  registerAdminRoutes(v1);
  registerMeRoutes(v1);
  registerWebhookRoutes(v1);
  registerApiKeyRoutes(v1);
  registerProfileRoutes(v1);
  registerAttachmentRoutes(v1);
  registerProjectContinuityRoutes(v1);
  const leadDiscoveryRouter = express.Router();
  v1.use("/lead-discovery", leadDiscoveryRouter);
  registerLeadDiscoveryRoutes(leadDiscoveryRouter);
  registerPromptTemplateRoutes(v1);
  registerAIRoutes(v1);
  registerWorkspaceRoutes(v1);

  // /conversations + /conversations/:id/messages share a sub-router
  const conversationsRouter = express.Router();
  v1.use("/conversations", conversationsRouter);
  registerConversationRoutes(conversationsRouter);
  registerMessageRoutes(conversationsRouter);

  // /agents + /agents/:id/memories + /agents/:id/knowledge share a sub-router
  const agentsRouter = express.Router();
  v1.use("/agents", agentsRouter);
  registerAgentRoutes(agentsRouter);
  registerAgentMemoryRoutes(agentsRouter);
  registerAgentKnowledgeRoutes(agentsRouter);
  // Session 20 — AI Workforce Communication (identities, messages, teams, reasoning, feedback, escalation)
  registerAgentCommRoutes(agentsRouter);

  // /canvases (Windels Workspace / Canvas Builder)
  const canvasesRouter = express.Router();
  v1.use("/canvases", canvasesRouter);
  registerCanvasRoutes(canvasesRouter);

  // Session 22 — Canvas Collab: same document service exposed at /canvas
  // (the S22 route prefix) + realtime presence/cursor endpoints on both paths.
  const canvasCollabRouter = express.Router();
  v1.use("/canvas", canvasCollabRouter);
  registerCanvasCollabRoutes(canvasCollabRouter);
  registerCanvasCollabRoutes(canvasesRouter);

  // /talk (Windels Talk — channels, DMs, messages, meetings, action items)
  const talkRouter = express.Router();
  v1.use("/talk", talkRouter);
  registerTalkRoutes(talkRouter);

  // /workflows (Windels Flow — workflow builder, execution, runs, approvals)
  const workflowsRouter = express.Router();
  v1.use("/workflows", workflowsRouter);
  registerWorkflowRoutes(workflowsRouter);

  // /developers (API keys, webhooks)
  const developersRouter = express.Router();
  v1.use("/developers", developersRouter);
  registerDeveloperRoutes(developersRouter);

  // /billing (subscription, invoices, predictive insights)
  const billingRouter = express.Router();
  v1.use("/billing", billingRouter);
  registerBillingRoutes(billingRouter);

  // /enterprise (models, AI monitoring, plugins, integrations, SSO, org/white-label, + Session 18 governance/discovery/events/api-governance)
  const enterpriseRouter = express.Router();
  v1.use("/enterprise", enterpriseRouter);
  registerEnterpriseRoutes(enterpriseRouter);

  // /data (Session 19 — Data Platform: catalog, knowledge graph, memory, sync)
  const dataRouter = express.Router();
  v1.use("/data", dataRouter);
  registerDataPlatformRoutes(dataRouter);

  // /governance (RBAC/ABAC permissions, audit logs, health, alerts, retention, compliance)
  const governanceRouter = express.Router();
  v1.use("/governance", governanceRouter);
  registerGovernanceRoutes(governanceRouter);

  // /platform (metrics, logs, traces, AI observability, regions, CDN, DR/failover)
  const platformRouter = express.Router();
  v1.use("/platform", platformRouter);
  registerPlatformRoutes(platformRouter);

  // /security (scorecard, self-test, prompt guard, encryption status, breakers, rate limits, events)
  const securityRouter = express.Router();
  v1.use("/security", securityRouter);
  registerSecurityRoutes(securityRouter);

  // /qa — Enterprise QA Platform (Session 22): suites, cases, runs, dashboard
  const qaRouter = express.Router();
  v1.use("/qa", qaRouter);
  qaRouter.use(authenticate);
  qaRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerQaRoutes(qaRouter);

  // /releases — Session 24: Release Management (pipeline, approvals, AI validation, staging, production, DORA)
  const releaseRouter = express.Router();
  v1.use("/releases", releaseRouter);
  releaseRouter.use(authenticate);
  releaseRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerReleaseRoutes(releaseRouter);

  // /program — Session 25: AI Program Management (roadmap, sprints, requirements, arch review, risks, exec)
  const programRouter = express.Router();
  v1.use("/program", programRouter);
  programRouter.use(authenticate);
  programRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerProgramRoutes(programRouter);

  // /engineering — Session 26: Engineering Observability (metrics, deployments, tech debt, pipeline analytics, productivity)
  const engRouter = express.Router();
  v1.use("/engineering", engRouter);
  engRouter.use(authenticate);
  engRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerEngineeringRoutes(engRouter);

  // /dev-portal — Session 27: Enterprise Developer Platform (SDKs, CLI, local/sandbox/emulator envs, testing + deployment toolkit)
  const dpRouter = express.Router();
  v1.use("/dev-portal", dpRouter);
  dpRouter.use(authenticate);
  dpRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerDevPortalRoutes(dpRouter);

  // /extensions — Session 28: Extension Platform (registry, business/industry modules, skills, custom agents, workflow/dashboard/UI extensions, lifecycle)
  const extRouter = express.Router();
  v1.use("/extensions", extRouter);
  extRouter.use(authenticate);
  extRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerExtensionRoutes(extRouter);

  // /platform-services — Session 29: Enterprise Platform Services (config, feature flags, runtime config, policies, multi-tenant, licensing, billing, capabilities, ontology, blueprints)
  const psvcRouter = express.Router();
  v1.use("/platform-services", psvcRouter);
  psvcRouter.use(authenticate);
  psvcRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerPlatformServicesRoutes(psvcRouter);

  // /ml-ops — Session 30: AI Infrastructure / MLOps (model registry/lifecycle/deploy/monitoring/governance, prompts/versioning/testing, RAG/vectors/embeddings/knowledge)
  const mlRouter = express.Router();
  v1.use("/ml-ops", mlRouter);
  mlRouter.use(authenticate);
  mlRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerMlOpsRoutes(mlRouter);

  // /enterprise-foundation — Session 31: Enterprise Foundation (data fabric, identity/federation/AI identity, finops+cost+optimization, resilience+self-healing+BCP, AI quality+evals, global ops/exec dashboard)
  const efRouter = express.Router();
  v1.use("/enterprise-foundation", efRouter);
  efRouter.use(authenticate);
  efRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerEnterpriseFoundationRoutes(efRouter);

  // /collaboration — Session 32: Enterprise Collaboration & Perception Intelligence (meetings + screen + camera intel)
  const collabRouter = express.Router();
  v1.use("/collaboration", collabRouter);
  collabRouter.use(authenticate);
  collabRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerCollaborationRoutes(collabRouter);

  // /ai-ecosystem — Session 33: Vendor-Agnostic AI Ecosystem Infrastructure (provider abstraction, personality studio, trust/explainability)
  const aiEcoRouter = express.Router();
  v1.use("/ai-ecosystem", aiEcoRouter);
  aiEcoRouter.use(authenticate);
  aiEcoRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerAiEcosystemRoutes(aiEcoRouter);

  // /marketplace — Session 34: Enterprise Marketplace, Digital Twin & Simulation (skills, twins, scenarios, apps)
  const marketplaceRouter = express.Router();
  v1.use("/marketplace", marketplaceRouter);
  marketplaceRouter.use(authenticate);
  marketplaceRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerMarketplaceRoutes(marketplaceRouter);

  // /crypto-intel — Session 35: Enterprise Crypto Intelligence (opt-in, disabled by default)
  const ciRouter = express.Router();
  v1.use("/crypto-intel", ciRouter);
  ciRouter.use(authenticate);
  ciRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerCryptoIntelligenceRoutes(ciRouter);

  // /wake-intel — Session 36: Enterprise Wake Intelligence & Multimodal Activation
  const wiRouter = express.Router();
  v1.use("/wake-intel", wiRouter);
  wiRouter.use(authenticate);
  wiRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerWakeIntelRoutes(wiRouter);

  // /architecture — Session 37: Architecture stubs, ESI/SI/Kernel/God-Node registry, deployment targets
  const archRouter = express.Router();
  v1.use("/architecture", archRouter);
  archRouter.use(authenticate);
  archRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerArchitectureRoutes(archRouter);

  // /self-hosted — Session 38: Self-Hosted AI Infrastructure (GPU, models, inference, vector, edge, airgap)
  const shRouter = express.Router();
  v1.use("/self-hosted", shRouter);
  shRouter.use(authenticate);
  shRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerSelfHostedRoutes(shRouter);

  // /kernel — Session 39: Enterprise AI Kernel (context/memory/reasoning/resource/agent/event/policy/security/...)
  const krRouter = express.Router();
  v1.use("/kernel", krRouter);
  krRouter.use(authenticate);
  krRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerKernelRoutes(krRouter);

  // /voice-studio — Session 40: Voice Studio (library, cloning with consent, customization, multilingual TTS)
  const vsRouter = express.Router();
  v1.use("/voice-studio", vsRouter);
  vsRouter.use(authenticate);
  vsRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerVoiceStudioRoutes(vsRouter);

  // /trading-intel — Session 81: Unified Global Financial Markets Intelligence & Trading Platform (extends S35)
  const tiRouter = express.Router();
  v1.use("/trading-intel", tiRouter);
  tiRouter.use(authenticate);
  tiRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerTradingIntelRoutes(tiRouter);

  // /voice-foundry — Session 41: AI Voice Foundry (autonomous voices, design/evolve/deploy, consent-exempt with audit)
  const vfRouter = express.Router();
  v1.use("/voice-foundry", vfRouter);
  vfRouter.use(authenticate);
  vfRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerVoiceFoundryRoutes(vfRouter);

  // /experts — Session 77A: Professional Intelligence Platform (domain expert agents, courses, packages)
  const epRouter = express.Router();
  v1.use("/experts", epRouter);
  epRouter.use(authenticate);
  epRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerExpertsPlatformRoutes(epRouter);

  // /media-factory/publishing/webhooks — PUBLIC platform callbacks (HMAC-verified,
  // no JWT). MUST mount before the authenticated media-factory router so platform
  // hubs are never rejected by the JWT middleware.
  const pubMfWebhooks = express.Router();
  v1.use("/media-factory/publishing/webhooks", pubMfWebhooks);
  // Public platform callback (HMAC-verified, no JWT). Resolves the org from
  // ?oid= or X-Windels-Org, verifies the signature, then syncs the update onto
  // the matching publish job. Registered per-platform by the org.
  pubMfWebhooks.post("/:platform/callback", express.json({ limit: "2mb" }), async (req: any, res, next) => {
    try {
      const platform = req.params.platform;
      const oid = resolveCallbackOrgId(req.query, req.headers);
      if (!oid) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing org (query ?oid= or X-Windels-Org header)" } });
      const cfg = await getWebhookConfig(oid, platform);
      if (!cfg) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "No webhook registered for this platform" } });
      const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
      if (!verifySignature(cfg.secret, raw, req.headers)) {
        return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid webhook signature" } });
      }
      const update = {
        postId: req.body?.postId,
        videoId: req.body?.videoId,
        status: req.body?.status,
        reason: req.body?.reason,
        availableAt: req.body?.availableAt,
      };
      const ref = update.postId ?? update.videoId;
      if (!ref) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing postId/videoId" } });
      const job = await PublishingService.findJobByPlatformRef(oid, platform, ref);
      if (!job) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "No matching publish job" } });
      await PublishingService.applyPlatformWebhook(oid, job.id, update);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // /media-factory — Session 77B: Autonomous AI Media/Content Factory (channels, characters, courses, safety)
  const mfRouter = express.Router();
  v1.use("/media-factory", mfRouter);
  mfRouter.use(authenticate);
  mfRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerMediaFactoryRoutes(mfRouter);

  // /ux-intelligence — Session 78: UX Intelligence, Design System & Experience
  const uxRouter = express.Router();
  v1.use("/ux-intelligence", uxRouter);
  uxRouter.use(authenticate);
  uxRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerUxIntelligenceRoutes(uxRouter);

  // /gift-cards — Session 79: WMPC Gift Card Payment Platform (registers into existing Payment Gateway)
  const gcRouter = express.Router();
  v1.use("/gift-cards", gcRouter);
  gcRouter.use(authenticate);
  gcRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerGiftCardsRoutes(gcRouter);

  // /global-currency — Session 80: Global Multi-Currency & Localization
  const gcuRouter = express.Router();
  v1.use("/global-currency", gcuRouter);
  gcuRouter.use(authenticate);
  gcuRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerGlobalCurrencyRoutes(gcuRouter);

  // /validation — Session 76: Final Enterprise Integration & Validation (Digital Operations Center report)
  const v76Router = express.Router();
  v1.use("/validation", v76Router);
  v76Router.use(authenticate);
  v76Router.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerV76ValidationRoutes(v76Router);

  // /media-generation — Session 42: Universal Media Generation (image/audio/video on S38 GPU via S39 Kernel)
  const mgRouter = express.Router();
  v1.use("/media-generation", mgRouter);
  mgRouter.use(authenticate);
  mgRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerMediaGenRoutes(mgRouter);

  // /hybrid-execution — Session 43: Hybrid AI Execution & Model/Compute Management
  const hxRouter = express.Router();
  v1.use("/hybrid-execution", hxRouter);
  hxRouter.use(authenticate);
  hxRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerHybridExecRoutes(hxRouter);

  // /voice-ownership — Session 44: Voice Ownership, Security & Governance
  const voRouter = express.Router();
  v1.use("/voice-ownership", voRouter);
  voRouter.use(authenticate);
  voRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerVoiceOwnershipRoutes(voRouter);

  // /core-integration — Session 45: Core Enterprise Integration Checkpoint
  const ceiRouter = express.Router();
  v1.use("/core-integration", ceiRouter);
  ceiRouter.use(authenticate);
  ceiRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerCoreIntegrationRoutes(ceiRouter);

  // /model-factory — Session 46: Enterprise AI Model Factory (V8.4 §1)
  const mf2Router = express.Router();
  v1.use("/model-factory", mf2Router);
  mf2Router.use(authenticate);
  mf2Router.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerModelFactoryRoutes(mf2Router);

  // /memory-evolution — Session 47: Enterprise Memory Evolution Engine (V8.4 §2)
  const meRouter = express.Router();
  v1.use("/memory-evolution", meRouter);
  meRouter.use(authenticate);
  meRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerMemoryEvolutionRoutes(meRouter);

  // /constitution — Session 48: AI Constitution Studio
  const cstRouter = express.Router();
  v1.use("/constitution", cstRouter);
  cstRouter.use(authenticate);
  cstRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerConstitutionRoutes(cstRouter);

  // /composer — Session 49: AI Capability Composer
  const cmpRouter = express.Router();
  v1.use("/composer", cmpRouter);
  cmpRouter.use(authenticate);
  cmpRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerComposerRoutes(cmpRouter);

  // /benchmarks — Session 50: Enterprise AI Benchmark Center
  const bmRouter = express.Router();
  v1.use("/benchmarks", bmRouter);
  bmRouter.use(authenticate);
  bmRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerBenchmarksRoutes(bmRouter);

  // /disaster-recovery — Session 51: Disaster Recovery & AI Continuity
  const drRouter = express.Router();
  v1.use("/disaster-recovery", drRouter);
  drRouter.use(authenticate);
  drRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerDisasterRecoveryRoutes(drRouter);

  // /licensing — Session 52: AI Licensing & Monetization Platform
  const licRouter = express.Router();
  v1.use("/licensing", licRouter);
  licRouter.use(authenticate);
  licRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerLicensingRoutes(licRouter);

  // /deployment — Session 53: Enterprise Deployment Platform
  const depRouter = express.Router();
  v1.use("/deployment", depRouter);
  depRouter.use(authenticate);
  depRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerDeploymentRoutes(depRouter);

  // /updates — Session 54: Update & Lifecycle Management
  const updRouter = express.Router();
  v1.use("/updates", updRouter);
  updRouter.use(authenticate);
  registerUpdateRoutes(updRouter);

  // /usage-intel — Session 55: Enterprise Usage Intelligence
  const usageRouter = express.Router();
  v1.use("/usage-intel", usageRouter);
  usageRouter.use(authenticate);
  registerUsageRoutes(usageRouter);

  // /fabric — Session 56: Intelligence Fabric, Trust Center, Mission Control, AIO Bus
  const fabRouter = express.Router();
  v1.use("/fabric", fabRouter);
  fabRouter.use(authenticate);
  registerFabricRoutes(fabRouter);

  // /robotics — Session 57: Robotics & Physical Automation
  const robRouter = express.Router();
  v1.use("/robotics", robRouter);
  robRouter.use(authenticate);
  registerRoboticsRoutes(robRouter);

  // /spatial — Session 58: Spatial Computing
  const spaRouter = express.Router();
  v1.use("/spatial", spaRouter);
  spaRouter.use(authenticate);
  registerSpatialRoutes(spaRouter);

  // /sdk — Session 59: Enterprise SDK
  const sdkRouter = express.Router();
  v1.use("/sdk", sdkRouter);
  sdkRouter.use(authenticate);
  registerSdkRoutes(sdkRouter);

  // /training — Session 60: Training & Fine-Tuning
  const trRouter = express.Router();
  v1.use("/training", trRouter);
  trRouter.use(authenticate);
  registerTrainingRoutes(trRouter);

  // /data-marketplace — Session 61: Enterprise Data & Knowledge Marketplace
  const dmRouter = express.Router();
  v1.use("/data-marketplace", dmRouter);
  dmRouter.use(authenticate);
  registerDataMarketplaceRoutes(dmRouter);

  // /digital-humans — Session 62: Digital Human Platform
  const dhRouter = express.Router();
  v1.use("/digital-humans", dhRouter);
  dhRouter.use(authenticate);
  registerDigitalHumanRoutes(dhRouter);

  // /quantum — Session 63: Quantum Readiness
  const qRouter = express.Router();
  v1.use("/quantum", qRouter);
  qRouter.use(authenticate);
  registerQuantumRoutes(qRouter);

  // /sustainability — Session 64: Sustainability & ESG
  const esgRouter = express.Router();
  v1.use("/sustainability", esgRouter);
  esgRouter.use(authenticate);
  registerSustainabilityRoutes(esgRouter);

  // /biomedical — Session 65: Biomedical & Healthcare
  const biRouter = express.Router();
  v1.use("/biomedical", biRouter);
  biRouter.use(authenticate);
  registerBiomedicalRoutes(biRouter);

  // /legal — Session 66: Legal Intelligence
  const legRouter = express.Router();
  v1.use("/legal", legRouter);
  legRouter.use(authenticate);
  registerLegalRoutes(legRouter);

  // /education — Session 67: Education & Learning
  const eduRouter = express.Router();
  v1.use("/education", eduRouter);
  eduRouter.use(authenticate);
  registerEducationRoutes(eduRouter);

  // /scientific — Session 68: Scientific Research
  const sciRouter = express.Router();
  v1.use("/scientific", sciRouter);
  sciRouter.use(authenticate);
  registerScientificRoutes(sciRouter);

  // /cognitive — Session 69: Cognitive Evolution & World Intelligence
  const cogRouter = express.Router();
  v1.use("/cognitive", cogRouter);
  cogRouter.use(authenticate);
  registerCognitiveRoutes(cogRouter);

  // /command — Session 70: Global Command Center
  const gccRouter = express.Router();
  v1.use("/command", gccRouter);
  gccRouter.use(authenticate);
  registerCommandRoutes(gccRouter);

  // /ai-economy — Session 71: AI Economy Platform
  const ecoRouter = express.Router();
  v1.use("/ai-economy", ecoRouter);
  ecoRouter.use(authenticate);
  registerAiEconomyRoutes(ecoRouter);

  // /autonomous — Session 72: Autonomous Organization
  const autRouter = express.Router();
  v1.use("/autonomous", autRouter);
  autRouter.use(authenticate);
  registerAutonomousRoutes(autRouter);

  // /cyber — Session 82: Cybersecurity Academy & Multi-Cloud Security
  const cybRouter = express.Router();
  v1.use("/cyber", cybRouter);
  cybRouter.use(authenticate);
  registerCyberRoutes(cybRouter);

  // /opex — Session 73: Operational Excellence & Responsible AI
  const opexRouter = express.Router();
  v1.use("/opex", opexRouter);
  opexRouter.use(authenticate);
  registerOpexRoutes(opexRouter);

  // /industry — Session 74: Semantic Intelligence, Industry Solutions & Digital Operations
  const indRouter = express.Router();
  v1.use("/industry", indRouter);
  indRouter.use(authenticate);
  registerIndustryRoutes(indRouter);

  // /health-ecosystem — Session 75: Health, Wellness & Digital Healthcare Ecosystem
  const hecRouter = express.Router();
  v1.use("/health-ecosystem", hecRouter);
  hecRouter.use(authenticate);
  registerHealthEcosystemRoutes(hecRouter);

  // /etl — Session 83: ETL & Custom Data Pipelines
  const etlRouter = express.Router();
  v1.use("/etl", etlRouter);
  registerEtlRoutes(etlRouter);

  // /camera — Session 87: Live Camera Intelligence
  const cameraRouter = express.Router();
  v1.use("/camera", cameraRouter);
  registerCameraRoutes(cameraRouter);

  // /advertising — AI Advertising Platform (unified multi-mode: standard,
  // smart, performance, autonomous). One module, multiple campaign modes.
  const advertisingRouter = express.Router();
  v1.use("/advertising", advertisingRouter);
  registerAdvertisingRoutes(advertisingRouter);

  // /music — Music Generation (real WAV synthesis in pure Node). Part of the
  // media/creative family; no duplicate of mediaGen (that one is the generic
  // image/audio/video job queue, this one renders actual audible music).
  const musicRouter = express.Router();
  v1.use("/music", musicRouter);
  musicRouter.use(authenticate);
  registerMusicGenRoutes(musicRouter);

  // /media-factory/music-video — AI Music Video Generator (integrated into the
  // Media Studio). Mounted on the same prefix as the media factory so its
  // /music-video/jobs + rendered-file paths resolve under /api/v1/media-factory.
  const musicVideoRouter = express.Router();
  v1.use("/media-factory", musicVideoRouter);
  musicVideoRouter.use(authenticate);
  registerMusicVideoRoutes(musicVideoRouter);

  // /brokers — AI Trading Intelligence Broker Integration Layer (MT5 + others).
  // Upgrade to the existing trading engine: unified broker accounts, AI trading
  // modes, trade supervisor, strategies, portfolio intelligence, risk controls.
  const brokerRouter = express.Router();
  v1.use("/brokers", brokerRouter);
  brokerRouter.use(authenticate);
  registerBrokerIntegrationRoutes(brokerRouter);

  // /marketing — AI Marketing Intelligence & Campaign Management (Tier-1 module).
  const marketingRouter = express.Router();
  v1.use("/marketing", marketingRouter);
  marketingRouter.use(authenticate);
  registerMarketingRoutes(marketingRouter);

  // /tenant-isolation — Session 89: Tenant Isolation & Cross-Tenant Data
  // Governance (per-org isolation policies, namespace audit, cross-tenant
  // self-tests, export gate).
  const tenantIsolationRouter = express.Router();
  v1.use("/tenant-isolation", tenantIsolationRouter);
  registerTenantIsolationRoutes(tenantIsolationRouter);

  // /crm — Session 90: Enterprise CRM (contacts, companies, deal pipeline,
  // activity ledger, deterministic dashboard rollup). Org-scoped Redis keys.
  const crmRouter = express.Router();
  v1.use("/crm", crmRouter);
  registerCrmRoutes(crmRouter);

  // /mobile (device registration, push subscriptions, biometrics, offline sync)
  registerMobileRoutes(v1);

  // /events — SSE real-time channel (Module 1: Gap 6)
  // EventSource doesn't support custom headers, so we accept token via query param
  const eventsRouter = express.Router();
  eventsRouter.use((req, _res, next) => {
    // EventSource API doesn't support Authorization headers — accept token from query
    const queryToken = req.query?.token as string | undefined;
    if (queryToken && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${queryToken}`;
    }
    next();
  });
  eventsRouter.use(authenticate);
  v1.use("/events", eventsRouter);
  registerSSERoutes(eventsRouter);

  // Apply org-scoping middleware to all authenticated routes below this point.
  // This ensures every downstream service has req.org available and cross-tenant
  // data access is prevented at the middleware layer.
  v1.use(orgScope());

  v1.get("/", (_req, res) => {
    const envelope: ApiEnvelope<{ service: string; version: string }> = {
      ok: true,
      data: { service: "windels-api", version: process.env.npm_package_version ?? "0.1.0" },
    };
    res.json(envelope);
  });

  app.get("/healthz", (_req, res) => res.send("ok"));
  app.use("/api/v1", v1);

  // Public API Gateway (api-key authenticated, stable REST surface)
  const publicRouter = express.Router();
  registerPublicApiRoutes(publicRouter);
  app.use("/api/rest/v1", publicRouter);

  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` },
      meta: { requestId: req.requestId },
    });
  });

  app.use(errorHandler);
  return app;
}
