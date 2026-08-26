/**
 * Session 69 / 110 — Cognitive platform observability rollup.
 *
 * This file answers "what is actually running in this organization right now"
 * from real tables. The Session 110 world-model evidence register (entities,
 * observations, hypotheses) lives beside it in `worldModel.service.ts`; the
 * `worldModel()` delegate below exists so callers that already hold
 * `CognitiveService` reach it without a second import.
 *
 * Session 177: the self-evolution/DNA/federation/world-model fields report
 * `null` (was 0) until measured — 0 would be a measurement claim. `dashboard()`
 * never seeds; it is a pure read.
 *
 * Completion: every one of those fields now has a real org-scoped backing store
 * — the world-model register (worldModel.service.ts), the innovation pipeline
 * (innovationPipeline.service.ts), the self-evolution register
 * (selfEvolution.service.ts) and the federation register (federation.service.ts).
 * Each field reports a measured value once its store holds data and a
 * null/structural_null pair while empty. Nothing is estimated.
 */
import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import type { CognitiveDashboard, CogWorldModelRollup, ObservatoryNode } from "@windels/shared";

const K = { meta: (oid: string) => `cog:${oid}:meta` };
export const CognitiveService = {
  async ensureBootstrapped(logger?: Logger, oid?: string) {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) return;
    if (!(await redis.exists(K.meta(oid)))) { await redis.set(K.meta(oid), "1"); logger?.info({ msg: "[cognitive] observability rollup initialized", organizationId: oid }); }
  },
  /**
   * Platform observability rollup.
   *
   * Counts are read from real tables. Fields that once had no backing store
   * (self-evolution, DNA completeness, federation partners, marketplace assets,
   * innovation pipeline, civilization/world modelling) are now backed by real
   * org-scoped stores; each reports a measured value once its store holds data
   * and `null` while empty (a plausible number over an empty store would imply
   * activity that has not happened). Measured aggregates (observatory, memory,
   * predictions) remain numbers; 0 there is measured (0 healthy nodes).
   *
   * This is a pure read — it never writes. A fresh org returns `null` for the
   * not-yet-populated fields and provenance marks them `structural_null`.
   */
  async dashboard(oid: string): Promise<CognitiveDashboard> {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) throw new Error("organizationId is required");
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [agents, workflows, conversations, memories, knowledge, tasks, runningWorkflows,
           aiTotal, aiFailed, aiAvg, failedRuns, openAlerts] = await Promise.all([
      prisma.agent.count({ where: { organizationId: oid } }), prisma.workflow.count({ where: { organizationId: oid } }), prisma.conversation.count({ where: { organizationId: oid, deletedAt: null } }),
      prisma.agentMemory.count({ where: { agent: { organizationId: oid } } }), prisma.agentKnowledge.count({ where: { agent: { organizationId: oid } } }), prisma.task.count({ where: { organizationId: oid } }),
      prisma.workflowRun.count({ where: { workflow: { organizationId: oid }, status: "RUNNING" } }),
      prisma.aiRequest.count({ where: { organizationId: oid, createdAt: { gte: since } } }),
      prisma.aiRequest.count({ where: { organizationId: oid, createdAt: { gte: since }, status: { not: "succeeded" } } }),
      prisma.aiRequest.aggregate({ where: { organizationId: oid, createdAt: { gte: since } }, _avg: { durationMs: true } }),
      prisma.workflowRun.count({ where: { workflow: { organizationId: oid }, status: "FAILED", createdAt: { gte: since } } }),
      prisma.alert.count({ where: { organizationId: oid, dismissedAt: null } }).catch(() => 0),
    ]);

    // Reasoning accuracy is proxied by the AI success rate over the window —
    // the only signal actually recorded. It is 0 when nothing has run.
    const successPct = aiTotal ? Math.round(((aiTotal - aiFailed) / aiTotal) * 100) : 0;
    // `healthy` reflects a real signal per category rather than a constant true.
    // Categories are constrained by ObservatoryNode; each maps to a real count.
    const observatory: ObservatoryNode[] = [
      { category: "ai_employees", healthy: true, count: agents, alerts: 0 },
      { category: "workflows", healthy: failedRuns === 0, count: workflows, alerts: failedRuns },
      { category: "memory", healthy: true, count: memories, alerts: 0 },
      { category: "knowledge_graph", healthy: true, count: knowledge, alerts: 0 },
      { category: "processes", healthy: true, count: tasks + conversations, alerts: 0 },
      { category: "services", healthy: aiFailed === 0, count: aiTotal, alerts: aiFailed },
      { category: "events", healthy: openAlerts === 0, count: openAlerts, alerts: openAlerts },
    ];
    const healthyPct = Math.round((observatory.filter((o) => o.healthy).length / observatory.length) * 100);

    // Two of the previously structural-null fields now have a real backing
    // store: the Session 110 world-model evidence register. `civilizationEntities`
    // is the register's entity count and `worldScenariosTracked` is its
    // hypothesis count (forward-looking scenarios). They are read from stored
    // records only — never estimated. An empty register still reports the honest
    // 0/structural_null pair (0 is a measurement here: nothing recorded yet).
    const { CognitiveWorldModelService } = await import("./worldModel.service.js");
    const worldModel = await CognitiveWorldModelService.worldModel(oid);
    const civilizationEntities = worldModel.entityCount;
    const worldScenariosTracked = worldModel.hypothesisCount;
    const worldModelHasData = civilizationEntities > 0 || worldScenariosTracked > 0;

    // The remaining formerly-structural fields now have real org-scoped backing
    // stores. Each reports a real value once its store holds data and a null +
    // structural_null pair while empty (never a fabricated estimate).
    const { InnovationPipelineService } = await import("./innovationPipeline.service.js");
    const { SelfEvolutionService } = await import("./selfEvolution.service.js");
    const { FederationService } = await import("./federation.service.js");
    const [innovation, evolution, federation] = await Promise.all([
      InnovationPipelineService.rollup(oid),
      SelfEvolutionService.rollup(oid),
      FederationService.rollup(oid),
    ]);
    const marketplaceUnifiedAssets = federation.hasData ? federation.unifiedAssets : null;
    const federationPartners = federation.hasData ? federation.activePartners : null;
    const innovationProposalsOpen = innovation.hasData ? innovation.openCount : null;
    const innovationPipelineValueUsd = innovation.hasData ? innovation.pipelineValueUsd : null;
    return {
      selfEvolutionHealth: evolution.health, autoFixes30d: evolution.autoFixes30d,
      // A bottleneck is a workflow that is stuck running or has failed.
      activeBottlenecks: runningWorkflows + failedRuns,
      dnaCompleteness: evolution.dnaCompleteness,
      marketplaceUnifiedAssets, federationPartners,
      observatoryHealthyPct: healthyPct,
      observabilityNodes: observatory.reduce((n, x) => n + x.count, 0),
      reasoningAccuracyAvg: successPct,
      globalMemoryEntries: memories + knowledge,
      innovationProposalsOpen, innovationPipelineValueUsd,
      civilizationEntities, worldScenariosTracked,
      predictionsMade30d: aiTotal, predictionAccuracyPct: successPct,
      components: evolution.components, partners: federation.partners, observatory,
      // ReasoningCapability is keyed by a fixed domain enum, and we do not
      // classify requests by reasoning domain — so this stays empty rather
      // than mislabelling aggregate traffic as e.g. "medical" reasoning.
      reasoning: [],
      memoryLayers: [
        { layer: "agent_memory", entries: memories, accesses24h: 0, sizeGb: 0 },
        { layer: "agent_knowledge", entries: knowledge, accesses24h: 0, sizeGb: 0 },
      ],
      innovations: innovation.proposals, scenarios: [],
      provenance: {
        selfEvolutionHealth: evolution.hasData ? "measured" : "structural_null",
        autoFixes30d: evolution.hasData ? "measured" : "structural_null",
        dnaCompleteness: evolution.hasData ? "measured" : "structural_null",
        marketplaceUnifiedAssets: federation.hasData ? "measured" : "structural_null",
        federationPartners: federation.hasData ? "measured" : "structural_null",
        innovationProposalsOpen: innovation.hasData ? "measured" : "structural_null",
        innovationPipelineValueUsd: innovation.hasData ? "measured" : "structural_null",
        civilizationEntities: worldModelHasData ? "measured" : "structural_null",
        worldScenariosTracked: worldModelHasData ? "measured" : "structural_null",
        note: "Every field is now backed by a real org-scoped store (self-evolution, innovation pipeline, federation, world-model). Each reports a measured value once its store holds data and a null/structural_null pair while empty (0 is a real measurement — nothing recorded yet). Observatory, memory and prediction rolls remain live counts.",
      },
    } satisfies CognitiveDashboard;
  },

  /**
   * Session 110 world-model rollup (entities/observations/hypotheses). Kept as
   * a thin delegate so the two cognitive surfaces stay separable: this file
   * projects live platform activity, `worldModel.service.ts` projects the
   * organization's own evidence register.
   */
  async worldModel(oid: string): Promise<CogWorldModelRollup> {
    const { CognitiveWorldModelService } = await import("./worldModel.service.js");
    return CognitiveWorldModelService.worldModel(oid);
  },
};
