// Session 91 — Enterprise Email Intelligence.
//
// The master spec's Phase-3 Enterprise Applications list includes Email
// Intelligence; until now the platform had no email surface. This module
// ships an org-scoped mailbox registry, a threaded message store, a real
// (dependency-free) SMTP outbox connector, AI drafting/summarize/triage via
// the existing ProviderRegistry (with deterministic, explicitly-labeled
// fallbacks), and a deterministic inbox-analytics rollup.
//
// Types are prefixed `Ei`. Single source of truth shared by the API service,
// the HTTP routes and the web client.

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────────

export const EI_MAILBOX_PROVIDERS = ["gmail", "outlook", "custom", "other"] as const;
export type EiMailboxProvider = (typeof EI_MAILBOX_PROVIDERS)[number];

export const EI_MAILBOX_STATUSES = ["configured", "pending", "error"] as const;
export type EiMailboxStatus = (typeof EI_MAILBOX_STATUSES)[number];

export const EI_MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
export type EiMessageDirection = (typeof EI_MESSAGE_DIRECTIONS)[number];

export const EI_OUTBOX_STATUSES = ["none", "queued", "sending", "sent", "failed"] as const;
export type EiOutboxStatus = (typeof EI_OUTBOX_STATUSES)[number];

export const EI_TRIAGE_LABELS = ["urgent", "needs_reply", "informational"] as const;
export type EiTriageLabel = (typeof EI_TRIAGE_LABELS)[number];

// ─── Records ────────────────────────────────────────────────────────────

export interface EiMailbox {
  id: string;
  organizationId: string;
  name: string;
  emailAddress: string;
  provider: EiMailboxProvider;
  imapHost: string | null;
  imapPort: number | null;
  smtpHost: string | null;
  smtpPort: number | null;
  username: string | null;
  /** True when encrypted credentials are stored (never expose the blob). */
  hasCredentials: boolean;
  status: EiMailboxStatus;
  lastSyncAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EiMessage {
  id: string;
  organizationId: string;
  mailboxId: string;
  threadId: string;
  messageId: string;
  direction: EiMessageDirection;
  fromName: string | null;
  fromAddress: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  sentAt: string | null;
  receivedAt: string;
  labels: string[];
  isRead: boolean;
  attachmentsCount: number;
  inReplyTo: string | null;
  references: string[];
  contactId: string | null;
  dealId: string | null;
  companyId: string | null;
  outboxStatus: EiOutboxStatus;
  outboxError: string | null;
  smtpResponse: string | null;
  deliveredAt: string | null;
}

export interface EiThread {
  threadId: string;
  organizationId: string;
  mailboxId: string;
  subject: string;
  lastActivityAt: string;
  messageCount: number;
  participants: string[];
  labels: string[];
  unreadCount: number;
  lastMessageId: string;
}

export interface EiThreadDetail extends EiThread {
  messages: EiMessage[];
  summary: EiThreadSummary;
  triage: EiTriageResult;
}

export interface EiDashboardRollup {
  counts: {
    mailboxes: number;
    messages: number;
    unread: number;
    inbound: number;
    outbound: number;
    queued: number;
    sent: number;
    failed: number;
    threads: number;
  };
  last7dMessages: number;
  topSenders: Array<{ email: string; count: number }>;
  /** Mean reply latency from real timestamps, or null when unmeasurable. */
  avgResponseMs: number | null;
  unreadByMailbox: Array<{ mailboxId: string; name: string; unread: number }>;
  openThreads: EiThread[];
  recentMessages: EiMessage[];
  lastUpdatedAt: string | null;
}

export interface EiThreadSummary {
  threadId: string;
  summaryKind: "ai" | "deterministic";
  summary: string;
  participants: string[];
  messageCount: number;
  dateRange: { from: string; to: string } | null;
  keywords: string[];
  actionables: string[];
}

export interface EiTriageResult {
  threadId: string;
  triageKind: "ai" | "heuristic";
  urgencyScore: number;
  label: EiTriageLabel;
  suggestedAction: string;
  reasons: string[];
}

// ─── Input schemas (validated at the API boundary) ──────────────────────

export const EiMailboxUpsertSchema = z.object({
  name: z.string().trim().min(1).max(80),
  emailAddress: z.string().trim().email().max(254),
  provider: z.enum(EI_MAILBOX_PROVIDERS).default("custom"),
  imapHost: z.string().trim().max(200).nullable().optional(),
  imapPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpHost: z.string().trim().max(200).nullable().optional(),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  username: z.string().trim().max(200).nullable().optional(),
  password: z.string().max(400).nullable().optional(),
});
export type EiMailboxUpsertInput = z.infer<typeof EiMailboxUpsertSchema>;
/** Pre-parse input (defaulted fields optional) — used by the service directly. */
export type EiMailboxCreateInput = z.input<typeof EiMailboxUpsertSchema>;

const emailList = z.array(z.string().trim().email().max(254)).max(50).default([]);

export const EiMessageCreateSchema = z.object({
  mailboxId: z.string().trim().min(1).max(64),
  direction: z.enum(EI_MESSAGE_DIRECTIONS).default("inbound"),
  messageId: z.string().trim().max(320).optional(),
  fromName: z.string().trim().max(160).nullable().optional(),
  fromAddress: z.string().trim().email().max(254),
  to: emailList,
  cc: emailList,
  subject: z.string().trim().max(500).default("(no subject)"),
  bodyText: z.string().trim().min(1).max(200_000),
  bodyHtml: z.string().max(500_000).nullable().optional(),
  sentAt: z.string().datetime().nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  isRead: z.boolean().default(false),
  attachmentsCount: z.number().int().min(0).max(100).default(0),
  inReplyTo: z.string().trim().max(320).nullable().optional(),
  references: z.array(z.string().trim().max(320)).max(50).default([]),
  contactId: z.string().trim().max(64).nullable().optional(),
  dealId: z.string().trim().max(64).nullable().optional(),
  companyId: z.string().trim().max(64).nullable().optional(),
  outboxStatus: z.enum(EI_OUTBOX_STATUSES).default("none"),
});
export type EiMessageCreateInput = z.infer<typeof EiMessageCreateSchema>;
/** Pre-parse input (defaulted fields optional) — used by the service directly. */
export type EiMessageCreateRequest = z.input<typeof EiMessageCreateSchema>;

export const EiDraftSchema = z.object({
  context: z.string().trim().min(1).max(20_000),
  tone: z.string().trim().max(60).optional(),
  length: z.enum(["short", "medium", "long"]).optional(),
  recipient: z.string().trim().email().max(254).optional(),
  subjectHint: z.string().trim().max(200).optional(),
});
export type EiDraftInput = z.infer<typeof EiDraftSchema>;

export const EiSummarizeSchema = z.object({ threadId: z.string().trim().min(1).max(64) });
export const EiTriageSchema = z.object({ threadId: z.string().trim().min(1).max(64) });
