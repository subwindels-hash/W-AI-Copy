import { prisma } from "../db/client.js";
import type { UsageDashboard } from "@windels/shared";

export const UsageService = {
  async ensureBootstrapped(_logger?: any, _oid = "org-windels") {},
  async dashboard(oid = "org-windels"): Promise<UsageDashboard> {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [conversations, messages, workflowRuns, agents, members, tasks] = await Promise.all([
      prisma.conversation.count({ where: { organizationId: oid, createdAt: { gte: since }, deletedAt: null } }),
      prisma.talkMessage.count({ where: { channel: { organizationId: oid }, createdAt: { gte: since }, deletedAt: null } }),
      prisma.workflowRun.count({ where: { workflow: { organizationId: oid }, createdAt: { gte: since } } }),
      prisma.agent.count({ where: { organizationId: oid } }), prisma.membership.count({ where: { organizationId: oid } }),
      prisma.task.count({ where: { organizationId: oid, createdAt: { gte: since } } }),
    ]);
    const totalRequests30d = messages + workflowRuns + conversations;
    return { metrics: [
      { label: "Conversations (30d)", value: conversations, unit: "", deltaPct: 0, trend: "flat" }, { label: "Messages (30d)", value: messages, unit: "", deltaPct: 0, trend: "flat" },
      { label: "Workflow runs (30d)", value: workflowRuns, unit: "", deltaPct: 0, trend: "flat" }, { label: "Tasks (30d)", value: tasks, unit: "", deltaPct: 0, trend: "flat" },
      { label: "AI employees", value: agents, unit: "", deltaPct: 0, trend: "flat" }, { label: "Members", value: members, unit: "", deltaPct: 0, trend: "flat" },
    ], departments: [], modules: [], series: [], resources: { cpuPct: 0, memPct: 0, gpuPct: 0, storageGb: 0, storageQuotaGb: 0, networkMbps: 0, carbonKgCO2e: 0, costPerDayUsd: 0 }, totalRequests30d, totalCost30dUsd: 0, totalSavings30dUsd: 0, automationRate: 0, productivityGainHours30d: 0, roiPct: 0, adoptionPct: members ? 1 : 0, carbonKgCO2e30d: 0 } as UsageDashboard;
  },
};
