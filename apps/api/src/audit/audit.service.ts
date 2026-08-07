/**
 * Audit Module (S???) — Centralized Audit Logging Service
 *
 * Provides a unified audit trail across all WINDELS AI OS modules.
 * All modules SHOULD log significant actions through this service
 * rather than writing directly to the AuditLog table.
 *
 * Audit Event Categories:
 *   - authentication (login, logout, mfa, password change)
 *   - authorization (role changes, permission grants, api key management)
 *   - data (create, read, update, delete operations on business entities)
 *   - system (configuration changes, deployments, feature flags)
 *   - security (incidents, access reviews, policy violations)
 *   - billing (subscription changes, payments, invoices)
 *   - ai (model usage, agent actions, prompt evaluations)
 */

import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import type { Prisma } from "@prisma/client";

// ─── Audit Event Types ──────────────────────────────────────────────────────

export type AuditAction =
  // Authentication
  | "auth.login"
  | "auth.logout"
  | "auth.register"
  | "auth.password_change"
  | "auth.mfa_enable"
  | "auth.mfa_disable"
  | "auth.mfa_challenge"
  | "auth.session_create"
  | "auth.session_revoke"
  // Authorization
  | "authz.role_assign"
  | "authz.role_revoke"
  | "authz.permission_grant"
  | "authz.permission_revoke"
  | "authz.api_key_create"
  | "authz.api_key_revoke"
  | "authz.api_key_rotate"
  // Data Operations
  | "data.create"
  | "data.read"
  | "data.update"
  | "data.delete"
  | "data.export"
  | "data.import"
  // System
  | "system.config_change"
  | "system.feature_flag_toggle"
  | "system.deployment"
  | "system.release_promote"
  | "system.release_rollback"
  | "system.environment_create"
  | "system.environment_delete"
  // Security
  | "security.incident_create"
  | "security.incident_update"
  | "security.access_review_run"
  | "security.policy_violation"
  | "security.rate_limit_triggered"
  | "security.prompt_guard_block"
  // Billing
  | "billing.subscription_create"
  | "billing.subscription_update"
  | "billing.subscription_cancel"
  | "billing.invoice_create"
  | "billing.invoice_paid"
  | "billing.invoice_void"
  | "billing.payment_success"
  | "billing.payment_failed"
  | "billing.webhook_receive"
  // AI
  | "ai.model_invoke"
  | "ai.agent_task_start"
  | "ai.agent_task_complete"
  | "ai.agent_task_fail"
  | "ai.workflow_execute"
  | "ai.prompt_evaluated";

export type AuditResourceType =
  | "user"
  | "organization"
  | "workspace"
  | "agent"
  | "workflow"
  | "conversation"
  | "message"
  | "invoice"
  | "subscription"
  | "api_key"
  | "model"
  | "deployment"
  | "incident"
  | "policy"
  | "integration"
  | "custom";

export interface AuditLogCreateInput {
  organizationId?: string;
  userId?: string;
  apiKeyId?: string;
  action: AuditAction;
  resourceType?: AuditResourceType;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditQueryFilter {
  organizationId?: string;
  userId?: string;
  action?: AuditAction | AuditAction[];
  resourceType?: AuditResourceType;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// ─── Audit Service ──────────────────────────────────────────────────────────

export const auditService = {
  /**
   * Log an audit event
   */
  async log(event: AuditLogCreateInput): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          organizationId: event.organizationId ?? null,
          userId: event.userId ?? null,
          apiKeyId: event.apiKeyId ?? null,
          action: event.action,
          resourceType: event.resourceType ?? null,
          resourceId: event.resourceId ?? null,
          ipAddress: event.ipAddress ?? null,
          userAgent: event.userAgent ?? null,
          requestId: event.requestId ?? null,
          metadata: event.metadata ?? {},
        },
      });

      // Also publish to Redis for real-time audit streaming (optional)
      await redis.lPush(
        `audit:log:${event.organizationId || "global"}:recent`,
        JSON.stringify({
          ...event,
          createdAt: new Date().toISOString(),
        }),
      );

      // Trim to last 1000 events per organization
      await redis.lTrim(`audit:log:${event.organizationId || "global"}:recent`, 0, 999);
    } catch (error) {
      // Log failure but don't throw — audit failures shouldn't break the app
      logger.error("Failed to write audit log", {
        action: event.action,
        resourceId: event.resourceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  /**
   * Log an audit event with full context from request
   */
  async logFromRequest(
    action: AuditAction,
    req: {
      user?: { id: string; organizationId?: string };
      apiKey?: { id: string; organizationId: string };
      ip?: string;
      userAgent?: string;
      requestId?: string;
    },
    resourceType?: AuditResourceType,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const orgId = req.user?.organizationId || req.apiKey?.organizationId;

    await this.log({
      organizationId: orgId,
      userId: req.user?.id,
      apiKeyId: req.apiKey?.id,
      action,
      resourceType,
      resourceId,
      ipAddress: req.ip,
      userAgent: req.userAgent,
      requestId: req.requestId,
      metadata,
    });
  },

  /**
   * Query audit logs with filters
   */
  async query(filter: AuditQueryFilter): Promise<{
    logs: Array<{
      id: string;
      action: AuditAction;
      resourceType: AuditResourceType | null;
      resourceId: string | null;
      userId: string | null;
      organizationId: string | null;
      ipAddress: string | null;
      requestId: string | null;
      metadata: Record<string, unknown>;
      createdAt: Date;
    }>;
    total: number;
  }> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.organizationId && { organizationId: filter.organizationId }),
      ...(filter.userId && { userId: filter.userId }),
      ...(filter.action && (Array.isArray(filter.action) ? { action: { in: filter.action } } : { action: filter.action })),
      ...(filter.resourceType && { resourceType: filter.resourceType }),
      ...(filter.resourceId && { resourceId: filter.resourceId }),
      ...(filter.startDate || filter.endDate) && {
        createdAt: {
          ...(filter.startDate && { gte: filter.startDate }),
          ...(filter.endDate && { lte: filter.endDate }),
        },
      },
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filter.limit || 50,
        skip: filter.offset || 0,
        select: {
          id: true,
          action: true,
          resourceType: true,
          resourceId: true,
          userId: true,
          organizationId: true,
          ipAddress: true,
          requestId: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  },

  /**
   * Get recent audit logs for an organization
   */
  async getRecent(organizationId: string, limit = 50): Promise<Array<{
    id: string;
    action: AuditAction;
    resourceType: AuditResourceType | null;
    resourceId: string | null;
    userId: string | null;
    createdAt: Date;
  }>> {
    return prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        userId: true,
        createdAt: true,
      },
    });
  },

  /**
   * Get audit log count by action type
   */
  async getStats(organizationId: string, days = 30): Promise<Record<string, number>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await prisma.auditLog.groupBy({
      by: ["action"],
      where: {
        organizationId,
        createdAt: { gte: startDate },
      },
      _count: { action: true },
    });

    return Object.fromEntries(logs.map((l) => [l.action, l._count.action]));
  },

  /**
   * Export audit logs for compliance
   */
  async export(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    format: "json" | "csv" = "json",
  ): Promise<string> {
    const { logs } = await this.query({
      organizationId,
      startDate,
      endDate,
      limit: 10000,
    });

    if (format === "json") {
      return JSON.stringify(logs, null, 2);
    }

    // CSV format
    const headers = [
      "id",
      "action",
      "resourceType",
      "resourceId",
      "userId",
      "organizationId",
      "ipAddress",
      "requestId",
      "createdAt",
    ];

    const rows = logs.map((log) =>
      headers.map((h) => {
        const val = log[h as keyof typeof log];
        // Escape CSV special characters
        const str = String(val ?? "");
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }),
    );

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  },
};

export default auditService;
