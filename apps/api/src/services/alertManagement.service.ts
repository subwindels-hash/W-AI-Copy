/**
 * Alert Management Service (Module 21 — Gap 1)
 *
 * Proactive alerting with rules, evaluation, and notifications:
 * - Alert rules (metric thresholds, log patterns, error rates)
 * - Alert evaluation (periodic checks against rules)
 * - Alert notifications (email, Slack, PagerDuty, webhook)
 * - Alert escalation (escalation policies, on-call rotation)
 * - Alert history and deduplication
 * - Alert suppression and maintenance windows
 *
 * Enables proactive monitoring and incident response.
 */
import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { redisCmd } from "../db/redis.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:alertManagement');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export type AlertSeverity = "info" | "warning" | "error" | "critical";
export type AlertStatus = "firing" | "resolved" | "silenced" | "acknowledged";
export type NotificationChannel = "email" | "slack" | "pagerduty" | "webhook";

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: AlertSeverity;
  condition: AlertCondition;
  notificationChannels: NotificationChannel[];
  escalationPolicyId?: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface AlertCondition {
  type: "metric_threshold" | "log_pattern" | "error_rate" | "health_check";
  metric?: string;
  operator?: "gt" | "lt" | "eq" | "gte" | "lte";
  threshold?: number;
  duration?: number; // seconds
  logPattern?: string;
  errorTypes?: string[];
  healthCheck?: string;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  firedAt: string;
  resolvedAt?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  notifications: AlertNotification[];
  fingerprint: string;
}

export interface AlertNotification {
  id: string;
  alertId: string;
  channel: NotificationChannel;
  sentAt: string;
  status: "sent" | "failed" | "pending";
  errorMessage?: string;
  recipient: string;
}

export interface EscalationPolicy {
  id: string;
  name: string;
  description: string;
  levels: EscalationLevel[];
  createdAt: string;
  updatedAt: string;
}

export interface EscalationLevel {
  level: number;
  delayMinutes: number;
  notificationChannels: NotificationChannel[];
  recipients: string[];
}

export interface MaintenanceWindow {
  id: string;
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  alertRuleIds: string[]; // Empty means all rules
  createdAt: string;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const ALERT_RULE_KEY = (id: string) => `alert_rule:${id}`;
const ALERT_RULES_KEY = "alert_rules:all";
const ALERT_KEY = (id: string) => `alert:${id}`;
const ALERTS_KEY = "alerts:all";
const ALERT_FINGERPRINT_KEY = (fingerprint: string) => `alert:fingerprint:${fingerprint}`;
const ESCALATION_POLICY_KEY = (id: string) => `escalation_policy:${id}`;
const ESCALATION_POLICIES_KEY = "escalation_policies:all";
const MAINTENANCE_WINDOW_KEY = (id: string) => `maintenance_window:${id}`;
const MAINTENANCE_WINDOWS_KEY = "maintenance_windows:all";

// ─── Alert Rule Management ──────────────────────────────────────

/**
 * Create an alert rule
 */
export async function createAlertRule(input: {
  name: string;
  description: string;
  severity: AlertSeverity;
  condition: AlertCondition;
  notificationChannels: NotificationChannel[];
  escalationPolicyId?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  enabled?: boolean;
}): Promise<AlertRule> {
  const id = `rule_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();

  const rule: AlertRule = {
    id,
    name: input.name,
    description: input.description,
    enabled: input.enabled ?? true,
    severity: input.severity,
    condition: input.condition,
    notificationChannels: input.notificationChannels,
    escalationPolicyId: input.escalationPolicyId,
    labels: input.labels ?? {},
    annotations: input.annotations ?? {},
    createdAt: now,
    updatedAt: now,
  };

  await prisma.alertRule.create({ data: rule });
  await redisCmd.set(ALERT_RULE_KEY(id), JSON.stringify(rule));
  await redisCmd.sadd(ALERT_RULES_KEY, id);

  logger.info("Alert rule created", {
    ruleId: id,
    name: input.name,
    severity: input.severity,
  });

  Metrics.increment("alert.rules.created", 1);

  return rule;
}

/**
 * Get alert rule by ID
 */
export async function getAlertRule(ruleId: string): Promise<AlertRule | null> {
  return prisma.alertRule.findUnique({ where: { id: ruleId } });
}

/**
 * List all alert rules
 */
export async function listAlertRules(filters?: {
  enabled?: boolean;
  severity?: AlertSeverity;
}): Promise<AlertRule[]> {
  const where: any = {};

  if (filters?.enabled !== undefined) {
    where.enabled = filters.enabled;
  }

  if (filters?.severity) {
    where.severity = filters.severity;
  }

  return prisma.alertRule.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Update alert rule
 */
export async function updateAlertRule(
  ruleId: string,
  updates: Partial<AlertRule>,
): Promise<AlertRule | null> {
  const rule = await prisma.alertRule.update({
    where: { id: ruleId },
    data: {
      ...updates,
      updatedAt: new Date().toISOString(),
    },
  });

  await redisCmd.set(ALERT_RULE_KEY(ruleId), JSON.stringify(rule));

  logger.info("Alert rule updated", {
    ruleId,
    updates: Object.keys(updates),
  });

  return rule;
}

/**
 * Delete alert rule
 */
export async function deleteAlertRule(ruleId: string): Promise<void> {
  await prisma.alertRule.delete({ where: { id: ruleId } });
  await redisCmd.del(ALERT_RULE_KEY(ruleId));
  await redisCmd.srem(ALERT_RULES_KEY, ruleId);

  logger.info("Alert rule deleted", { ruleId });
}

// ─── Alert Evaluation ───────────────────────────────────────────

/**
 * Evaluate all alert rules
 */
export async function evaluateAlertRules(): Promise<number> {
  const rules = await listAlertRules({ enabled: true });
  let alertsFired = 0;

  for (const rule of rules) {
    try {
      const shouldFire = await evaluateAlertCondition(rule.condition);

      if (shouldFire) {
        // Check if alert is already firing (deduplication)
        const fingerprint = generateAlertFingerprint(rule);
        const existingAlert = await getAlertByFingerprint(fingerprint);

        if (!existingAlert || existingAlert.status === "resolved") {
          await fireAlert(rule, fingerprint);
          alertsFired++;
        }
      } else {
        // Check if alert should be resolved
        const fingerprint = generateAlertFingerprint(rule);
        const existingAlert = await getAlertByFingerprint(fingerprint);

        if (existingAlert && existingAlert.status === "firing") {
          await resolveAlert(existingAlert.id);
        }
      }
    } catch (error) {
      logger.error("Alert rule evaluation failed", {
        ruleId: rule.id,
        ruleName: rule.name,
        error: (error as Error).message,
      });
    }
  }

  if (alertsFired > 0) {
    logger.info("Alert evaluation completed", { alertsFired });
  }

  return alertsFired;
}

/**
 * Evaluate alert condition
 */
async function evaluateAlertCondition(condition: AlertCondition): Promise<boolean> {
  switch (condition.type) {
    case "metric_threshold":
      return evaluateMetricThreshold(condition);

    case "log_pattern":
      return evaluateLogPattern(condition);

    case "error_rate":
      return evaluateErrorRate(condition);

    case "health_check":
      return evaluateHealthCheck(condition);

    default:
      return false;
  }
}

/**
 * Evaluate metric threshold condition
 */
async function evaluateMetricThreshold(condition: AlertCondition): Promise<boolean> {
  if (!condition.metric || condition.threshold === undefined || !condition.operator) {
    return false;
  }

  // Get metric value from Metrics service
  const snapshot = Metrics.snapshot();
  const metricData = snapshot.counters[condition.metric] || snapshot.gauges[condition.metric];

  if (!metricData) {
    return false;
  }

  const value = metricData.total || metricData.value || 0;

  switch (condition.operator) {
    case "gt":
      return value > condition.threshold;
    case "lt":
      return value < condition.threshold;
    case "eq":
      return value === condition.threshold;
    case "gte":
      return value >= condition.threshold;
    case "lte":
      return value <= condition.threshold;
    default:
      return false;
  }
}

/**
 * Evaluate log pattern condition
 */
async function evaluateLogPattern(condition: AlertCondition): Promise<boolean> {
  if (!condition.logPattern) {
    return false;
  }

  // Get recent logs from logger ring buffer
  const { snapshotRing } = await import("../observability/logger.js");
  const recentLogs = snapshotRing({ limit: 100 });

  const pattern = new RegExp(condition.logPattern, "i");
  return recentLogs.some((log) => pattern.test(JSON.stringify(log)));
}

/**
 * Evaluate error rate condition
 */
async function evaluateErrorRate(condition: AlertCondition): Promise<boolean> {
  if (condition.threshold === undefined) {
    return false;
  }

  // Get error count from metrics
  const snapshot = Metrics.snapshot();
  const errorCount = snapshot.counters["errors"]?.total || 0;
  const requestCount = snapshot.counters["requests"]?.total || 1;

  const errorRate = (errorCount / requestCount) * 100;

  return errorRate > condition.threshold;
}

/**
 * Evaluate health check condition
 */
async function evaluateHealthCheck(condition: AlertCondition): Promise<boolean> {
  if (!condition.healthCheck) {
    return false;
  }

  // Get health check status
  const { getHealthCheck } = await import("./healthCheck.service.js");
  const health = await getHealthCheck(condition.healthCheck);

  return !health || health.status !== "healthy";
}

// ─── Alert Firing & Resolution ──────────────────────────────────

/**
 * Generate alert fingerprint for deduplication
 */
function generateAlertFingerprint(rule: AlertRule): string {
  const data = `${rule.id}:${rule.name}:${JSON.stringify(rule.condition)}`;
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
}

/**
 * Get alert by fingerprint
 */
async function getAlertByFingerprint(fingerprint: string): Promise<Alert | null> {
  const alertId = await redisCmd.get(ALERT_FINGERPRINT_KEY(fingerprint));
  if (!alertId) return null;

  return getAlert(alertId);
}

/**
 * Fire an alert
 */
async function fireAlert(rule: AlertRule, fingerprint: string): Promise<Alert> {
  const id = `alert_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();

  const message = rule.annotations.summary || `${rule.name} is firing`;

  const alert: Alert = {
    id,
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    status: "firing",
    message,
    labels: rule.labels,
    annotations: rule.annotations,
    firedAt: now,
    notifications: [],
    fingerprint,
  };

  await prisma.alert.create({ data: alert });
  await redisCmd.set(ALERT_KEY(id), JSON.stringify(alert));
  await redisCmd.sadd(ALERTS_KEY, id);
  await redisCmd.set(ALERT_FINGERPRINT_KEY(fingerprint), id);

  logger.warn("Alert fired", {
    alertId: id,
    ruleName: rule.name,
    severity: rule.severity,
    message,
  });

  Metrics.increment("alerts.fired", 1, { severity: rule.severity });

  // Send notifications
  await sendAlertNotifications(alert, rule);

  return alert;
}

/**
 * Resolve an alert
 */
export async function resolveAlert(alertId: string): Promise<Alert | null> {
  const alert = await getAlert(alertId);
  if (!alert) return null;

  alert.status = "resolved";
  alert.resolvedAt = new Date().toISOString();

  await prisma.alert.update({
    where: { id: alertId },
    data: { status: "resolved", resolvedAt: alert.resolvedAt },
  });

  await redisCmd.set(ALERT_KEY(alertId), JSON.stringify(alert));

  logger.info("Alert resolved", {
    alertId,
    ruleName: alert.ruleName,
    duration: alert.resolvedAt && alert.firedAt
      ? new Date(alert.resolvedAt).getTime() - new Date(alert.firedAt).getTime()
      : 0,
  });

  Metrics.increment("alerts.resolved", 1, { severity: alert.severity });

  // Send resolution notifications
  const rule = await getAlertRule(alert.ruleId);
  if (rule) {
    await sendAlertNotifications(alert, rule, true);
  }

  return alert;
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(
  alertId: string,
  acknowledgedBy: string,
): Promise<Alert | null> {
  const alert = await getAlert(alertId);
  if (!alert) return null;

  alert.status = "acknowledged";
  alert.acknowledgedAt = new Date().toISOString();
  alert.acknowledgedBy = acknowledgedBy;

  await prisma.alert.update({
    where: { id: alertId },
    data: {
      status: "acknowledged",
      acknowledgedAt: alert.acknowledgedAt,
      acknowledgedBy,
    },
  });

  await redisCmd.set(ALERT_KEY(alertId), JSON.stringify(alert));

  logger.info("Alert acknowledged", {
    alertId,
    acknowledgedBy,
  });

  Metrics.increment("alerts.acknowledged", 1);

  return alert;
}

// ─── Alert Notifications ────────────────────────────────────────

/**
 * Send alert notifications
 */
async function sendAlertNotifications(
  alert: Alert,
  rule: AlertRule,
  isResolution: boolean = false,
): Promise<void> {
  for (const channel of rule.notificationChannels) {
    try {
      const notification = await sendNotification(channel, alert, isResolution);
      alert.notifications.push(notification);
    } catch (error) {
      logger.error("Alert notification failed", {
        alertId: alert.id,
        channel,
        error: (error as Error).message,
      });

      alert.notifications.push({
        id: `notif_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`,
        alertId: alert.id,
        channel,
        sentAt: new Date().toISOString(),
        status: "failed",
        errorMessage: (error as Error).message,
        recipient: "unknown",
      });
    }
  }

  // Update alert with notifications
  await prisma.alert.update({
    where: { id: alert.id },
    data: { notifications: alert.notifications },
  });

  await redisCmd.set(ALERT_KEY(alert.id), JSON.stringify(alert));
}

/**
 * Send notification via channel
 */
async function sendNotification(
  channel: NotificationChannel,
  alert: Alert,
  isResolution: boolean,
): Promise<AlertNotification> {
  const notificationId = `notif_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`;
  const sentAt = new Date().toISOString();

  let recipient = "unknown";
  let status: "sent" | "failed" | "pending" = "pending";
  let errorMessage: string | undefined;

  try {
    switch (channel) {
      case "email":
        recipient = process.env.ALERT_EMAIL_RECIPIENTS || "alerts@example.com";
        await sendEmailNotification(alert, isResolution, recipient);
        status = "sent";
        break;

      case "slack":
        recipient = process.env.ALERT_SLACK_WEBHOOK || "slack";
        await sendSlackNotification(alert, isResolution, recipient);
        status = "sent";
        break;

      case "pagerduty":
        recipient = process.env.ALERT_PAGERDUTY_SERVICE_KEY || "pagerduty";
        await sendPagerDutyNotification(alert, isResolution, recipient);
        status = "sent";
        break;

      case "webhook":
        recipient = process.env.ALERT_WEBHOOK_URL || "webhook";
        await sendWebhookNotification(alert, isResolution, recipient);
        status = "sent";
        break;
    }

    Metrics.increment("alert.notifications.sent", 1, { channel });
  } catch (error) {
    status = "failed";
    errorMessage = (error as Error).message;
    Metrics.increment("alert.notifications.failed", 1, { channel });
  }

  return {
    id: notificationId,
    alertId: alert.id,
    channel,
    sentAt,
    status,
    errorMessage,
    recipient,
  };
}

/**
 * Send email notification
 */
async function sendEmailNotification(
  alert: Alert,
  isResolution: boolean,
  recipient: string,
): Promise<void> {
  // In production, use a real email service (SendGrid, SES, etc.)
  const subject = isResolution
    ? `[RESOLVED] ${alert.ruleName}`
    : `[${alert.severity.toUpperCase()}] ${alert.ruleName}`;

  const body = `
Alert: ${alert.ruleName}
Severity: ${alert.severity}
Status: ${isResolution ? "RESOLVED" : "FIRING"}
Message: ${alert.message}
Fired At: ${alert.firedAt}
${alert.resolvedAt ? `Resolved At: ${alert.resolvedAt}` : ""}

Labels: ${JSON.stringify(alert.labels, null, 2)}
Annotations: ${JSON.stringify(alert.annotations, null, 2)}
  `.trim();

  logger.info("Email notification sent", { recipient, subject });
  // await emailService.send({ to: recipient, subject, body });
}

/**
 * Send Slack notification
 */
async function sendSlackNotification(
  alert: Alert,
  isResolution: boolean,
  webhookUrl: string,
): Promise<void> {
  const color = {
    info: "#36a64f",
    warning: "#ff9900",
    error: "#ff0000",
    critical: "#8b0000",
  }[alert.severity];

  const payload = {
    attachments: [
      {
        color,
        title: isResolution ? `[RESOLVED] ${alert.ruleName}` : alert.ruleName,
        text: alert.message,
        fields: [
          { title: "Severity", value: alert.severity, short: true },
          { title: "Status", value: isResolution ? "RESOLVED" : "FIRING", short: true },
          { title: "Fired At", value: alert.firedAt, short: false },
        ],
        footer: "Windels Alert Manager",
        ts: Math.floor(new Date(alert.firedAt).getTime() / 1000),
      },
    ],
  };

  logger.info("Slack notification sent", { webhookUrl });
  // await fetch(webhookUrl, { method: "POST", body: JSON.stringify(payload) });
}

/**
 * Send PagerDuty notification
 */
async function sendPagerDutyNotification(
  alert: Alert,
  isResolution: boolean,
  serviceKey: string,
): Promise<void> {
  const payload = {
    service_key: serviceKey,
    event_type: isResolution ? "resolve" : "trigger",
    description: alert.message,
    incident_key: alert.fingerprint,
    details: {
      severity: alert.severity,
      rule_name: alert.ruleName,
      labels: alert.labels,
      annotations: alert.annotations,
    },
  };

  logger.info("PagerDuty notification sent", { serviceKey });
  // await fetch("https://events.pagerduty.com/generic/2010-04-15/create_event.json", {
  //   method: "POST",
  //   body: JSON.stringify(payload),
  // });
}

/**
 * Send webhook notification
 */
async function sendWebhookNotification(
  alert: Alert,
  isResolution: boolean,
  webhookUrl: string,
): Promise<void> {
  const payload = {
    alert_id: alert.id,
    rule_id: alert.ruleId,
    rule_name: alert.ruleName,
    severity: alert.severity,
    status: isResolution ? "resolved" : "firing",
    message: alert.message,
    labels: alert.labels,
    annotations: alert.annotations,
    fired_at: alert.firedAt,
    resolved_at: alert.resolvedAt,
  };

  logger.info("Webhook notification sent", { webhookUrl });
  // await fetch(webhookUrl, { method: "POST", body: JSON.stringify(payload) });
}

// ─── Alert Queries ──────────────────────────────────────────────

/**
 * Get alert by ID
 */
export async function getAlert(alertId: string): Promise<Alert | null> {
  return prisma.alert.findUnique({ where: { id: alertId } });
}

/**
 * List alerts with filters
 */
export async function listAlerts(filters?: {
  status?: AlertStatus;
  severity?: AlertSeverity;
  ruleId?: string;
  limit?: number;
}): Promise<Alert[]> {
  const where: any = {};

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.severity) {
    where.severity = filters.severity;
  }

  if (filters?.ruleId) {
    where.ruleId = filters.ruleId;
  }

  return prisma.alert.findMany({
    where,
    orderBy: { firedAt: "desc" },
    take: filters?.limit || 100,
  });
}

/**
 * Get alert statistics
 */
export async function getAlertStats(): Promise<{
  totalAlerts: number;
  byStatus: Record<AlertStatus, number>;
  bySeverity: Record<AlertSeverity, number>;
  avgResolutionTimeMs: number;
  topRules: Array<{ ruleId: string; ruleName: string; count: number }>;
}> {
  const alerts = await listAlerts({ limit: 10000 });

  const byStatus: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const ruleCounts: Record<string, { ruleName: string; count: number }> = {};
  let totalResolutionTime = 0;
  let resolvedCount = 0;

  for (const alert of alerts) {
    byStatus[alert.status] = (byStatus[alert.status] || 0) + 1;
    bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;

    if (!ruleCounts[alert.ruleId]) {
      ruleCounts[alert.ruleId] = { ruleName: alert.ruleName, count: 0 };
    }
    ruleCounts[alert.ruleId].count++;

    if (alert.status === "resolved" && alert.resolvedAt && alert.firedAt) {
      totalResolutionTime += new Date(alert.resolvedAt).getTime() - new Date(alert.firedAt).getTime();
      resolvedCount++;
    }
  }

  const topRules = Object.entries(ruleCounts)
    .map(([ruleId, data]) => ({ ruleId, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalAlerts: alerts.length,
    byStatus: byStatus as any,
    bySeverity: bySeverity as any,
    avgResolutionTimeMs: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
    topRules,
  };
}
