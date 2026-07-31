import { prisma } from "../db/client.js";
import { resolveUserContext } from "./workspace.service.js";
import { z } from "zod";
type RetentionResource = "messages" | "runs" | "logs" | "audit" | "conversations" | "attachments";
type RetentionResourceDb = "MESSAGES" | "RUNS" | "LOGS" | "AUDIT" | "CONVERSATIONS" | "ATTACHMENTS";

export const RetentionSchema = z.object({
  resource: z.enum(["messages", "runs", "logs", "audit", "conversations", "attachments"]),
  retentionDays: z.number().int().min(7).max(3650),
});

export interface RetentionPolicy {
  resource: RetentionResource;
  retentionDays: number;
}

// Default retention policies (in days)
const DEFAULTS: Record<RetentionResourceDb, number> = {
  MESSAGES: 365,
  RUNS: 180,
  LOGS: 90,
  AUDIT: 365 * 3, // 3 years for compliance
  CONVERSATIONS: 365,
  ATTACHMENTS: 365,
};

export async function getRetentionPolicies(userId: string): Promise<RetentionPolicy[]> {
  const ctx = await resolveUserContext(userId);
  const settings = (await prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } }))?.settings as any ?? {};
  const ret = (settings.retention ?? {}) as Record<string, number>;
  return Object.entries(DEFAULTS).map(([resource, days]) => ({
    resource: resource.toLowerCase() as RetentionResource,
    retentionDays: ret[resource] ?? days,
  }));
}

export async function updateRetentionPolicy(userId: string, input: z.infer<typeof RetentionSchema>) {
  const ctx = await resolveUserContext(userId);
  const org = await prisma.organization.findUnique({ where: { id: ctx.organizationId } });
  if (!org) throw Object.assign(new Error("Not found"), { status: 404 });
  const settings = (org.settings as any) ?? {};
  const retention = settings.retention ?? {};
  retention[input.resource.toUpperCase()] = input.retentionDays;
  await prisma.organization.update({
    where: { id: ctx.organizationId },
    data: { settings: { ...settings, retention } },
  });
  return getRetentionPolicies(userId);
}

/** Apply retention: delete records older than the policy threshold. Run periodically. */
export async function applyRetention() {
  const orgs = await prisma.organization.findMany();
  const deleted: Record<string, number> = {};
  for (const org of orgs) {
    const settings = (org.settings as any) ?? {};
    const retention = settings.retention ?? {};
    const policies = (Object.keys(DEFAULTS) as RetentionResourceDb[]).map((r) => ({
      resource: r,
      days: retention[r] ?? DEFAULTS[r],
    }));
    for (const p of policies) {
      const before = new Date(Date.now() - p.days * 86_400_000);
      let n = 0;
      switch (p.resource) {
        case "MESSAGES":
          n = (await prisma.talkMessage.deleteMany({ where: { channel: { organizationId: org.id }, createdAt: { lt: before } } })).count; break;
        case "RUNS":
          n = (await prisma.workflowRun.deleteMany({ where: { workflow: { organizationId: org.id }, createdAt: { lt: before } } })).count; break;
        case "AUDIT":
          n = (await prisma.auditLog.deleteMany({ where: { organizationId: org.id, createdAt: { lt: before } } })).count; break;
        case "CONVERSATIONS":
          n = (await prisma.conversation.deleteMany({ where: { organizationId: org.id, createdAt: { lt: before } } })).count; break;
        case "LOGS":
          n = (await prisma.healthCheck.deleteMany({ where: { createdAt: { lt: before } } })).count; break;
        case "ATTACHMENTS":
          // attachments don't have a direct org FK in simple MVP; skip cascade
          break;
      }
      deleted[p.resource.toLowerCase()] = (deleted[p.resource.toLowerCase()] ?? 0) + n;
    }
  }
  return deleted;
}

export async function getDataExport(userId: string, type: "workflows" | "conversations" | "talk" | "profile") {
  const ctx = await resolveUserContext(userId);
  let payload: any = {};
  switch (type) {
    case "profile": {
      const u = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
      payload = { user: { email: u?.email, role: u?.role, profile: u?.profile } }; break;
    }
    case "workflows": {
      payload = await prisma.workflow.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null }, include: { runs: { take: 50 } } }); break;
    }
    case "conversations": {
      payload = await prisma.conversation.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null }, include: { messages: { take: 200 } } }); break;
    }
    case "talk": {
      const channels = await prisma.talkChannel.findMany({ where: { organizationId: ctx.organizationId }, include: { messages: { take: 500 } } });
      payload = channels; break;
    }
  }
  const exp = await prisma.dataExport.create({
    data: {
      organizationId: ctx.organizationId, userId, type, status: "ready",
      downloadUrl: `data:application/json;base64,${Buffer.from(JSON.stringify(payload)).toString("base64")}`,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      completedAt: new Date(),
    },
  });
  return { id: exp.id, type, downloadUrl: exp.downloadUrl, expiresAt: exp.expiresAt };
}

export async function listExports(userId: string) {
  const ctx = await resolveUserContext(userId);
  return prisma.dataExport.findMany({ where: { userId, organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" } });
}

export function getComplianceReport(userId: string) {
  return resolveUserContext(userId).then(async () => ({
    gdpr: { dataExports: true, erasure: true, retentionPolicies: true, auditLogs: true },
    hipaa: { auditLogging: true, accessControls: true, encryptionAtRest: false, encryptionInTransit: true },
    soc2: { accessControls: true, changeManagement: false, logging: true, backups: false },
  }));
}
