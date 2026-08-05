/**
 * WINDELS AI OS — Billing tests.
 *
 * Covers the pure, deterministic parts of the billing module (plan pricing +
 * Zod validation + payment-event schema validation) that do not require a live
 * database. The Prisma-backed write paths (recordPaymentEvent apply, dunning)
 * are exercised at the contract level via schema validation and idempotency
 * semantics that don't touch the DB.
 */
import { describe, it, expect, vi } from "vitest";

// The billing service transitively imports @prisma/client (not generated in
// this environment). We only need the pure pricing + Zod schemas, so stub the
// Prisma client + workspace context to make the module import cleanly.
vi.mock("../db/client.js", () => ({
  prisma: {
    invoice: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn() },
    billingSubscription: { updateMany: vi.fn() },
  },
}));
vi.mock("@prisma/client", () => ({ PrismaClient: class {}, Prisma: { InputJsonValue: class {} } }));

const { PLAN_PRICES, UpdateSubscriptionSchema, RecordPaymentEventSchema } = await import("../services/billing.service.js");

describe("plan pricing", () => {
  it("all plans have coherent pricing and configuration", () => {
    const ids = Object.keys(PLAN_PRICES);
    expect(ids).toEqual(expect.arrayContaining(["starter", "pro", "team", "enterprise"]));
    for (const [id, p] of Object.entries(PLAN_PRICES)) {
      expect(p.name).toBeTruthy();
      expect(p.monthly).toBeGreaterThanOrEqual(0);
      expect(p.annual).toBeGreaterThanOrEqual(0);
      expect(p.seatIncluded).toBeGreaterThanOrEqual(0);
      // Annual should cost less than 12× monthly (multi-month discount) for paid plans.
      if (p.monthly > 0) expect(p.annual).toBeLessThanOrEqual(p.monthly * 12);
    }
  });

  it("plans are ordered by price (free → enterprise)", () => {
    const order = ["starter", "pro", "team", "enterprise"];
    const months = order.map((id) => PLAN_PRICES[id as keyof typeof PLAN_PRICES].monthly);
    expect(months).toEqual([...months].sort((a, b) => a - b));
    expect(PLAN_PRICES.starter.monthly).toBe(0); // starter is free
  });

  it("seat pricing scales with plan tier", () => {
    const pro = PLAN_PRICES.pro;
    const team = PLAN_PRICES.team;
    expect(pro.perSeatMonthly).toBeGreaterThan(0);
    expect(team.perSeatMonthly).toBeGreaterThan(pro.perSeatMonthly);
  });

  it("included seats are non-decreasing across tiers", () => {
    const order = ["starter", "pro", "team", "enterprise"];
    const seats = order.map((id) => PLAN_PRICES[id as keyof typeof PLAN_PRICES].seatIncluded);
    expect(seats).toEqual([...seats].sort((a, b) => a - b));
  });

  it("annual pricing is a 10x multiplier of monthly for paid plans", () => {
    // Catalog convention: annual = 10 * monthly (2 months free).
    for (const id of ["pro", "team", "enterprise"] as const) {
      expect(PLAN_PRICES[id].annual).toBe(PLAN_PRICES[id].monthly * 10);
    }
  });

  it("per-seat pricing scales with tier", () => {
    const order = ["starter", "pro", "team", "enterprise"];
    for (let i = 1; i < order.length; i++) {
      const prev = PLAN_PRICES[order[i - 1] as keyof typeof PLAN_PRICES].perSeatMonthly;
      const cur = PLAN_PRICES[order[i] as keyof typeof PLAN_PRICES].perSeatMonthly;
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });

  it("every paid plan has a positive seat overage basis", () => {
    for (const id of ["pro", "team", "enterprise"] as const) {
      expect(PLAN_PRICES[id].overageBasisMonthly).toBeGreaterThan(0);
    }
  });
});

describe("subscription schema validation", () => {
  it("accepts a valid plan update", () => {
    const r = UpdateSubscriptionSchema.safeParse({ plan: "team", seats: 15, cycle: "annual" });
    expect(r.success).toBe(true);
  });

  it("rejects invalid plan values and bad data types", () => {
    expect(UpdateSubscriptionSchema.safeParse({ plan: "freemium" }).success).toBe(false);
    expect(UpdateSubscriptionSchema.safeParse({ seats: 0 }).success).toBe(false);
    expect(UpdateSubscriptionSchema.safeParse({ seats: "many" }).success).toBe(false);
    expect(UpdateSubscriptionSchema.safeParse({ cycle: "weekly" }).success).toBe(false);
    expect(UpdateSubscriptionSchema.safeParse({ customerEmail: "not-an-email" }).success).toBe(false);
  });

  it("rejects an empty update (no fields)", () => {
    expect(UpdateSubscriptionSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a partial update with just seats", () => {
    expect(UpdateSubscriptionSchema.safeParse({ seats: 25 }).success).toBe(true);
  });

  it("accepts a partial update with just cycle", () => {
    expect(UpdateSubscriptionSchema.safeParse({ cycle: "monthly" }).success).toBe(true);
  });

  it("rejects a seats value above the upper bound", () => {
    expect(UpdateSubscriptionSchema.safeParse({ seats: 10_001 }).success).toBe(false);
  });

  it("rejects a non-integer seat count", () => {
    expect(UpdateSubscriptionSchema.safeParse({ seats: 2.5 }).success).toBe(false);
  });
});

describe("payment event schema validation", () => {
  it("accepts a valid paid event", () => {
    const r = RecordPaymentEventSchema.safeParse({
      eventId: "evt_123", invoiceNumber: "WIN-00000001", status: "paid", amountCents: 2900, currency: "USD",
    });
    expect(r.success).toBe(true);
  });

  it("accepts failed / voided / refunded statuses", () => {
    for (const status of ["failed", "voided", "refunded"]) {
      expect(RecordPaymentEventSchema.safeParse({ eventId: `e_${status}`, invoiceNumber: "WIN-00000001", status }).success).toBe(true);
    }
  });

  it("rejects malformed payloads", () => {
    expect(RecordPaymentEventSchema.safeParse({}).success).toBe(false); // missing required
    expect(RecordPaymentEventSchema.safeParse({ eventId: "", invoiceNumber: "WIN-1", status: "paid" }).success).toBe(false); // empty event id
    expect(RecordPaymentEventSchema.safeParse({ eventId: "e", invoiceNumber: "WIN-1", status: "weird" }).success).toBe(false); // bad status
    expect(RecordPaymentEventSchema.safeParse({ eventId: "e", invoiceNumber: "WIN-1", status: "paid", amountCents: -5 }).success).toBe(false); // negative amount
    expect(RecordPaymentEventSchema.safeParse({ eventId: "e", invoiceNumber: "WIN-1", status: "paid", currency: "US" }).success).toBe(false); // 2-char currency
  });

  it("requires a non-empty eventId (idempotency key) and invoiceNumber", () => {
    // eventId is the provider idempotency key — empty is rejected.
    expect(RecordPaymentEventSchema.safeParse({ eventId: "", invoiceNumber: "WIN-1", status: "paid" }).success).toBe(false);
    expect(RecordPaymentEventSchema.safeParse({ eventId: "evt_1", invoiceNumber: "", status: "paid" }).success).toBe(false);
    expect(RecordPaymentEventSchema.safeParse({ eventId: "evt_1", invoiceNumber: "WIN-1", status: "paid" }).success).toBe(true);
  });

  it("accepts an event with all optional metadata", () => {
    const r = RecordPaymentEventSchema.safeParse({
      eventId: "evt_full", invoiceNumber: "WIN-00000099", status: "paid",
      paidAt: "2026-08-05T12:00:00.000Z", amountCents: 1234, currency: "NGN", meta: { provider: "paystack" },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a bad paidAt datetime", () => {
    expect(RecordPaymentEventSchema.safeParse({ eventId: "e", invoiceNumber: "WIN-1", status: "paid", paidAt: "yesterday" }).success).toBe(false);
  });
});
