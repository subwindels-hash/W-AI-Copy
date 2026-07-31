import { api } from "./api";

export interface Plan {
  id: string; name: string; monthly: number; annual: number;
}
export interface Subscription {
  id: string; plan: string; planName: string; status: string; seats: number; cycle: "monthly" | "annual";
  currentPeriodStart: string; currentPeriodEnd: string; customerEmail?: string | null; monthlyRate: number;
}
export interface Invoice {
  id: string; number: string; amountCents: number; currency: string; status: string;
  dueDate?: string | null; paidAt?: string | null; hostedUrl?: string | null; pdfUrl?: string | null; createdAt: string;
}
export interface BillingOverview {
  subscription: Subscription;
  plans: Plan[];
  invoices: Invoice[];
}
export interface PredictiveInsights {
  period: { since: string; until: string };
  usage: { workflows30d: number; messages30d: number; conversations30d: number; tasks30d: number; agentsActive: number };
  forecast30d: { workflows: number; messages: number; conversations: number; tasks: number };
  insights: string[];
}

export async function getBilling() { return api<BillingOverview>("/billing"); }
export async function updateSubscription(input: { plan?: string; seats?: number; cycle?: "monthly" | "annual" }) {
  return api<{ subscription: Subscription }>("/billing", { method: "PATCH", json: input });
}
export async function getInsights() { return api<PredictiveInsights>("/billing/insights"); }
