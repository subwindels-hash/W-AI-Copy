import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import type { CognitiveDashboard } from "@windels/shared";

const K = { meta: (oid: string) => `cog:${oid}:meta` };
export const CognitiveService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels") { if (!(await redis.exists(K.meta(oid)))) { await redis.set(K.meta(oid), "1"); logger?.info({ msg: "[cognitive] observability rollup initialized", organizationId: oid }); } },
  async dashboard(oid: string): Promise<CognitiveDashboard> {
    await this.ensureBootstrapped(undefined, oid);
    const [agents, workflows, conversations, memories, knowledge, tasks, runningWorkflows] = await Promise.all([
      prisma.agent.count({ where: { organizationId: oid } }), prisma.workflow.count({ where: { organizationId: oid } }), prisma.conversation.count({ where: { organizationId: oid, deletedAt: null } }),
      prisma.agentMemory.count({ where: { agent: { organizationId: oid } } }), prisma.agentKnowledge.count({ where: { agent: { organizationId: oid } } }), prisma.task.count({ where: { organizationId: oid } }),
      prisma.workflowRun.count({ where: { workflow: { organizationId: oid }, status: "RUNNING" } }),
    ]);
    const observatory = [
      { category: "ai_employees", healthy: true, count: agents, alerts: 0 }, { category: "workflows", healthy: true, count: workflows, alerts: runningWorkflows },
      { category: "conversations", healthy: true, count: conversations, alerts: 0 }, { category: "memory", healthy: true, count: memories + knowledge, alerts: 0 }, { category: "tasks", healthy: true, count: tasks, alerts: 0 },
    ];
    return { selfEvolutionHealth: 0, autoFixes30d: 0, activeBottlenecks: runningWorkflows, dnaCompleteness: 0, marketplaceUnifiedAssets: 0, federationPartners: 0, observatoryHealthyPct: 100, observabilityNodes: observatory.reduce((n, x) => n + x.count, 0), reasoningAccuracyAvg: 0, globalMemoryEntries: memories + knowledge, innovationProposalsOpen: 0, innovationPipelineValueUsd: 0, civilizationEntities: 0, worldScenariosTracked: 0, predictionsMade30d: 0, predictionAccuracyPct: 0, components: [], partners: [], observatory, reasoning: [], memoryLayers: [{ layer: "organizational", entries: memories + knowledge, accesses24h: 0, sizeGb: 0 }], innovations: [], scenarios: [] } as CognitiveDashboard;
  },
};
