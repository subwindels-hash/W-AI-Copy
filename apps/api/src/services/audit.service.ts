import { prisma } from "../db/client.js";
import { resolveUserContext } from "./workspace.service.js";
import type { Request } from "express";
import { PaginationQuery } from "@windels/shared/api";

export const AUDIT_ACTIONS = [
  "CREATE", "UPDATE", "DELETE", "LOGIN", "LOGIN_FAILED", "LOGOUT",
  "RUN", "APPROVE", "EXPORT", "LOG",
  "API_KEY_CREATE", "API_KEY_REVOKE", "WEBHOOK_CREATE", "WEBHOOK_DELETE",
  "SSO_UPDATE", "INTEGRATION_CONNECT", "PERMISSION_GRANT", "PERMISSION_REVOKE",
  "RETENTION_UPDATE", "ALERT_CREATE", "BACKUP_CREATE", "USER_SUSPEND",
  "FAILOVER_TRIGGER", "FAILOVER_CLEAR", "PURGE_CACHE", "CONFIG_UPDATE",
] as const;
export type AuditAction = typeof AUDIT_ACTIONS[number];

/** Resolve organization context for a user and write an audit entry (req-free convenience). */
export async function writeAuditForUser(
  userId: string,
  input: {
    action: AuditAction;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, any>;
  }
) {
  try {
    const ctx = await resolveUserContext(userId);
    await writeAudit(null, {
      organizationId: ctx.organizationId,
      userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
    });
  } catch (e) {
    console.warn("[audit] writeAuditForUser failed:", (e as Error).message);
  }
}

/** Record an audit entry from an authenticated request. */
export async function writeAudit(
  req: Request | null,
  input: {
    organizationId: string;
    userId?: string | null;
    apiKeyId?: string | null;
    action: AuditAction;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, any>;
  }
) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        apiKeyId: input.apiKeyId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        ipAddress: req?.ip ?? null,
        userAgent: req?.header("user-agent") ?? null,
        requestId: (req as any)?.requestId ?? null,
        metadata: input.metadata ?? {},
      },
    });
  } catch (e) {
    console.warn("[audit] failed to write:", (e as Error).message);
  }
}

/** Convenience: derive org/user from request automatically. */
export async function auditFromReq(req: Request, action: AuditAction, meta?: { resourceType?: string; resourceId?: string; metadata?: Record<string, any> }) {
  const user = (req as any).user;
  if (!user) return;
  try {
    const ctx = await resolveUserContext(user.id);
    await writeAudit(req, {
      organizationId: ctx.organizationId,
      userId: user.id,
      apiKeyId: (req as any).apiKey?.id ?? null,
      action,
      resourceType: meta?.resourceType,
      resourceId: meta?.resourceId,
      metadata: meta?.metadata,
    });
  } catch {}
}

export async function listAuditLogs(userId: string, q: PaginationQuery & { action?: string; resourceType?: string; userId?: string }) {
  const ctx = await resolveUserContext(userId);
  const where: any = { organizationId: ctx.organizationId };
  if (q.action) where.action = q.action;
  if (q.resourceType) where.resourceType = q.resourceType;
  if (q.userId) where.userId = q.userId;
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.perPage, take: q.perPage,
      include: { user: { include: { profile: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    items: items.map((a) => ({
      id: a.id, action: a.action, resourceType: a.resourceType, resourceId: a.resourceId,
      ipAddress: a.ipAddress, metadata: a.metadata, createdAt: a.createdAt,
      user: a.user ? { id: a.user.id, email: a.user.email, displayName: a.user.profile?.displayName } : null,
    })),
    pagination: { page: q.page, perPage: q.perPage, total, totalPages: Math.ceil(total / q.perPage) },
  };
}
