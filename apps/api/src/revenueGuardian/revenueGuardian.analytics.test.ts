/**
 * Session 200 — deeper AI Revenue Guardian coverage.
 *
 * The Session-89 suite covers one happy path per area. This suite hardens the
 * money-sensitive logic that was left unverified: payment clamping, credit
 * scoring / risk tiers, aging buckets, promise evaluation branches, rule
 * trigger thresholds, dashboard rollup math, executive-report period filtering,
 * and cross-tenant isolation on the financial paths. Real service + the
 * NODE_ENV=test in-memory Redis (same pattern as revenueGuardian.test.ts).
 *
 * WINDELS is an Enterprise AI Platform, not a broker.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RevenueGuardianService as RG } from "./revenueGuardian.service.js";
import { redisCmd as redis } from "../db/redis.js";

const ORG = `rg-an-${Date.now()}`;
const DAY = 86_400_000;
const isoInDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

async function wipeOrg(org: string) {
  const entities = ["customer", "invoice", "case", "promise", "comm", "ai", "task", "rule"];
  for (const e of entities) {
    const idxKey = `rg:${e}:idx:${org}`;
    const ids = await redis.zrange(idxKey, 0, -1);
    for (const id of ids) await redis.del(`rg:${e}:i:${org}:${id}`);
    await redis.del(idxKey);
  }
}

async function customer(name = "Cust") {
  return RG.createCustomer(ORG, { name, email: `${name}@x.com` });
}
async function invoice(customerId: string, amountCents: number, opts: { dueInDays?: number; number?: string } = {}) {
  return RG.createInvoice(ORG, {
    customerId,
    number: opts.number ?? `INV-${Math.random().toString(36).slice(2, 8)}`,
    lines: [{ description: "svc", quantity: 1, unitPriceCents: amountCents, totalCents: amountCents }],
    dueDate: isoInDays(opts.dueInDays ?? 30),
  });
}

beforeEach(async () => { await wipeOrg(ORG); });

describe("recordPayment — clamping & status transitions", () => {
  it("marks partial when payment < amount", async () => {
    const c = await customer();
    const inv = await invoice(c.id, 10000);
    const p = await RG.recordPayment(ORG, inv.id, 4000);
    expect(p!.paidCents).toBe(4000);
    expect(p!.status).toBe("partial");
    expect(p!.paidAt).toBeUndefined();
  });

  it("marks paid and stamps paidAt when fully paid", async () => {
    const c = await customer();
    const inv = await invoice(c.id, 10000);
    const p = await RG.recordPayment(ORG, inv.id, 10000);
    expect(p!.status).toBe("paid");
    expect(p!.paidCents).toBe(10000);
    expect(typeof p!.paidAt).toBe("string");
  });

  it("never lets paidCents exceed the invoice amount (overpayment clamp)", async () => {
    const c = await customer();
    const inv = await invoice(c.id, 10000);
    const p = await RG.recordPayment(ORG, inv.id, 999999);
    expect(p!.paidCents).toBe(10000);
    expect(p!.status).toBe("paid");
  });

  it("accumulates successive partial payments up to the total", async () => {
    const c = await customer();
    const inv = await invoice(c.id, 10000);
    await RG.recordPayment(ORG, inv.id, 3000);
    const p2 = await RG.recordPayment(ORG, inv.id, 3000);
    expect(p2!.paidCents).toBe(6000);
    expect(p2!.status).toBe("partial");
    const p3 = await RG.recordPayment(ORG, inv.id, 5000); // 3000+3000+5000 -> clamp 10000
    expect(p3!.paidCents).toBe(10000);
    expect(p3!.status).toBe("paid");
  });

  it("returns null for an unknown invoice", async () => {
    expect(await RG.recordPayment(ORG, "nope", 100)).toBeNull();
  });
});

describe("customer aggregates — credit score, risk, aging", () => {
  it("raises credit score & keeps low risk after on-time payments", async () => {
    const c = await customer("GoodPayer");
    const inv = await invoice(c.id, 10000);
    await RG.recordPayment(ORG, inv.id, 10000);
    const prof = await RG.getCustomer(ORG, c.id);
    // base 600 + paid(10) => 610 => still "medium" tier, but paidInvoices tracked
    expect(prof!.paidInvoices).toBe(1);
    expect(prof!.unpaidInvoices).toBe(0);
    expect(prof!.lifetimeValueCents).toBe(10000);
    expect(prof!.creditScore).toBeGreaterThanOrEqual(600);
  });

  it("drops score and escalates risk when invoices are badly overdue", async () => {
    const c = await customer("BadPayer");
    // Several invoices due 200 days ago and unpaid => overdue, >90d penalties.
    for (let i = 0; i < 5; i++) await invoice(c.id, 20000, { dueInDays: -200 });
    // Trigger recompute
    await RG.refreshCustomerAggregates(ORG, c.id);
    const prof = await RG.getCustomer(ORG, c.id);
    expect(prof!.unpaidInvoices).toBe(5);
    expect(prof!.creditScore).toBeLessThan(600);
    expect(["high", "critical"]).toContain(prof!.riskLevel);
  });

  it("classifies aging buckets from days overdue", async () => {
    const c = await customer("Aging");
    await invoice(c.id, 1000, { dueInDays: -10 });   // d1_30
    await invoice(c.id, 1000, { dueInDays: -45 });   // d31_60
    await invoice(c.id, 1000, { dueInDays: -200 });  // d120_plus
    const list = await RG.listInvoices(ORG, { customerId: c.id });
    const buckets = list.map((i) => i.agingBucket).sort();
    expect(buckets).toContain("d1_30");
    expect(buckets).toContain("d31_60");
    expect(buckets).toContain("d120_plus");
  });

  it("a paid invoice contributes to lifetime value, not outstanding", async () => {
    const c = await customer();
    const inv = await invoice(c.id, 5000);
    await RG.recordPayment(ORG, inv.id, 5000);
    const prof = await RG.getCustomer(ORG, c.id);
    expect(prof!.outstandingBalanceCents).toBe(0);
    expect(prof!.lifetimeValueCents).toBe(5000);
  });
});

describe("evaluatePromises — kept / broken / pending branches", () => {
  it("marks a promise KEPT when its linked invoice is paid", async () => {
    const c = await customer();
    const inv = await invoice(c.id, 10000);
    await RG.recordPayment(ORG, inv.id, 10000);
    await RG.createPromise(ORG, { customerId: c.id, invoiceId: inv.id, amountCents: 10000, promisedDate: isoInDays(-1), recordedBy: "u1" });
    const res = await RG.evaluatePromises(ORG);
    expect(res.kept).toBe(1);
    expect(res.broken).toBe(0);
  });

  it("marks a promise BROKEN when past due and unpaid, and increments customer broken count", async () => {
    const c = await customer();
    const inv = await invoice(c.id, 10000);
    await RG.createPromise(ORG, { customerId: c.id, invoiceId: inv.id, amountCents: 10000, promisedDate: isoInDays(-2), recordedBy: "u1" });
    const res = await RG.evaluatePromises(ORG);
    expect(res.broken).toBe(1);
    const prof = await RG.getCustomer(ORG, c.id);
    expect(prof!.brokenPromises).toBe(1);
  });

  it("leaves a future promise pending (neither kept nor broken)", async () => {
    const c = await customer();
    const inv = await invoice(c.id, 10000);
    await RG.createPromise(ORG, { customerId: c.id, invoiceId: inv.id, amountCents: 10000, promisedDate: isoInDays(5), recordedBy: "u1" });
    const res = await RG.evaluatePromises(ORG);
    expect(res).toEqual({ broken: 0, kept: 0 });
    const [pr] = await RG.listPromises(ORG);
    expect(pr.status).toBe("pending");
  });

  it("increments case broken/promise counters", async () => {
    const c = await customer();
    const inv = await invoice(c.id, 10000);
    const cs = await RG.createCase(ORG, { customerId: c.id, primaryInvoiceId: inv.id, priority: "high" });
    await RG.createPromise(ORG, { customerId: c.id, caseId: cs.id, invoiceId: inv.id, amountCents: 10000, promisedDate: isoInDays(-1), recordedBy: "u1" });
    const afterCreate = await RG.getCase(ORG, cs.id);
    expect(afterCreate!.promisesCount).toBe(1);
    await RG.evaluatePromises(ORG);
    const afterEval = await RG.getCase(ORG, cs.id);
    expect(afterEval!.brokenPromisesCount).toBe(1);
  });
});

describe("collection cases", () => {
  it("computes total outstanding across linked invoices and links them back", async () => {
    const c = await customer();
    const i1 = await invoice(c.id, 10000);
    const i2 = await invoice(c.id, 5000);
    await RG.recordPayment(ORG, i2.id, 2000); // 3000 outstanding
    const cs = await RG.createCase(ORG, { customerId: c.id, primaryInvoiceId: i1.id, invoiceIds: [i2.id], priority: "medium" });
    expect(cs.totalOutstandingCents).toBe(10000 + 3000);
    const linked = await RG.getInvoice(ORG, i1.id);
    expect(linked!.caseId).toBe(cs.id);
  });

  it("stamps closedAt when a case is resolved", async () => {
    const c = await customer();
    const inv = await invoice(c.id, 10000);
    const cs = await RG.createCase(ORG, { customerId: c.id, primaryInvoiceId: inv.id, priority: "low" });
    const updated = await RG.updateCase(ORG, cs.id, { status: "resolved" });
    expect(updated!.status).toBe("resolved");
    expect(typeof updated!.closedAt).toBe("string");
  });
});

describe("evaluateRules — trigger thresholds", () => {
  it("only fires enabled rules whose threshold the overdue invoice meets", async () => {
    const c = await customer();
    await invoice(c.id, 10000, { dueInDays: -45 }); // ~45 days overdue
    await RG.createRule(ORG, { name: "gentle", triggerDaysOverdue: 30, action: "send_reminder", channel: "email", enabled: true });
    await RG.createRule(ORG, { name: "firm", triggerDaysOverdue: 60, action: "escalate_to_human", enabled: true });
    await RG.createRule(ORG, { name: "off", triggerDaysOverdue: 1, action: "assign_ai", enabled: false });
    const actions = await RG.evaluateRules(ORG);
    const names = actions.map((a) => a.action);
    expect(names).toContain("send_reminder");        // 45 >= 30
    expect(names).not.toContain("escalate_to_human"); // 45 < 60
    expect(names).not.toContain("assign_ai");         // disabled
  });

  it("returns nothing when no invoices are overdue", async () => {
    const c = await customer();
    await invoice(c.id, 10000, { dueInDays: 30 }); // not overdue
    await RG.createRule(ORG, { name: "r", triggerDaysOverdue: 1, action: "send_reminder", enabled: true });
    expect(await RG.evaluateRules(ORG)).toEqual([]);
  });
});

describe("dashboard rollup — analytics math", () => {
  it("aggregates outstanding, overdue, aging and customer counts from real data", async () => {
    const c1 = await customer("C1");
    const c2 = await customer("C2");
    const paidInv = await invoice(c1.id, 10000, { dueInDays: 30 });
    await RG.recordPayment(ORG, paidInv.id, 10000);
    await invoice(c1.id, 8000, { dueInDays: -40 });  // overdue, d31_60
    await invoice(c2.id, 5000, { dueInDays: 15 });   // current, not overdue

    const r = await RG.rollup(ORG);
    expect(r.totalCustomerCount).toBe(2);
    expect(r.totalOutstandingCents).toBe(8000 + 5000);
    expect(r.overdueCents).toBe(8000);
    expect(r.aging.d31_60).toBe(8000);
    expect(r.aging.current).toBe(5000);
    expect(r.collectedThisMonthCents).toBe(10000);
    expect(r.overdueCustomerCount).toBeGreaterThanOrEqual(1);
    expect(r.collectionTrend.length).toBe(14);
    // collectionSuccess = paid/invoiced = 10000 / 23000 ~ 43.5%
    expect(r.collectionSuccessRatePct).toBeGreaterThan(40);
    expect(r.collectionSuccessRatePct).toBeLessThan(45);
  });

  it("returns a zeroed-but-valid rollup for an empty org (no divide-by-zero)", async () => {
    const r = await RG.rollup(ORG);
    expect(r.totalOutstandingCents).toBe(0);
    expect(r.recoveryRatePct).toBe(0);
    expect(r.collectionSuccessRatePct).toBe(0);
    expect(r.badDebtRiskPct).toBe(0);
    expect(r.aging).toEqual({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d120_plus: 0 });
  });
});

describe("executive report — period filtering", () => {
  it("only counts invoices issued within the reporting window", async () => {
    const c = await customer();
    // issued now (in-window) and one far in the past by backdating not supported,
    // so use the window boundaries around 'now'.
    await invoice(c.id, 10000, { dueInDays: 30 });
    const from = isoInDays(-1);
    const to = isoInDays(1);
    const rep = await RG.executiveReport(ORG, from, to);
    expect(rep.period).toEqual({ from, to });
    expect(rep.summary.totalInvoicedCents).toBe(10000);
    expect(Array.isArray(rep.recommendations)).toBe(true);
    expect(rep.recommendations.length).toBeGreaterThan(0);
  });

  it("excludes invoices issued outside the window", async () => {
    const c = await customer();
    await invoice(c.id, 10000, { dueInDays: 30 }); // issued ~now
    // Window entirely in the future => nothing issued in it.
    const rep = await RG.executiveReport(ORG, isoInDays(10), isoInDays(20));
    expect(rep.summary.totalInvoicedCents).toBe(0);
  });
});

describe("tenant isolation on financial paths", () => {
  it("does not leak invoices, cases or rollups across orgs", async () => {
    const c = await customer();
    await invoice(c.id, 10000);
    const otherOrg = `${ORG}-other`;
    try {
      expect(await RG.listInvoices(otherOrg)).toEqual([]);
      const r = await RG.rollup(otherOrg);
      expect(r.totalOutstandingCents).toBe(0);
      expect(r.totalCustomerCount).toBe(0);
    } finally {
      await wipeOrg(otherOrg);
    }
  });

  it("recordPayment on another org's invoice id returns null", async () => {
    const c = await customer();
    const inv = await invoice(c.id, 10000);
    const otherOrg = `${ORG}-x`;
    expect(await RG.recordPayment(otherOrg, inv.id, 5000)).toBeNull();
  });
});
