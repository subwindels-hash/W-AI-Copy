/**
 * BillingService — Slice 252: Commercial Billing.
 * Billing accounts, plans, MRR/ARR, invoices, dunning, usage metering.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { BillingAccount, BillingPlan, BillingPeriod, BillingStatus, Invoice } from "@windels/shared";

const LIST   = "psvc:billing";
const DETAIL = (id: string) => `psvc:billing:${id}`;
const BY_TENANT = "psvc:billing:tenant";

const PLAN_MRR: Record<BillingPlan, number> = {
  free: 0, starter: 49, growth: 299, scale: 1499, enterprise: 4999,
};

const SER = <T>(v: T) => JSON.stringify(v);
function iso(days = 0): string { return new Date(Date.now() + days*86400_000).toISOString(); }

export const BillingService = {
  async list(filter?: { status?: BillingStatus; plan?: BillingPlan }): Promise<BillingAccount[]> {
    const ids = await redis.smembers(LIST);
    const out: BillingAccount[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (!raw) continue;
      const b = JSON.parse(raw) as BillingAccount;
      if (filter?.status && b.status !== filter.status) continue;
      if (filter?.plan && b.plan !== filter.plan) continue;
      out.push(b);
    }
    return out.sort((a,b) => b.mrr - a.mrr);
  },

  async get(id: string): Promise<BillingAccount | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as BillingAccount) : null;
  },

  async forTenant(tenantId: string): Promise<BillingAccount | null> {
    const id = await redis.hget(BY_TENANT, tenantId);
    return id ? this.get(id) : null;
  },

  async openAccount(input: {
    tenantId: string; plan?: BillingPlan; period?: BillingPeriod;
    seats?: number; currency?: string; lastFour?: string;
  }): Promise<BillingAccount> {
    const id = randomUUID();
    const plan: BillingPlan = input.plan ?? "growth";
    const period: BillingPeriod = input.period ?? "monthly";
    const seats = input.seats ?? 25;
    const baseMrr = PLAN_MRR[plan];
    const seatMrr = plan === "free" ? 0 : plan === "starter" ? 15 : plan === "growth" ? 20 : plan === "scale" ? 25 : 40;
    const mrr = baseMrr + seats * seatMrr;
    const b: BillingAccount = {
      id, tenantId: input.tenantId, plan, period,
      status: plan === "free" ? "trial" : "current",
      mrr, arr: mrr * 12, seats, nextBillAt: iso(30),
      currency: input.currency ?? "USD", taxRate: 0.0, discountPct: 0, dunningLevel: 0,
      lastFour: input.lastFour, invoices: [],
      usageThisPeriod: { apiCalls: 0, aiTokens: 0, seats: seats, storageGb: 0 },
    };
    // seed first invoice
    if (plan !== "free") {
      b.invoices.push({
        id: randomUUID(), number: `INV-${Date.now().toString().slice(-8)}`,
        amount: mrr, currency: b.currency, status: "paid",
        issuedAt: iso(-2), dueAt: iso(28), paidAt: iso(-1),
        lineItems: [
          { description: `${plan} plan (${period})`, amount: baseMrr, qty: 1 },
          { description: "seats", amount: seatMrr, qty: seats },
        ],
      });
    }
    await redis.set(DETAIL(id), SER(b));
    await redis.sadd(LIST, id);
    await redis.hset(BY_TENANT, b.tenantId, id);
    return b;
  },

  async update(id: string, patch: Partial<BillingAccount>): Promise<BillingAccount | null> {
    const b = await this.get(id);
    if (!b) return null;
    Object.assign(b, patch);
    if (patch.plan) {
      const baseMrr = PLAN_MRR[b.plan];
      const seatMrr = b.plan === "free" ? 0 : b.plan === "starter" ? 15 : b.plan === "growth" ? 20 : b.plan === "scale" ? 25 : 40;
      b.mrr = baseMrr + b.seats * seatMrr;
      b.arr = b.mrr * 12;
    }
    await redis.set(DETAIL(id), SER(b));
    return b;
  },

  async recordUsage(id: string, metric: string, delta: number): Promise<BillingAccount | null> {
    const b = await this.get(id);
    if (!b) return null;
    b.usageThisPeriod[metric] = (b.usageThisPeriod[metric] ?? 0) + delta;
    await redis.set(DETAIL(id), SER(b));
    return b;
  },

  async rollup(): Promise<{ total: number; totalMrr: number; totalArr: number; delinquent: number; byPlan: Record<BillingPlan, number> }> {
    const all = await this.list();
    const byPlan: Record<string, number> = { free:0, starter:0, growth:0, scale:0, enterprise:0 };
    for (const b of all) byPlan[b.plan] = (byPlan[b.plan] ?? 0) + 1;
    return {
      total: all.length,
      totalMrr: all.reduce((a,b)=>a+b.mrr,0),
      totalArr: all.reduce((a,b)=>a+b.arr,0),
      delinquent: all.filter(b=>b.status==="delinquent"||b.status==="past_due").length,
      byPlan: byPlan as Record<BillingPlan, number>,
    };
  },
};
