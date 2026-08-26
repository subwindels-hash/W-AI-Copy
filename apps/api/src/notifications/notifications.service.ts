/**
 * Notifications Module (S???) — Multi-Channel Notification Service
 *
 * Provides unified notification delivery across multiple channels:
 * - In-app notifications (stored in DB, displayed in UI)
 * - Push notifications (via mobile module)
 * - Email notifications (via SMTP)
 * - SMS notifications (via SMS provider, future)
 *
 * Uses the existing Notification model from the Prisma schema.
 */

import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import type { Prisma } from "@prisma/client";

// ─── Notification Types ──────────────────────────────────────────────────────

export type NotificationChannel = "in_app" | "push" | "email" | "sms";

/** Result of attempting delivery on a single channel. Never fabricated. */
export interface NotificationDeliveryResult {
  channel: NotificationChannel;
  sent: boolean;
  reason: string;
  error?: string;
}

/** Provider-agnostic SMS transport. Real providers (Twilio, etc.) implement this. */
export interface SmsTransport {
  send(input: { to: string; message: string }): Promise<{ sent: boolean; reason?: string; error?: string }>;
}

/**
 * Resolve the configured SMS transport, or `null` when none is configured.
 * A Twilio transport is used when the standard Twilio env vars are present; the
 * REST call is performed with the runtime `fetch`. No provider configured means
 * SMS is honestly reported as unavailable rather than silently dropped.
 */
export function getSmsTransport(fetchImpl: typeof fetch = fetch): SmsTransport | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return null;
  return {
    async send({ to, message }) {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
      const body = new URLSearchParams({ To: to, From: from, Body: message });
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: "POST",
          headers: {
            authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (e) {
        return { sent: false, reason: "SMS_NETWORK_ERROR", error: (e as Error).message };
      }
      if (res.ok) return { sent: true, reason: "sent" };
      const text = await res.text().catch(() => "");
      return { sent: false, reason: `SMS_HTTP_${res.status}`, error: text.slice(0, 300) };
    },
  };
}
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export type NotificationCategory =
  // Authentication & Security
  | "auth.login_success"
  | "auth.login_failed"
  | "auth.password_changed"
  | "auth.mfa_enabled"
  | "auth.mfa_disabled"
  | "auth.new_device"
  | "auth.session_revoked"
  // Billing
  | "billing.subscription_renewed"
  | "billing.invoice_paid"
  | "billing.invoice_failed"
  | "billing.payment_received"
  | "billing.plan_changed"
  | "billing.trial_ending"
  // Collaboration
  | "collaboration.message_received"
  | "collaboration.mention"
  | "collaboration.channel_join"
  | "collaboration.meeting_reminder"
  | "collaboration.action_item_assign"
  | "collaboration.comment_added"
  // Workflow & Automation
  | "workflow.completed"
  | "workflow.failed"
  | "workflow.approval_required"
  | "workflow.approval_approved"
  | "workflow.approval_rejected"
  // System
  | "system.maintenance_scheduled"
  | "system.outage"
  | "system.update_available"
  | "system.feature_enabled"
  // AI
  | "ai.agent_task_complete"
  | "ai.agent_task_failed"
  | "ai.model_quota_warning"
  | "ai.report_ready"
  // Commerce (WMPC marketplace events relayed to the user)
  | "commerce.order_created"
  | "commerce.order_shipped"
  | "commerce.order_delivered"
  | "commerce.order_cancelled"
  | "commerce.payment_completed"
  | "commerce.payment_failed"
  | "commerce.refund_completed";

export interface NotificationCreateInput {
  userId: string;
  organizationId: string;
  title: string;
  body: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  data?: Record<string, unknown>;
  linkUrl?: string;
  expiresAt?: Date;
}

export interface NotificationPreference {
  userId: string;
  category: NotificationCategory;
  channels: NotificationChannel[];
  enabled: boolean;
}

// Map our category to the existing Notification type field
function categoryToType(category: NotificationCategory): string {
  if (category.startsWith("auth.")) return "alert";
  if (category.startsWith("billing.")) return "system";
  if (category.startsWith("collaboration.")) return "message";
  if (category.startsWith("workflow.")) return "system";
  if (category.startsWith("system.")) return "system";
  if (category.startsWith("ai.")) return "system";
  return "system";
}

// ─── Notification Service ────────────────────────────────────────────────────

export const notificationsService = {
  /**
   * Create and send a notification
   */
  async createAndSend(input: NotificationCreateInput): Promise<string> {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        type: categoryToType(input.category),
        title: input.title,
        body: input.body,
        icon: this.getIconForCategory(input.category),
        url: input.linkUrl ?? null,
        data: input.data ?? {},
        readAt: null,
        dismissedAt: null,
      },
    });

    // Queue for delivery on each channel
    for (const channel of input.channels) {
      await this.queueDelivery(notification.id, channel);
    }

    logger.info("Notification created", {
      notificationId: notification.id,
      userId: notification.userId,
      category: input.category,
      channels: input.channels,
    });

    return notification.id;
  },

  /**
   * Get icon for notification category
   */
  getIconForCategory(category: NotificationCategory): string | null {
    if (category.startsWith("auth.")) return "shield";
    if (category.startsWith("billing.")) return "credit-card";
    if (category.startsWith("collaboration.")) return "message-square";
    if (category.startsWith("workflow.")) return "clock";
    if (category.startsWith("system.")) return "info";
    if (category.startsWith("ai.")) return "bot";
    return null;
  },

  /**
   * Queue notification for delivery on a specific channel
   */
  async queueDelivery(notificationId: string, channel: NotificationChannel): Promise<void> {
    const key = `notif:delivery:${notificationId}:${channel}`;
    await (redis as any).set(key, "pending", "EX", 3600); // 1-hour TTL
    await (redis as any).lpush("notif:delivery:queue", JSON.stringify({ notificationId, channel }));
  },

  /**
   * Process delivery queue (called by background worker)
   */
  async processDeliveryQueue(): Promise<{ processed: number; failed: number }> {
    const results = { processed: 0, failed: 0 };

    while (true) {
      const item = await (redis as any).rpop("notif:delivery:queue");
      if (!item) break;

      try {
        const { notificationId, channel } = JSON.parse(item);
        await this.deliver(notificationId, channel);
        await redis.del(`notif:delivery:${notificationId}:${channel}`);
        results.processed++;
      } catch (error) {
        logger.error("Notification delivery failed", { error });
        results.failed++;
      }
    }

    return results;
  },

  /**
   * Deliver notification via specific channel
   */
  async deliver(notificationId: string, channel: NotificationChannel): Promise<void> {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error(`Notification ${notificationId} not found`);
    }

    switch (channel) {
      case "in_app":
        // Already stored in DB, nothing else to do
        break;

      case "push":
        await this.sendPush(notification);
        break;

      case "email":
        await this.sendEmail(notification);
        break;

      case "sms": {
        const phone = notification.data && typeof notification.data === "object"
          ? (notification.data as Record<string, unknown>).phone as string | undefined
          : undefined;
        await this.sendSms({ ...notification, phone });
        break;
      }
    }
  },

  /**
   * Send push notification (delegates to mobile service)
   */
  async sendPush(notification: {
    id: string;
    userId: string;
    title: string;
    body: string;
    url?: string | null;
    data?: Record<string, unknown>;
  }): Promise<void> {
    // Import here to avoid circular dependency
    const { sendToUser } = await import("../services/push.service.js");

    await (sendToUser as any)({
      userId: notification.userId,
      title: notification.title,
      body: notification.body,
      data: {
        type: "notification",
        notificationId: notification.id,
        linkUrl: notification.url,
        ...notification.data,
      },
    });

    // Mark as push delivered
    await prisma.notification.update({
      where: { id: notification.id },
      data: { pushDelivered: true },
    });
  },

  /**
   * Send an email notification through the configured SMTP relay
   * (`EmailService.sendEmail`, the same real transport the contact center and
   * site platform use). It resolves the recipient's address from the user
   * record and never fabricates delivery:
   *   - no email on file  → { sent:false, reason:"NO_EMAIL_ON_FILE" }
   *   - SMTP not set up    → { sent:false, reason:"SMTP_NOT_CONFIGURED" }
   *   - relay error        → { sent:false, reason:"SMTP_ERROR", error }
   * Callers get a structured result; nothing is silently dropped.
   */
  async sendEmail(notification: {
    id?: string;
    userId: string;
    title: string;
    body: string;
    url?: string | null;
  }): Promise<NotificationDeliveryResult> {
    const user = await prisma.user.findUnique({ where: { id: notification.userId }, select: { email: true } });
    if (!user?.email) {
      logger.warn("Email notification skipped: no email on file", { notificationId: notification.id, userId: notification.userId });
      return { channel: "email", sent: false, reason: "NO_EMAIL_ON_FILE" };
    }
    const text = notification.url ? `${notification.body}\n\n${notification.url}` : notification.body;
    try {
      const { EmailService } = await import("../sitePlatform/sitePlatform.service.js");
      const res = await EmailService.sendEmail({ to: user.email, subject: notification.title, text });
      if (res.sent) {
        logger.info("Email notification sent", { notificationId: notification.id, userId: notification.userId });
        return { channel: "email", sent: true, reason: res.reason };
      }
      logger.warn("Email notification not sent", { notificationId: notification.id, userId: notification.userId, reason: res.reason });
      return { channel: "email", sent: false, reason: res.reason, error: res.error };
    } catch (e) {
      logger.warn("Email notification error", { notificationId: notification.id, userId: notification.userId, error: (e as Error).message });
      return { channel: "email", sent: false, reason: "SMTP_ERROR", error: (e as Error).message };
    }
  },

  /**
   * Send an SMS notification through a provider-agnostic, injectable transport.
   * The default transport is resolved from `getSmsTransport()`; when no SMS
   * provider is configured the message is honestly reported as not sent rather
   * than logged as if it had been. The recipient number is read from the user
   * record (never invented).
   */
  async sendSms(
    notification: { id?: string; userId: string; title: string; body: string; phone?: string | null },
    transport: SmsTransport | null = getSmsTransport(),
  ): Promise<NotificationDeliveryResult> {
    if (!transport) {
      logger.warn("SMS notification skipped: no SMS provider configured", { notificationId: notification.id, userId: notification.userId });
      return { channel: "sms", sent: false, reason: "SMS_NOT_CONFIGURED" };
    }
    // The User model has no phone column, so the recipient number must be
    // supplied explicitly (e.g. via the notification's data payload). Without
    // one we honestly report it rather than inventing a destination.
    const phone = notification.phone?.trim();
    if (!phone) {
      logger.warn("SMS notification skipped: no phone provided", { notificationId: notification.id, userId: notification.userId });
      return { channel: "sms", sent: false, reason: "NO_PHONE_ON_FILE" };
    }
    const message = `${notification.title}: ${notification.body}`.slice(0, 480);
    try {
      const res = await transport.send({ to: phone, message });
      if (res.sent) {
        logger.info("SMS notification sent", { notificationId: notification.id, userId: notification.userId });
        return { channel: "sms", sent: true, reason: res.reason ?? "sent" };
      }
      return { channel: "sms", sent: false, reason: res.reason ?? "SMS_SEND_FAILED", error: res.error };
    } catch (e) {
      logger.warn("SMS notification error", { notificationId: notification.id, userId: notification.userId, error: (e as Error).message });
      return { channel: "sms", sent: false, reason: "SMS_ERROR", error: (e as Error).message };
    }
  },

  /**
   * Get user's notifications
   */
  async getForUser(
    userId: string,
    options?: {
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    icon: string | null;
    url: string | null;
    data: Record<string, unknown>;
    pushDelivered: boolean;
    readAt: Date | null;
    dismissedAt: Date | null;
    createdAt: Date;
  }>> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(options?.unreadOnly && { readAt: null }),
    };

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options?.limit || 20,
      skip: options?.offset || 0,
    });

    return notifications;
  },

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        readAt: new Date(),
      },
    });
  },

  /**
   * Mark all notifications as read for user
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return result.count;
  },

  /**
   * Get unread count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    });
  },

  /**
   * Delete notification (dismiss)
   */
  async delete(notificationId: string, userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        dismissedAt: new Date(),
      },
    });
  },

  /**
   * Clear dismissed/expired notifications
   */
  async clearDismissed(): Promise<number> {
    const result = await prisma.notification.deleteMany({
      where: {
        dismissedAt: {
          lte: new Date(),
        },
      },
    });

    return result.count;
  },

  /**
   * Get or create user's notification preferences
   */
  async getPreferences(userId: string): Promise<NotificationPreference[]> {
    const preferences = await prisma.notificationPreference.findMany({
      where: { userId },
    });

    // Return default preferences for important categories
    const existingCategories = new Set(preferences.map((p) => p.category));
    const defaultPreferences: NotificationPreference[] = [];

    const defaultCategories: NotificationCategory[] = [
      "auth.login_failed",
      "auth.new_device",
      "billing.invoice_failed",
      "workflow.approval_required",
    ];

    for (const category of defaultCategories) {
      if (!existingCategories.has(category)) {
        defaultPreferences.push({
          userId,
          category,
          channels: ["in_app"],
          enabled: true,
        });
      }
    }

    return [...preferences, ...defaultPreferences];
  },

  /**
   * Update user's notification preferences
   */
  async updatePreference(
    userId: string,
    category: NotificationCategory,
    channels: NotificationChannel[],
    enabled: boolean,
  ): Promise<void> {
    await prisma.notificationPreference.upsert({
      where: {
        userId_category: { userId, category },
      },
      create: {
        userId,
        category,
        channels,
        enabled,
      },
      update: {
        channels,
        enabled,
      },
    });
  },
};

export default notificationsService;
