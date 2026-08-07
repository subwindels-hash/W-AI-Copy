/**
 * AI Revenue Guardian — Unit tests.
 *
 * Covers: customers, invoices, collection cases, payment promises,
 * communications, AI Employees, tasks, rules, dashboard rollup,
 * risk scoring, aging analysis, executive report, automation.
 *
 * WINDELS is an Enterprise AI Platform, not a broker.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RevenueGuardianService } from "./revenueGuardian.service.js";
import { redisCmd as redis } from "../db/redis.js";

const ORG = `rg-test-${Date.now()}`;

// Wipe test keys between tests (best-effort; uses SMEMBERS/scan patterns).
async function wipeOrg(org: string) {
  const entities = ["customer", "invoice", "case", "promise", "comm", "ai", "task", "rule"];
  for (const e of entities) {
    const idxKey = `rg:${e}:idx:${org}`;
    const ids = await redis.zrange(idxKey, 0, -1);
    for (const id of ids) {
      await redis.del(`rg:${e}:i:${org}:${id}`);
    }
    await redis.del(idxKey);
  }
}

beforeEach(async () => { await wipeOrg(ORG); });

describe("RevenueGuardianService — Customers", () => {
  it("creates and lists customers", async () => {
    const c1 = await RevenueGuardianService.createCustomer(ORG, {
      name: "Acme Corp", email: "billing@acme.com", creditLimitCents: 500000,
    });
    const c2 = await RevenueGuardianService.createCustomer(ORG, {
      name: "Globex Inc", email: "ap@globex.com", creditLimitCents: 100000,
    });

    const list = await RevenueGuardianService.listCustomers(ORG);
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.name).sort()).toEqual(["Acme Corp", "Globex Inc"]);
    expect(c1.creditScore).toBe(600); // default
    expect(c1.riskLevel).toBe("medium");
    expect(c2.organizationId).toBe(ORG);
  });

  it("filters customers by name query", async () => {
    await RevenueGuardianService.createCustomer(ORG, { name: "Alpha LLC", email: "a@alpha.com" });
    await RevenueGuardianService.createCustomer(ORG, { name: "Beta Corp", email: "b@beta.com" });
    const filtered = await RevenueGuardianService.listCustomers(ORG, { q: "alpha" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Alpha LLC");
  });

  it("updates and deletes customers", async () => {
    const c = await RevenueGuardianService.createCustomer(ORG, { name: "TestCo", email: "test@test.com" });
    const updated = await RevenueGuardianService.updateCustomer(ORG, c.id, { name: "TestCo Updated", notes: "VIP" });
    expect(updated!.name).toBe("TestCo Updated");
    expect(updated!.notes).toBe("VIP");

    const ok = await RevenueGuardianService.deleteCustomer(ORG, c.id);
    expect(ok).toBe(true);
    const list = await RevenueGuardianService.listCustomers(ORG);
    expect(list).toHaveLength(0);
  });

  it("tenant isolation: other org cannot see customers", async () => {
    await RevenueGuardianService.createCustomer(ORG, { name: "Org1 Co", email: "a@org1.com" });
    const other = await RevenueGuardianService.listCustomers("different-org");
    expect(other).toHaveLength(0);
  });
});

describe("RevenueGuardianService — Invoices", () => {
  let customerId: string;

  beforeEach(async () => {
    const c = await RevenueGuardianService.createCustomer(ORG, { name: "InvoiceCo", email: "inv@co.com" });
    customerId = c.id;
  });

  it("creates invoices and computes totals", async () => {
    const inv = await RevenueGuardianService.createInvoice(ORG, {
      customerId,
      number: "INV-001",
      lines: [
        { description: "Service A", quantity: 2, unitPriceCents: 5000, totalCents: 10000 },
        { description: "Service B", quantity: 1, unitPriceCents: 3000, totalCents: 3000 },
      ],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    expect(inv.amountCents).toBe(13000);
    expect(inv.paidCents).toBe(0);
    expect(inv.status).toBe("sent");
    expect(inv.daysOverdue).toBe(0);
    expect(inv.agingBucket).toBe("current");
  });

  it("records payments and updates status", async () => {
    const inv = await RevenueGuardianService.createInvoice(ORG, {
      customerId,
      number: "INV-002",
      lines: [{ description: "Product", quantity: 1, unitPriceCents: 10000, totalCents: 10000 }],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    const partial = await RevenueGuardianService.recordPayment(ORG, inv.id, 5000);
    expect(partial!.paidCents).toBe(5000);
    expect(partial!.status).toBe("partial"); // partial payment received

    const full = await RevenueGuardianService.recordPayment(ORG, inv.id, 5000);
    expect(full!.paidCents).toBe(10000);
    expect(full!.status).toBe("paid");
    expect(full!.paidAt).toBeTruthy();
  });

  it("detects overdue invoices", async () => {
    const inv = await RevenueGuardianService.createInvoice(ORG, {
      customerId,
      number: "INV-003",
      lines: [{ description: "Overdue Service", quantity: 1, unitPriceCents: 8000, totalCents: 8000 }],
      dueDate: new Date(Date.now() - 45 * 86400000).toISOString(), // 45 days ago
    });

    const fetched = await RevenueGuardianService.getInvoice(ORG, inv.id);
    expect(fetched!.status).toBe("overdue");
    expect(fetched!.daysOverdue).toBeGreaterThanOrEqual(44);
    expect(fetched!.agingBucket).toBe("d31_60");
  });

  it("refreshes customer aggregates after invoice operations", async () => {
    await RevenueGuardianService.createInvoice(ORG, {
      customerId,
      number: "INV-004",
      lines: [{ description: "A", quantity: 1, unitPriceCents: 5000, totalCents: 5000 }],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    await RevenueGuardianService.createInvoice(ORG, {
      customerId,
      number: "INV-005",
      lines: [{ description: "B", quantity: 1, unitPriceCents: 3000, totalCents: 3000 }],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    const customer = await RevenueGuardianService.getCustomer(ORG, customerId);
    expect(customer!.totalInvoices).toBe(2);
    expect(customer!.outstandingBalanceCents).toBe(8000);
    expect(customer!.unpaidInvoices).toBe(2);
  });
});

describe("RevenueGuardianService — Collection Cases", () => {
  it("creates cases and links invoices", async () => {
    const c = await RevenueGuardianService.createCustomer(ORG, { name: "CaseCo", email: "case@co.com" });
    const inv1 = await RevenueGuardianService.createInvoice(ORG, {
      customerId: c.id, number: "CASE-001",
      lines: [{ description: "X", quantity: 1, unitPriceCents: 10000, totalCents: 10000 }],
      dueDate: new Date(Date.now() - 60 * 86400000).toISOString(),
    });
    const inv2 = await RevenueGuardianService.createInvoice(ORG, {
      customerId: c.id, number: "CASE-002",
      lines: [{ description: "Y", quantity: 1, unitPriceCents: 5000, totalCents: 5000 }],
      dueDate: new Date(Date.now() - 30 * 86400000).toISOString(),
    });

    const cs = await RevenueGuardianService.createCase(ORG, {
      customerId: c.id, primaryInvoiceId: inv1.id, invoiceIds: [inv2.id], priority: "high",
    });

    expect(cs.totalOutstandingCents).toBe(15000);
    expect(cs.invoiceIds).toHaveLength(2);
    expect(cs.status).toBe("open");

    // Verify invoices are linked
    const fetchedInv = await RevenueGuardianService.getInvoice(ORG, inv1.id);
    expect(fetchedInv!.caseId).toBe(cs.id);
  });

  it("updates case status", async () => {
    const c = await RevenueGuardianService.createCustomer(ORG, { name: "CaseUpdate", email: "cu@co.com" });
    const inv = await RevenueGuardianService.createInvoice(ORG, {
      customerId: c.id, number: "CSU-001",
      lines: [{ description: "Z", quantity: 1, unitPriceCents: 7000, totalCents: 7000 }],
      dueDate: new Date(Date.now() - 10 * 86400000).toISOString(),
    });
    const cs = await RevenueGuardianService.createCase(ORG, {
      customerId: c.id, primaryInvoiceId: inv.id,
    });

    const updated = await RevenueGuardianService.updateCase(ORG, cs.id, {
      status: "resolved", resolutionNotes: "Customer paid in full",
    });
    expect(updated!.status).toBe("resolved");
    expect(updated!.closedAt).toBeTruthy();
    expect(updated!.resolutionNotes).toBe("Customer paid in full");
  });
});

describe("RevenueGuardianService — Payment Promises", () => {
  it("creates and evaluates promises", async () => {
    const c = await RevenueGuardianService.createCustomer(ORG, { name: "PromiseCo", email: "p@co.com" });
    const inv = await RevenueGuardianService.createInvoice(ORG, {
      customerId: c.id, number: "PROM-001",
      lines: [{ description: "A", quantity: 1, unitPriceCents: 10000, totalCents: 10000 }],
      dueDate: new Date(Date.now() - 30 * 86400000).toISOString(),
    });

    // Promise in the future → stays pending
    const futurePromise = await RevenueGuardianService.createPromise(ORG, {
      customerId: c.id, invoiceId: inv.id, amountCents: 10000,
      promisedDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      confidenceScore: 0.8, notes: "Will pay next week", recordedBy: "user-1",
    });
    expect(futurePromise.status).toBe("pending");

    // Promise in the past → broken on evaluation
    const pastPromise = await RevenueGuardianService.createPromise(ORG, {
      customerId: c.id, invoiceId: inv.id, amountCents: 5000,
      promisedDate: new Date(Date.now() - 1 * 86400000).toISOString(),
      confidenceScore: 0.3, notes: "Promised yesterday but didn't pay", recordedBy: "user-1",
    });

    const result = await RevenueGuardianService.evaluatePromises(ORG);
    expect(result.broken).toBeGreaterThanOrEqual(1);

    const promises = await RevenueGuardianService.listPromises(ORG);
    const broken = promises.filter((p) => p.status === "broken");
    expect(broken.length).toBeGreaterThanOrEqual(1);
  });
});

describe("RevenueGuardianService — AI Employees", () => {
  it("creates and lists AI Employees", async () => {
    const ai = await RevenueGuardianService.createAiEmployee(ORG, {
      type: "collections", name: "Collections Agent", description: "Handles overdue accounts", enabled: true,
    });
    expect(ai.type).toBe("collections");
    expect(ai.enabled).toBe(true);

    const list = await RevenueGuardianService.listAiEmployees(ORG);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Collections Agent");
  });
});

describe("RevenueGuardianService — Tasks", () => {
  it("creates and updates tasks", async () => {
    const task = await RevenueGuardianService.createTask(ORG, {
      title: "Follow up with Acme Corp", priority: "high",
      dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    });
    expect(task.status).toBe("pending");

    const updated = await RevenueGuardianService.updateTaskStatus(ORG, task.id, "completed");
    expect(updated!.status).toBe("completed");
    expect(updated!.completedAt).toBeTruthy();
  });
});

describe("RevenueGuardianService — Collection Rules", () => {
  it("creates rules and evaluates them against overdue invoices", async () => {
    const c = await RevenueGuardianService.createCustomer(ORG, { name: "RuleCo", email: "r@co.com" });

    // Overdue invoice (45 days)
    await RevenueGuardianService.createInvoice(ORG, {
      customerId: c.id, number: "RULE-001",
      lines: [{ description: "A", quantity: 1, unitPriceCents: 10000, totalCents: 10000 }],
      dueDate: new Date(Date.now() - 45 * 86400000).toISOString(),
    });

    // Rule: at 30 days overdue → send reminder
    await RevenueGuardianService.createRule(ORG, {
      name: "30-day reminder", triggerDaysOverdue: 30,
      action: "send_reminder", channel: "email", template: "Dear {name}, your invoice is overdue.",
    });

    // Rule: at 60 days → escalate (should NOT match our 45-day invoice)
    await RevenueGuardianService.createRule(ORG, {
      name: "60-day escalation", triggerDaysOverdue: 60,
      action: "escalate_to_human", priority: "high",
    });

    const actions = await RevenueGuardianService.evaluateRules(ORG);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("send_reminder");
    expect(actions[0].channel).toBe("email");
  });
});

describe("RevenueGuardianService — Dashboard Rollup", () => {
  it("computes rollup from actual data", async () => {
    const c = await RevenueGuardianService.createCustomer(ORG, { name: "RollupCo", email: "roll@co.com" });

    // Paid invoice
    const paid = await RevenueGuardianService.createInvoice(ORG, {
      customerId: c.id, number: "RP-001",
      lines: [{ description: "Paid Svc", quantity: 1, unitPriceCents: 5000, totalCents: 5000 }],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    await RevenueGuardianService.recordPayment(ORG, paid.id, 5000);

    // Overdue invoice
    await RevenueGuardianService.createInvoice(ORG, {
      customerId: c.id, number: "RP-002",
      lines: [{ description: "Overdue Svc", quantity: 1, unitPriceCents: 8000, totalCents: 8000 }],
      dueDate: new Date(Date.now() - 15 * 86400000).toISOString(),
    });

    const rollup = await RevenueGuardianService.rollup(ORG);
    expect(rollup.totalOutstandingCents).toBe(8000);
    expect(rollup.overdueCents).toBe(8000);
    expect(rollup.collectedTodayCents).toBeGreaterThanOrEqual(5000);
    expect(rollup.totalCustomerCount).toBe(1);
    expect(rollup.overdueCustomerCount).toBe(1);
    expect(rollup.aging.d1_30).toBe(8000);
    expect(rollup.collectionTrend).toHaveLength(14);
  });
});

describe("RevenueGuardianService — Executive Report", () => {
  it("generates report with correct period", async () => {
    const c = await RevenueGuardianService.createCustomer(ORG, { name: "ExecCo", email: "exec@co.com" });
    await RevenueGuardianService.createInvoice(ORG, {
      customerId: c.id, number: "EX-001",
      lines: [{ description: "X", quantity: 1, unitPriceCents: 10000, totalCents: 10000 }],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    const from = new Date(Date.now() - 30 * 86400000).toISOString();
    const to = new Date().toISOString();
    const report = await RevenueGuardianService.executiveReport(ORG, from, to);

    expect(report.summary.totalInvoicedCents).toBe(10000);
    expect(report.aging).toBeDefined();
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.aiVsHumanPerformance).toBeDefined();
  });
});

describe("RevenueGuardianService — Communications", () => {
  it("creates and lists communications", async () => {
    const c = await RevenueGuardianService.createCustomer(ORG, { name: "CommCo", email: "c@co.com" });
    const comm = await RevenueGuardianService.createCommunication(ORG, {
      customerId: c.id, channel: "email", direction: "outbound",
      body: "Your invoice is overdue. Please pay.", automated: true,
    });

    expect(comm.channel).toBe("email");
    expect(comm.automated).toBe(true);

    const list = await RevenueGuardianService.listCommunications(ORG, { customerId: c.id });
    expect(list).toHaveLength(1);

    // Customer lastCommunicationAt should be updated
    const customer = await RevenueGuardianService.getCustomer(ORG, c.id);
    expect(customer!.lastCommunicationAt).toBeTruthy();
  });
});

describe("RevenueGuardianService — Customer Profile", () => {
  it("returns full profile with insights", async () => {
    const c = await RevenueGuardianService.createCustomer(ORG, {
      name: "ProfileCo", email: "prof@co.com", preferredChannel: "email",
    });
    // Create multiple overdue invoices to push risk score into high/critical
    for (let i = 0; i < 5; i++) {
      await RevenueGuardianService.createInvoice(ORG, {
        customerId: c.id, number: `PROF-${i + 1}`,
        lines: [{ description: `Svc ${i}`, quantity: 1, unitPriceCents: 10000, totalCents: 10000 }],
        dueDate: new Date(Date.now() - (60 + i * 10) * 86400000).toISOString(),
      });
    }

    const profile = await RevenueGuardianService.getCustomerProfile(ORG, c.id);
    expect(profile).not.toBeNull();
    expect(profile!.customer.name).toBe("ProfileCo");
    expect(profile!.invoices).toHaveLength(5);
    expect(profile!.insights.length).toBeGreaterThan(0);
    // With 5 overdue invoices and 60+ day ages, risk should be elevated
    const paymentInsight = profile!.insights.find((i) => i.type === "payment_prediction");
    expect(paymentInsight).toBeTruthy();
    // Should have a channel preference insight
    const channelInsight = profile!.insights.find((i) => i.type === "best_channel");
    expect(channelInsight).toBeTruthy();
  });
});
