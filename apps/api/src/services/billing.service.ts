import { prisma } from "../db/client.js";
import { resolveUserContext } from "./workspace.service.js";
import { z } from "zod";

// Minimal billing stub for MVP. No external Stripe integration; allows
// admin/super_admin to view subscription, change plan, view invoices.
// Later sessions wire this to a real payment provider.

export const UpdateSubscriptionSchema = z.object({
  plan: z.enum(["starter", "pro", "team", "enterprise"]).optional(),
  seats: z.number().int().min(1).max(10_000).optional(),
  cycle: z.enum(["monthly", "annual"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one subscription field is required");

const PLAN_PRICES: Record<string, { monthly: number; annual: number; name: string }> = {
  starter: { monthly: 0, annual: 0, name: "Starter" },
  pro: { monthly: 2900, annual: 29000, name: "Pro" },
  team: { monthly: 4900, annual: 49000, name: "Team" },
  enterprise: { monthly: 0, annual: 0, name: "Enterprise" },
};

async function ensureSubscription(orgId: string) {
  let sub = await prisma.billingSubscription.findUnique({ where: { organizationId: orgId } });
  if (!sub) {
    sub = await prisma.billingSubscription.create({
      data: { organizationId: orgId, plan: "starter", seats: 5, cycle: "monthly" },
    });
  }
  return sub;
}

export async function getBilling(userId: string) {
  const ctx = await resolveUserContext(userId);
  const sub = await ensureSubscription(ctx.organizationId);
  const invoices = await prisma.invoice.findMany({
    where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 24,
  });
  const price = PLAN_PRICES[sub.plan] ?? PLAN_PRICES.starter;
  const monthlyRate = sub.cycle === "annual" ? Math.round(price.annual / 12) : price.monthly;
  return {
    subscription: {
      id: sub.id, plan: sub.plan, planName: price.name, status: sub.status, seats: sub.seats,
      cycle: sub.cycle, currentPeriodStart: sub.currentPeriodStart, currentPeriodEnd: sub.currentPeriodEnd,
      customerEmail: sub.customerEmail, monthlyRate,
    },
    plans: Object.entries(PLAN_PRICES).map(([id, p]) => ({ id, name: p.name, monthly: p.monthly, annual: p.annual })),
    invoices: invoices.map((i) => ({
      id: i.id, number: i.number, amountCents: i.amountCents, currency: i.currency, status: i.status,
      dueDate: i.dueDate, paidAt: i.paidAt, hostedUrl: i.hostedUrl, pdfUrl: i.pdfUrl, createdAt: i.createdAt,
    })),
  };
}

export async function updateSubscription(userId: string, input: z.infer<typeof UpdateSubscriptionSchema>) {
  const ctx = await resolveUserContext(userId);
  const sub = await ensureSubscription(ctx.organizationId);
  const plan = input.plan ?? sub.plan;
  const cycle = input.cycle ?? sub.cycle;
  const seats = input.seats ?? sub.seats;
  const price = PLAN_PRICES[plan] ?? PLAN_PRICES.starter;
  const amountCents = (cycle === "annual" ? price.annual : price.monthly) * Math.ceil(seats / 5);
  if (plan === sub.plan && cycle === sub.cycle && seats === sub.seats) {
    return { subscription: sub, unchanged: true };
  }
  // This is an internal invoice record, not payment capture. A payment-provider
  // webhook must confirm payment before this can be treated as revenue.
  if (plan !== "starter") {
    const num = `INV-${Date.now().toString().slice(-8)}`;
    await prisma.invoice.create({
      data: {
        organizationId: ctx.organizationId,
        subscriptionId: sub.id,
        number: num,
        amountCents,
        currency: "USD",
        status: "open",
        dueDate: new Date(Date.now() + 7 * 86_400_000),
        lines: [{ plan, seats, cycle, amountCents }],
      },
    });
  }
  const updated = await prisma.billingSubscription.update({
    where: { id: sub.id },
    data: {
      plan,
      cycle,
      seats,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + (cycle === "annual" ? 365 : 30) * 86_400_000),
    },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      userId,
      action: "billing.subscription.changed",
      resourceType: "BillingSubscription",
      resourceId: sub.id,
      metadata: { previous: { plan: sub.plan, cycle: sub.cycle, seats: sub.seats }, next: { plan, cycle, seats }, amountCents },
    },
  });
  return { subscription: updated, paymentRequired: plan !== "starter" };
}

export async function getPredictiveAnalytics(userId: string) {
  const ctx = await resolveUserContext(userId);
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86_400_000);

  const [runs30, messages30, convs30, tasks30, agents30] = await Promise.all([
    prisma.workflowRun.count({ where: { workflow: { organizationId: ctx.organizationId }, createdAt: { gte: since30 } } }),
    prisma.talkMessage.count({ where: { channel: { organizationId: ctx.organizationId }, createdAt: { gte: since30 } } }),
    prisma.conversation.count({ where: { organizationId: ctx.organizationId, createdAt: { gte: since30 } } }),
    prisma.task.count({ where: { organizationId: ctx.organizationId, createdAt: { gte: since30 } } }),
    prisma.agent.count({ where: { organizationId: ctx.organizationId } }),
  ]);

  // Simple linear projection: next 30 days = last 30 days * small growth factor
  const growth = 1.08;
  return {
    period: { since: since30, until: now },
    usage: { workflows30d: runs30, messages30d: messages30, conversations30d: convs30, tasks30d: tasks30, agentsActive: agents30 },
    forecast30d: {
      workflows: Math.round(runs30 * growth),
      messages: Math.round(messages30 * growth),
      conversations: Math.round(convs30 * growth),
      tasks: Math.round(tasks30 * growth),
    },
    insights: [
      runs30 > 10 ? "Your team is using Flow heavily — consider adding retries and monitoring." : "Try building your first automated workflow.",
      agents30 >= 3 ? "AI workforce is established — review memory quality weekly." : "Add more AI employees to increase automation coverage.",
      messages30 > 50 ? "Talk is driving collaboration. Use @mentions to route questions to agents." : "Start using Talk for team & AI chat to build context.",
    ],
  };
}
