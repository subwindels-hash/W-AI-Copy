// Session 20 / 107 — Billing & Subscription shared contracts.

import { z } from "zod";

export const BILLING_PLANS = ["starter", "pro", "team", "enterprise"] as const;
export type BillingPlanId = (typeof BILLING_PLANS)[number];
export const BILLING_CYCLES = ["monthly", "annual"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export const BILLING_PAYMENT_STATUSES = ["paid", "failed", "voided", "refunded"] as const;
export type BillingPaymentStatus = (typeof BILLING_PAYMENT_STATUSES)[number];

export interface BillingPlan {
  id: BillingPlanId;
  name: string;
  monthly: number;
  annual: number;
  seatIncluded: number;
  perSeatMonthly: number;
  perSeatAnnual: number;
}

export interface BillingInvoiceLine {
  description: string;
  amountCents: number;
  quantity: number;
  unitCents: number;
  kind: "base" | "seat" | "overage" | "discount" | "credit" | "adjustment";
}

export interface BillingSubscription {
  id: string;
  plan: string;
  planName: string;
  status: string;
  seats: number;
  cycle: BillingCycle;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  customerEmail: string | null;
  monthlyRate: number;
  renewalCents: number;
}

export interface BillingInvoice {
  id: string;
  number: string;
  amountCents: number;
  currency: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
  createdAt: string;
  lines: BillingInvoiceLine[];
}

export interface BillingOverview {
  subscription: BillingSubscription;
  plans: BillingPlan[];
  invoices: BillingInvoice[];
  accountsReceivable: { openInvoiceCount: number; openInvoiceTotal: number };
}

export interface BillingPredictiveInsights {
  period: { since: string; until: string };
  usage: { workflows30d: number; messages30d: number; conversations30d: number; tasks30d: number; agentsActive: number; revenueCents30d: number };
  forecast30d: { workflows: number; messages: number; conversations: number; tasks: number };
  insights: string[];
}

export const BillingSubscriptionUpdateSchema = z.object({
  plan: z.enum(BILLING_PLANS).optional(),
  seats: z.number().int().min(1).max(10_000).optional(),
  cycle: z.enum(BILLING_CYCLES).optional(),
  customerEmail: z.string().email().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one subscription field is required");
export type BillingSubscriptionUpdateInput = z.infer<typeof BillingSubscriptionUpdateSchema>;

export const BillingPaymentEventSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  invoiceNumber: z.string().trim().min(1).max(64),
  status: z.enum(BILLING_PAYMENT_STATUSES),
  paidAt: z.string().datetime().optional(),
  amountCents: z.number().int().nonnegative().optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  meta: z.record(z.unknown()).optional(),
});
export type BillingPaymentEventInput = z.infer<typeof BillingPaymentEventSchema>;

export const BillingInvoiceIdSchema = z.object({ id: z.string().cuid() });
export const BillingVoidSchema = z.object({ reason: z.string().trim().max(500).optional() });
