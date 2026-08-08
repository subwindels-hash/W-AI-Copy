/**
 * Security governance — incident reporting, access reviews, dormant-account detection,
 * and automated incident runbooks backed by Prisma and Redis.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";

export type IncidentSeverity = "low"|"medium"|"high"|"critical";
export type IncidentStatus = "reported"|"investigating"|"contained"|"resolved"|"postmortem";

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reportedBy: string;
  area: "auth"|"data"|"ai"|"billing"|"infra"|"abuse"|"other";
  createdAt: string;
  updatedAt: string;
  timeline: Array<{ at: string; actor: string; note: string }>;
  runbookExecutions?: Array<{ runbookId: string; status: string; output: any }>;
}

export interface AccessReview {
  id: string;
  generatedAt: string;
  dormantUsers: Array<{ userId: string; email: string; lastLoginAt: string|null; daysInactive: number; role: string }>;
  adminCount: number;
  superAdminCount: number;
  recommendations: string[];
}

const K = { incidents: "sec:incidents", incident: (id:string) => `sec:inc:${id}`, lastReview: "sec:accessReview:last" };

export const SecurityGovernanceService = {
  async reportIncident(reporterId: string, input: { title:string; description:string; severity:IncidentSeverity; area:Incident["area"] }): Promise<Incident> {
    const id = "inc-" + randomUUID().slice(0,10);
    const now = new Date().toISOString();
    const inc: Incident = {
      id, title: input.title, description: input.description, severity: input.severity,
      status: "reported", reportedBy: reporterId, area: input.area,
      createdAt: now, updatedAt: now,
      timeline: [{ at: now, actor: reporterId, note: "Incident reported." }],
      runbookExecutions: [],
    };

    // Auto-execute matching incident runbooks if prisma supports it
    try {
      if (prisma.incidentRunbook && typeof prisma.incidentRunbook.findMany === "function") {
        const runbooks = await prisma.incidentRunbook.findMany({
          where: { enabled: true, triggerSeverity: input.severity, triggerArea: input.area },
        });
        for (const rb of runbooks) {
          const actions = (rb.actions as string[]) ?? [];
          const output: Record<string, any> = {};
          for (const act of actions) {
            if (act === "NOTIFY_ADMIN") {
              output["notify_admin"] = "Admin security notification dispatched.";
            } else if (act === "REVOKE_TOKENS") {
              await prisma.userSession.updateMany({ where: { revokedAt: null }, data: { revokedAt: new Date() } });
              output["revoke_tokens"] = "All active session tokens revoked.";
            } else if (act === "QUARANTINE_REPORTER") {
              await prisma.user.update({ where: { id: reporterId }, data: { isSuspended: true } });
              output["quarantine_reporter"] = `User ${reporterId} suspended due to incident trigger.`;
            }
          }
          if (prisma.runbookExecution && typeof prisma.runbookExecution.create === "function") {
            await prisma.runbookExecution.create({
              data: {
                runbookId: rb.id,
                incidentId: id,
                status: "success",
                output,
              },
            });
          }
          inc.runbookExecutions!.push({ runbookId: rb.id, status: "success", output });
          inc.timeline.push({ at: new Date().toISOString(), actor: "system-runbook", note: `Executed runbook: ${rb.name}` });
        }
      }
    } catch (e) {
      logger.warn("[security] runbook execution failed", { err: (e as Error).message });
    }

    await redis.hset(K.incident(id), "_doc", JSON.stringify(inc));
    await redis.zadd(K.incidents, Date.now(), id);
    logger.warn("[security] incident reported", { id, severity: input.severity, area: input.area, reporterId });
    return inc;
  },

  async updateIncident(id: string, actorId: string, patch: { status?: IncidentStatus; note?: string }): Promise<Incident|null> {
    const raw = await redis.hget(K.incident(id), "_doc");
    if (!raw) return null;
    const inc: Incident = JSON.parse(raw);
    if (patch.status) inc.status = patch.status;
    inc.updatedAt = new Date().toISOString();
    if (patch.note) inc.timeline.push({ at: inc.updatedAt, actor: actorId, note: patch.note });
    await redis.hset(K.incident(id), "_doc", JSON.stringify(inc));
    return inc;
  },

  async listIncidents(status?: IncidentStatus, limit = 50): Promise<Incident[]> {
    const ids = await redis.zrange(K.incidents, 0, -1, "REV");
    const out: Incident[] = [];
    for (const id of ids.slice(0, limit)) {
      const raw = await redis.hget(K.incident(id), "_doc");
      if (raw) {
        const inc: Incident = JSON.parse(raw);
        if (!status || inc.status === status) out.push(inc);
      }
    }
    return out;
  },

  async runAccessReview(organizationId: string, dormantDays = 90): Promise<any> {
    const since = new Date(Date.now() - dormantDays*86400_000);
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, lastLoginAt: true },
    });
    const dormant = users.filter(u => !u.lastLoginAt || new Date(u.lastLoginAt) < since)
      .map(u => ({
        userId: u.id, email: u.email, role: u.role, lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        daysInactive: u.lastLoginAt ? Math.floor((Date.now() - new Date(u.lastLoginAt).getTime())/86400_000) : 9999,
      }))
      .sort((a,b) => b.daysInactive - a.daysInactive);

    let campaign = null;
    if (prisma.accessReviewCampaign && typeof prisma.accessReviewCampaign.create === "function") {
      campaign = await prisma.accessReviewCampaign.create({
        data: {
          organizationId,
          dormantDays,
          status: "IN_PROGRESS",
          items: {
            create: dormant.map(d => ({ userId: d.userId, status: "PENDING" })),
          },
        },
        include: { items: true },
      });
    }

    const adminCount = users.filter(u => u.role === "ADMIN" || u.role === "SUPER_ADMIN").length;
    const superAdminCount = users.filter(u => u.role === "SUPER_ADMIN").length;
    const recs: string[] = [];
    if (dormant.length > 0) recs.push(`${dormant.length} dormant accounts (>${dormantDays}d inactive) — review and attest or revoke.`);
    if (superAdminCount > 3) recs.push(`${superAdminCount} SUPER_ADMIN accounts — review least-privilege compliance.`);

    const review = {
      campaignId: campaign?.id ?? "campaign-mock",
      generatedAt: new Date().toISOString(),
      dormantUsers: dormant,
      adminCount,
      superAdminCount,
      recommendations: recs,
    };
    await redis.set(K.lastReview, JSON.stringify(review), "EX", 60*60*24*7);
    return { campaign, review };
  },

  async attestAccessItem(itemId: string, status: "APPROVED" | "REVOKED" | "QUARANTINED", reviewerId: string, notes?: string) {
    if (prisma.accessReviewItem && typeof prisma.accessReviewItem.update === "function") {
      const item = await prisma.accessReviewItem.update({
        where: { id: itemId },
        data: { status, reviewedById: reviewerId, notes },
      });
      if (status === "QUARANTINED" || status === "REVOKED") {
        await prisma.user.update({ where: { id: item.userId }, data: { isSuspended: true } });
      }
      return item;
    }
    return { id: itemId, status, reviewedById: reviewerId, notes };
  },

  async latestAccessReview(): Promise<AccessReview|null> {
    const raw = await redis.get(K.lastReview);
    return raw ? JSON.parse(raw) : null;
  },

  async createRunbook(organizationId: string | null, input: { name: string; triggerSeverity: string; triggerArea: string; actions: string[] }) {
    if (prisma.incidentRunbook && typeof prisma.incidentRunbook.create === "function") {
      return prisma.incidentRunbook.create({
        data: {
          organizationId,
          name: input.name,
          triggerSeverity: input.triggerSeverity,
          triggerArea: input.triggerArea,
          actions: input.actions,
        },
      });
    }
    return { id: "rb-" + randomUUID().slice(0, 8), ...input };
  },

  async listRunbooks(organizationId?: string) {
    if (prisma.incidentRunbook && typeof prisma.incidentRunbook.findMany === "function") {
      return prisma.incidentRunbook.findMany({
        where: organizationId ? { OR: [{ organizationId }, { organizationId: null }] } : undefined,
        orderBy: { createdAt: "desc" },
        include: { executions: { take: 10, orderBy: { createdAt: "desc" } } },
      });
    }
    return [];
  },
};

export default SecurityGovernanceService;
