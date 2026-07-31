/**
 * Security governance — incident reporting, access reviews, dormant-account detection.
 *
 * Real implementations backed by Prisma (users/memberships) + Redis (incident records,
 * review runs). Produces actionable reports and audit logs.
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
    };
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

  async runAccessReview(dormantDays = 90): Promise<AccessReview> {
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
    const adminCount = users.filter(u => u.role === "ADMIN" || u.role === "SUPER_ADMIN").length;
    const superAdminCount = users.filter(u => u.role === "SUPER_ADMIN").length;
    const recs: string[] = [];
    if (dormant.length > 0) recs.push(`${dormant.length} dormant accounts (>${dormantDays}d inactive) — consider disabling or rotating credentials.`);
    if (superAdminCount > 3) recs.push(`${superAdminCount} SUPER_ADMIN accounts — review least-privilege compliance.`);
    const review: AccessReview = {
      id: "rev-" + randomUUID().slice(0,8),
      generatedAt: new Date().toISOString(),
      dormantUsers: dormant, adminCount, superAdminCount, recommendations: recs,
    };
    await redis.set(K.lastReview, JSON.stringify(review), "EX", 60*60*24*7); // cache 7 days
    return review;
  },

  async latestAccessReview(): Promise<AccessReview|null> {
    const raw = await redis.get(K.lastReview);
    return raw ? JSON.parse(raw) : null;
  },
};

export default SecurityGovernanceService;
