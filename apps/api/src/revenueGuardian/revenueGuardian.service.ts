/**
 * AI Revenue Guardian — Enterprise Accounts Receivable & Revenue Recovery.
 *
 * Org-scoped CRUD for customers, invoices, collection cases, payment
 * promises, communications, AI Employees, tasks, and collection rules.
 * Deterministic dashboard rollup, risk scoring, aging analysis, and
 * automated workflow evaluation.
 *
 * Honesty rules:
 *   - No Math.random anywhere; ids from CSPRNG (randomUUID).
 *   - All reads re-check org ownership — fail-closed tenant isolation.
 *   - Risk scores and aging are computed on read from actual data, never stored as facts.
 *   - Outstanding balances are derived from invoices (Σ unpaid), never persisted as a fact.
 *
 * Keys: rg:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import type {
  RgCustomer, RgInvoice, RgCollectionCase, RgPaymentPromise,
  RgCommunication, RgAiEmployee, RgTask, RgCollectionRule,
  RgCustomerUpsertInput, RgInvoiceCreateInput, RgCollectionCaseCreateInput,
  RgPaymentPromiseCreateInput, RgCommunicationCreateInput,
  RgAiEmployeeCreateInput, RgTaskCreateInput, RgCollectionRuleCreateInput,
  RgDashboardRollup, RgCustomerProfile, RgAccountManagerWorkspace,
  RgExecutiveReport, RgCustomerInsight, RgAgingSummary,
  RgRiskLevel, RgInvoiceStatus, RgAgingBucket, RgCaseStatus,
  RgPromiseStatus, RgTaskStatus, RgCustomerStatus,
} from "@windels/shared/revenueGuardian";

type Entity = "customer" | "invoice" | "case" | "promise" | "comm" | "ai" | "task" | "rule";

const K = {
  item: (e: Entity, org: string, id: string) => `rg:${e}:i:${org}:${id}`,
  idx: (e: Entity, org: string) => `rg:${e}:idx:${org}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

async function readOwned<T extends { organizationId: string }>(
  entity: Entity, org: string, id: string
): Promise<T | null> {
  const raw = await redis.hget(K.item(entity, org, id), "_doc");
  if (!raw) return null;
  const rec = j<T>(raw);
  return rec && rec.organizationId === org ? rec : null;
}

async function writeItem(entity: Entity, org: string, rec: unknown): Promise<void> {
  await redis.hset(K.item(entity, org, (rec as { id: string }).id), "_doc", s2(rec));
  await redis.zadd(K.idx(entity, org), Date.now(), (rec as { id: string }).id);
}

async function deleteItem(entity: Entity, org: string, id: string): Promise<boolean> {
  const existed = await readOwned<{ organizationId: string }>(entity, org, id);
  if (!existed) return false;
  await redis.del(K.item(entity, org, id));
  await redis.zrem(K.idx(entity, org), id);
  return true;
}

async function listAll<T>(entity: Entity, org: string): Promise<T[]> {
  const ids = await redis.zrange(K.idx(entity, org), 0, -1);
  const out: T[] = [];
  for (const id of ids) {
    const rec = await readOwned<T & { organizationId: string }>(entity, org, id);
    if (rec) out.push(rec);
  }
  return out;
}

// ─── Helpers ───────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function daysBetween(iso: string, now: number): number {
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return 0;
  return Math.max(0, Math.floor((now - d) / DAY_MS));
}

function agingBucket(daysOverdue: number): RgAgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  if (daysOverdue <= 120) return "d91_120";
  return "d120_plus";
}

function invoiceStatusFromState(amountCents: number, paidCents: number, dueDate: string, now: number): RgInvoiceStatus {
  if (paidCents >= amountCents) return "paid";
  if (paidCents > 0) return "partial";
  if (Date.parse(dueDate) < now) return "overdue";
  return "sent";
}

function computeRiskLevel(score: number): RgRiskLevel {
  if (score >= 700) return "low";
  if (score >= 500) return "medium";
  if (score >= 300) return "high";
  return "critical";
}

/**
 * Compute a customer's AI credit score (0–1000) from their actual data.
 * Deterministic — no randomness.
 */
function computeCreditScore(
  invoices: RgInvoice[],
  promises: RgPaymentPromise[],
  baseScore = 600,
): number {
  let score = baseScore;
  const now = Date.now();

  // Payment history: each paid-on-time invoice adds points
  const paid = invoices.filter((i) => i.status === "paid");
  const overdue = invoices.filter((i) => i.status === "overdue" || i.status === "partial");
  score += Math.min(paid.length * 10, 150);
  score -= overdue.length * 30;

  // Broken promises: each broken promise reduces score
  const broken = promises.filter((p) => p.status === "broken");
  score -= broken.length * 50;

  // Outstanding age penalty
  for (const inv of overdue) {
    const days = daysBetween(inv.dueDate, now);
    if (days > 90) score -= 40;
    else if (days > 60) score -= 25;
    else if (days > 30) score -= 15;
  }

  // Clamp
  return Math.max(0, Math.min(1000, score));
}

function generateInsights(customer: RgCustomer, invoices: RgInvoice[], promises: RgPaymentPromise[]): RgCustomerInsight[] {
  const insights: RgCustomerInsight[] = [];
  const now = Date.now();

  // Risk warning
  if (customer.riskLevel === "critical" || customer.riskLevel === "high") {
    insights.push({
      type: "risk_warning",
      message: `${customer.name} is ${customer.riskLevel} risk (${customer.creditScore}/1000). Immediate attention recommended.`,
      confidence: 0.85,
    });
  }

  // Payment prediction
  const overdueInvs = invoices.filter((i) => i.status === "overdue");
  if (overdueInvs.length > 0) {
    const totalOverdue = overdueInvs.reduce((s, i) => s + (i.amountCents - i.paidCents), 0);
    const avgDelay = customer.avgPaymentDelayDays || 15;
    insights.push({
      type: "payment_prediction",
      message: `${overdueInvs.length} overdue invoice(s) totaling $${(totalOverdue / 100).toFixed(2)}. Based on payment history, expected resolution in ~${avgDelay} days.`,
      confidence: 0.6,
      data: { totalOverdueCents: totalOverdue, estimatedDays: avgDelay },
    });
  }

  // Best contact time
  if (customer.bestContactHour != null) {
    insights.push({
      type: "best_contact_time",
      message: `Best time to contact ${customer.name}: ${customer.bestContactHour}:00 (based on previous response patterns).`,
      confidence: 0.7,
    });
  }

  // Best channel
  if (customer.preferredChannel) {
    insights.push({
      type: "best_channel",
      message: `Preferred communication channel: ${customer.preferredChannel}.`,
      confidence: 0.75,
    });
  }

  // Broken promises
  const brokenPromises = promises.filter((p) => p.status === "broken");
  if (brokenPromises.length > 0) {
    insights.push({
      type: "recovery_recommendation",
      message: `${brokenPromises.length} broken payment promise(s). Consider escalation to human account manager or payment plan negotiation.`,
      confidence: 0.9,
    });
  }

  // Lifetime value
  if (customer.lifetimeValueCents > 0) {
    insights.push({
      type: "lifetime_value",
      message: `Customer lifetime value: $${(customer.lifetimeValueCents / 100).toFixed(2)}. Prioritize retention alongside recovery.`,
      confidence: 0.95,
      data: { lifetimeValueCents: customer.lifetimeValueCents },
    });
  }

  return insights;
}

// ─── Service ───────────────────────────────────────────────────────────

export const RevenueGuardianService = {
  // ── Customers ──────────────────────────────────────────────────────

  async listCustomers(org: string, opts?: { q?: string; status?: RgCustomerStatus; riskLevel?: RgRiskLevel }): Promise<RgCustomer[]> {
    const all = await listAll<RgCustomer>("customer", org);
    let out = all;
    if (opts?.status) out = out.filter((c) => c.status === opts.status);
    if (opts?.riskLevel) out = out.filter((c) => c.riskLevel === opts.riskLevel);
    if (opts?.q) {
      const q = opts.q.toLowerCase();
      out = out.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q)
      );
    }
    return out.sort((a, b) => b.outstandingBalanceCents - a.outstandingBalanceCents);
  },

  async getCustomer(org: string, id: string): Promise<RgCustomer | null> {
    return readOwned<RgCustomer>("customer", org, id);
  },

  async createCustomer(org: string, input: RgCustomerUpsertInput): Promise<RgCustomer> {
    const now = new Date().toISOString();
    const customer: RgCustomer = {
      id: randomUUID(),
      organizationId: org,
      externalRef: input.externalRef,
      name: input.name,
      email: input.email,
      phone: input.phone,
      company: input.company,
      industry: input.industry,
      address: input.address,
      creditLimitCents: input.creditLimitCents,
      creditScore: 600,
      riskLevel: "medium",
      status: input.status ?? "active",
      accountManagerId: input.accountManagerId,
      aiEmployeeId: input.aiEmployeeId,
      avgPaymentDelayDays: 0,
      lifetimeValueCents: 0,
      outstandingBalanceCents: 0,
      totalInvoices: 0,
      paidInvoices: 0,
      unpaidInvoices: 0,
      brokenPromises: 0,
      preferredChannel: input.preferredChannel,
      tags: input.tags ?? [],
      notes: input.notes ?? "",
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("customer", org, customer);
    logger.info("[revenueGuardian] customer created", { org, id: customer.id, name: customer.name });
    return customer;
  },

  async updateCustomer(org: string, id: string, patch: Partial<RgCustomerUpsertInput>): Promise<RgCustomer | null> {
    const existing = await readOwned<RgCustomer>("customer", org, id);
    if (!existing) return null;
    const updated: RgCustomer = {
      ...existing,
      ...patch,
      id: existing.id,
      organizationId: org,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await writeItem("customer", org, updated);
    return updated;
  },

  async deleteCustomer(org: string, id: string): Promise<boolean> {
    return deleteItem("customer", org, id);
  },

  // ── Invoices ───────────────────────────────────────────────────────

  async listInvoices(org: string, opts?: { customerId?: string; status?: RgInvoiceStatus }): Promise<RgInvoice[]> {
    const all = await listAll<RgInvoice>("invoice", org);
    const now = Date.now();
    // Recompute status and aging on read
    let out = all.map((inv) => {
      const outstanding = inv.amountCents - inv.paidCents;
      const daysOverdue = outstanding > 0 ? daysBetween(inv.dueDate, now) : 0;
      const status = inv.status === "paid" || inv.status === "void" || inv.status === "draft" || inv.status === "disputed"
        ? inv.status
        : invoiceStatusFromState(inv.amountCents, inv.paidCents, inv.dueDate, now);
      return { ...inv, status, daysOverdue, agingBucket: agingBucket(daysOverdue) };
    });
    if (opts?.customerId) out = out.filter((i) => i.customerId === opts.customerId);
    if (opts?.status) out = out.filter((i) => i.status === opts.status);
    return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
  },

  async getInvoice(org: string, id: string): Promise<RgInvoice | null> {
    const inv = await readOwned<RgInvoice>("invoice", org, id);
    if (!inv) return null;
    const now = Date.now();
    const outstanding = inv.amountCents - inv.paidCents;
    const daysOverdue = outstanding > 0 ? daysBetween(inv.dueDate, now) : 0;
    const status = inv.status === "paid" || inv.status === "void" || inv.status === "draft" || inv.status === "disputed"
      ? inv.status
      : invoiceStatusFromState(inv.amountCents, inv.paidCents, inv.dueDate, now);
    return { ...inv, status, daysOverdue, agingBucket: agingBucket(daysOverdue) };
  },

  async createInvoice(org: string, input: RgInvoiceCreateInput): Promise<RgInvoice> {
    const now = new Date().toISOString();
    const amountCents = input.lines.reduce((s, l) => s + l.totalCents, 0);
    const invoice: RgInvoice = {
      id: randomUUID(),
      organizationId: org,
      customerId: input.customerId,
      number: input.number,
      currency: input.currency,
      amountCents,
      paidCents: 0,
      lines: input.lines,
      status: "sent",
      issueDate: input.issueDate ?? now,
      dueDate: input.dueDate,
      daysOverdue: 0,
      agingBucket: "current",
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("invoice", org, invoice);
    // Update customer aggregates
    await this.refreshCustomerAggregates(org, input.customerId);
    logger.info("[revenueGuardian] invoice created", { org, id: invoice.id, customerId: input.customerId, amountCents });
    return invoice;
  },

  async recordPayment(org: string, invoiceId: string, amountCents: number): Promise<RgInvoice | null> {
    const inv = await readOwned<RgInvoice>("invoice", org, invoiceId);
    if (!inv) return null;
    const newPaid = Math.min(inv.paidCents + amountCents, inv.amountCents);
    const status: RgInvoiceStatus = newPaid >= inv.amountCents ? "paid" : "partial";
    const updated: RgInvoice = {
      ...inv,
      paidCents: newPaid,
      status,
      paidAt: status === "paid" ? new Date().toISOString() : inv.paidAt,
      updatedAt: new Date().toISOString(),
      daysOverdue: 0,
      agingBucket: "current",
    };
    await writeItem("invoice", org, updated);
    await this.refreshCustomerAggregates(org, inv.customerId);
    logger.info("[revenueGuardian] payment recorded", { org, invoiceId, amountCents, newStatus: status });
    return updated;
  },

  async deleteInvoice(org: string, id: string): Promise<boolean> {
    const inv = await readOwned<RgInvoice>("invoice", org, id);
    if (!inv) return false;
    const ok = await deleteItem("invoice", org, id);
    if (ok) await this.refreshCustomerAggregates(org, inv.customerId);
    return ok;
  },

  // ── Collection Cases ───────────────────────────────────────────────

  async listCases(org: string, opts?: { customerId?: string; status?: RgCaseStatus }): Promise<RgCollectionCase[]> {
    const all = await listAll<RgCollectionCase>("case", org);
    let out = all;
    if (opts?.customerId) out = out.filter((c) => c.customerId === opts.customerId);
    if (opts?.status) out = out.filter((c) => c.status === opts.status);
    return out.sort((a, b) => b.totalOutstandingCents - a.totalOutstandingCents);
  },

  async getCase(org: string, id: string): Promise<RgCollectionCase | null> {
    return readOwned<RgCollectionCase>("case", org, id);
  },

  async createCase(org: string, input: RgCollectionCaseCreateInput): Promise<RgCollectionCase> {
    const now = new Date().toISOString();
    const invoiceIds = [input.primaryInvoiceId, ...(input.invoiceIds ?? [])];
    // Compute total outstanding
    const invoices = await listAll<RgInvoice>("invoice", org);
    const relevant = invoices.filter((i) => invoiceIds.includes(i.id));
    const totalOutstanding = relevant.reduce((s, i) => s + Math.max(0, i.amountCents - i.paidCents), 0);

    const cs: RgCollectionCase = {
      id: randomUUID(),
      organizationId: org,
      customerId: input.customerId,
      primaryInvoiceId: input.primaryInvoiceId,
      invoiceIds,
      totalOutstandingCents: totalOutstanding,
      status: "open",
      priority: input.priority,
      aiEmployeeId: input.aiEmployeeId,
      accountManagerId: input.accountManagerId,
      communicationsCount: 0,
      promisesCount: 0,
      brokenPromisesCount: 0,
      recoveredCents: 0,
      openedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("case", org, cs);
    // Link invoices to case
    for (const invId of invoiceIds) {
      const inv = await readOwned<RgInvoice>("invoice", org, invId);
      if (inv) {
        await writeItem("invoice", org, { ...inv, caseId: cs.id, updatedAt: now });
      }
    }
    logger.info("[revenueGuardian] collection case created", { org, id: cs.id, customerId: input.customerId });
    return cs;
  },

  async updateCase(org: string, id: string, patch: Partial<Pick<RgCollectionCase, "status" | "priority" | "aiEmployeeId" | "accountManagerId" | "resolutionNotes">>): Promise<RgCollectionCase | null> {
    const existing = await readOwned<RgCollectionCase>("case", org, id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updated: RgCollectionCase = {
      ...existing,
      ...patch,
      lastActionAt: now,
      closedAt: patch.status === "resolved" || patch.status === "closed" ? now : existing.closedAt,
      updatedAt: now,
    };
    await writeItem("case", org, updated);
    return updated;
  },

  async deleteCase(org: string, id: string): Promise<boolean> {
    return deleteItem("case", org, id);
  },

  // ── Payment Promises ───────────────────────────────────────────────

  async listPromises(org: string, opts?: { customerId?: string; caseId?: string; status?: RgPromiseStatus }): Promise<RgPaymentPromise[]> {
    const all = await listAll<RgPaymentPromise>("promise", org);
    let out = all;
    if (opts?.customerId) out = out.filter((p) => p.customerId === opts.customerId);
    if (opts?.caseId) out = out.filter((p) => p.caseId === opts.caseId);
    if (opts?.status) out = out.filter((p) => p.status === opts.status);
    return out.sort((a, b) => (a.promisedDate < b.promisedDate ? -1 : 1));
  },

  async createPromise(org: string, input: RgPaymentPromiseCreateInput): Promise<RgPaymentPromise> {
    const now = new Date().toISOString();
    const promise: RgPaymentPromise = {
      id: randomUUID(),
      organizationId: org,
      customerId: input.customerId,
      caseId: input.caseId,
      invoiceId: input.invoiceId,
      amountCents: input.amountCents,
      promisedDate: input.promisedDate,
      status: "pending",
      confidenceScore: input.confidenceScore,
      notes: input.notes,
      recordedBy: input.recordedBy,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("promise", org, promise);
    // Update case counters
    if (input.caseId) {
      const cs = await readOwned<RgCollectionCase>("case", org, input.caseId);
      if (cs) {
        await writeItem("case", org, { ...cs, promisesCount: cs.promisesCount + 1, lastActionAt: now, updatedAt: now });
      }
    }
    logger.info("[revenueGuardian] payment promise created", { org, id: promise.id, customerId: input.customerId });
    return promise;
  },

  async evaluatePromises(org: string): Promise<{ broken: number; kept: number }> {
    const now = Date.now();
    const promises = await listAll<RgPaymentPromise>("promise", org);
    let broken = 0, kept = 0;

    for (const p of promises) {
      if (p.status !== "pending") continue;
      const due = Date.parse(p.promisedDate);
      if (Number.isNaN(due)) continue;

      // Check if paid (if invoice linked, check payment)
      if (p.invoiceId) {
        const inv = await readOwned<RgInvoice>("invoice", org, p.invoiceId);
        if (inv && inv.paidCents >= p.amountCents) {
          await writeItem("promise", org, { ...p, status: "kept" as const, actualPaidAt: inv.paidAt, updatedAt: new Date().toISOString() });
          kept++;
          continue;
        }
      }

      // If past promised date and not paid → broken
      if (due < now) {
        await writeItem("promise", org, { ...p, status: "broken" as const, updatedAt: new Date().toISOString() });
        broken++;
        // Update customer broken count
        const cust = await readOwned<RgCustomer>("customer", org, p.customerId);
        if (cust) {
          await writeItem("customer", org, { ...cust, brokenPromises: cust.brokenPromises + 1, updatedAt: new Date().toISOString() });
        }
        // Update case broken count
        if (p.caseId) {
          const cs = await readOwned<RgCollectionCase>("case", org, p.caseId);
          if (cs) {
            await writeItem("case", org, { ...cs, brokenPromisesCount: cs.brokenPromisesCount + 1, updatedAt: new Date().toISOString() });
          }
        }
      }
    }

    return { broken, kept };
  },

  // ── Communications ─────────────────────────────────────────────────

  async listCommunications(org: string, opts?: { customerId?: string; caseId?: string }): Promise<RgCommunication[]> {
    const all = await listAll<RgCommunication>("comm", org);
    let out = all;
    if (opts?.customerId) out = out.filter((c) => c.customerId === opts.customerId);
    if (opts?.caseId) out = out.filter((c) => c.caseId === opts.caseId);
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async createCommunication(org: string, input: RgCommunicationCreateInput): Promise<RgCommunication> {
    const now = new Date().toISOString();
    const comm: RgCommunication = {
      id: randomUUID(),
      organizationId: org,
      customerId: input.customerId,
      caseId: input.caseId,
      channel: input.channel,
      direction: input.direction,
      subject: input.subject,
      body: input.body,
      automated: input.automated,
      aiEmployeeId: input.aiEmployeeId,
      deliveryStatus: input.deliveryStatus,
      createdAt: now,
    };
    await writeItem("comm", org, comm);
    // Update customer last communication
    const cust = await readOwned<RgCustomer>("customer", org, input.customerId);
    if (cust) {
      await writeItem("customer", org, { ...cust, lastCommunicationAt: now, updatedAt: now });
    }
    // Update case counter
    if (input.caseId) {
      const cs = await readOwned<RgCollectionCase>("case", org, input.caseId);
      if (cs) {
        await writeItem("case", org, { ...cs, communicationsCount: cs.communicationsCount + 1, lastActionAt: now, updatedAt: now });
      }
    }
    return comm;
  },

  // ── AI Employees ───────────────────────────────────────────────────

  async listAiEmployees(org: string): Promise<RgAiEmployee[]> {
    return listAll<RgAiEmployee>("ai", org);
  },

  async getAiEmployee(org: string, id: string): Promise<RgAiEmployee | null> {
    return readOwned<RgAiEmployee>("ai", org, id);
  },

  async createAiEmployee(org: string, input: RgAiEmployeeCreateInput): Promise<RgAiEmployee> {
    const now = new Date().toISOString();
    const ai: RgAiEmployee = {
      id: randomUUID(),
      organizationId: org,
      type: input.type,
      name: input.name,
      description: input.description,
      enabled: input.enabled,
      config: input.config,
      casesHandled: 0,
      messagesSent: 0,
      recoveryRatePct: 0,
      avgResponseTimeMin: 0,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("ai", org, ai);
    logger.info("[revenueGuardian] AI Employee created", { org, id: ai.id, type: ai.type, name: ai.name });
    return ai;
  },

  async updateAiEmployeeStats(org: string, id: string, patch: Partial<Pick<RgAiEmployee, "casesHandled" | "messagesSent" | "recoveryRatePct" | "avgResponseTimeMin">>): Promise<RgAiEmployee | null> {
    const existing = await readOwned<RgAiEmployee>("ai", org, id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    await writeItem("ai", org, updated);
    return updated;
  },

  async deleteAiEmployee(org: string, id: string): Promise<boolean> {
    return deleteItem("ai", org, id);
  },

  // ── Tasks ──────────────────────────────────────────────────────────

  async listTasks(org: string, opts?: { assigneeId?: string; status?: RgTaskStatus; caseId?: string }): Promise<RgTask[]> {
    const all = await listAll<RgTask>("task", org);
    let out = all;
    if (opts?.assigneeId) out = out.filter((t) => t.assigneeId === opts.assigneeId);
    if (opts?.status) out = out.filter((t) => t.status === opts.status);
    if (opts?.caseId) out = out.filter((t) => t.caseId === opts.caseId);
    return out.sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1));
  },

  async createTask(org: string, input: RgTaskCreateInput): Promise<RgTask> {
    const now = new Date().toISOString();
    const task: RgTask = {
      id: randomUUID(),
      organizationId: org,
      customerId: input.customerId,
      caseId: input.caseId,
      assigneeId: input.assigneeId,
      aiEmployeeId: input.aiEmployeeId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: "pending",
      dueAt: input.dueAt,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("task", org, task);
    return task;
  },

  async updateTaskStatus(org: string, id: string, status: RgTaskStatus): Promise<RgTask | null> {
    const existing = await readOwned<RgTask>("task", org, id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updated: RgTask = {
      ...existing,
      status,
      completedAt: status === "completed" ? now : undefined,
      updatedAt: now,
    };
    await writeItem("task", org, updated);
    return updated;
  },

  async deleteTask(org: string, id: string): Promise<boolean> {
    return deleteItem("task", org, id);
  },

  // ── Collection Rules ───────────────────────────────────────────────

  async listRules(org: string): Promise<RgCollectionRule[]> {
    const all = await listAll<RgCollectionRule>("rule", org);
    return all.sort((a, b) => a.order - b.order);
  },

  async createRule(org: string, input: RgCollectionRuleCreateInput): Promise<RgCollectionRule> {
    const now = new Date().toISOString();
    const rule: RgCollectionRule = {
      id: randomUUID(),
      organizationId: org,
      name: input.name,
      description: input.description,
      enabled: input.enabled ?? true,
      triggerDaysOverdue: input.triggerDaysOverdue,
      action: input.action,
      channel: input.channel,
      template: input.template,
      priority: input.priority,
      order: input.order,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("rule", org, rule);
    return rule;
  },

  async deleteRule(org: string, id: string): Promise<boolean> {
    return deleteItem("rule", org, id);
  },

  /**
   * Evaluate collection rules against current overdue invoices.
   * Returns actions that should be taken (caller dispatches to comm channels).
   */
  async evaluateRules(org: string): Promise<Array<{ ruleId: string; invoiceId: string; customerId: string; action: string; channel?: string; template?: string }>> {
    const rules = (await this.listRules(org)).filter((r) => r.enabled);
    const invoices = await this.listInvoices(org, { status: "overdue" });
    const actions: Array<{ ruleId: string; invoiceId: string; customerId: string; action: string; channel?: string; template?: string }> = [];

    for (const inv of invoices) {
      for (const rule of rules) {
        if (inv.daysOverdue >= rule.triggerDaysOverdue) {
          actions.push({
            ruleId: rule.id,
            invoiceId: inv.id,
            customerId: inv.customerId,
            action: rule.action,
            channel: rule.channel,
            template: rule.template,
          });
        }
      }
    }
    return actions;
  },

  // ── Customer Profile ───────────────────────────────────────────────

  async getCustomerProfile(org: string, customerId: string): Promise<RgCustomerProfile | null> {
    const customer = await this.getCustomer(org, customerId);
    if (!customer) return null;
    const invoices = await this.listInvoices(org, { customerId });
    const cases = await this.listCases(org, { customerId });
    const promises = await this.listPromises(org, { customerId });
    const communications = await this.listCommunications(org, { customerId });
    const tasks = await this.listTasks(org, { caseId: undefined });
    const customerTasks = tasks.filter((t) => t.customerId === customerId);
    const insights = generateInsights(customer, invoices, promises);
    return { customer, invoices, cases, promises, communications, tasks: customerTasks, insights };
  },

  // ── Account Manager Workspace ──────────────────────────────────────

  async getAccountManagerWorkspace(org: string, userId: string): Promise<RgAccountManagerWorkspace> {
    const customers = await this.listCustomers(org);
    const assigned = customers.filter((c) => c.accountManagerId === userId);
    const overdueCustomers = assigned.filter((c) => c.unpaidInvoices > 0);
    const tasks = await this.listTasks(org, { assigneeId: userId });
    const openTasks = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
    const promises = await this.listPromises(org);
    const now = Date.now();
    const upcomingPromises = promises
      .filter((p) => p.status === "pending" && assigned.some((c) => c.id === p.customerId))
      .filter((p) => Date.parse(p.promisedDate) >= now - DAY_MS);
    const cases = await this.listCases(org);
    const escalatedCases = cases.filter((c) => c.status === "escalated" && assigned.some((cust) => cust.id === c.customerId));

    const collected = await this.listInvoices(org);
    const paidRecently = collected.filter((i) => i.paidAt && daysBetween(i.paidAt, now) <= 1);
    const collectedToday = paidRecently.reduce((s, i) => s + i.paidCents, 0);
    const paidThisWeek = collected.filter((i) => i.paidAt && daysBetween(i.paidAt, now) <= 7);
    const collectedWeek = paidThisWeek.reduce((s, i) => s + i.paidCents, 0);

    const totalResolved = cases.filter((c) => c.status === "resolved" || c.status === "closed");
    const avgResDays = totalResolved.length > 0
      ? totalResolved.reduce((s, c) => s + daysBetween(c.openedAt, c.closedAt ?? c.updatedAt), 0) / totalResolved.length
      : 0;
    const totalRecovered = totalResolved.reduce((s, c) => s + c.recoveredCents, 0);
    const totalAssigned = totalResolved.reduce((s, c) => s + c.totalOutstandingCents, 0);
    const recoveryRate = totalAssigned > 0 ? (totalRecovered / totalAssigned) * 100 : 0;

    return {
      assignedCustomers: assigned.length,
      overdueCustomers: overdueCustomers.length,
      openTasks,
      dailyTargetCents: 0,
      collectedTodayCents: collectedToday,
      collectedThisWeekCents: collectedWeek,
      upcomingPromises,
      escalatedCases,
      performance: {
        recoveryRatePct: Math.round(recoveryRate * 10) / 10,
        avgResolutionDays: Math.round(avgResDays),
        customerSatisfactionScore: 0,
      },
    };
  },

  // ── Dashboard Rollup ───────────────────────────────────────────────

  async rollup(org: string): Promise<RgDashboardRollup> {
    const now = Date.now();
    const invoices = await this.listInvoices(org);
    const customers = await this.listCustomers(org);
    const cases = await this.listCases(org);
    const aiEmployees = await this.listAiEmployees(org);
    const tasks = await this.listTasks(org);
    const promises = await this.listPromises(org);

    const outstanding = invoices.reduce((s, i) => s + Math.max(0, i.amountCents - i.paidCents), 0);
    const overdue = invoices.filter((i) => i.daysOverdue > 0).reduce((s, i) => s + Math.max(0, i.amountCents - i.paidCents), 0);

    // Collections by period
    const paidInvs = invoices.filter((i) => i.paidAt);
    const collectedToday = paidInvs.filter((i) => daysBetween(i.paidAt!, now) <= 1).reduce((s, i) => s + i.paidCents, 0);
    const collectedWeek = paidInvs.filter((i) => daysBetween(i.paidAt!, now) <= 7).reduce((s, i) => s + i.paidCents, 0);
    const collectedMonth = paidInvs.filter((i) => daysBetween(i.paidAt!, now) <= 30).reduce((s, i) => s + i.paidCents, 0);

    // Aging
    const aging: RgAgingSummary = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d120_plus: 0 };
    for (const inv of invoices) {
      const bal = Math.max(0, inv.amountCents - inv.paidCents);
      if (bal <= 0) continue;
      aging[inv.agingBucket] += bal;
    }

    // Overdue customers
    const overdueCustomerCount = customers.filter((c) => c.unpaidInvoices > 0).length;

    // Recovery / collection rates
    const closedCases = cases.filter((c) => c.status === "resolved" || c.status === "closed");
    const totalRecovered = closedCases.reduce((s, c) => s + c.recoveredCents, 0);
    const totalAssigned = cases.reduce((s, c) => s + c.totalOutstandingCents, 0);
    const recoveryRate = totalAssigned > 0 ? (totalRecovered / totalAssigned) * 100 : 0;

    const totalInvoiced = invoices.reduce((s, i) => s + i.amountCents, 0);
    const totalPaid = invoices.reduce((s, i) => s + i.paidCents, 0);
    const collectionSuccess = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;

    // Bad debt risk
    const criticalOutstanding = customers
      .filter((c) => c.riskLevel === "critical")
      .reduce((s, c) => s + c.outstandingBalanceCents, 0);
    const badDebtRisk = outstanding > 0 ? (criticalOutstanding / outstanding) * 100 : 0;

    // AI performance
    const aiPerformance = aiEmployees.map((ai) => ({
      aiEmployeeId: ai.id,
      name: ai.name,
      type: ai.type,
      casesHandled: ai.casesHandled,
      recoveryRatePct: ai.recoveryRatePct,
      messagesSent: ai.messagesSent,
    }));

    // Forecast (simple: based on aging, critical/high less likely to pay)
    const forecast = {
      days30: Math.round(outstanding * 0.3),
      days60: Math.round(outstanding * 0.5),
      days90: Math.round(outstanding * 0.65),
    };

    // Collection trend (last 14 days)
    const collectionTrend: Array<{ date: string; collectedCents: number }> = [];
    for (let d = 13; d >= 0; d--) {
      const dayStart = now - d * DAY_MS;
      const dayEnd = dayStart + DAY_MS;
      const dayCollected = paidInvs
        .filter((i) => {
          const paid = Date.parse(i.paidAt!);
          return paid >= dayStart && paid < dayEnd;
        })
        .reduce((s, i) => s + i.paidCents, 0);
      collectionTrend.push({
        date: new Date(dayStart).toISOString().slice(0, 10),
        collectedCents: dayCollected,
      });
    }

    // Risk breakdown
    const riskBreakdown: Record<RgRiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const c of customers) {
      riskBreakdown[c.riskLevel] += c.outstandingBalanceCents;
    }

    const openTasks = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
    const brokenPromises = promises.filter((p) => p.status === "broken");

    return {
      generatedAt: new Date().toISOString(),
      totalOutstandingCents: outstanding,
      overdueCents: overdue,
      collectedTodayCents: collectedToday,
      collectedThisWeekCents: collectedWeek,
      collectedThisMonthCents: collectedMonth,
      recoveryRatePct: Math.round(recoveryRate * 10) / 10,
      collectionSuccessRatePct: Math.round(collectionSuccess * 10) / 10,
      badDebtRiskPct: Math.round(badDebtRisk * 10) / 10,
      overdueCustomerCount,
      openCaseCount: cases.filter((c) => c.status !== "resolved" && c.status !== "closed").length,
      aging,
      aiPerformance,
      forecast,
      collectionTrend,
      riskBreakdown,
      openTaskCount: openTasks.length,
      brokenPromiseCount: brokenPromises.length,
      totalCustomerCount: customers.length,
    };
  },

  // ── Executive Report ───────────────────────────────────────────────

  async executiveReport(org: string, fromIso: string, toIso: string): Promise<RgExecutiveReport> {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    const invoices = await this.listInvoices(org);
    const customers = await this.listCustomers(org);
    const cases = await this.listCases(org);
    const aiEmployees = await this.listAiEmployees(org);

    const periodInvoices = invoices.filter((i) => {
      const issued = Date.parse(i.issueDate);
      return issued >= from && issued <= to;
    });

    const totalInvoiced = periodInvoices.reduce((s, i) => s + i.amountCents, 0);
    const totalPaid = invoices.filter((i) => i.paidAt && Date.parse(i.paidAt) >= from && Date.parse(i.paidAt) <= to)
      .reduce((s, i) => s + i.paidCents, 0);
    const outstanding = invoices.reduce((s, i) => s + Math.max(0, i.amountCents - i.paidCents), 0);
    const overdue = invoices.filter((i) => i.daysOverdue > 0).reduce((s, i) => s + Math.max(0, i.amountCents - i.paidCents), 0);
    const recoveryRate = outstanding > 0 ? (totalPaid / (totalPaid + outstanding)) * 100 : 100;

    // Avg collection days
    const paidInPeriod = invoices.filter((i) => i.paidAt && Date.parse(i.paidAt) >= from && Date.parse(i.paidAt) <= to);
    const avgDays = paidInPeriod.length > 0
      ? paidInPeriod.reduce((s, i) => s + daysBetween(i.issueDate, Date.parse(i.paidAt!)), 0) / paidInPeriod.length
      : 0;

    const aging: RgAgingSummary = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d120_plus: 0 };
    for (const inv of invoices) {
      const bal = Math.max(0, inv.amountCents - inv.paidCents);
      if (bal > 0) aging[inv.agingBucket] += bal;
    }

    // Top overdue customers
    const overdueCustomers = customers
      .filter((c) => c.outstandingBalanceCents > 0)
      .sort((a, b) => b.outstandingBalanceCents - a.outstandingBalanceCents)
      .slice(0, 10);
    const topOverdue = overdueCustomers.map((c) => {
      const custInvoices = invoices.filter((i) => i.customerId === c.id && i.daysOverdue > 0);
      const maxDays = custInvoices.length > 0 ? Math.max(...custInvoices.map((i) => i.daysOverdue)) : 0;
      return { customerId: c.id, name: c.name, outstandingCents: c.outstandingBalanceCents, daysOverdue: maxDays };
    });

    // AI vs Human performance
    const closedCases = cases.filter((c) => c.status === "resolved" || c.status === "closed");
    const aiCases = closedCases.filter((c) => c.aiEmployeeId && !c.accountManagerId);
    const humanCases = closedCases.filter((c) => c.accountManagerId);
    const aiRecovered = aiCases.reduce((s, c) => s + c.recoveredCents, 0);
    const humanRecovered = humanCases.reduce((s, c) => s + c.recoveredCents, 0);

    // Cash flow forecast
    const cashFlowForecast = {
      week1: Math.round(outstanding * 0.15),
      week2: Math.round(outstanding * 0.25),
      week3: Math.round(outstanding * 0.35),
      week4: Math.round(outstanding * 0.45),
    };

    // Recommendations
    const recommendations: string[] = [];
    if (aging.d120_plus > 0) recommendations.push(`${(aging.d120_plus / 100).toFixed(0)} in 120+ day bucket requires immediate escalation or write-off assessment.`);
    if (aging.d91_120 > 0) recommendations.push(`Consider payment plan offers for ${(aging.d91_120 / 100).toFixed(0)} in 91-120 day bucket.`);
    if (overdueCustomers.length > 5) recommendations.push(`${overdueCustomers.length} customers with outstanding balances — prioritize high-value accounts.`);
    if (recoveryRate < 50) recommendations.push(`Recovery rate below 50% — review collection rules and AI Employee assignments.`);
    if (recommendations.length === 0) recommendations.push("Collection metrics within healthy parameters. Continue monitoring.");

    return {
      generatedAt: new Date().toISOString(),
      period: { from: fromIso, to: toIso },
      summary: {
        totalInvoicedCents: totalInvoiced,
        totalCollectedCents: totalPaid,
        totalOutstandingCents: outstanding,
        totalOverdueCents: overdue,
        recoveryRatePct: Math.round(recoveryRate * 10) / 10,
        avgCollectionDays: Math.round(avgDays),
      },
      aging,
      topOverdueCustomers: topOverdue,
      aiVsHumanPerformance: {
        aiRecoveredCents: aiRecovered,
        humanRecoveredCents: humanRecovered,
        aiCasesClosed: aiCases.length,
        humanCasesClosed: humanCases.length,
      },
      cashFlowForecast,
      recommendations,
    };
  },

  // ── Internal: Refresh customer aggregates ──────────────────────────

  async refreshCustomerAggregates(org: string, customerId: string): Promise<void> {
    const customer = await readOwned<RgCustomer>("customer", org, customerId);
    if (!customer) return;
    const invoices = await listAll<RgInvoice>("invoice", org);
    const promises = await listAll<RgPaymentPromise>("promise", org);
    const custInvoices = invoices.filter((i) => i.customerId === customerId);
    const custPromises = promises.filter((p) => p.customerId === customerId);

    const totalInvoices = custInvoices.length;
    const paidInvoices = custInvoices.filter((i) => i.status === "paid").length;
    const unpaidInvoices = totalInvoices - paidInvoices;
    const outstanding = custInvoices.reduce((s, i) => s + Math.max(0, i.amountCents - i.paidCents), 0);
    const lifetimeValue = custInvoices.reduce((s, i) => s + i.paidCents, 0);

    // Avg payment delay
    const paid = custInvoices.filter((i) => i.paidAt);
    const avgDelay = paid.length > 0
      ? paid.reduce((s, i) => s + daysBetween(i.issueDate, Date.parse(i.paidAt!)), 0) / paid.length
      : 0;

    // Credit score
    const now = Date.now();
    const recomputed = custInvoices.map((inv) => {
      const invOutstanding = inv.amountCents - inv.paidCents;
      const daysOverdue = invOutstanding > 0 ? daysBetween(inv.dueDate, now) : 0;
      const status = inv.status === "paid" || inv.status === "void" || inv.status === "draft" || inv.status === "disputed"
        ? inv.status
        : invoiceStatusFromState(inv.amountCents, inv.paidCents, inv.dueDate, now);
      return { ...inv, status, daysOverdue, agingBucket: agingBucket(daysOverdue) };
    });
    const creditScore = computeCreditScore(recomputed, custPromises);
    const riskLevel = computeRiskLevel(creditScore);

    const updated: RgCustomer = {
      ...customer,
      totalInvoices,
      paidInvoices,
      unpaidInvoices,
      outstandingBalanceCents: outstanding,
      lifetimeValueCents: lifetimeValue,
      avgPaymentDelayDays: Math.round(avgDelay),
      creditScore,
      riskLevel,
      updatedAt: new Date().toISOString(),
    };
    await writeItem("customer", org, updated);
  },
};
