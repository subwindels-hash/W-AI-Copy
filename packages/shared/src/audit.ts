/**
 * Audit Module — Shared Types & Schemas
 */

import { z } from "zod";

// ─── Audit Action Types ──────────────────────────────────────────────────────

export const AUDIT_ACTIONS = [
  // Authentication
  "auth.login",
  "auth.logout",
  "auth.register",
  "auth.password_change",
  "auth.mfa_enable",
  "auth.mfa_disable",
  "auth.mfa_challenge",
  "auth.session_create",
  "auth.session_revoke",
  // Authorization
  "authz.role_assign",
  "authz.role_revoke",
  "authz.permission_grant",
  "authz.permission_revoke",
  "authz.api_key_create",
  "authz.api_key_revoke",
  "authz.api_key_rotate",
  // Data Operations
  "data.create",
  "data.read",
  "data.update",
  "data.delete",
  "data.export",
  "data.import",
  // System
  "system.config_change",
  "system.feature_flag_toggle",
  "system.deployment",
  "system.release_promote",
  "system.release_rollback",
  "system.environment_create",
  "system.environment_delete",
  // Security
  "security.incident_create",
  "security.incident_update",
  "security.access_review_run",
  "security.policy_violation",
  "security.rate_limit_triggered",
  "security.prompt_guard_block",
  // Billing
  "billing.subscription_create",
  "billing.subscription_update",
  "billing.subscription_cancel",
  "billing.invoice_create",
  "billing.invoice_paid",
  "billing.invoice_void",
  "billing.payment_success",
  "billing.payment_failed",
  "billing.webhook_receive",
  // AI
  "ai.model_invoke",
  "ai.agent_task_start",
  "ai.agent_task_complete",
  "ai.agent_task_fail",
  "ai.workflow_execute",
  "ai.prompt_evaluated",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// ─── Resource Types ──────────────────────────────────────────────────────────

export const AUDIT_RESOURCE_TYPES = [
  "user",
  "organization",
  "workspace",
  "agent",
  "workflow",
  "conversation",
  "message",
  "invoice",
  "subscription",
  "api_key",
  "model",
  "deployment",
  "incident",
  "policy",
  "integration",
  "custom",
] as const;

export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number];

// ─── Audit Log Shape ─────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  organizationId: string | null;
  userId: string | null;
  action: AuditAction;
  resourceType: AuditResourceType | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface AuditLogSummary {
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
}

export interface AuditStats {
  stats: Record<AuditAction, number>;
  period: { days: number };
}

// ─── Route Validation Schemas ────────────────────────────────────────────────

export const auditRoutesSchema = {
  query: z.object({
    userId: z.string().optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
    resourceType: z.enum(AUDIT_RESOURCE_TYPES).optional(),
    resourceId: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }),

  export: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    format: z.enum(["json", "csv"]).optional(),
  }),
};
