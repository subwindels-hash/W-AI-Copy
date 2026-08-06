import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createApp } from "./http/server.js";
import { prisma } from "./db/client.js";
import { redis } from "./db/redis.js";
import { agentRuntime } from "./services/agentRuntime.service.js";
import * as workflowService from "./services/workflow.service.js";
import { ensureRolePermissions } from "./services/permissions.service.js";
import { startAlertEngine } from "./services/alerting.service.js";
import { applyRetention } from "./services/compliance.service.js";
import { autoSummarizeConversations } from "./services/ai/summarizer.js";
import { Metrics } from "./observability/metrics.js";

let workflowTicker: NodeJS.Timeout | null = null;
let retentionTicker: NodeJS.Timeout | null = null;
let summarizationTicker: NodeJS.Timeout | null = null;

async function main() {
  // Wait for Redis — don't crash if temporarily down at boot (dev-friendly).
  redis.connect().catch((e) => logger.warn("redis initial connect failed", { err: e }));

  // Prisma will connect lazily on first query; warm it up.
  await prisma.$connect().catch((e) => {
    logger.error("prisma connect failed", { err: e });
    process.exit(1);
  });

  const app = createApp();
  const server = app.listen(env.API_PORT, env.API_HOST, async () => {
    logger.info(`🚀 WINDELS AI OS API listening on http://${env.API_HOST}:${env.API_PORT}/api/v1`, { port: env.API_PORT, host: env.API_HOST, env: env.NODE_ENV, service: "windels-api" });
    Metrics.gauge("process.uptime_seconds", 0);
    // Seed RBAC baseline.
    await ensureRolePermissions().catch((e) => logger.warn("role permission seed failed", { err: e }));

    // ── Session 18: Enterprise Engineering Framework bootstrap ──
    try {
      const { discoverRoutes } = await import("./enterprise/apiGovernance/apiGovernance.service.js");
      const found = discoverRoutes(app);
      logger.info("api governance: routes discovered", { count: found.length });

      // The API self-registers with DiscoveryService inside its module init
      // (registerSelf()), so we do NOT call registerOnce() here — that would
      // create a duplicate entry. We still publish a startup event once.

      const { GovernanceService } = await import("./enterprise/governance/governance.service.js");
      // Seed one canonical Session 18 ADR so the catalog isn't empty.
      const existing = await GovernanceService.listADRs();
      if (!existing.length) {
        await GovernanceService.createADR({
          title: "Adopt Enterprise Engineering Framework",
          context: "The platform has reached a size where microservice conventions, service discovery, event bus schemas, API governance, and architecture reviews must be formalised to support horizontal scaling.",
          decision: "Adopt the four enterprise-framework modules shipped in Session 18: Architecture Governance (ADRs + Standards + Reviews), Service Registry/Discovery (heartbeats + dependency validation), typed Event Bus (schemas, correlation IDs, DLQ, Redis pub/sub), and API Governance (endpoint inventory, OpenAPI generation, version negotiation).",
          consequences: "All new services must register with the registry, publish schemas for every event, and add ADRs for significant architectural choices. API routes are auto-inventoried for OpenAPI generation.",
          authors: [],
          tags: ["enterprise", "architecture", "session-18"],
          status: "accepted",
        }, "system");
      }

      const { EventBusService } = await import("./enterprise/events/eventBus.service.js");
      EventBusService.publish("service.registered", { serviceId: "windels-api" }, { producer: "bootstrap" }).catch(() => {});

      const { SyncService } = await import("./enterprise/sync/sync.service.js");
      // Delay slightly so the data-catalog seed (600ms) and KG seed (700ms)
      // setTimeouts have both populated their stores before the catalog-scan runs.
      setTimeout(() => { void SyncService.bootstrap(); }, 1500);

      // Session 20 — AI Workforce Communication (identities, teams, policies)
      setTimeout(async () => {
        try {
          const { bootstrapAgentComm } = await import("./enterprise/agentComm/bootstrap.js");
          await bootstrapAgentComm();
        } catch (e) { logger.warn("agent comm bootstrap failed", { err: e }); }
      }, 2000);

      // Session 21 — Enterprise Infrastructure (cluster/IaC/releases/regions/optimization)
      setTimeout(async () => {
        try {
          const { ClusterService } = await import("./platform/cluster.service.js");
          const { IaCService } = await import("./platform/iac.service.js");
          const { ReleaseService } = await import("./platform/release.service.js");
          const { RegionService } = await import("./platform/region.service.js");
          const { OptimizationService } = await import("./platform/optimization.service.js");
          const { InfraMetricsService } = await import("./platform/infraMetrics.service.js");
          await ClusterService.seed(); await IaCService.seed(); await ReleaseService.seed();
          await RegionService.seed(); await OptimizationService.seed();
          InfraMetricsService.start();
          logger.info("platform infrastructure bootstrap complete");
        } catch (e) { logger.warn("infrastructure bootstrap failed", { err: e }); }
      }, 2500);

      // Session 22 — Enterprise QA Platform (test runner, seeded suites/cases, scheduler)
      setTimeout(async () => {
        try {
          const { bootstrapQA } = await import("./qa/bootstrap.js");
          await bootstrapQA();
        } catch (e) { logger.warn("qa bootstrap failed", { err: e }); }
      }, 3500);

      // Session 23 — Engineering Governance (coding/repo/ADR/review/dep/sec standards)
      setTimeout(async () => {
        try {
          const { bootstrapGovernance } = await import("./governance/bootstrap.js");
          await bootstrapGovernance();
        } catch (e) { logger.warn("engineering governance bootstrap failed", { err: e }); }
      }, 4500);

      // Session 24 — Release Management (pipeline, approvals, AI validation, staging, production, DORA)
      setTimeout(async () => {
        try {
          const { bootstrapReleases } = await import("./release/bootstrap.js");
          await bootstrapReleases();
        } catch (e) { logger.warn("release pipeline bootstrap failed", { err: e }); }
      }, 5000);

      // Session 25 — AI Program Management (roadmap, sprints, requirements, arch review, risks, exec)
      setTimeout(async () => {
        try {
          const { bootstrapProgram } = await import("./program/bootstrap.js");
          await bootstrapProgram();
        } catch (e) { logger.warn("program management bootstrap failed", { err: e }); }
      }, 5500);

      // Session 26 — Engineering Observability (metrics, deployments, tech debt, pipelines, productivity)
      setTimeout(async () => {
        try {
          const { bootstrapEngineering } = await import("./engineering/bootstrap.js");
          await bootstrapEngineering();
        } catch (e) { logger.warn("engineering observability bootstrap failed", { err: e }); }
      }, 6000);

      // Session 27 — Enterprise Developer Platform (SDKs, CLI, local/sandbox/emulator, testing, deployment toolkit)
      setTimeout(async () => {
        try {
          const { bootstrapDevPortal } = await import("./devportal/bootstrap.js");
          await bootstrapDevPortal();
        } catch (e) { logger.warn("developer portal bootstrap failed", { err: e }); }
      }, 6500);

      // Session 28 — Extension Platform (registry, business/industry modules, skills, custom agents, workflow/dashboard/UI extensions, lifecycle)
      setTimeout(async () => {
        try {
          const { bootstrapExtensions } = await import("./extensions/bootstrap.js");
          await bootstrapExtensions();
        } catch (e) { logger.warn("extension platform bootstrap failed", { err: e }); }
      }, 7000);

      // Session 29 — Enterprise Platform Services (config, feature flags, runtime config, policies, multi-tenant, licensing, billing, capabilities, ontology, blueprints)
      setTimeout(async () => {
        try {
          const { bootstrapPlatformServices } = await import("./platformServices/bootstrap.js");
          await bootstrapPlatformServices();
        } catch (e) { logger.warn("platform services bootstrap failed", { err: e }); }
      }, 7500);

      // Session 30 — AI Infrastructure / MLOps (model registry, lifecycle, deployments, monitoring, governance, prompts, RAG, vectors, embeddings, knowledge)
      setTimeout(async () => {
        try {
          const { bootstrapMlOps } = await import("./mlOps/bootstrap.js");
          await bootstrapMlOps();
        } catch (e) { logger.warn("ml ops bootstrap failed", { err: e }); }
      }, 8000);

      // Session 31 — Enterprise Foundation (data fabric, identity/federation/AI identity, finops/cost/optimization, resilience/self-healing/BCP, AI quality/evals, global ops/exec dashboard)
      setTimeout(async () => {
        try {
          const { bootstrapEnterpriseFoundation } = await import("./enterpriseFoundation/bootstrap.js");
          await bootstrapEnterpriseFoundation();
        } catch (e) { logger.warn("enterprise foundation bootstrap failed", { err: e }); }
      }, 8500);

      // Session 32 — Enterprise Collaboration & Perception Intelligence (live meeting intel, screen intel, live camera intel)
      setTimeout(async () => {
        try {
          const { bootstrapCollaboration } = await import("./collaboration/bootstrap.js");
          await bootstrapCollaboration();
        } catch (e) { logger.warn("collaboration bootstrap failed", { err: e }); }
      }, 9000);

      // Session 33 — Vendor-Agnostic AI Ecosystem Infrastructure (provider abstraction, personality studio, trust & explainability)
      setTimeout(async () => {
        try {
          const { bootstrapAiEcosystem } = await import("./aiEcosystem/bootstrap.js");
          await bootstrapAiEcosystem(logger);
        } catch (e) { logger.warn("ai ecosystem bootstrap failed", { err: e }); }
      }, 9500);

      // Session 34 — Enterprise Marketplace, Digital Twin & Simulation
      setTimeout(async () => {
        try {
          const { bootstrapMarketplace } = await import("./marketplace/bootstrap.js");
          await bootstrapMarketplace(logger);
        } catch (e) { logger.warn("marketplace bootstrap failed", { err: e }); }
      }, 10000);

      // Session 35 — Crypto Intelligence (opt-in, disabled by default)
      setTimeout(async () => {
        try {
          const { bootstrapCryptoIntelligence } = await import("./cryptoIntelligence/bootstrap.js");
          await bootstrapCryptoIntelligence(logger);
        } catch (e) { logger.warn("crypto intel bootstrap failed", { err: e }); }
      }, 10500);

      // Session 36 — Wake Intelligence & Multimodal Activation
      setTimeout(async () => {
        try {
          const { bootstrapWakeIntelligence } = await import("./wakeIntel/bootstrap.js");
          await bootstrapWakeIntelligence(logger);
        } catch (e) { logger.warn("wake intel bootstrap failed", { err: e }); }
      }, 11000);

      // Session 37 — Enterprise Architecture stubs + ESI/SI/Kernel/God-Node registry
      setTimeout(async () => {
        try {
          const { bootstrapArchitecture } = await import("./architecture/bootstrap.js");
          await bootstrapArchitecture(logger);
        } catch (e) { logger.warn("architecture bootstrap failed", { err: e }); }
      }, 11500);

      // Session 38 — Self-Hosted AI Infrastructure
      setTimeout(async () => {
        try {
          const { bootstrapSelfHosted } = await import("./selfHosted/bootstrap.js");
          await bootstrapSelfHosted(logger);
        } catch (e) { logger.warn("self-hosted bootstrap failed", { err: e }); }
      }, 12000);

      // Session 39 — AI Kernel
      setTimeout(async () => {
        try {
          const { bootstrapKernel } = await import("./kernel/bootstrap.js");
          await bootstrapKernel(logger);
        } catch (e) { logger.warn("kernel bootstrap failed", { err: e }); }
      }, 12500);

      // Session 40 — Voice Studio
      setTimeout(async () => {
        try {
          const { bootstrapVoiceStudio } = await import("./voiceStudio/bootstrap.js");
          await bootstrapVoiceStudio(logger);
        } catch (e) { logger.warn("voice studio bootstrap failed", { err: e }); }
      }, 13000);

      // Session 81 — Unified Global Financial Markets Intelligence & Trading Platform (extends S35)
      setTimeout(async () => {
        try {
          const { bootstrapTradingIntel } = await import("./tradingIntel/bootstrap.js");
          await bootstrapTradingIntel(logger);
        } catch (e) { logger.warn("trading intel bootstrap failed", { err: e }); }
      }, 13500);

      // Session 41 — AI Voice Foundry (autonomous voice design/evolve/deploy)
      setTimeout(async () => {
        try {
          const { bootstrapVoiceFoundry } = await import("./voiceFoundry/bootstrap.js");
          await bootstrapVoiceFoundry(logger);
        } catch (e) { logger.warn("voice foundry bootstrap failed", { err: e }); }
      }, 14000);

      // Session 77A — Professional Intelligence Platform (Expert Agents)
      setTimeout(async () => {
        try {
          const { bootstrapExpertsPlatform } = await import("./expertsPlatform/bootstrap.js");
          await bootstrapExpertsPlatform(logger);
        } catch (e) { logger.warn("experts platform bootstrap failed", { err: e }); }
      }, 14500);

      // Session 77B — Autonomous AI Media/Content Factory
      setTimeout(async () => {
        try {
          const { bootstrapMediaFactory } = await import("./mediaFactory/bootstrap.js");
          await bootstrapMediaFactory(logger);
        } catch (e) { logger.warn("media factory bootstrap failed", { err: e }); }
      }, 15000);

      // Session 77B — Social publishing worker (due-job processor).
      // Interval via PUBLISH_WORKER_INTERVAL_MS (default 5s); unref'ed so it
      // never keeps the process alive.
      setTimeout(async () => {
        try {
          const { startPublishWorker } = await import("./mediaFactory/publishing/publishJobs.js");
          startPublishWorker();
        } catch (e) { logger.warn("publish worker start failed", { err: e }); }
      }, 15250);

      // Session 78 — UX Intelligence, Design System & Experience
      setTimeout(async () => {
        try {
          const { bootstrapUxIntelligence } = await import("./uxIntelligence/bootstrap.js");
          await bootstrapUxIntelligence(logger);
        } catch (e) { logger.warn("ux intelligence bootstrap failed", { err: e }); }
      }, 15500);

      // Session 79 — WMPC Gift Card Payment Platform
      setTimeout(async () => {
        try {
          const { bootstrapGiftCards } = await import("./giftCards/bootstrap.js");
          await bootstrapGiftCards(logger);
        } catch (e) { logger.warn("gift cards bootstrap failed", { err: e }); }
      }, 16000);

      // Session 90 — Enterprise CRM (demo seed is gated behind WINDELS_DEMO_DATA)
      setTimeout(async () => {
        try {
          const { bootstrapCrm } = await import("./crm/bootstrap.js");
          await bootstrapCrm(logger);
        } catch (e) { logger.warn("crm bootstrap failed", { err: e }); }
      }, 20000);

      // Session 91 — Enterprise Email Intelligence (demo seed gated)
      setTimeout(async () => {
        try {
          const { bootstrapEmailIntel } = await import("./emailIntel/bootstrap.js");
          await bootstrapEmailIntel(logger);
        } catch (e) { logger.warn("email-intel bootstrap failed", { err: e }); }
      }, 21000);

      // Session 80 — Global Multi-Currency & Localization
      setTimeout(async () => {
        try {
          const { bootstrapGlobalCurrency } = await import("./globalCurrency/bootstrap.js");
          await bootstrapGlobalCurrency(logger);
          const { startFxRefreshJob } = await import("./globalCurrency/refreshRates.js");
          startFxRefreshJob(logger);
        } catch (e) { logger.warn("global currency bootstrap failed", { err: e }); }
      }, 16500);

      // Session 76 — Final Enterprise Integration & Validation (post all bootstraps)
      setTimeout(async () => {
        try {
          const { bootstrapV76Validation } = await import("./v76validation/bootstrap.js");
          await bootstrapV76Validation(logger);
        } catch (e) { logger.warn("v76 validation bootstrap failed", { err: e }); }
      }, 17000);

      // Session 42 — Universal Media Generation
      setTimeout(async () => {
        try {
          const { bootstrapMediaGen } = await import("./mediaGen/bootstrap.js");
          await bootstrapMediaGen(logger);
          // Periodic worker: pull pending jobs across all tenants every 2s.
          const { MediaGenService } = await import("./mediaGen/mediaGen.service.js");
          const { redisCmd } = await import("./db/redis.js");
          setInterval(async () => {
            try {
              const keys = await redisCmd.keys("mg:tenant:*:pending");
              for (const k of keys) {
                const org = k.split(":")[2];
                if (org) await MediaGenService.runWorkerTick(org);
              }
            } catch (err) {
              logger.warn("media-gen worker tick failed", { err });
            }
          }, 2000).unref();
        } catch (e) { logger.warn("media-gen bootstrap failed", { err: e }); }
      }, 17500);

      // Session 43 — Hybrid AI Execution & Model/Compute Management
      setTimeout(async () => {
        try {
          const { bootstrapHybridExec } = await import("./hybridExec/bootstrap.js");
          await bootstrapHybridExec(logger);
        } catch (e) { logger.warn("hybrid-exec bootstrap failed", { err: e }); }
      }, 18000);

      // Session 44 — Voice Ownership, Security & Governance
      setTimeout(async () => {
        try {
          const { bootstrapVoiceOwnership } = await import("./voiceOwnership/bootstrap.js");
          await bootstrapVoiceOwnership(logger);
        } catch (e) { logger.warn("voice-ownership bootstrap failed", { err: e }); }
      }, 18500);

      // Session 45 — Core Enterprise Integration Checkpoint
      setTimeout(async () => {
        try {
          const { bootstrapCoreIntegration } = await import("./coreIntegration/bootstrap.js");
          await bootstrapCoreIntegration(logger);
        } catch (e) { logger.warn("core-integration bootstrap failed", { err: e }); }
      }, 19000);

      // Session 46 — Enterprise AI Model Factory (V8.4 §1)
      setTimeout(async () => {
        try {
          const { bootstrapModelFactory } = await import("./modelFactory/bootstrap.js");
          await bootstrapModelFactory(logger);
        } catch (e) { logger.warn("model-factory bootstrap failed", { err: e }); }
      }, 19500);

      // Session 47 — Enterprise Memory Evolution Engine (V8.4 §2)
      setTimeout(async () => {
        try {
          const { bootstrapMemoryEvolution } = await import("./memoryEvolution/bootstrap.js");
          await bootstrapMemoryEvolution(logger);
        } catch (e) { logger.warn("memory-evolution bootstrap failed", { err: e }); }
      }, 20000);

      // Session 48 — AI Constitution Studio
      setTimeout(async () => {
        try {
          const { bootstrapConstitution } = await import("./constitution/bootstrap.js");
          await bootstrapConstitution({ logger });
        } catch (e) { logger.warn("constitution bootstrap failed", { err: e }); }
      }, 20500);

      // Session 49 — AI Capability Composer
      setTimeout(async () => {
        try {
          const { bootstrapComposer } = await import("./composer/bootstrap.js");
          await bootstrapComposer({ logger });
        } catch (e) { logger.warn("composer bootstrap failed", { err: e }); }
      }, 21000);

      // Session 50 — Enterprise AI Benchmark Center
      setTimeout(async () => {
        try {
          const { bootstrapBenchmarks } = await import("./benchmarks/bootstrap.js");
          await bootstrapBenchmarks({ logger });
        } catch (e) { logger.warn("benchmarks bootstrap failed", { err: e }); }
      }, 21500);

      // Session 51 — Disaster Recovery & AI Continuity
      setTimeout(async () => {
        try {
          const { bootstrapDisasterRecovery } = await import("./disasterRecovery/bootstrap.js");
          await bootstrapDisasterRecovery({ logger });
        } catch (e) { logger.warn("disaster-recovery bootstrap failed", { err: e }); }
      }, 22000);

      // Session 52 — AI Licensing & Monetization
      setTimeout(async () => {
        try {
          const { bootstrapLicensing } = await import("./licensing/bootstrap.js");
          await bootstrapLicensing({ logger });
        } catch (e) { logger.warn("licensing bootstrap failed", { err: e }); }
      }, 22500);

      // Session 53 — Enterprise Deployment Platform
      setTimeout(async () => {
        try {
          const { bootstrapDeployment } = await import("./deployment/bootstrap.js");
          await bootstrapDeployment({ logger });
        } catch (e) { logger.warn("deployment bootstrap failed", { err: e }); }
      }, 23000);

      // Seed new modules for the SUPER_ADMIN's organization too if it differs from "org-windels"
      const runNewBootstraps = async (oid: string, uid: string) => {
        const { bootstrapUpdates } = await import("./updates/bootstrap.js");
        const { bootstrapUsage } = await import("./usage/bootstrap.js");
        const { bootstrapFabric } = await import("./fabric/bootstrap.js");
        const { bootstrapRobotics } = await import("./robotics/bootstrap.js");
        const { bootstrapSpatial } = await import("./spatial/bootstrap.js");
        const { bootstrapSdk } = await import("./sdk/bootstrap.js");
        const { bootstrapTraining } = await import("./training/bootstrap.js");
        const { bootstrapDataMarketplace } = await import("./dataMarketplace/bootstrap.js");
        const { bootstrapDigitalHumans } = await import("./digitalHumans/bootstrap.js");
        const { bootstrapQuantum } = await import("./quantum/bootstrap.js");
        const { bootstrapSustainability } = await import("./sustainability/bootstrap.js");
        const { bootstrapBiomedical } = await import("./biomedical/bootstrap.js");
        const { bootstrapLegal } = await import("./legal/bootstrap.js");
        const { bootstrapEducation } = await import("./education/bootstrap.js");
        const { bootstrapScientific } = await import("./scientific/bootstrap.js");
        const { bootstrapCognitive } = await import("./cognitive/bootstrap.js");
        const { bootstrapCommand } = await import("./command/bootstrap.js");
        const { bootstrapAiEconomy } = await import("./aiEconomy/bootstrap.js");
        const { bootstrapAutonomous } = await import("./autonomous/bootstrap.js");
        const { bootstrapCyber } = await import("./cyber/bootstrap.js");
        const { bootstrapOpex } = await import("./opex/bootstrap.js");
        const { bootstrapIndustry } = await import("./industry/bootstrap.js");
        const { bootstrapHealthEcosystem } = await import("./healthEcosystem/bootstrap.js");
        const { bootstrapPromptTemplates } = await import("./promptTemplates/bootstrap.js");
        await bootstrapUpdates({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapUsage({ logger, defaultOrgId: oid });
        await bootstrapFabric({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapRobotics({ logger, defaultOrgId: oid });
        await bootstrapSpatial({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapSdk({ logger, defaultOrgId: oid });
        await bootstrapTraining({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapDataMarketplace({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapDigitalHumans({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapQuantum({ logger, defaultOrgId: oid });
        await bootstrapSustainability({ logger, defaultOrgId: oid });
        await bootstrapBiomedical({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapLegal({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapEducation({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapScientific({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapCognitive({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapCommand({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapAiEconomy({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapAutonomous({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapCyber({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapOpex({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapIndustry({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapHealthEcosystem({ logger, defaultOrgId: oid, defaultUserId: uid });
        await bootstrapPromptTemplates({ logger, defaultOrgId: oid, defaultUserId: uid });
      };

      // Session 54 — Update & Lifecycle Management
      setTimeout(async () => {
        try {
          await runNewBootstraps("org-windels", "user-admin");
          // Also seed for the actual super_admin org if the user exists
          try {
            const { prisma: pc } = await import("./db/client.js");
            const admin = await pc.user.findFirst({ where: { email: "admin@windels.ai" } }) as any;
            if (admin && admin.organizationId && admin.organizationId !== "org-windels") {
              await runNewBootstraps(admin.organizationId, admin.id);
            }
            await pc.$disconnect();
          } catch (inner) { logger?.warn?.("dynamic org bootstrap skipped", { err: inner instanceof Error ? inner.message : inner }); }
        } catch (e) { logger.warn("new-module bootstrap failed", { err: e }); }
      }, 23500);
    } catch (e) { logger.warn("enterprise framework bootstrap failed", { err: e }); }

    // Start background agent runtime (task processing loop).
    agentRuntime.start();
    // Start scheduled workflow ticker (runs every 30s).
    workflowTicker = setInterval(() => {
      workflowService.tickScheduledTriggers().catch((e) => logger.warn("workflow tick failed", { err: e }));
    }, 30_000);
    // Start retention application hourly.
    retentionTicker = setInterval(() => {
      applyRetention().catch((e) => logger.warn("retention apply failed", { err: e }));
    }, 60 * 60_000);
    // Start conversation auto-summarization every 15 minutes.
    summarizationTicker = setInterval(() => {
      autoSummarizeConversations(10, 40).catch((e) => logger.warn("auto-summarization failed", { err: e }));
    }, 15 * 60_000);
    // Start alert engine (subscribes to EventBus).
    startAlertEngine();
  });

  const shutdown = async (signal: string) => {
    logger.info("shutting down gracefully", { signal });
    agentRuntime.stop();
    if (workflowTicker) clearInterval(workflowTicker);
    if (retentionTicker) clearInterval(retentionTicker);
    if (summarizationTicker) clearInterval(summarizationTicker);

    // Stop accepting new connections and drain in-flight requests
    const closePromise = new Promise<void>((resolve) => server.close(() => resolve()));

    // Force-close after 30 seconds if requests haven't drained
    const forceCloseTimer = setTimeout(() => {
      logger.warn("graceful shutdown timeout — force closing", { signal });
      server.closeAllConnections?.();
    }, 30_000);
    forceCloseTimer.unref?.();

    try {
      await closePromise;
      logger.info("HTTP server closed cleanly");
    } catch (e) {
      logger.warn("HTTP server close error", { err: e });
    }
    clearTimeout(forceCloseTimer);

    // Disconnect database and Redis
    await prisma.$disconnect().catch((e) => logger.warn("prisma disconnect failed", { err: e }));
    try {
      redis.disconnect(false);
    } catch (e) {
      logger.warn("redis disconnect failed", { err: e });
    }

    logger.info("shutdown complete");
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  logger.fatal("fatal startup error", { err: e });
  process.exit(1);
});
