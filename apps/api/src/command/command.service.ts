import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import type { GlobalCommandDashboard } from "@windels/shared";
const K = { meta: (oid: string) => `cmd:${oid}:meta` };

export const CommandService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels") { if (!(await redis.exists(K.meta(oid)))) { await redis.set(K.meta(oid), "1"); logger?.info({ msg: "[command] operations dashboard initialized", organizationId: oid }); } },
  async dashboard(oid: string): Promise<GlobalCommandDashboard> {
    await this.ensureBootstrapped(undefined, oid);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const day = new Date(Date.now() - 86_400_000);
    const [agents, workflows, activeRuns, tasks, openTasks, conversations, users,
           openAlerts, criticalAlerts, resolvedAlerts30d, aiDecisions24h, failedRuns] = await Promise.all([
      prisma.agent.count({ where: { organizationId: oid } }), prisma.workflow.count({ where: { organizationId: oid } }), prisma.workflowRun.count({ where: { workflow: { organizationId: oid }, status: "RUNNING" } }),
      prisma.task.count({ where: { organizationId: oid } }), prisma.task.count({ where: { organizationId: oid, status: { in: ["TODO", "IN_PROGRESS"] } } }),
      prisma.conversation.count({ where: { organizationId: oid, deletedAt: null } }), prisma.membership.count({ where: { organizationId: oid } }),
      prisma.alert.count({ where: { organizationId: oid, dismissedAt: null } }).catch(() => 0),
      prisma.alert.count({ where: { organizationId: oid, dismissedAt: null, severity: "CRITICAL" } }).catch(() => 0),
      prisma.alert.count({ where: { organizationId: oid, dismissedAt: { gte: since } } }).catch(() => 0),
      prisma.aiRequest.count({ where: { organizationId: oid, createdAt: { gte: day } } }).catch(() => 0),
      prisma.workflowRun.count({ where: { workflow: { organizationId: oid }, status: "FAILED", createdAt: { gte: since } } }),
    ]);
    // Health blends task completion with open incidents and workflow failures,
    // so an org drowning in alerts cannot report 100%.
    const taskHealth = tasks ? Math.max(0, Math.round((1 - openTasks / tasks) * 100)) : 100;
    const penalty = Math.min(50, criticalAlerts * 10 + Math.min(20, openAlerts * 2) + Math.min(20, failedRuns * 5));
    const health = Math.max(0, taskHealth - penalty);
    return { enterpriseHealth: health, globalRevenueMtd: 0, activeUsersGlobal: users,
      incidentsOpen: openAlerts, incidentsCritical: criticalAlerts, incidentsResolved30d: resolvedAlerts30d,
      // MTTR needs paired open/close timestamps we do not record; left at 0.
      mttrMinutes: 0,
      workforceProductivity: tasks ? Math.round(((tasks - openTasks) / tasks) * 100) : 0,
      aiDecisions24h, humanOverrides24h: 0, kpis: [
      { label: "Members", value: String(users), delta: 0, tone: "azure" }, { label: "AI employees", value: String(agents), delta: 0, tone: "violet" }, { label: "Active workflows", value: String(activeRuns), delta: 0, tone: "emerald" }, { label: "Open tasks", value: String(openTasks), delta: 0, tone: "amber" }, { label: "Conversations", value: String(conversations), delta: 0, tone: "teal" },
      { label: "Open incidents", value: String(openAlerts), delta: 0, tone: openAlerts ? "crimson" : "emerald" },
      { label: "AI requests (24h)", value: String(aiDecisions24h), delta: 0, tone: "fuchsia" },
    ], regions: [], incidents: [], briefings: [], strategicInitiatives: [] } as GlobalCommandDashboard;
  },
};
