import { randomBytes, createHmac } from "node:crypto";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { EventBus } from "./eventBus.js";
import { z } from "zod";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:webhook');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


export const CreateWebhookSchema = z.object({
  url: z.string().url(),
  description: z.string().max(500).optional(),
  events: z.array(z.string()).default(["*"]),
});

export const UpdateWebhookSchema = z.object({
  url: z.string().url().optional(),
  description: z.string().max(500).optional(),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export const WEBHOOK_EVENTS = [
  "*",
  // Workflow
  "workflow.run.started",
  "workflow.run.succeeded",
  "workflow.run.failed",
  "workflow.run.waiting_approval",
  "workflow.completed",
  "workflow.failed",
  // Agents / AI jobs
  "agent.task.completed",
  "agent.completed",
  "agent.failed",
  "agent.started",
  "agent.run.started",
  "agent.run.requires_action",
  "agent.run.completed",
  "agent.run.failed",
  "agent.run.cancelled",
  "ai.job.completed",
  "ai.job.failed",
  // Messaging / collaboration
  "task.created",
  "task.completed",
  "message.created",
  "ai.request",
  "ai.error",
  // Media generation
  "media.generated",
  "media.failed",
  "video.generated",
  "music.generated",
  // Billing & payments
  "payment.received",
  "payment.failed",
  "subscription.changed",
  "invoice.created",
  "gift_card.redeemed",
  // Trading & market
  "trading.signal",
  "trading.execution",
  "market.data",
  // System
  "user.event",
  "subscription.event",
  "webhook.delivery_failed",
  "integration.connected",
] as const;

function genSecret() {
  return "whsec_" + randomBytes(24).toString("base64url");
}

function signPayload(secret: string, payload: string, timestamp: number) {
  const mac = createHmac("sha256", secret);
  mac.update(`${timestamp}.${payload}`);
  return "v1=" + mac.digest("hex");
}

export async function listWebhooks(userId: string) {
  const ctx = await resolveUserContext(userId);
  const whs = await prisma.webhookEndpoint.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { include: { profile: true } }, _count: { select: { deliveries: true } } },
  });
  return whs.map((w: any) => ({
    id: w.id, url: w.url, description: w.description, events: w.events, active: w.active,
    failureCount: w.failureCount, lastDeliveryAt: w.lastDeliveryAt, lastStatus: w.lastStatus,
    deliveriesCount: w._count.deliveries,
    createdBy: { id: w.createdBy.id, displayName: w.createdBy.profile?.displayName ?? w.createdBy.email },
    createdAt: w.createdAt,
  }));
}

export async function createWebhook(userId: string, input: z.infer<typeof CreateWebhookSchema>) {
  const ctx = await resolveUserContext(userId);
  const w = await prisma.webhookEndpoint.create({
    data: {
      organizationId: ctx.organizationId,
      createdById: userId,
      url: input.url,
      description: input.description,
      events: input.events,
      secret: genSecret(),
    },
  });
  return { id: w.id, url: w.url, secret: w.secret, events: w.events, createdAt: w.createdAt };
}

export async function updateWebhook(userId: string, id: string, input: z.infer<typeof UpdateWebhookSchema>) {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.webhookEndpoint.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!existing) throw AppError.notFound("Webhook not found");
  return prisma.webhookEndpoint.update({ where: { id }, data: input });
}

export async function deleteWebhook(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.webhookEndpoint.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!existing) throw AppError.notFound("Webhook not found");
  await prisma.webhookEndpoint.delete({ where: { id } });
}

export async function listDeliveries(userId: string, webhookId: string) {
  const ctx = await resolveUserContext(userId);
  const wh = await prisma.webhookEndpoint.findFirst({ where: { id: webhookId, organizationId: ctx.organizationId } });
  if (!wh) throw AppError.notFound("Webhook not found");
  const del = await prisma.webhookDelivery.findMany({
    where: { webhookId }, orderBy: { createdAt: "desc" }, take: 50,
  });
  return del;
}

// ─── Dispatch ──────────────────────────────────────────────────
export async function dispatchEvent(organizationId: string, event: string, payload: Record<string, any>) {
  const targets = await prisma.webhookEndpoint.findMany({
    where: { organizationId, active: true, OR: [{ events: { has: "*" } }, { events: { has: event } }] },
  });
  for (const wh of targets) {
    const body = JSON.stringify({ id: `evt_${Date.now()}_${_rng.next().toString(36).slice(2, 8)}`, event, data: payload, created: new Date().toISOString() });
    const ts = Math.floor(Date.now() / 1000);
    const signature = signPayload(wh.secret, body, ts);
    const del = await prisma.webhookDelivery.create({
      data: { webhookId: wh.id, event, payload: payload as any, nextRetryAt: new Date() },
    });
    // Fire-and-forget delivery in background
    deliver(wh.id, del.id, body, signature, ts).catch((e) => console.warn("[webhook] delivery failed:", e?.message));
  }
}

async function deliver(webhookId: string, deliveryId: string, body: string, signature: string, ts: number, attempt = 1) {
  const wh = await prisma.webhookEndpoint.findUnique({ where: { id: webhookId } });
  if (!wh) return;
  let status: number | null = null;
  let responseBody: string | null = null;
  try {
    const resp = await fetch(wh.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Windels-Webhook/1.0",
        "Windels-Signature": signature,
        "Windels-Timestamp": String(ts),
        "Windels-Event": (JSON.parse(body) as any).event,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    status = resp.status;
    responseBody = (await resp.text()).slice(0, 2000);
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status, responseBody, attempts: attempt, deliveredAt: new Date(), nextRetryAt: null },
    });
    await prisma.webhookEndpoint.update({
      where: { id: webhookId },
      data: { lastDeliveryAt: new Date(), lastStatus: status, failureCount: resp.ok ? 0 : { increment: 1 } },
    });
    if (!resp.ok && attempt < 5) {
      const delay = Math.pow(2, attempt) * 1000;
      const next = new Date(Date.now() + delay);
      await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { nextRetryAt: next } });
      setTimeout(() => deliver(webhookId, deliveryId, body, signature, ts, attempt + 1), delay);
    } else if (!resp.ok && attempt >= 5) {
      const orgId = wh.organizationId;
      EventBus.emit("webhook.delivery_failed", { webhookId, deliveryId, organizationId: orgId, status, event: (JSON.parse(body) as any).event, failureCount: wh.failureCount + 1 }).catch(() => {});
    }
  } catch (e: any) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status, responseBody: e?.message ?? "network error", attempts: attempt },
    });
    const updated = await prisma.webhookEndpoint.update({ where: { id: webhookId }, data: { failureCount: { increment: 1 } } });
    if (attempt < 5) {
      const delay = Math.pow(2, attempt) * 1000;
      const next = new Date(Date.now() + delay);
      await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { nextRetryAt: next } });
      setTimeout(() => deliver(webhookId, deliveryId, body, signature, ts, attempt + 1), delay);
    } else {
      EventBus.emit("webhook.delivery_failed", { webhookId, deliveryId, organizationId: wh.organizationId, error: e?.message, failureCount: updated.failureCount }).catch(() => {});
    }
  }
}
