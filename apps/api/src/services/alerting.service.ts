import { prisma } from "../db/client.js";
import { resolveUserContext } from "./workspace.service.js";
import { EventBus } from "./eventBus.js";
import { AlertSeverity } from "@prisma/client";
import { createHmac, randomBytes } from "node:crypto";

export interface AlertRuleInput {
  name: string;
  event: string;
  condition?: string;
  severity?: AlertSeverity;
  channels?: ("EMAIL" | "WEBHOOK" | "IN_APP")[];
  enabled?: boolean;
}

export async function listAlertRules(userId: string) {
  const ctx = await resolveUserContext(userId);
  return prisma.alertRule.findMany({
    where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" },
  });
}

export async function createAlertRule(userId: string, input: AlertRuleInput) {
  const ctx = await resolveUserContext(userId);
  return prisma.alertRule.create({
    data: {
      organizationId: ctx.organizationId, createdById: userId,
      name: input.name, event: input.event,
      condition: input.condition,
      severity: input.severity ?? "WARNING",
      channels: input.channels ?? ["IN_APP"],
      enabled: input.enabled ?? true,
    },
  });
}

export async function updateAlertRule(userId: string, id: string, patch: Partial<AlertRuleInput> & { enabled?: boolean }) {
  const ctx = await resolveUserContext(userId);
  const r = await prisma.alertRule.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!r) throw Object.assign(new Error("Not found"), { status: 404 });
  return prisma.alertRule.update({ where: { id }, data: patch as any });
}

export async function deleteAlertRule(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const r = await prisma.alertRule.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!r) throw Object.assign(new Error("Not found"), { status: 404 });
  await prisma.alertRule.delete({ where: { id } });
}

export async function listAlerts(userId: string, opts?: { unreadOnly?: boolean }) {
  const ctx = await resolveUserContext(userId);
  const where: any = { organizationId: ctx.organizationId };
  if (opts?.unreadOnly) where.readAt = null;
  return prisma.alert.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 });
}

export async function markAlertsRead(userId: string) {
  const ctx = await resolveUserContext(userId);
  await prisma.alert.updateMany({
    where: { organizationId: ctx.organizationId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function dismissAlert(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const a = await prisma.alert.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!a) throw Object.assign(new Error("Not found"), { status: 404 });
  await prisma.alert.update({ where: { id }, data: { dismissedAt: new Date() } });
}

// ─── Alert engine: subscribe to events and fire alerts ─────────
export function startAlertEngine() {
  EventBus.on("*", async ({ event, payload }: any) => {
    try {
      const orgId = payload?.organizationId;
      if (!orgId) return;
      const rules = await prisma.alertRule.findMany({ where: { organizationId: orgId, enabled: true, event: { in: [event, "*"] } } });
      for (const rule of rules) {
        // MVP: if condition present, do a simple truthy field check (event.condition "key=value" etc.).
        if (rule.condition && !evalCondition(rule.condition, payload)) continue;
        const title = buildTitle(rule, event, payload);
        const alert = await prisma.alert.create({
          data: {
            organizationId: orgId, ruleId: rule.id,
            severity: rule.severity,
            title, event,
            message: typeof payload === "object" ? JSON.stringify(payload).slice(0, 500) : String(payload),
            metadata: payload ?? {},
          },
        });
        // Deliver the alert through the requested channels. EMAIL and WEBHOOK
        // use the existing SMTP relay and a configurable on-call webhook; both
        // are best-effort and never throw into the event loop.
        if (rule.channels.includes("EMAIL")) {
          void dispatchAlertEmail(alert.title, alert.message ?? "", rule.severity).catch((e) => console.warn("[alert] email dispatch failed:", (e as Error).message));
        }
        if (rule.channels.includes("WEBHOOK")) {
          void dispatchAlertWebhook(alert).catch((e) => console.warn("[alert] webhook dispatch failed:", (e as Error).message));
        }
        // IN_APP is always delivered via the alerts table itself
        void alert;
      }
    } catch (e) {
      console.warn("[alert engine] failed:", (e as Error).message);
    }
  });
}

/** Send an alert email through the configured SMTP relay (best-effort). */
async function dispatchAlertEmail(title: string, message: string, severity: AlertSeverity): Promise<void> {
  const to = process.env.WINDELS_ALERT_EMAIL;
  const host = process.env.WINDELS_SMTP_HOST;
  const port = Number(process.env.WINDELS_SMTP_PORT || 0);
  if (!to || !host || !port) return; // not configured — skip silently
  const { sendSmtp } = await import("../emailIntel/smtp.client.js");
  await sendSmtp({
    host, port,
    secure: process.env.WINDELS_SMTP_SECURE === "true",
    username: process.env.WINDELS_SMTP_USER ?? null,
    password: process.env.WINDELS_SMTP_PASS ?? null,
    from: process.env.WINDELS_MAIL_FROM ?? "no-reply@windels.ai",
    to: [to],
    subject: `[WINDELS ${severity}] ${title}`,
    text: [`Severity: ${severity}`, "", message ?? ""].join("\n"),
  });
}

/**
 * Dispatch an alert to the configured on-call paging webhook (PagerDuty /
 * Opsgenie-style generic endpoint). The payload is HMAC-SHA256 signed with the
 * optional shared secret so the receiver can verify it.
 */
async function dispatchAlertWebhook(alert: {
  id: string; title: string; severity: AlertSeverity; event: string | null;
  message: string | null; metadata: unknown; createdAt: Date;
}): Promise<void> {
  const url = process.env.WINDELS_ALERT_WEBHOOK_URL;
  if (!url) return; // no paging endpoint configured
  const body = JSON.stringify({
    id: alert.id,
    title: alert.title,
    severity: alert.severity,
    event: alert.event,
    message: alert.message ?? "",
    metadata: alert.metadata ?? {},
    firedAt: alert.createdAt.toISOString(),
  });
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Windels-Alert": "v1" };
  const secret = process.env.WINDELS_ALERT_WEBHOOK_SECRET;
  if (secret) {
    const ts = Math.floor(Date.now() / 1000);
    const mac = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    headers["X-Windels-Signature"] = `v1=${mac}`;
    headers["X-Windels-Timestamp"] = String(ts);
  }
  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`alert webhook returned ${res.status}`);
}

// Test-only hook so the dispatch path can be verified without a real event bus.
export const __test__dispatchWebhook = dispatchAlertWebhook;

function evalCondition(expr: string, payload: any): boolean {
  // expr like "failureCount>=3" or simple "status=failed"
  const m = expr.match(/^([\w.]+)\s*(>=|<=|==|>|<|=)\s*(.+)$/);
  if (!m) return true;
  const [, path, op, raw] = m;
  const left = path.split(".").reduce((o: any, k) => o?.[k], payload);
  let right: any = raw.trim();
  if (!isNaN(Number(right))) right = Number(right);
  else if (right === "true") right = true;
  else if (right === "false") right = false;
  else if (right.startsWith('"') && right.endsWith('"')) right = right.slice(1, -1);
  switch (op) {
    case "=":
    case "==": return left == right;
    case ">": return Number(left) > Number(right);
    case "<": return Number(left) < Number(right);
    case ">=": return Number(left) >= Number(right);
    case "<=": return Number(left) <= Number(right);
  }
  return true;
}

function buildTitle(rule: { name: string }, event: string, _payload: any) {
  return rule.name || `Alert: ${event}`;
}

// Built-in system rule: seed on first boot if none exist
export async function ensureDefaultAlerts(orgId: string, createdById: string) {
  const existing = await prisma.alertRule.count({ where: { organizationId: orgId } });
  if (existing > 0) return;
  const defaults = [
    { name: "Workflow failed", event: "workflow.run.failed", severity: AlertSeverity.CRITICAL, channels: ["IN_APP"] },
    { name: "AI error spike", event: "ai.error", severity: AlertSeverity.WARNING, channels: ["IN_APP"] },
    { name: "Webhook delivery failures", event: "webhook.delivery_failed", severity: AlertSeverity.WARNING, channels: ["IN_APP"] },
  ];
  for (const d of defaults) {
    await prisma.alertRule.create({ data: { organizationId: orgId, createdById, ...d } as any });
  }
}
