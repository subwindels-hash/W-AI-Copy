/** Session 107 — typed Billing & Subscription client. */
import { api } from "./api";
import type { BillingCycle, BillingInvoice, BillingOverview, BillingPaymentEventInput, BillingPlan, BillingPredictiveInsights, BillingSubscription, BillingSubscriptionUpdateInput } from "@windels/shared/billing";

export type { BillingCycle, BillingInvoice, BillingOverview, BillingPaymentEventInput, BillingPlan, BillingPredictiveInsights, BillingSubscription, BillingSubscriptionUpdateInput } from "@windels/shared/billing";
// Compatibility aliases retained for SettingsPage/AnalyticsPage.
export type Plan = BillingPlan;
export type Subscription = BillingSubscription;
export type Invoice = BillingInvoice;
export type PredictiveInsights = BillingPredictiveInsights;

export async function getBilling() { return api<BillingOverview>("/billing"); }
export async function updateSubscription(input: BillingSubscriptionUpdateInput) { return api<{ subscription: BillingSubscription; invoice?: { id: string; number: string; amountCents: number; status: string; dueDate: string | null } | null }>("/billing", { method: "PATCH", json: input }); }
export async function getInsights() { return api<BillingPredictiveInsights>("/billing/insights"); }
export async function markInvoicePaid(id: string) { return api<BillingInvoice>(`/billing/invoices/${id}/mark-paid`, { method: "POST" }); }
export async function voidInvoice(id: string, reason?: string) { return api<BillingInvoice>(`/billing/invoices/${id}/void`, { method: "POST", json: { reason } }); }
