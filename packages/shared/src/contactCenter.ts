/**
 * Contact & Support Center contracts.
 *
 * A production Contact Center for WINDELS AI OS: a public contact form, an AI
 * contact assistant that classifies and routes requests, persistent contact
 * records, admin management, notifications and audit. Everything maps to the
 * real backend — no placeholders.
 */
import { z } from "zod";

/* ── Contact categories ─────────────────────────────────────────────────── */

export const CONTACT_CATEGORIES = [
  "general",
  "sales",
  "technical",
  "billing",
  "api_developer",
  "partnership",
  "enterprise",
  "security",
  "report_problem",
  "feedback",
  "other",
] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  general: "General Inquiry",
  sales: "Sales",
  technical: "Technical Support",
  billing: "Billing",
  api_developer: "API & Developer Support",
  partnership: "Partnership",
  enterprise: "Enterprise",
  security: "Security",
  report_problem: "Report a Problem",
  feedback: "Feedback",
  other: "Other",
};

/** Department each category is routed to by default. */
export const CONTACT_CATEGORY_DEPARTMENT: Record<ContactCategory, string> = {
  general: "general",
  sales: "sales",
  technical: "technical",
  billing: "billing",
  api_developer: "api",
  partnership: "partnerships",
  enterprise: "enterprise_sales",
  security: "security",
  report_problem: "technical",
  feedback: "general",
  other: "general",
};

/* ── Statuses & priorities ──────────────────────────────────────────────── */

export const CONTACT_STATUSES = [
  "new",
  "ai_handling",
  "awaiting_human",
  "assigned",
  "in_progress",
  "awaiting_customer",
  "resolved",
  "closed",
] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ContactPriority = (typeof CONTACT_PRIORITIES)[number];

export const CONTACT_METHODS = ["email", "phone", "chat"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const CONTACT_SOURCES = ["web", "ai_assistant", "api", "email"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

/* ── Contact request ────────────────────────────────────────────────────── */

export interface ContactRequestRow {
  id: string;
  requestNumber: string;
  userId: string | null;
  accountId: string | null;
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  company: string | null;
  category: ContactCategory;
  subject: string;
  message: string;
  preferredContactMethod: ContactMethod;
  aiConversationId: string | null;
  aiSummary: string | null;
  priority: ContactPriority;
  status: ContactStatus;
  department: string;
  assignedUserId: string | null;
  assignedAgentId: string | null;
  source: ContactSource;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  messageCount: number;
}

export interface ContactMessageRow {
  id: string;
  requestId: string;
  authorType: "user" | "staff" | "ai" | "system";
  authorId: string | null;
  authorName: string | null;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface ContactStatusHistoryRow {
  id: string;
  requestId: string;
  fromStatus: ContactStatus | null;
  toStatus: ContactStatus;
  changedByUserId: string | null;
  createdAt: string;
}

/* ── Contact form (public submission) ──────────────────────────────────── */

export const ContactFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  phone: z.string().trim().max(40).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  company: z.string().trim().max(160).optional().nullable(),
  category: z.enum(CONTACT_CATEGORIES).default("general"),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(10).max(10000),
  preferredContactMethod: z.enum(CONTACT_METHODS).default("email"),
  // Optional honeypot — must stay empty for humans.
  website: z.string().max(0).optional(),
  // Optional auth context.
  userId: z.string().cuid().optional(),
  accountId: z.string().max(120).optional().nullable(),
  aiConversationId: z.string().max(200).optional().nullable(),
  aiSummary: z.string().max(5000).optional().nullable(),
});
export type ContactFormInput = z.input<typeof ContactFormSchema>;

/* ── AI assistant chat ─────────────────────────────────────────────────── */

export const ContactChatStartSchema = z.object({
  // Initial user message to start the AI conversation.
  message: z.string().trim().min(1).max(4000),
  // Optional authenticated context.
  name: z.string().max(120).optional(),
  email: z.string().email().optional(),
});
export type ContactChatStartInput = z.input<typeof ContactChatStartSchema>;

export const ContactChatMessageSchema = z.object({
  conversationId: z.string().min(8).max(200),
  message: z.string().trim().min(1).max(4000),
});
export type ContactChatMessageInput = z.input<typeof ContactChatMessageSchema>;

export interface ContactAiReply {
  conversationId: string;
  reply: string;
  /** Whether the assistant has enough to create a contact request. */
  readyToSubmit: boolean;
  /** Collected contact fields so far (partial). */
  collected: Partial<ContactFormInput>;
  /** True when the assistant recommended human support. */
  needsHuman: boolean;
  /** Best-guess category. */
  category: ContactCategory;
  /** Whether the reply came from approved knowledge (vs a clarifying prompt). */
  answeredFromKnowledge: boolean;
}

/* ── Admin / my-requests filters ───────────────────────────────────────── */

export const ContactListQuerySchema = z.object({
  status: z.enum(CONTACT_STATUSES).optional(),
  category: z.enum(CONTACT_CATEGORIES).optional(),
  department: z.string().max(80).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});
export type ContactListQuery = z.input<typeof ContactListQuerySchema>;

/* ── Admin actions ─────────────────────────────────────────────────────── */

export const ContactAssignSchema = z.object({
  userId: z.string().cuid().optional(),
  agentId: z.string().cuid().optional(),
});
export type ContactAssignInput = z.input<typeof ContactAssignSchema>;

export const ContactRespondSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  isInternal: z.boolean().default(false),
});
export type ContactRespondInput = z.input<typeof ContactRespondSchema>;

export const ContactTransitionSchema = z.object({
  to: z.enum(CONTACT_STATUSES),
});
export type ContactTransitionInput = z.input<typeof ContactTransitionSchema>;

/* ── Admin dashboard ───────────────────────────────────────────────────── */

export interface ContactDashboardRow {
  generatedAt: string;
  total: number;
  byStatus: Array<{ status: ContactStatus; count: number }>;
  byCategory: Array<{ category: ContactCategory; count: number }>;
  byCountry: Array<{ country: string; count: number }>;
  byDepartment: Array<{ department: string; count: number }>;
  aiHandled: number;
  humanHandled: number;
  avgResolutionHours: number | null;
  recent: ContactRequestRow[];
}
