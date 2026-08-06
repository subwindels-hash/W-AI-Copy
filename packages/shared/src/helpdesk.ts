// Session 95 — Enterprise Helpdesk & Customer Support.
//
// The platform now ships all Phase-3 named Enterprise Applications; the
// master spec's capability catalog names Customer Support among its AI
// Workforces, and enterprise stacks pair CRM with a support desk. This
// module ships org-scoped tickets with an honest lifecycle, a comment
// timeline (with internal staff notes), deterministic SLA tracking,
// assignment, a rollup computed from stored records, and CRM integration.
//
// Types are prefixed `Hd`. Single source of truth shared by the API service,
// the HTTP routes and the web client.

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────────

export const HD_TICKET_STATUSES = ["new", "open", "pending", "resolved", "closed"] as const;
export type HdTicketStatus = (typeof HD_TICKET_STATUSES)[number];

export const HD_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type HdPriority = (typeof HD_PRIORITIES)[number];

export const HD_CHANNELS = ["email", "chat", "phone", "web", "other"] as const;
export type HdChannel = (typeof HD_CHANNELS)[number];

/** Target resolution hours per priority — drives deterministic SLA due dates. */
export const HD_SLA_TARGET_HOURS: Record<HdPriority, number> = {
  low: 72,
  medium: 24,
  high: 8,
  urgent: 2,
};

/** Statuses that count as "open" (not yet resolved or closed). */
export const HD_OPEN_STATUSES: ReadonlySet<HdTicketStatus> = new Set(["new", "open", "pending"]);

// ─── Records ────────────────────────────────────────────────────────────

export interface HdTicket {
  id: string;
  number: string;
  organizationId: string;
  subject: string;
  description: string | null;
  status: HdTicketStatus;
  priority: HdPriority;
  channel: HdChannel;
  requesterName: string;
  requesterEmail: string | null;
  assigneeId: string | null;
  contactId: string | null;
  companyId: string | null;
  tags: string[];
  slaDueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HdComment {
  id: string;
  organizationId: string;
  ticketId: string;
  authorName: string;
  authorId: string | null;
  body: string;
  internal: boolean;
  createdAt: string;
}

export interface HdTicketDetail extends HdTicket {
  comments: HdComment[];
}

export interface HdRollup {
  counts: {
    tickets: number;
    open: number;
    resolved: number;
    closed: number;
    overdue: number;
    unassigned: number;
  };
  byPriority: Array<{ priority: HdPriority; count: number }>;
  /** 0–1 over resolved tickets measured against their SLA due dates, or null when none resolved. */
  slaCompliancePct: number | null;
  /** Mean resolution time in hours over resolved tickets, or null. */
  avgResolutionHours: number | null;
  byAssignee: Array<{ assigneeId: string | null; count: number }>;
  recentTickets: HdTicket[];
  lastUpdatedAt: string | null;
}

// ─── Input schemas (validated at the API boundary) ──────────────────────

export const HdTicketUpsertSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  description: z.string().max(8000).nullable().optional(),
  status: z.enum(HD_TICKET_STATUSES).default("new"),
  priority: z.enum(HD_PRIORITIES).default("medium"),
  channel: z.enum(HD_CHANNELS).default("web"),
  requesterName: z.string().trim().min(1).max(120),
  requesterEmail: z.string().trim().email().max(254).nullable().optional(),
  assigneeId: z.string().trim().max(64).nullable().optional(),
  contactId: z.string().trim().max(64).nullable().optional(),
  companyId: z.string().trim().max(64).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type HdTicketUpsertInput = z.infer<typeof HdTicketUpsertSchema>;
export type HdTicketCreateInput = z.input<typeof HdTicketUpsertSchema>;

export const HdCommentCreateSchema = z.object({
  authorName: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
  internal: z.boolean().default(false),
});
/** Pre-parse input (defaulted fields optional) — used by the service directly. */
export type HdCommentCreateInput = z.input<typeof HdCommentCreateSchema>;

export const HdTransitionSchema = z.object({
  status: z.enum(HD_TICKET_STATUSES),
});
export type HdTransitionInput = z.infer<typeof HdTransitionSchema>;

export const HdAssignSchema = z.object({
  assigneeId: z.string().trim().max(64).nullable(),
});
export type HdAssignInput = z.infer<typeof HdAssignSchema>;
