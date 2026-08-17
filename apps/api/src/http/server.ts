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
import { registerMfaAssuranceRoutes } from "./routes/mfaAssurance.js";
import { registerGoogleAuthRoutes } from "./routes/googleAuth.js";
import { registerGoogleIdentityRoutes } from "./routes/googleIdentity.js";
import { registerDerivativesRoutes } from "./routes/derivatives.js";
import { registerDerivativesDeskRoutes } from "./routes/derivativesDesk.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerWebhookRoutes } from "./routes/webhook.js";
import { registerWhatsAppRoutes } from "../channels/whatsapp/whatsapp.routes.js";
import { registerWhatsAppWebhookRoutes } from "../channels/whatsapp/whatsappWebhook.routes.js";
import { registerTelegramRoutes } from "../channels/telegram/telegram.routes.js";
import { registerTelegramWebhookRoutes } from "../channels/telegram/telegramWebhook.routes.js";
import { registerApiKeyRoutes } from "./routes/apikey.js";
import { registerProfileRoutes } from "./routes/profile.js";
import { registerWorkspaceRoutes } from "./routes/workspace.js";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerConversationOpsRoutes } from "./routes/conversationOps.js";
import { registerConversationManageRoutes, registerShareResolveRoutes } from "./routes/conversationManage.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
import { registerProjectContinuityRoutes } from "./routes/projectContinuity.js";
import { registerLeadDiscoveryRoutes } from "./routes/leadDiscovery.js";
import { registerLeadPipelineRoutes } from "./routes/leadPipeline.js";
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
import { registerPaymentsRoutes } from "./routes/payments.js";
import { registerGeoBillingRoutes } from "./routes/geoBilling.js";
import { registerKnowledgeRoutes } from "./routes/knowledge.js";
import { registerReligionsRoutes } from "./routes/religions.js";
import { registerReligionsIntegrationsRoutes } from "./routes/religionsIntegrations.js";
import { registerPoliticsRoutes } from "./routes/politics.js";
import { registerLifePrinciplesRoutes } from "./routes/lifePrinciples.js";
import { registerEnterpriseRoutes } from "./routes/enterprise.js";
import { registerDataPlatformRoutes } from "./routes/dataPlatform.js";
import { registerGovernanceRoutes } from "./routes/governance.js";
import { registerPlatformRoutes } from "./routes/platform.js";
import { registerSecurityRoutes } from "./routes/security.js";
import { registerPublicApiRoutes } from "./routes/publicApi.js";
import { registerDeveloperGatewayRoutes } from "./routes/developerGateway.js";
import { registerDeveloperPlatformRoutes } from "./routes/developerPlatform.js";
import { registerAdminApiControlRoutes } from "./routes/adminApiControl.js";
import { registerBlockonomicsAdminRoutes } from "./routes/blockonomicsAdmin.js";
import { registerContactRoutes } from "./routes/contact.js";
import { registerMobileRoutes } from "./routes/mobile.js";
import { registerMobileSyncRoutes } from "./routes/mobileSync.js";
import { registerQaRoutes } from "./routes/qa.js";
import { registerReleaseRoutes } from "./routes/release.js";
import { registerProgramRoutes } from "./routes/program.js";
import { registerEngineeringRoutes } from "./routes/engineering.js";
import { registerAiEngineeringRoutes } from "./routes/aiEngineering.js";
import { registerIdentityKnowledgeRoutes } from "./routes/identityKnowledge.js";
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
import { registerVoiceRoutes } from "./routes/voice.js";
import { registerTradingIntelRoutes } from "./routes/tradingIntel.js";
import { registerExpertsPlatformRoutes } from "./routes/expertsPlatform.js";
import { registerMediaFactoryRoutes } from "./routes/mediaFactory.js";
import { registerUxIntelligenceRoutes } from "./routes/uxIntelligence.js";
import { registerGiftCardsRoutes } from "./routes/giftCards.js";
import { registerGlobalCurrencyRoutes } from "./routes/globalCurrency.js";
import { registerV76ValidationRoutes } from "./routes/v76validation.js";
import { registerMediaGenRoutes } from "./routes/mediaGen.js";
import { registerVideoRoutes } from "./routes/video.js";
import { registerVideoAssetRoutes } from "./routes/videoAssets.js";
import { registerVideoTransformRoutes } from "./routes/videoTransform.js";
import { registerVideoTransformAssetRoutes } from "./routes/videoTransformAssets.js";
import { registerVideoTransformerRoutes } from "./routes/videoTransformer.js";
import { registerVideoTransformerAssetRoutes } from "./routes/videoTransformerAssets.js";
import { registerCinematicRoutes } from "./routes/cinematic.js";
import { registerPluginOsRoutes } from "./routes/pluginOs.js";
import { registerCinematicAssetRoutes } from "./routes/cinematicAssets.js";
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
import { registerCyberCloudAcademyRoutes } from "./routes/cyberCloudAcademy.js";
import { registerUniversityRoutes } from "./routes/university.js";
import { registerUniversityEngineRoutes } from "./routes/universityEngine.js";
import { registerScientificRoutes } from "./routes/scientific.js";
import { registerCognitiveRoutes } from "./routes/cognitive.js";
import { registerCommandRoutes } from "./routes/command.js";
import { registerAiEconomyRoutes } from "./routes/aiEconomy.js";
import { registerAutonomousRoutes } from "./routes/autonomous.js";
import { registerCyberRoutes } from "./routes/cyber.js";
import { registerOpexRoutes } from "./routes/opex.js";
import { registerOpexAssuranceRoutes } from "./routes/opexAssurance.js";
import { registerIndustryRoutes } from "./routes/industry.js";
import { registerHealthEcosystemRoutes } from "./routes/healthEcosystem.js";
import { registerEtlRoutes } from "./routes/etl.js";
import { registerCameraRoutes } from "./routes/camera.js";
import { registerAdvertisingRoutes } from "./routes/advertising.js";
import { registerTenantIsolationRoutes } from "./routes/tenantIsolation.js";
import { registerCrmRoutes } from "./routes/crm.js";
import { registerEmailIntelRoutes } from "./routes/emailIntel.js";
import { registerErpRoutes } from "./routes/erp.js";
import { registerRevenueGuardianRoutes } from "./routes/revenueGuardian.js";
import { registerWebsiteBuilderRoutes } from "./routes/websiteBuilder.js";
import { registerSocialPlatformRoutes } from "./routes/socialPlatform.js";
import { registerHelpdeskRoutes } from "./routes/helpdesk.js";
import { registerAppBuilderRoutes } from "./routes/appBuilder.js";
import { registerBusinessIntelligenceRoutes } from "./routes/businessIntelligence.js";
import { registerSoftwareFactoryRoutes } from "./routes/softwareFactory.js";
import { registerEnterpriseSearchRoutes } from "./routes/enterpriseSearch.js";
import { registerEnterpriseFinOpsRoutes } from "./routes/enterpriseFinOps.js";
import { registerMusicGenRoutes } from "./routes/musicGen.js";
import { registerMusicVideoRoutes } from "./routes/musicVideo.js";
import { registerPublishingRoutes } from "./routes/publishing.js";
import { registerCommerceRoutes } from "./routes/commerce.js";
import { registerAiCommerceRoutes } from "./routes/aiCommerce.js";
import { registerBrokerIntegrationRoutes } from "./routes/brokerIntegration.js";
import { registerEaRoutes } from "./routes/ea.js";
import { registerMarketingRoutes } from "./routes/marketing.js";
import { registerNfcRoutes } from "./routes/nfc.js";
import { registerPublicNfcRoutes } from "./routes/nfcPublic.js";
import { registerModuleCenterRoutes } from "./routes/moduleCenter.js";
import { registerModuleRuntimeRoutes } from "./routes/moduleRuntime.js";
import { registerNativeAiApiRoutes } from "./routes/nativeAiApi.js";
import { registerNativeAiRoutes } from "./routes/nativeAi.js";
import { registerCloudAndroidRoutes } from "./routes/cloudAndroid.js";
import { verifySignature, resolveCallbackOrgId, getWebhookConfig } from "../mediaFactory/publishing/webhooks.js";
import { PublishingService } from "../mediaFactory/publishing.service.js";
import { logger } from "../observability/logger.js";
import { observabilityMiddleware } from "./middleware/observability.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { csrfMiddleware } from "../security/csrf.js";
import { orgScope } from "./middleware/orgScope.js";
import { registerSSERoutes } from "./routes/events.js";
import jwt from "jsonwebtoken";
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
  // Session 116 — MFA assurance (policy, coverage, throttle, ledger) on a
  // `/mfa` sub-router registered ahead of the original six endpoints. The
  // sub-router attaches `authenticate` per handler rather than with
  // `router.use`, so `/mfa/status`, `/mfa/enable`, `/mfa/confirm`,
  // `/mfa/verify`, `/mfa/disable` and `/mfa/recovery-codes` fall through to
  // their original handlers with their behaviour unchanged.
  const mfaAssuranceRouter = express.Router();
  v1.use("/mfa", mfaAssuranceRouter);
  registerMfaAssuranceRoutes(mfaAssuranceRouter);
  registerMfaRoutes(v1);
  // Session 114 Google identity governance (policy, linked identities, ledger,
  // configuration report) on an `/auth/google` sub-router registered ahead of
  // the OAuth endpoints themselves. The sub-router attaches `authenticate` per
  // handler rather than with `router.use`, so `/auth/google`,
  // `/auth/google/status` and `/auth/google/callback` fall through to the
  // original handlers with their behaviour — including their unauthenticated
  // status — unchanged.
  const googleIdentityRouter = express.Router();
  v1.use("/auth/google", googleIdentityRouter);
  registerGoogleIdentityRoutes(googleIdentityRouter);
  registerGoogleAuthRoutes(v1);
  // Session 113 desk (position book, portfolio exposure, scenarios, bond
  // ladder) on a `/derivatives` sub-router, registered ahead of the Session 81
  // calculators. The sub-router attaches `authenticate` per handler rather than
  // with `router.use`, so an unmatched path falls through to Session 81's
  // stateless endpoints with their behaviour unchanged.
  const derivativesRouter = express.Router();
  v1.use("/derivatives", derivativesRouter);
  registerDerivativesDeskRoutes(derivativesRouter);
  registerDerivativesRoutes(v1);
  registerAdminRoutes(v1);
  registerMeRoutes(v1);
  registerWebhookRoutes(v1);
  registerApiKeyRoutes(v1);
  registerProfileRoutes(v1);
  registerAttachmentRoutes(v1);
  registerProjectContinuityRoutes(v1);
  // Session 115 — the lead pipeline shares the /lead-discovery prefix with
  // Session 85's discovery endpoints. Its router is registered first and
  // attaches `authenticate` per handler rather than with `router.use`, so an
  // unmatched path falls through to Session 85's six endpoints unchanged.
  const leadPipelineRouter = express.Router();
  v1.use("/lead-discovery", leadPipelineRouter);
  registerLeadPipelineRoutes(leadPipelineRouter);
  const leadDiscoveryRouter = express.Router();
  v1.use("/lead-discovery", leadDiscoveryRouter);
  registerLeadDiscoveryRoutes(leadDiscoveryRouter);
  registerPromptTemplateRoutes(v1);
  registerAIRoutes(v1);
  registerWorkspaceRoutes(v1);

  // /conversations + /conversations/:id/messages share a sub-router
  const conversationsRouter = express.Router();
  v1.use("/conversations", conversationsRouter);
  // Session 112 first: /search, /unread and /deleted are literal paths that the
  // Session 2 router's `GET /:id` (cuid-validated) would otherwise reject.
  registerConversationOpsRoutes(conversationsRouter);
  // Conversation-management (pin/archive/rename/share) — paths are all
  // `/:id/...` so they never collide with the literal collection paths above
  // or the Session 2 `/:id` handlers below.
  registerConversationManageRoutes(conversationsRouter);
  registerConversationRoutes(conversationsRouter);
  registerMessageRoutes(conversationsRouter);

  // Public share-link resolution. Attaches the user *opportunistically* when a
  // valid JWT is supplied so anonymous `anyone_with_link` shares still resolve.
  const shareResolveRouter = express.Router();
  v1.use("/share", shareResolveRouter);
  shareResolveRouter.use((req, _res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next();
    try {
      const payload = jwt.verify(token, env.JWT_SECRET, { issuer: env.JWT_ISSUER }) as any;
      req.user = { id: payload.id, email: payload.email, role: payload.role, organizationId: payload.organizationId };
    } catch {
      /* ignore invalid token — anonymous access still applies */
    }
    next();
  });
  registerShareResolveRoutes(shareResolveRouter);

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
  registerPaymentsRoutes(v1);
  registerGeoBillingRoutes(v1);

  // /knowledge — Session 140: Global Human Knowledge & Everyday Question
  // Intelligence System (master categories, curated knowledge layers, the
  // Question Intent Engine, teaching/comparison/timeline/graph engines, and
  // the org-scoped dynamic layer). Catalog reads work for any authenticated
  // member; the dynamic layer is organization-scoped.
  const knowledgeRouter = express.Router();
  v1.use("/knowledge", knowledgeRouter);
  knowledgeRouter.use(authenticate);
  registerKnowledgeRoutes(knowledgeRouter);

  // /religions — Session 141: Global Religion, Belief & Spirituality
  // Knowledge System (families, denominations, indigenous traditions,
  // ancient religions, the comparison engine, educational levels and the
  // ten-step expansion pipeline). Catalog reads work for any authenticated
  // member; submissions are organization-scoped; approval is Super Admin only.
  const religionsRouter = express.Router();
  v1.use("/religions", religionsRouter);
  religionsRouter.use(authenticate);
  registerReligionsRoutes(religionsRouter);

  // /religions/integrations — Session 142: the five §20 integration channels
  // (Memory Fabric, AI agents, AI Training Center, Lecturer AI education,
  // conversational teaching).
  const religionsIntegrationsRouter = express.Router();
  religionsIntegrationsRouter.use(authenticate);
  registerReligionsIntegrationsRoutes(religionsIntegrationsRouter);
  religionsRouter.use("/integrations", religionsIntegrationsRouter);

  // /politics — Session 144: Global Politics, Government & Political History
  // Intelligence System (country profiles, leaders, parties, elections,
  // ministries, constitutions, ideologies, movements, international
  // organizations, timelines, the fact-vs-opinion engine and the
  // never-overwrite-history update engine). Catalog reads work for any
  // authenticated member; updates are organization-scoped; applying updates
  // is Super Admin only.
  const politicsRouter = express.Router();
  v1.use("/politics", politicsRouter);
  politicsRouter.use(authenticate);
  registerPoliticsRoutes(politicsRouter);

  // /life-principles — Session 150: Life Operating Principles Engine (the
  // 115 practical life principles grouped into 10 parts, the Life Coaching
  // Engine over 13 areas, Daily Rules Mode, the Decision Mode framework,
  // the 12 balance pairs and the WINDELS Principle). Static curated
  // catalog — read-only for any authenticated member.
  const lifePrinciplesRouter = express.Router();
  v1.use("/life-principles", lifePrinciplesRouter);
  lifePrinciplesRouter.use(authenticate);
  registerLifePrinciplesRoutes(lifePrinciplesRouter);

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

  // /ai-engineering — Session 124: AI Software Engineering Workforce
  // (roles, GitHub engineering module, repository intelligence, autonomous
  // tasks, engineering memory, command center). Any authenticated member may
  // read; write capabilities are gated per handler where it matters.
  const aiEngRouter = express.Router();
  v1.use("/ai-engineering", aiEngRouter);
  aiEngRouter.use(authenticate);
  registerAiEngineeringRoutes(aiEngRouter);

  // /identity-knowledge — Session 125: Super Admin Biography, Identity
  // Memory & AI Knowledge System. Record management is super-admin-only
  // (requireSuperAdmin per route); reads are classification-aware; the AI
  // response engine answers only from approved knowledge.
  const ikRouter = express.Router();
  v1.use("/identity-knowledge", ikRouter);
  ikRouter.use(authenticate);
  registerIdentityKnowledgeRoutes(ikRouter);

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

  // /voice — Unified Voice Module (v4.0): Voice Studio (S40) + Voice Foundry (S41)
  // Combined voice synthesis, creation, deployment, and management
  const voiceRouter = express.Router();
  v1.use("/voice", voiceRouter);
  voiceRouter.use(authenticate);
  voiceRouter.use(async (req, res, next) => {
    try {
      const { hasPermission } = await import("../services/permissions.service.js");
      const { Permission } = await import("@prisma/client");
      if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admins only" } });
      }
      next();
    } catch (e) { next(e); }
  });
  registerVoiceRoutes(voiceRouter);

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

  // ── WhatsApp channel ──────────────────────────────────────────────────
  // The PUBLIC webhook mounts FIRST and without `authenticate`: Meta cannot
  // present a WINDELS JWT. It is protected by the verify token (GET) and the
  // HMAC app-secret signature over the raw body (POST). The authenticated
  // admin router is mounted after it on a sibling path.
  const waWebhookRouter = express.Router();
  v1.use("/channels/whatsapp/webhook", waWebhookRouter);
  registerWhatsAppWebhookRoutes(waWebhookRouter);
  registerWhatsAppRoutes(v1);

  // /channels/telegram/webhook — PUBLIC bot updates (secret-token verified).
  const tgWebhookRouter = express.Router();
  v1.use("/channels/telegram/webhook", tgWebhookRouter);
  registerTelegramWebhookRoutes(tgWebhookRouter);
  registerTelegramRoutes(v1);

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

  // /publishing — Publishing Module (extracted from mediaFactory)
  // Handles publishing to external platforms: YouTube, TikTok, Instagram, etc.
  const publishingRouter = express.Router();
  v1.use("/publishing", publishingRouter);
  publishingRouter.use(authenticate);
  registerPublishingRoutes(publishingRouter);

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

  // /video — AI Video Generation & Production Engine (incremental module).
  // Public asset serving is mounted before authenticate so render URLs stream;
  // the JSON project/job API requires auth.
  const videoAssetRouter = express.Router();
  v1.use("/video/assets", videoAssetRouter);
  registerVideoAssetRoutes(videoAssetRouter);
  const videoRouter = express.Router();
  v1.use("/video", videoRouter);
  registerVideoRoutes(videoRouter);

  // /video-transform — AI Video Transformation Studio (node-based Switch X)
  const vtAssetRouter = express.Router();
  v1.use("/video-transform/assets", vtAssetRouter);
  registerVideoTransformAssetRoutes(vtAssetRouter);
  const vtRouter = express.Router();
  v1.use("/video-transform", vtRouter);
  registerVideoTransformRoutes(vtRouter);

  // /cinematic — AI Video Studio (cinematic generation, characters, multi-shot).
  const cinAssetRouter = express.Router();
  v1.use("/cinematic/assets", cinAssetRouter);
  registerCinematicAssetRoutes(cinAssetRouter);
  const cinRouter = express.Router();
  v1.use("/cinematic", cinRouter);
  registerCinematicRoutes(cinRouter);

  // /video-editor — AI VIDEO TRANSFORMER (natural-language selective editing).
  const vtxAssetRouter = express.Router();
  v1.use("/video-editor/assets", vtxAssetRouter);
  registerVideoTransformerAssetRoutes(vtxAssetRouter);
  const vtxRouter = express.Router();
  v1.use("/video-editor", vtxRouter);
  registerVideoTransformerRoutes(vtxRouter);

  // /plugins — WINDELS PLUGIN OS (marketplace, install, connections, capabilities).
  const pluginOsRouter = express.Router();
  v1.use("/plugins", pluginOsRouter);
  registerPluginOsRoutes(pluginOsRouter);

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

  // /cyber-cloud-academy — Lecturer AI teaching tracks (Cyber + Cloud)
  // Mounted next to /education so both learners and security/cloud users can
  // discover it; sessions themselves run through the Lecturer AI.
  const ccaRouter = express.Router();
  v1.use("/cyber-cloud-academy", ccaRouter);
  ccaRouter.use(authenticate);
  registerCyberCloudAcademyRoutes(ccaRouter);

  // /university — University Education: full faculty + degree catalog taught
  // by the Lecturer AI (bachelor / master / doctor + research).
  const uniRouter = express.Router();
  v1.use("/university", uniRouter);
  uniRouter.use(authenticate);
  registerUniversityRoutes(uniRouter);

  // /education-engine — WINDELS Universal University & Higher Education Engine
  const ueRouter = express.Router();
  v1.use("/education-engine", ueRouter);
  ueRouter.use(authenticate);
  registerUniversityEngineRoutes(ueRouter);

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
  // Session 118 registers its assurance handlers on the same router and *ahead*
  // of Session 73's three, so an unmatched path falls straight through to
  // /opex/dashboard/rollup and /opex/safety-alerts with their behaviour intact.
  const opexRouter = express.Router();
  v1.use("/opex", opexRouter);
  opexRouter.use(authenticate);
  registerOpexAssuranceRoutes(opexRouter);
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

  // /nfc — NFC Card Manager. The API creates authorization/verification plans;
  // local PC/SC, mobile native, or Web NFC adapters perform hardware I/O.
  registerNfcRoutes(v1);

  // Permanent signed-package module control plane (Super Admin only) and
  // authenticated runtime registrations/proxy for successfully activated modules.
  registerModuleCenterRoutes(v1);
  registerModuleRuntimeRoutes(v1);
  registerCloudAndroidRoutes(v1);

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

  // /ea — MetaTrader Expert Advisor endpoints. Mixed public/private auth:
  // register/list/revoke are behind session auth; poll/fill/heartbeat/config
  // use Bearer-token auth handled inside registerEaRoutes.
  const eaRouter = express.Router();
  v1.use("/ea", eaRouter);
  registerEaRoutes(eaRouter);

  // /marketing — AI Marketing Intelligence & Campaign Management (Tier-1 module).
  const marketingRouter = express.Router();
  v1.use("/marketing", marketingRouter);
  marketingRouter.use(authenticate);
  registerMarketingRoutes(marketingRouter);

  // /commerce — B2C E-commerce (product catalog, cart, checkout, orders)
  const commerceRouter = express.Router();
  v1.use("/commerce", commerceRouter);
  commerceRouter.use(authenticate);
  registerCommerceRoutes(commerceRouter);

  // /ai-commerce — AI Commerce over the WMPC marketplace. Distinct from
  // /commerce above: this router owns NO catalog, cart, order or payment data;
  // every call is proxied to WMPC through the commerce connector. The WMPC
  // webhook lives inside this router and authenticates by HMAC, so the router
  // must NOT have a blanket `authenticate` applied here.
  const aiCommerceRouter = express.Router();
  v1.use("/ai-commerce", aiCommerceRouter);
  registerAiCommerceRoutes(aiCommerceRouter);

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

  // /email-intel — Session 91: Enterprise Email Intelligence (mailboxes,
  // threaded messages, outbox + real SMTP connector, AI draft/summarize/
  // triage with honest provider labeling, deterministic inbox analytics).
  const emailIntelRouter = express.Router();
  v1.use("/email-intel", emailIntelRouter);
  registerEmailIntelRoutes(emailIntelRouter);

  // /erp — Session 92: Enterprise ERP (product catalog, inventory +
  // movements ledger, suppliers, purchase/sales orders with honest
  // lifecycles, CRM won-deal hook, deterministic operations rollup).
  const erpRouter = express.Router();
  v1.use("/erp", erpRouter);
  registerErpRoutes(erpRouter);

  const revenueGuardianRouter = express.Router();
  v1.use("/revenue-guardian", revenueGuardianRouter);
  registerRevenueGuardianRoutes(revenueGuardianRouter);

  // /website-builder — Session 93: Website Builder (org-scoped sites, pages
  // + typed blocks, deterministic block→HTML renderer, publish pipeline with
  // real snapshots, AI copy with honest provider labeling).
  const websiteBuilderRouter = express.Router();
  v1.use("/website-builder", websiteBuilderRouter);
  registerWebsiteBuilderRoutes(websiteBuilderRouter);

  // /social-platform — Session 94: Social Platform (org-scoped feed, posts,
  // comments, reactions ledger → computed engagement, hashtag extraction,
  // deterministic rollup).
  const socialPlatformRouter = express.Router();
  v1.use("/social-platform", socialPlatformRouter);
  registerSocialPlatformRoutes(socialPlatformRouter);

  // /helpdesk — Session 95: Enterprise Helpdesk & Customer Support (tickets
  // with honest lifecycle + deterministic SLA, comment timeline, assignment,
  // CRM activity integration, computed rollup).
  const helpdeskRouter = express.Router();
  v1.use("/helpdesk", helpdeskRouter);
  registerHelpdeskRoutes(helpdeskRouter);

  // /builder — Session 96: Enterprise AI Software Factory & Application
  // Builder (implements docs/AI_APPLICATION_BUILDER_SPECIFICATION.md V3.0
  // core: projects, AI-workforce tasks, build-farm state machine, immutable
  // artifact registry with real SHA-256/SBOM, Human Decision Inbox gate).
  const appBuilderRouter = express.Router();
  v1.use("/builder", appBuilderRouter);
  registerAppBuilderRoutes(appBuilderRouter);

  // /builder (extended) — Session 99: Software Factory Studios & Build Farm
  // (five-studio catalog + org-scoped studio plans + project coverage +
  // per-run compilation targets derived honestly from run state).
  const softwareFactoryRouter = express.Router();
  v1.use("/builder", softwareFactoryRouter);
  registerSoftwareFactoryRoutes(softwareFactoryRouter);

  // /bi — Session 97: Enterprise Business Intelligence & Report Builder
  // (data sources, live KPI values computed from the real module stores,
  // report builder + deterministic evaluation + real CSV export).
  const businessIntelRouter = express.Router();
  v1.use("/bi", businessIntelRouter);
  registerBusinessIntelligenceRoutes(businessIntelRouter);

  // /search — Session 98: Enterprise Search (unified org-scoped search over
  // the real module records with deterministic relevance ranking + facets).
  const enterpriseSearchRouter = express.Router();
  v1.use("/search", enterpriseSearchRouter);
  registerEnterpriseSearchRoutes(enterpriseSearchRouter);

  // /finops — Session 100: org-scoped Enterprise FinOps depth (cost centers,
  // budgets, actual cost ledger, allocation ledger and computed chargebacks).
  const enterpriseFinOpsRouter = express.Router();
  v1.use("/finops", enterpriseFinOpsRouter);
  registerEnterpriseFinOpsRoutes(enterpriseFinOpsRouter);

  // /mobile (device registration, push subscriptions, biometrics, offline sync)
  //
  // Session 117's durable offline queue, device-trust and push-health routes are
  // mounted on their own /mobile router *first*, so anything they do not serve
  // falls straight through to the Session 21 endpoints with their paths,
  // payloads and (for GET /mobile/config) their public access unchanged.
  const mobileSyncRouter = express.Router();
  v1.use("/mobile", mobileSyncRouter);
  registerMobileSyncRoutes(mobileSyncRouter);
  registerMobileRoutes(v1);

  // /native-ai — first-party Native AI Studio. This is intentionally a
  // session-authenticated console API, distinct from the external API-key
  // surface mounted at top-level `/v1` below. Both delegate to the same
  // health-gated, real-provider-only native router.
  const nativeAiStudioRouter = express.Router();
  v1.use("/native-ai", nativeAiStudioRouter);
  registerNativeAiRoutes(nativeAiStudioRouter);

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

  // Native AI provider surface. It deliberately lives at top-level /v1 while
  // the existing /api/rest/v1 gateway remains mounted and unchanged.
  const nativeAiRouter = express.Router();
  registerNativeAiApiRoutes(nativeAiRouter);
  app.use("/v1", rateLimit("apiGlobal"), nativeAiRouter);

  // Public API Gateway (api-key authenticated, stable REST surface)
  const publicRouter = express.Router();
  registerPublicApiRoutes(publicRouter);
  registerPublicNfcRoutes(publicRouter);
  // Developer gateway extensions (agent execution, workflows, knowledge,
  // trading, media) mounted after the Session 120 predecessors so their exact
  // paths remain authoritative.
  registerDeveloperGatewayRoutes(publicRouter);
  app.use("/api/rest/v1", publicRouter);

  // Developer Platform (applications, products, usage dashboard) on the
  // authenticated /api/v1 surface.
  registerDeveloperPlatformRoutes(v1);
  // Admin API Control Center (Super Admin) — platform-wide developer control.
  registerAdminApiControlRoutes(v1);
  // Blockonomics payment-provider control plane (Super Admin only).
  registerBlockonomicsAdminRoutes(v1);
  // Contact & Support Center (public form, AI assistant, my-requests, admin).
  registerContactRoutes(v1);

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
