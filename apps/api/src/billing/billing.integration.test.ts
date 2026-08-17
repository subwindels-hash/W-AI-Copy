/** Session 107 — Prisma-backed billing service tests on FakePrisma/FakeKv. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const db = new FakePrisma();
const kv = new FakeKv();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const billing = await import("../services/billing.service.js");
const { BillingSubscriptionUpdateSchema, BillingPaymentEventSchema } = await import("@windels/shared/billing");

const ORG_A = "org-billing-a";
const ORG_B = "org-billing-b";
const USER_A = "user-billing-a";
const USER_B = "user-billing-b";

function seed() {
  db.seed("Organization", [{ id: ORG_A, name: "Alpha", slug: "alpha" }, { id: ORG_B, name: "Beta", slug: "beta" }]);
  db.seed("Workspace", [{ id: "ws-a", organizationId: ORG_A }, { id: "ws-b", organizationId: ORG_B }]);
  db.seed("User", [
    { id: USER_A, email: "a@example.com", role: "ADMIN", isActive: true, isSuspended: false, createdAt: new Date() },
    { id: USER_B, email: "b@example.com", role: "ADMIN", isActive: true, isSuspended: false, createdAt: new Date() },
  ]);
  db.seed("Membership", [
    { id: cuid(), userId: USER_A, organizationId: ORG_A, workspaceId: "ws-a", joinedAt: new Date(1) },
    { id: cuid(), userId: USER_B, organizationId: ORG_B, workspaceId: "ws-b", joinedAt: new Date(1) },
  ]);
}

beforeEach(() => { db.reset(); seed(); kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear(); });

async function openProInvoice() {
  const result: any = await billing.updateSubscription(USER_A, { plan: "pro", cycle: "monthly", seats: 5 });
  return result.invoice!;
}

describe("billing — subscription and invoice ledger", () => {
  it("creates an honest starter subscription for a fresh organization", async () => {
    const overview = await billing.getBilling(USER_A);
    expect(overview.subscription.plan).toBe("starter");
    expect(overview.subscription.renewalCents).toBe(0);
    expect(overview.invoices).toEqual([]);
    expect(overview.accountsReceivable).toEqual({ openInvoiceCount: 0, openInvoiceTotal: 0 });
  });

  it("changes plan, creates an open invoice and audits the subscription change", async () => {
    const result: any = await billing.updateSubscription(USER_A, { plan: "pro", cycle: "monthly", seats: 5 });
    expect(result.paymentRequired).toBe(true);
    expect(result.invoice).toMatchObject({ amountCents: 2900, status: "open" });
    expect(db.tables.get("AuditLog")![0]).toMatchObject({ action: "billing.subscription.changed", organizationId: ORG_A });
    const overview = await billing.getBilling(USER_A);
    expect(overview.subscription.plan).toBe("pro");
    expect(overview.accountsReceivable.openInvoiceTotal).toBe(2900);
  });

  it("reports the exact remaining invoice balance after an applied split-tender allocation", async () => {
    const invoice = await openProInvoice();
    db.seed("InvoicePaymentAllocation", [{
      id: cuid(), organizationId: ORG_A, invoiceId: invoice.id, paymentId: null,
      sourceKind: "gift_card", sourceId: "gc-1", amountCents: 900,
      currency: "USD", status: "applied", appliedAt: new Date(),
      reversedAt: null, metadata: {}, createdAt: new Date(), updatedAt: new Date(),
    }]);
    const overview = await billing.getBilling(USER_A);
    expect(overview.invoices[0]).toMatchObject({ amountCents: 2900, allocatedCents: 900, remainingCents: 2000 });
    expect(overview.accountsReceivable.openInvoiceTotal).toBe(2000);
  });

  it("does not create a duplicate invoice for an unchanged update", async () => {
    await billing.updateSubscription(USER_A, { plan: "pro" });
    const unchanged: any = await billing.updateSubscription(USER_A, { plan: "pro", cycle: "monthly", seats: 5 });
    expect(unchanged.unchanged).toBe(true);
    expect(db.tables.get("Invoice")).toHaveLength(1);
  });

  it("keeps invoice reads organization-scoped", async () => {
    await openProInvoice();
    const beta = await billing.getBilling(USER_B);
    expect(beta.invoices).toHaveLength(0);
    expect(beta.accountsReceivable.openInvoiceTotal).toBe(0);
  });

  it("marks an invoice paid and restores an account with no remaining open invoices", async () => {
    const invoice = await openProInvoice();
    const paid = await billing.markInvoicePaid(USER_A, invoice.id);
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).toBeTruthy();
    expect(db.tables.get("AuditLog")!.some((row) => row.action === "billing.invoice.paid")).toBe(true);
    expect((await billing.getBilling(USER_A)).subscription.status).toBe("active");
  });

  it("voids open invoices but never voids a paid invoice", async () => {
    const invoice = await openProInvoice();
    const voided = await billing.voidInvoice(USER_A, invoice.id, "duplicate");
    expect(voided.status).toBe("void");
    const paidInvoice = (await billing.updateSubscription(USER_A, { plan: "team", cycle: "monthly", seats: 10 }) as any).invoice;
    await billing.markInvoicePaid(USER_A, paidInvoice.id);
    await expect(billing.voidInvoice(USER_A, paidInvoice.id)).rejects.toThrow("Cannot void a paid invoice");
  });

  it("rejects cross-tenant invoice mutation", async () => {
    const invoice = await openProInvoice();
    await expect(billing.markInvoicePaid(USER_B, invoice.id)).rejects.toThrow("Invoice not found");
    await expect(billing.voidInvoice(USER_B, invoice.id)).rejects.toThrow("Invoice not found");
  });
});

describe("billing — webhook and dunning controls", () => {
  it("applies a payment webhook once and makes duplicate delivery a no-op", async () => {
    const invoice = await openProInvoice();
    const event = { eventId: "evt-billing-1", invoiceNumber: invoice.number, status: "paid" as const, amountCents: 2900, currency: "usd" };
    const first: any = await billing.recordPaymentEvent(event);
    const second: any = await billing.recordPaymentEvent(event);
    expect(first).toMatchObject({ applied: true, idempotent: false });
    expect(second).toMatchObject({ applied: false, idempotent: true });
    expect((await billing.getBilling(USER_A)).invoices[0]!.status).toBe("paid");
  });

  it("does not fabricate an invoice when a webhook references an unknown number", async () => {
    const result: any = await billing.recordPaymentEvent({ eventId: "evt-unknown", invoiceNumber: "INV-missing", status: "paid" });
    expect(result).toMatchObject({ applied: false, reason: "invoice not found" });
    expect(db.tables.get("Invoice") ?? []).toHaveLength(0);
  });

  it("promotes overdue open invoices and the subscription to past_due", async () => {
    const invoice = await openProInvoice();
    db.tables.get("Invoice")!.find((row) => row.id === invoice.id)!.dueDate = new Date(Date.now() - 1000);
    expect(await billing.runDunning(ORG_A)).toEqual({ promoted: 1 });
    expect(db.tables.get("Invoice")!.find((row) => row.id === invoice.id)!.status).toBe("past_due");
    expect(db.tables.get("BillingSubscription")![0]!.status).toBe("past_due");
  });
});

describe("billing — shared contracts", () => {
  it("validates updates and payment events at the shared boundary", () => {
    expect(BillingSubscriptionUpdateSchema.safeParse({ plan: "team", seats: 12, cycle: "annual" }).success).toBe(true);
    expect(BillingSubscriptionUpdateSchema.safeParse({}).success).toBe(false);
    expect(BillingPaymentEventSchema.safeParse({ eventId: "evt", invoiceNumber: "INV-1", status: "paid" }).success).toBe(true);
    expect(BillingPaymentEventSchema.safeParse({ eventId: "evt", invoiceNumber: "INV-1", status: "unknown" }).success).toBe(false);
  });
});
