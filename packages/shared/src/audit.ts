/**
 * Audit Module — Shared Types & Schemas
 *
 * Covers 47 audit actions across 7 categories and 16 resource types.
 * Used by every WINDELS AI OS module via auditService.log().
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

// ─── Action Categories (for UI badges/filtering) ────────────────────────────

export const AUDIT_ACTION_CATEGORIES = {
  authentication: ["auth.login","auth.logout","auth.register","auth.password_change","auth.mfa_enable","auth.mfa_disable","auth.mfa_challenge","auth.session_create","auth.session_revoke"],
  authorization: ["authz.role_assign","authz.role_revoke","authz.permission_grant","authz.permission_revoke","authz.api_key_create","authz.api_key_revoke","authz.api_key_rotate"],
  data: ["data.create","data.read","data.update","data.delete","data.export","data.import"],
  system: ["system.config_change","system.feature_flag_toggle","system.deployment","system.release_promote","system.release_rollback","system.environment_create","system.environment_delete"],
  security: ["security.incident_create","security.incident_update","security.access_review_run","security.policy_violation","security.rate_limit_triggered","security.prompt_guard_block"],
  billing: ["billing.subscription_create","billing.subscription_update","billing.subscription_cancel","billing.invoice_create","billing.invoice_paid","billing.invoice_void","billing.payment_success","billing.payment_failed","billing.webhook_receive"],
  ai: ["ai.model_invoke","ai.agent_task_start","ai.agent_task_complete","ai.agent_task_fail","ai.workflow_execute","ai.prompt_evaluated"],
} as const;

export function auditActionCategory(action: AuditAction): keyof typeof AUDIT_ACTION_CATEGORIES {
  for (const [cat, actions] of Object.entries(AUDIT_ACTION_CATEGORIES)) {
    if ((actions as readonly string[]).includes(action)) return cat as keyof typeof AUDIT_ACTION_CATEGORIES;
  }
  return "data";
}

// ─── Audit Log Shapes ────────────────────────────────────────────────────────

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
  createdAt: string; // ISO datetime (wire)
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
  createdAt: string;
}

export interface AuditStats {
  stats: Record<string, number>;
  period: { days: number };
}

export interface AuditDetail extends AuditLog {
  apiKeyId: string | null;
}

export interface AuditTimelineEntry {
  date: string; // YYYY-MM-DD
  total: number;
  byAction: Record<string, number>;
}

export interface AuditTimelineResponse {
  days: number;
  entries: AuditTimelineEntry[];
}

export interface AuditQueryResult {
  logs: AuditLog[];
  total: number;
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

  byId: z.object({
    id: z.string().min(1),
  }),

  timeline: z.object({
    days: z.coerce.number().int().min(1).max(90).optional().default(14),
  }),
};

export type AuditQueryInput = z.input<typeof auditRoutesSchema.query>;
export type AuditExportInput = z.input<typeof auditRoutesSchema.export>;
export type AuditTimelineInput = z.input<typeof auditRoutesSchema.timeline>;
