/**
 * Session 70 / 111 — Global Command Center dashboard.
 *
 * Session 70 computed the executive counters from the real `Agent`,
 * `Workflow`, `Task`, `Conversation`, `AiRequest` and `Alert` tables, but left
 * `regions`, `incidents`, `briefings` and `strategicInitiatives` as permanently
 * empty arrays and `mttrMinutes` as a hardcoded `0` — the comment in the file
 * said the paired timestamps were simply not recorded anywhere.
 *
 * Session 111 records them. `CommandOperationsService` owns the organization's
 * incident, region, briefing, initiative and directive registers, and this
 * dashboard now projects those real records into the Session 70 shape:
 *
 *   - `mttrMinutes` is the mean measured minutes between an incident's stored
 *     `openedAt` and the `resolvedAt` a named human wrote. When nothing has
 *     been resolved it is `0` *and* `operations.mttrKind` is `"none"`, so a
 *     consumer can tell "no sample" apart from "instant recovery".
 *   - the incident counters sum two real sources: the platform `Alert` table
 *     (Session 70) and the command-centre incident register (Session 111).
 *     `CommandOperationsService.operations()` exposes the register's half on
 *     its own for anyone who needs the split.
 *   - `regions`, `incidents`, `briefings` and `strategicInitiatives` are the
 *     stored records, and stay empty for an organization that recorded none.
 */
import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import type { CmdOperationsRollup, GlobalCommandDashboard } from "@windels/shared";
import { CommandOperationsService } from "./operations.service.js";
const K = { meta: (oid: string) => `cmd:${oid}:meta` };

export const CommandService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels") {
    if (!(await redis.exists(K.meta(oid)))) { await redis.set(K.meta(oid), "1"); logger?.info({ msg: "[command] operations dashboard initialized", organizationId: oid }); }
    await CommandOperationsService.ensureBootstrapped(logger, oid);
  },

  /** Deterministic operations rollup over the Session 111 register. */
  async operations(oid: string): Promise<CmdOperationsRollup> {
    return CommandOperationsService.operations(oid);
  },

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

    // Session 111 register — real records, empty for an organization with none.
    const [ops, incidents, briefings, initiatives] = await Promise.all([
      CommandOperationsService.operations(oid),
      CommandOperationsService.listIncidents(oid, { limit: 200 }),
      CommandOperationsService.listBriefings(oid, { limit: 50 }),
      CommandOperationsService.listInitiatives(oid, { limit: 50 }),
    ]);
    const sinceIso = since.toISOString();
    const registerResolved30d = incidents.filter((incident) =>
      incident.status === "resolved" && (incident.resolvedAt ?? "") >= sinceIso).length;

    const incidentsOpen = openAlerts + ops.openIncidents;
    const incidentsCritical = criticalAlerts + ops.unresolvedBySeverity.critical;

    // Health blends task completion with open incidents and workflow failures,
    // so an org drowning in alerts cannot report 100%.
    const taskHealth = tasks ? Math.max(0, Math.round((1 - openTasks / tasks) * 100)) : 100;
    const penalty = Math.min(50, incidentsCritical * 10 + Math.min(20, incidentsOpen * 2) + Math.min(20, failedRuns * 5));
    const health = Math.max(0, taskHealth - penalty);

    return { enterpriseHealth: health, globalRevenueMtd: 0, activeUsersGlobal: users,
      incidentsOpen, incidentsCritical, incidentsResolved30d: resolvedAlerts30d + registerResolved30d,
      // Measured from the incident register's paired open/resolve timestamps.
      // `operations.mttrKind === "none"` marks a 0 that has no sample behind it.
      mttrMinutes: ops.meanTimeToResolveMinutes ?? 0,
      workforceProductivity: tasks ? Math.round(((tasks - openTasks) / tasks) * 100) : 0,
      aiDecisions24h, humanOverrides24h: 0, kpis: [
      { label: "Members", value: String(users), delta: 0, tone: "azure" }, { label: "AI employees", value: String(agents), delta: 0, tone: "violet" }, { label: "Active workflows", value: String(activeRuns), delta: 0, tone: "emerald" }, { label: "Open tasks", value: String(openTasks), delta: 0, tone: "amber" }, { label: "Conversations", value: String(conversations), delta: 0, tone: "teal" },
      { label: "Open incidents", value: String(incidentsOpen), delta: 0, tone: incidentsOpen ? "crimson" : "emerald" },
      { label: "AI requests (24h)", value: String(aiDecisions24h), delta: 0, tone: "fuchsia" },
      { label: "Regions declared", value: String(ops.regionCount), delta: 0, tone: "azure" },
      { label: "Open directives", value: String(ops.issuedDirectives), delta: 0, tone: ops.issuedDirectives ? "amber" : "emerald" },
      { label: "Workflows", value: String(workflows), delta: 0, tone: "teal" },
    ],
      regions: ops.regions.map((region) => ({
        region: region.code,
        health: region.health,
        servicesUp: region.servicesUp,
        servicesTotal: region.servicesTotal,
        latencyMs: region.latencyMs,
        activeUsers: region.activeUsers,
      })),
      incidents: incidents.map((incident) => ({
        id: incident.id,
        severity: incident.severity,
        title: incident.title,
        region: incident.regionCode ?? "global",
        service: incident.service,
        status: incident.status,
        ...(incident.owner ? { owner: incident.owner } : {}),
        openedAt: incident.openedAt,
        ...(incident.resolvedAt ? { resolvedAt: incident.resolvedAt } : {}),
      })),
      briefings: briefings.map((briefing) => ({
        id: briefing.id,
        title: briefing.title,
        // AI-assisted briefings stay labelled in the legacy shape too.
        summary: briefing.aiAssisted ? `[AI-assisted — advisory] ${briefing.summary}` : briefing.summary,
        priority: briefing.priority,
        category: briefing.category,
        generatedAt: briefing.createdAt,
      })),
      strategicInitiatives: initiatives.map((initiative) => ({
        id: initiative.id,
        name: initiative.name,
        progress: initiative.progressPct,
        owner: initiative.owner,
        due: initiative.dueAt,
      })),
    } satisfies GlobalCommandDashboard;
  },
};
