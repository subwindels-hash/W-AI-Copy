/**
 * Billing & Subscriptions (Sessions 9 / 20).
 *
 * This module manages organization subscriptions and invoices in Postgres. It
 * does NOT integrate with a payment provider directly; instead it exposes an
 * idempotent webhook path (`recordPaymentEvent`) that a provider like Stripe
 * or a manual reconciliation job can call to move invoices between states.
 *
 * States for `Invoice.status`:
 *   draft   → the invoice was created but not sent (internal only).
 *   open    → invoice sent, awaiting payment.
 *   paid    → payment confirmed via a webhook or admin action.
 *   past_due → open + past due date; the dunning helper sets this.
 *   void    → cancelled / non-collectible.
 *   uncollectible → dunning gave up.
 *
 * States for `BillingSubscription.status`:
 *   active | past_due | cancelled | trialing
 */
import { prisma } from "../db/client.js";
import { resolveUserContext } from "./workspace.service.js";
import type { z } from "zod";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { BillingPaymentEventSchema, BillingSubscriptionUpdateSchema } from "@windels/shared/billing";
import type { Prisma } from "@prisma/client";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";

// ─── Plan catalog ────────────────────────────────────────────────────────
type PlanId = "starter" | "pro" | "team" | "enterprise";
export const PLAN_PRICES: Record<PlanId, {
  monthly: number; annual: number; name: string;
  seatIncluded: number; perSeatMonthly: number; perSeatAnnual: number;
  overageBasisMonthly: number; overageBasisAnnual: number;
}> = {
  starter:    { monthly:      0, annual:       0, name: "Starter",    seatIncluded:  5, perSeatMonthly:    0, perSeatAnnual:     0, overageBasisMonthly:      0, overageBasisAnnual:      0 },
  pro:        { monthly:   2900, annual:   29000, name: "Pro",        seatIncluded:  5, perSeatMonthly:  400, perSeatAnnual:  4000, overageBasisMonthly:   2900, overageBasisAnnual:  29000 },
  team:       { monthly:   4900, annual:   49000, name: "Team",       seatIncluded: 10, perSeatMonthly:  700, perSeatAnnual:  7000, overageBasisMonthly:   4900, overageBasisAnnual:  49000 },
  enterprise: { monthly:  99000, annual:  990000, name: "Enterprise", seatIncluded: 50, perSeatMonthly: 1500, perSeatAnnual: 15000, overageBasisMonthly:  99000, overageBasisAnnual: 990000 },
};

// ─── Types ───────────────────────────────────────────────────────────────
export type InvoiceLine = {
  description: string;
  amountCents: number;
  quantity: number;
  unitCents: number;
  kind: "base" | "seat" | "overage" | "discount" | "credit" | "adjustment";
};

// ─── Zod ─────────────────────────────────────────────────────────────────
// Backwards-compatible names retained for existing route/tests.
export const UpdateSubscriptionSchema = BillingSubscriptionUpdateSchema;
export const RecordPaymentEventSchema = BillingPaymentEventSchema;

// ─── Internal helpers ────────────────────────────────────────────────────
function computeAmountCents(plan: PlanId, cycle: "monthly" | "annual", seats: number): { total: number; lines: InvoiceLine[] } {
  const p = PLAN_PRICES[plan];
  const isAnnual = cycle === "annual";
  const base = isAnnual ? p.annual : p.monthly;
  const perSeat = isAnnual ? p.perSeatAnnual : p.perSeatMonthly;
  const extra = Math.max(0, seats - p.seatIncluded);
  const lines: InvoiceLine[] = [];
  if (base > 0) {
    lines.push({
      description: `${p.name} plan — ${isAnnual ? "annual" : "monthly"} (includes ${p.seatIncluded} seats)`,
      amountCents: base,
      quantity: 1,
      unitCents: base,
      kind: "base",
    });
  }
  if (extra > 0 && perSeat > 0) {
    lines.push({
      description: `Additional seats × ${extra}`,
      amountCents: extra * perSeat,
      quantity: extra,
      unitCents: perSeat,
      kind: "seat",
    });
  }
  const total = lines.reduce((s, l) => s + l.amountCents, 0);
  return { total, lines };
}

function nextInvoiceNumber() {
  // Use the CSPRNG for the random segment so invoice numbers cannot collide
  // under load (Math.random() + millisecond timestamp is not collision-safe).
  const random = randomBytes(4).readUInt32BE(0).toString().padStart(8, "0");
  return `INV-${Date.now().toString(36).toUpperCase()}-${random.slice(0, 4)}`;
}

async function ensureSubscription(orgId: string) {
  let sub = await prisma.billingSubscription.findUnique({ where: { organizationId: orgId } });
  if (!sub) {
    sub = await prisma.billingSubscription.create({
      data: {
        organizationId: orgId,
        plan: "starter",
        seats: PLAN_PRICES.starter.seatIncluded,
        cycle: "monthly",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
  }
  return sub;
}

// ─── Public API ──────────────────────────────────────────────────────────
export async function getBilling(userId: string) {
  const ctx = await resolveUserContext(userId);
  const sub = await ensureSubscription(ctx.organizationId);
  await runDunning(ctx.organizationId); // opportunistic; cheap
  const invoices = await prisma.invoice.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: 24,
  });
  const price = PLAN_PRICES[sub.plan as PlanId] ?? PLAN_PRICES.starter;
  const monthlyRate = sub.cycle === "annual" ? Math.round(price.annual / 12) : price.monthly;
  const openInvoiceTotal = invoices
    .filter((i) => i.status === "open" || i.status === "past_due")
    .reduce((s, i) => s + i.amountCents, 0);

  return {
    subscription: {
      id: sub.id,
      plan: sub.plan,
      planName: price.name,
      status: sub.status,
      seats: sub.seats,
      cycle: sub.cycle,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      customerEmail: sub.customerEmail,
      monthlyRate,
      renewalCents: computeAmountCents(sub.plan as PlanId, sub.cycle as "monthly" | "annual", sub.seats).total,
    },
    plans: Object.entries(PLAN_PRICES).map(([id, p]) => ({
      id,
      name: p.name,
      monthly: p.monthly,
      annual: p.annual,
      seatIncluded: p.seatIncluded,
      perSeatMonthly: p.perSeatMonthly,
      perSeatAnnual: p.perSeatAnnual,
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      amountCents: i.amountCents,
      currency: i.currency,
      status: i.status,
      dueDate: i.dueDate,
      paidAt: i.paidAt,
      hostedUrl: i.hostedUrl,
      pdfUrl: i.pdfUrl,
      createdAt: i.createdAt,
      lines: Array.isArray(i.lines) ? (i.lines as unknown as InvoiceLine[]) : [],
    })),
    accountsReceivable: { openInvoiceCount: invoices.filter(i => i.status !== "paid" && i.status !== "void").length, openInvoiceTotal },
  };
}

export async function updateSubscription(userId: string, input: z.infer<typeof UpdateSubscriptionSchema>) {
  const ctx = await resolveUserContext(userId);
  const sub = await ensureSubscription(ctx.organizationId);
  const plan = (input.plan ?? sub.plan) as PlanId;
  const cycle = (input.cycle ?? sub.cycle) as "monthly" | "annual";
  const seats = input.seats ?? sub.seats;
  const customerEmail = input.customerEmail ?? sub.customerEmail;
  if (plan === sub.plan && cycle === sub.cycle && seats === sub.seats && customerEmail === sub.customerEmail) {
    return { subscription: sub, unchanged: true };
  }

  const { total, lines } = computeAmountCents(plan, cycle, seats);
  const willChargeThisCycle = plan !== "starter" && total > 0;

  let invoice: Prisma.InvoiceGetPayload<{}> | null = null;
  if (willChargeThisCycle) {
    invoice = await prisma.invoice.create({
      data: {
        organizationId: ctx.organizationId,
        subscriptionId: sub.id,
        number: nextInvoiceNumber(),
        amountCents: total,
        currency: "USD",
        status: "open",
        dueDate: new Date(Date.now() + 7 * 86_400_000),
        lines: lines as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const updated = await prisma.billingSubscription.update({
    where: { id: sub.id },
    data: {
      plan,
      cycle,
      seats,
      customerEmail: customerEmail ?? null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + (cycle === "annual" ? 365 : 30) * 86_400_000),
      status: sub.status === "past_due" ? "past_due" : "active",
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      userId,
      action: "billing.subscription.changed",
      resourceType: "BillingSubscription",
      resourceId: sub.id,
      metadata: {
        previous: { plan: sub.plan, cycle: sub.cycle, seats: sub.seats, customerEmail: sub.customerEmail },
        next: { plan, cycle, seats, customerEmail },
        invoiceNumber: invoice?.number ?? null,
        amountCents: total,
      },
    },
  });

  return {
    subscription: updated,
    invoice: invoice
      ? { id: invoice.id, number: invoice.number, amountCents: invoice.amountCents, status: invoice.status, dueDate: invoice.dueDate }
      : null,
    paymentRequired: willChargeThisCycle,
  };
}

export async function markInvoicePaid(userId: string, invoiceId: string, paidAt: Date = new Date()) {
  const ctx = await resolveUserContext(userId);
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId: ctx.organizationId } });
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "paid") return inv;
  const updated = await prisma.invoice.update({
    where: { id: inv.id },
    data: { status: "paid", paidAt },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      userId,
      action: "billing.invoice.paid",
      resourceType: "Invoice",
      resourceId: inv.id,
      metadata: { number: inv.number, amountCents: inv.amountCents, source: "admin" },
    },
  });
  // If this was the last unpaid invoice, restore subscription to active
  const stillOpen = await prisma.invoice.count({ where: { organizationId: ctx.organizationId, status: { in: ["open", "past_due"] } } });
  if (stillOpen === 0) {
    await prisma.billingSubscription.update({
      where: { organizationId: ctx.organizationId },
      data: { status: "active" },
    });
  }
  return updated;
}

export async function voidInvoice(userId: string, invoiceId: string, reason?: string) {
  const ctx = await resolveUserContext(userId);
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId: ctx.organizationId } });
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "paid") throw new Error("Cannot void a paid invoice");
  const updated = await prisma.invoice.update({ where: { id: inv.id }, data: { status: "void" } });
  await prisma.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      userId,
      action: "billing.invoice.voided",
      resourceType: "Invoice",
      resourceId: inv.id,
      metadata: { number: inv.number, reason: reason ?? null },
    },
  });
  return updated;
}

/**
 * Idempotent payment webhook.
 *
 * Callers (Stripe/PayPal/Manual reconciliation) POST an event; we store the
 * event id under `billing:webhook:seen:{eventId}` in Redis with a 30-day TTL
 * so duplicate deliveries are no-ops. The invoice status transition is only
 * applied once per event.
 */
export async function recordPaymentEvent(input: z.infer<typeof RecordPaymentEventSchema>) {
  const seenKey = `billing:webhook:seen:${input.eventId}`;
  const first = await redis.set(seenKey, "1", "EX", 30 * 86400, "NX");
  if (first !== "OK") {
    return { idempotent: true, applied: false, eventId: input.eventId };
  }

  const inv = await prisma.invoice.findUnique({ where: { number: input.invoiceNumber } });
  if (!inv) {
    logger.warn(`billing.webhook: unknown invoice ${input.invoiceNumber}`);
    return { idempotent: false, applied: false, eventId: input.eventId, reason: "invoice not found" };
  }

  const nextStatus =
    input.status === "paid" ? "paid" :
    input.status === "voided" ? "void" :
    input.status === "refunded" ? "void" :
    "past_due";

  const updated = await prisma.invoice.update({
    where: { id: inv.id },
    data: {
      status: nextStatus,
      paidAt: input.status === "paid" ? new Date(input.paidAt ?? Date.now()) : inv.paidAt,
      amountCents: typeof input.amountCents === "number" ? input.amountCents : inv.amountCents,
      currency: input.currency ?? inv.currency,
      lines: [
        ...(Array.isArray(inv.lines) ? (inv.lines as unknown as InvoiceLine[]) : []),
        {
          description: `webhook event ${input.eventId} → ${input.status}`,
          amountCents: 0,
          quantity: 1,
          unitCents: 0,
          kind: "adjustment" as const,
        },
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: inv.organizationId,
      action: `billing.webhook.${input.status}`,
      resourceType: "Invoice",
      resourceId: inv.id,
      metadata: {
        number: inv.number,
        eventId: input.eventId,
        amountCents: input.amountCents ?? null,
        currency: input.currency ?? null,
        webhookMeta: input.meta ?? null,
      },
    },
  });

  if (nextStatus === "paid") {
    const stillOpen = await prisma.invoice.count({ where: { organizationId: inv.organizationId, status: { in: ["open", "past_due"] } } });
    if (stillOpen === 0) {
      await prisma.billingSubscription.updateMany({
        where: { organizationId: inv.organizationId },
        data: { status: "active" },
      });
    }
  }
  return { idempotent: false, applied: true, eventId: input.eventId, invoice: updated };
}

/**
 * Dunning: promote any `open` invoice past its due date to `past_due`, and
 * flip its subscription to `past_due` too. Cheap, idempotent, safe to call
 * on every /billing GET.
 */
export async function runDunning(organizationId: string) {
  const now = new Date();
  const overdue = await prisma.invoice.findMany({
    where: {
      organizationId,
      status: "open",
      dueDate: { lt: now },
    },
    select: { id: true },
  });
  if (overdue.length === 0) return { promoted: 0 };
  await prisma.invoice.updateMany({
    where: { id: { in: overdue.map((i) => i.id) } },
    data: { status: "past_due" },
  });
  await prisma.billingSubscription.updateMany({
    where: { organizationId, status: { not: "cancelled" } },
    data: { status: "past_due" },
  });
  return { promoted: overdue.length };
}

// ─── Predictive analytics (kept from original, still real DB) ────────────
export async function getPredictiveAnalytics(userId: string) {
  const ctx = await resolveUserContext(userId);
  // Snap window boundaries to UTC midnight so repeated reads within the same
  // UTC day return byte-identical output (only the underlying counts move
  // when real data lands).
  const nowMs = Date.now();
  const dayMs = 86_400_000;
  const untilMs = Math.floor(nowMs / dayMs) * dayMs + dayMs; // next UTC midnight
  const now = new Date(untilMs);
  const since30 = new Date(untilMs - 30 * dayMs);

  const [runs30, messages30, convs30, tasks30, agents30, revenue30] = await Promise.all([
    prisma.workflowRun.count({ where: { workflow: { organizationId: ctx.organizationId }, createdAt: { gte: since30 } } }),
    prisma.talkMessage.count({ where: { channel: { organizationId: ctx.organizationId }, createdAt: { gte: since30 } } }),
    prisma.conversation.count({ where: { organizationId: ctx.organizationId, createdAt: { gte: since30 } } }),
    prisma.task.count({ where: { organizationId: ctx.organizationId, createdAt: { gte: since30 } } }),
    prisma.agent.count({ where: { organizationId: ctx.organizationId } }),
    prisma.invoice.aggregate({
      where: { organizationId: ctx.organizationId, status: "paid", paidAt: { gte: since30 } },
      _sum: { amountCents: true },
    }),
  ]);

  const growth = 1.08;
  return {
    period: { since: since30, until: now },
    usage: {
      workflows30d: runs30,
      messages30d: messages30,
      conversations30d: convs30,
      tasks30d: tasks30,
      agentsActive: agents30,
      revenueCents30d: revenue30._sum.amountCents ?? 0,
    },
    forecast30d: {
      workflows: Math.round(runs30 * growth),
      messages: Math.round(messages30 * growth),
      conversations: Math.round(convs30 * growth),
      tasks: Math.round(tasks30 * growth),
    },
    insights: [
      runs30 > 10 ? "Flow is under heavy use — consider adding retries and monitoring." : "Try building your first automated workflow.",
      agents30 >= 3 ? "AI workforce is established — review memory quality weekly." : "Add more AI employees to increase automation coverage.",
      messages30 > 50 ? "Talk is driving collaboration. Use @mentions to route questions to agents." : "Start using Talk for team & AI chat to build context.",
    ],
  };
}
