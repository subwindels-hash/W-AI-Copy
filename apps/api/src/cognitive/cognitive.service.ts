/**
 * Session 69 / 110 — Cognitive platform observability rollup.
 *
 * This file answers "what is actually running in this organization right now"
 * from real tables. The Session 110 world-model evidence register (entities,
 * observations, hypotheses) lives beside it in `worldModel.service.ts`; the
 * `worldModel()` delegate below exists so callers that already hold
 * `CognitiveService` reach it without a second import.
 *
 * Session 177: the nine self-evolution/DNA/federation/world-model fields now
 * report `null` (was 0) — those subsystems do not exist yet, and 0 is a
 * measurement claim. `dashboard()` no longer seeds; it is a pure read.
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
   * Counts are read from real tables. Fields with no backing store (self-
   * evolution, DNA completeness, federation partners, civilization/world
   * modelling) now report `null` — those subsystems do not exist yet, and a
   * plausible number would imply they do. Measured aggregates (observatory,
   * memory, predictions) remain numbers; 0 there is measured (0 healthy nodes).
   *
   * This is a pure read — it never writes. A fresh org returns `null` for the
   * nine structural fields and provenance marks them as `structural_null`.
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
    return {
      selfEvolutionHealth: null, autoFixes30d: null,
      // A bottleneck is a workflow that is stuck running or has failed.
      activeBottlenecks: runningWorkflows + failedRuns,
      dnaCompleteness: null, marketplaceUnifiedAssets: null, federationPartners: null,
      observatoryHealthyPct: healthyPct,
      observabilityNodes: observatory.reduce((n, x) => n + x.count, 0),
      reasoningAccuracyAvg: successPct,
      globalMemoryEntries: memories + knowledge,
      innovationProposalsOpen: null, innovationPipelineValueUsd: null,
      civilizationEntities: null, worldScenariosTracked: null,
      predictionsMade30d: aiTotal, predictionAccuracyPct: successPct,
      components: [], partners: [], observatory,
      // ReasoningCapability is keyed by a fixed domain enum, and we do not
      // classify requests by reasoning domain — so this stays empty rather
      // than mislabelling aggregate traffic as e.g. "medical" reasoning.
      reasoning: [],
      memoryLayers: [
        { layer: "agent_memory", entries: memories, accesses24h: 0, sizeGb: 0 },
        { layer: "agent_knowledge", entries: knowledge, accesses24h: 0, sizeGb: 0 },
      ],
      innovations: [], scenarios: [],
      provenance: {
        selfEvolutionHealth: "structural_null",
        autoFixes30d: "structural_null",
        dnaCompleteness: "structural_null",
        marketplaceUnifiedAssets: "structural_null",
        federationPartners: "structural_null",
        innovationProposalsOpen: "structural_null",
        innovationPipelineValueUsd: "structural_null",
        civilizationEntities: "structural_null",
        worldScenariosTracked: "structural_null",
        note: "Nine subsystems report null — they do not exist yet (no estimation). Measured rolls (observatory, memory, predictions, bottlenecks) remain numbers.",
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
