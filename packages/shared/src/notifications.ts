/**
 * Notifications Module — Shared Types & Schemas
 */

import { z } from "zod";

// ─── Channel Types ───────────────────────────────────────────────────────────

export const NOTIFICATION_CHANNELS = ["in_app", "push", "email", "sms"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// ─── Priority Types ──────────────────────────────────────────────────────────

export const NOTIFICATION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

// ─── Category Types ──────────────────────────────────────────────────────────

export const NOTIFICATION_CATEGORIES = [
  // Authentication & Security
  "auth.login_success",
  "auth.login_failed",
  "auth.password_changed",
  "auth.mfa_enabled",
  "auth.mfa_disabled",
  "auth.new_device",
  "auth.session_revoked",
  // Billing
  "billing.subscription_renewed",
  "billing.invoice_paid",
  "billing.invoice_failed",
  "billing.payment_received",
  "billing.plan_changed",
  "billing.trial_ending",
  // Collaboration
  "collaboration.message_received",
  "collaboration.mention",
  "collaboration.channel_join",
  "collaboration.meeting_reminder",
  "collaboration.action_item_assign",
  "collaboration.comment_added",
  // Workflow & Automation
  "workflow.completed",
  "workflow.failed",
  "workflow.approval_required",
  "workflow.approval_approved",
  "workflow.approval_rejected",
  // System
  "system.maintenance_scheduled",
  "system.outage",
  "system.update_available",
  "system.feature_enabled",
  // AI
  "ai.agent_task_complete",
  "ai.agent_task_failed",
  "ai.model_quota_warning",
  "ai.report_ready",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

// ─── Notification Shape ──────────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  organizationId: string;
  title: string;
  body: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  data: Record<string, unknown>;
  linkUrl: string | null;
  read: boolean;
  readAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface NotificationPreference {
  userId: string;
  category: NotificationCategory;
  channels: NotificationChannel[];
  enabled: boolean;
}

export interface NotificationList {
  notifications: Notification[];
  unreadCount: number;
}

// ─── Route Validation Schemas ────────────────────────────────────────────────

export const notificationsRoutesSchema = {
  list: z.object({
    unreadOnly: z.string().optional(),
    limit: z.string().optional(),
    offset: z.string().optional(),
  }),

  notificationId: z.object({
    id: z.string().cuid(),
  }),

  updatePreference: z.object({
    category: z.enum(NOTIFICATION_CATEGORIES),
    channels: z.array(z.enum(NOTIFICATION_CHANNELS)),
    enabled: z.boolean(),
  }),
};
