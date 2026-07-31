import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import type { GlobalCommandDashboard } from "@windels/shared";
const K = { meta: (oid: string) => `cmd:${oid}:meta` };

export const CommandService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels") { if (!(await redis.exists(K.meta(oid)))) { await redis.set(K.meta(oid), "1"); logger?.info({ msg: "[command] operations dashboard initialized", organizationId: oid }); } },
  async dashboard(oid: string): Promise<GlobalCommandDashboard> {
    await this.ensureBootstrapped(undefined, oid);
    const [agents, workflows, activeRuns, tasks, openTasks, conversations, users] = await Promise.all([
      prisma.agent.count({ where: { organizationId: oid } }), prisma.workflow.count({ where: { organizationId: oid } }), prisma.workflowRun.count({ where: { workflow: { organizationId: oid }, status: "RUNNING" } }),
      prisma.task.count({ where: { organizationId: oid } }), prisma.task.count({ where: { organizationId: oid, status: { in: ["TODO", "IN_PROGRESS"] } } }),
      prisma.conversation.count({ where: { organizationId: oid, deletedAt: null } }), prisma.membership.count({ where: { organizationId: oid } }),
    ]);
    const health = tasks ? Math.max(0, Math.round((1 - openTasks / tasks) * 100)) : 100;
    return { enterpriseHealth: health, globalRevenueMtd: 0, activeUsersGlobal: users, incidentsOpen: 0, incidentsCritical: 0, incidentsResolved30d: 0, mttrMinutes: 0, workforceProductivity: 0, aiDecisions24h: 0, humanOverrides24h: 0, kpis: [
      { label: "Members", value: String(users), delta: 0, tone: "azure" }, { label: "AI employees", value: String(agents), delta: 0, tone: "violet" }, { label: "Active workflows", value: String(activeRuns), delta: 0, tone: "emerald" }, { label: "Open tasks", value: String(openTasks), delta: 0, tone: "amber" }, { label: "Conversations", value: String(conversations), delta: 0, tone: "teal" },
    ], regions: [], incidents: [], briefings: [], strategicInitiatives: [] } as GlobalCommandDashboard;
  },
};
