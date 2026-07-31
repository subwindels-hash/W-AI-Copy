import { prisma } from "../db/client.js";
import { resolveUserContext } from "./workspace.service.js";
import { EventBus } from "./eventBus.js";
import { AlertSeverity } from "@prisma/client";

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
        // If channels include EMAIL or WEBHOOK, dispatch later (MVP stub logs only)
        if (rule.channels.includes("EMAIL")) console.log(`[alert] would email: ${title}`);
        if (rule.channels.includes("WEBHOOK")) console.log(`[alert] would webhook: ${title}`);
        // IN_APP is always delivered via the alerts table itself
        void alert;
      }
    } catch (e) {
      console.warn("[alert engine] failed:", (e as Error).message);
    }
  });
}

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
