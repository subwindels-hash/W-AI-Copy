// AI Revenue Guardian — Enterprise Accounts Receivable & Revenue Recovery.
//
// Types prefixed `Rg`. Single source of truth shared by the API service,
// the HTTP routes, and the web client.
//
// WINDELS AI OS is an Enterprise AI platform — this module automates
// accounts receivable, collections, and revenue recovery.

import { z } from "zod";

// ─── Enums ─────────────────────────────────────────────────────────────

export const RG_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RgRiskLevel = (typeof RG_RISK_LEVELS)[number];

export const RG_CUSTOMER_STATUSES = ["active", "watch", "collections", "legal", "written_off"] as const;
export type RgCustomerStatus = (typeof RG_CUSTOMER_STATUSES)[number];

export const RG_INVOICE_STATUSES = ["draft", "sent", "overdue", "partial", "paid", "void", "disputed"] as const;
export type RgInvoiceStatus = (typeof RG_INVOICE_STATUSES)[number];

export const RG_CASE_STATUSES = ["open", "in_progress", "promise_to_pay", "negotiating", "escalated", "resolved", "closed"] as const;
export type RgCaseStatus = (typeof RG_CASE_STATUSES)[number];

export const RG_COMM_CHANNELS = ["email", "sms", "whatsapp", "voice", "push", "in_app", "portal"] as const;
export type RgCommChannel = (typeof RG_COMM_CHANNELS)[number];

export const RG_COMM_DIRECTIONS = ["outbound", "inbound"] as const;
export type RgCommDirection = (typeof RG_COMM_DIRECTIONS)[number];

export const RG_AI_EMPLOYEE_TYPES = [
  "invoice_reminder",
  "collections",
  "payment_negotiation",
  "customer_communication",
  "credit_risk",
  "revenue_forecast",
  "debt_recovery",
  "executive_reporting",
] as const;
export type RgAiEmployeeType = (typeof RG_AI_EMPLOYEE_TYPES)[number];

export const RG_AGING_BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d91_120", "d120_plus"] as const;
export type RgAgingBucket = (typeof RG_AGING_BUCKETS)[number];

export const RG_TASK_STATUSES = ["pending", "in_progress", "completed", "overdue", "cancelled"] as const;
export type RgTaskStatus = (typeof RG_TASK_STATUSES)[number];

export const RG_PROMISE_STATUSES = ["pending", "kept", "broken", "renegotiated"] as const;
export type RgPromiseStatus = (typeof RG_PROMISE_STATUSES)[number];

// ─── Core Entities ─────────────────────────────────────────────────────

export interface RgCustomer {
  id: string;
  organizationId: string;
  /** External reference (CRM contact/company ID, email, etc.). */
  externalRef?: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  industry?: string;
  address?: string;
  /** Internal credit limit in cents (0 = unlimited / not set). */
  creditLimitCents: number;
  /** AI-computed credit score 0–1000 (higher = better). */
  creditScore: number;
  /** AI-computed risk level. */
  riskLevel: RgRiskLevel;
  /** Operational status. */
  status: RgCustomerStatus;
  /** Assigned human account manager (user ID, nullable). */
  accountManagerId?: string;
  /** Assigned AI Employee (id from RgAiEmployee). */
  aiEmployeeId?: string;
  /** Average payment delay in days (computed from history). */
  avgPaymentDelayDays: number;
  /** Lifetime value in cents. */
  lifetimeValueCents: number;
  /** Total outstanding balance in cents. */
  outstandingBalanceCents: number;
  /** Total number of invoices. */
  totalInvoices: number;
  /** Total paid invoices. */
  paidInvoices: number;
  /** Total unpaid invoices. */
  unpaidInvoices: number;
  /** Count of broken payment promises. */
  brokenPromises: number;
  /** Last communication timestamp. */
  lastCommunicationAt?: string;
  /** Preferred communication channel. */
  preferredChannel?: RgCommChannel;
  /** AI-computed best time to contact (hour of day 0-23). */
  bestContactHour?: number;
  /** Tags / labels for filtering. */
  tags: string[];
  /** Notes / internal comments. */
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface RgInvoice {
  id: string;
  organizationId: string;
  customerId: string;
  /** Invoice number (human-readable, e.g. "INV-2024-001"). */
  number: string;
  /** Currency ISO code. */
  currency: string;
  /** Total amount in cents. */
  amountCents: number;
  /** Amount paid so far in cents. */
  paidCents: number;
  /** Line items (structured). */
  lines: Array<{ description: string; quantity: number; unitPriceCents: number; totalCents: number }>;
  status: RgInvoiceStatus;
  issueDate: string;
  dueDate: string;
  paidAt?: string;
  /** Days overdue (computed: max(0, today - dueDate)). */
  daysOverdue: number;
  /** Aging bucket (computed from daysOverdue). */
  agingBucket: RgAgingBucket;
  /** Collection case ID if one exists for this invoice. */
  caseId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RgCollectionCase {
  id: string;
  organizationId: string;
  customerId: string;
  /** Primary invoice that triggered the case. */
  primaryInvoiceId: string;
  /** All related invoice IDs. */
  invoiceIds: string[];
  /** Total outstanding across all invoices in cents. */
  totalOutstandingCents: number;
  status: RgCaseStatus;
  priority: RgRiskLevel;
  /** Assigned AI Employee. */
  aiEmployeeId?: string;
  /** Assigned human account manager. */
  accountManagerId?: string;
  /** Number of communications sent in this case. */
  communicationsCount: number;
  /** Number of payment promises made. */
  promisesCount: number;
  /** Number of broken promises. */
  brokenPromisesCount: number;
  /** Last action timestamp. */
  lastActionAt?: string;
  /** Resolution notes. */
  resolutionNotes?: string;
  /** Amount recovered so far in this case (cents). */
  recoveredCents: number;
  openedAt: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RgPaymentPromise {
  id: string;
  organizationId: string;
  customerId: string;
  caseId?: string;
  invoiceId?: string;
  /** Promised amount in cents. */
  amountCents: number;
  /** Promised date. */
  promisedDate: string;
  status: RgPromiseStatus;
  /** AI confidence score 0.0-1.0. */
  confidenceScore: number;
  /** Notes from the customer or agent. */
  notes: string;
  /** Who recorded the promise (user ID or AI Employee ID). */
  recordedBy: string;
  /** Actual payment date if kept. */
  actualPaidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RgCommunication {
  id: string;
  organizationId: string;
  customerId: string;
  caseId?: string;
  channel: RgCommChannel;
  direction: RgCommDirection;
  subject?: string;
  body: string;
  /** Whether the communication was automated by an AI Employee. */
  automated: boolean;
  /** AI Employee that sent it (if automated). */
  aiEmployeeId?: string;
  /** Delivery status. */
  deliveryStatus: "queued" | "sent" | "delivered" | "read" | "failed" | "bounced";
  /** Customer response (if any). */
  response?: string;
  respondedAt?: string;
  createdAt: string;
}

export interface RgAiEmployee {
  id: string;
  organizationId: string;
  type: RgAiEmployeeType;
  name: string;
  description: string;
  enabled: boolean;
  /** Configuration per type. */
  config: Record<string, unknown>;
  /** Stats. */
  casesHandled: number;
  messagesSent: number;
  recoveryRatePct: number;
  avgResponseTimeMin: number;
  createdAt: string;
  updatedAt: string;
}

export interface RgTask {
  id: string;
  organizationId: string;
  customerId?: string;
  caseId?: string;
  /** Assigned user (account manager). */
  assigneeId?: string;
  /** AI Employee that created or owns the task. */
  aiEmployeeId?: string;
  title: string;
  description: string;
  priority: RgRiskLevel;
  status: RgTaskStatus;
  dueAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RgCollectionRule {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Days after due date to trigger. */
  triggerDaysOverdue: number;
  /** Action to take. */
  action: "send_reminder" | "send_overdue_notice" | "assign_ai" | "escalate_to_human" | "offer_payment_plan" | "create_case";
  /** Channel for communication actions. */
  channel?: RgCommChannel;
  /** Template/message to use. */
  template?: string;
  /** Priority to assign. */
  priority?: RgRiskLevel;
  /** Order of execution (lower = earlier). */
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Dashboard / Analytics ─────────────────────────────────────────────

export interface RgAgingSummary {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d91_120: number;
  d120_plus: number;
}

export interface RgDashboardRollup {
  generatedAt: string;
  /** Total outstanding revenue in cents. */
  totalOutstandingCents: number;
  /** Overdue revenue in cents (daysOverdue > 0). */
  overdueCents: number;
  /** Collected today in cents. */
  collectedTodayCents: number;
  /** Collected this week (7 days). */
  collectedThisWeekCents: number;
  /** Collected this month (30 days). */
  collectedThisMonthCents: number;
  /** Recovery rate = recovered / total_assigned * 100. */
  recoveryRatePct: number;
  /** Collection success rate = paid / total_invoiced * 100. */
  collectionSuccessRatePct: number;
  /** Bad debt risk = sum of critical-risk outstanding / total outstanding * 100. */
  badDebtRiskPct: number;
  /** Number of customers with overdue invoices. */
  overdueCustomerCount: number;
  /** Total active collection cases. */
  openCaseCount: number;
  /** Aging breakdown in cents. */
  aging: RgAgingSummary;
  /** AI Employee performance. */
  aiPerformance: Array<{
    aiEmployeeId: string;
    name: string;
    type: RgAiEmployeeType;
    casesHandled: number;
    recoveryRatePct: number;
    messagesSent: number;
  }>;
  /** Revenue forecast (next 30/60/90 days in cents). */
  forecast: {
    days30: number;
    days60: number;
    days90: number;
  };
  /** Collection trend (last 14 days, daily collected in cents). */
  collectionTrend: Array<{ date: string; collectedCents: number }>;
  /** Revenue at risk by risk level. */
  riskBreakdown: Record<RgRiskLevel, number>;
  /** Open tasks count. */
  openTaskCount: number;
  /** Broken promises count (active). */
  brokenPromiseCount: number;
  /** Total customers. */
  totalCustomerCount: number;
}

export interface RgCustomerProfile {
  customer: RgCustomer;
  invoices: RgInvoice[];
  cases: RgCollectionCase[];
  promises: RgPaymentPromise[];
  communications: RgCommunication[];
  tasks: RgTask[];
  /** AI insights for this customer. */
  insights: RgCustomerInsight[];
}

export interface RgCustomerInsight {
  type: "risk_warning" | "payment_prediction" | "best_contact_time" | "best_channel" | "recovery_recommendation" | "lifetime_value";
  message: string;
  confidence: number;
  data?: Record<string, unknown>;
}

export interface RgAccountManagerWorkspace {
  assignedCustomers: number;
  overdueCustomers: number;
  openTasks: RgTask[];
  dailyTargetCents: number;
  collectedTodayCents: number;
  collectedThisWeekCents: number;
  upcomingPromises: RgPaymentPromise[];
  escalatedCases: RgCollectionCase[];
  performance: {
    recoveryRatePct: number;
    avgResolutionDays: number;
    customerSatisfactionScore: number;
  };
}

export interface RgExecutiveReport {
  generatedAt: string;
  period: { from: string; to: string };
  summary: {
    totalInvoicedCents: number;
    totalCollectedCents: number;
    totalOutstandingCents: number;
    totalOverdueCents: number;
    recoveryRatePct: number;
    avgCollectionDays: number;
  };
  aging: RgAgingSummary;
  topOverdueCustomers: Array<{ customerId: string; name: string; outstandingCents: number; daysOverdue: number }>;
  aiVsHumanPerformance: {
    aiRecoveredCents: number;
    humanRecoveredCents: number;
    aiCasesClosed: number;
    humanCasesClosed: number;
  };
  cashFlowForecast: { week1: number; week2: number; week3: number; week4: number };
  recommendations: string[];
}

// ─── Create / Update Inputs ────────────────────────────────────────────

export const RgCustomerUpsertSchema = z.object({
  externalRef: z.string().optional(),
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  phone: z.string().max(30).optional(),
  company: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  creditLimitCents: z.number().int().min(0).default(0),
  status: z.enum(RG_CUSTOMER_STATUSES).default("active"),
  accountManagerId: z.string().optional(),
  aiEmployeeId: z.string().optional(),
  preferredChannel: z.enum(RG_COMM_CHANNELS).optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().default(""),
});
export type RgCustomerUpsertInput = z.input<typeof RgCustomerUpsertSchema>;

export const RgInvoiceCreateSchema = z.object({
  customerId: z.string().min(1),
  number: z.string().min(1).max(64),
  currency: z.string().length(3).default("USD"),
  lines: z.array(z.object({
    description: z.string().min(1).max(500),
    quantity: z.number().positive(),
    unitPriceCents: z.number().int().min(0),
    totalCents: z.number().int().min(0),
  })).min(1),
  issueDate: z.string().datetime().optional(),
  dueDate: z.string().datetime(),
});
export type RgInvoiceCreateInput = z.input<typeof RgInvoiceCreateSchema>;

export const RgCollectionCaseCreateSchema = z.object({
  customerId: z.string().min(1),
  primaryInvoiceId: z.string().min(1),
  invoiceIds: z.array(z.string()).default([]),
  priority: z.enum(RG_RISK_LEVELS).default("medium"),
  aiEmployeeId: z.string().optional(),
  accountManagerId: z.string().optional(),
});
export type RgCollectionCaseCreateInput = z.input<typeof RgCollectionCaseCreateSchema>;

export const RgPaymentPromiseCreateSchema = z.object({
  customerId: z.string().min(1),
  caseId: z.string().optional(),
  invoiceId: z.string().optional(),
  amountCents: z.number().int().min(1),
  promisedDate: z.string().datetime(),
  confidenceScore: z.number().min(0).max(1).default(0.5),
  notes: z.string().default(""),
  recordedBy: z.string().min(1),
});
export type RgPaymentPromiseCreateInput = z.input<typeof RgPaymentPromiseCreateSchema>;

export const RgCommunicationCreateSchema = z.object({
  customerId: z.string().min(1),
  caseId: z.string().optional(),
  channel: z.enum(RG_COMM_CHANNELS),
  direction: z.enum(RG_COMM_DIRECTIONS),
  subject: z.string().max(500).optional(),
  body: z.string().min(1).max(10000),
  automated: z.boolean().default(false),
  aiEmployeeId: z.string().optional(),
  deliveryStatus: z.enum(["queued", "sent", "delivered", "read", "failed", "bounced"]).default("queued"),
});
export type RgCommunicationCreateInput = z.input<typeof RgCommunicationCreateSchema>;

export const RgAiEmployeeCreateSchema = z.object({
  type: z.enum(RG_AI_EMPLOYEE_TYPES),
  name: z.string().min(1).max(100),
  description: z.string().max(1000).default(""),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
});
export type RgAiEmployeeCreateInput = z.input<typeof RgAiEmployeeCreateSchema>;

export const RgTaskCreateSchema = z.object({
  customerId: z.string().optional(),
  caseId: z.string().optional(),
  assigneeId: z.string().optional(),
  aiEmployeeId: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(""),
  priority: z.enum(RG_RISK_LEVELS).default("medium"),
  dueAt: z.string().datetime(),
});
export type RgTaskCreateInput = z.input<typeof RgTaskCreateSchema>;

export const RgCollectionRuleCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).default(""),
  enabled: z.boolean().default(true),
  triggerDaysOverdue: z.number().int().min(0).default(1),
  action: z.enum(["send_reminder", "send_overdue_notice", "assign_ai", "escalate_to_human", "offer_payment_plan", "create_case"]),
  channel: z.enum(RG_COMM_CHANNELS).optional(),
  template: z.string().max(5000).optional(),
  priority: z.enum(RG_RISK_LEVELS).optional(),
  order: z.number().int().min(0).default(0),
});
export type RgCollectionRuleCreateInput = z.input<typeof RgCollectionRuleCreateSchema>;
