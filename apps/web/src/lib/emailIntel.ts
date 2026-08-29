/** Session 91 — Enterprise Email Intelligence client. */
import { api } from "./api";

export type EiMailboxProvider = "gmail" | "outlook" | "custom" | "other";
export type EiMailboxStatus = "configured" | "pending" | "error";
export type EiMessageDirection = "inbound" | "outbound";
export type EiOutboxStatus = "none" | "queued" | "sending" | "sent" | "failed";
export type EiTriageLabel = "urgent" | "needs_reply" | "informational";

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
  avgResponseMs: number | null;
  unreadByMailbox: Array<{ mailboxId: string; name: string; unread: number }>;
  openThreads: EiThread[];
  recentMessages: EiMessage[];
  lastUpdatedAt: string | null;
}

export interface EiDraftResult {
  subject: string;
  body: string;
  provider: string;
  modelSource: "real" | "echo-demo";
  durationMs: number;
}

export interface EiMailboxCreateInput {
  name: string;
  emailAddress: string;
  provider?: EiMailboxProvider;
  imapHost?: string | null;
  imapPort?: number | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  username?: string | null;
  password?: string | null;
}

export interface EiMessageCreateInput {
  mailboxId: string;
  direction?: EiMessageDirection;
  messageId?: string;
  fromName?: string | null;
  fromAddress: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  bodyText: string;
  bodyHtml?: string | null;
  sentAt?: string | null;
  labels?: string[];
  isRead?: boolean;
  attachmentsCount?: number;
  inReplyTo?: string | null;
  references?: string[];
  contactId?: string | null;
  dealId?: string | null;
  companyId?: string | null;
  outboxStatus?: EiOutboxStatus;
}

export const emailIntelApi = {
  rollup: () => api<EiDashboardRollup>("/email-intel/dashboard/rollup"),

  listMailboxes: () => api<EiMailbox[]>("/email-intel/mailboxes"),
  createMailbox: (input: EiMailboxCreateInput) =>
    api<EiMailbox>("/email-intel/mailboxes", { method: "POST", json: input }),
  updateMailbox: (id: string, patch: Partial<EiMailboxCreateInput>) =>
    api<EiMailbox>(`/email-intel/mailboxes/${id}`, { method: "PATCH", json: patch }),
  deleteMailbox: (id: string) => api<{ deleted: boolean; id: string }>(`/email-intel/mailboxes/${id}`, { method: "DELETE" }),
  testMailbox: (id: string) => api<{ reachable: boolean; detail: string }>(`/email-intel/mailboxes/${id}/test`, { method: "POST" }),

  listThreads: (params?: { mailboxId?: string; unreadOnly?: boolean; q?: string }) =>
    api<EiThread[]>("/email-intel/threads", { params }),
  getThread: (threadId: string) => api<EiThreadDetail>(`/email-intel/threads/${threadId}`),

  listMessages: (params?: { threadId?: string; mailboxId?: string; direction?: EiMessageDirection }) =>
    api<EiMessage[]>("/email-intel/messages", { params }),
  createMessage: (input: EiMessageCreateInput) =>
    api<EiMessage>("/email-intel/messages", { method: "POST", json: input }),
  updateMessage: (id: string, patch: Partial<{ isRead: boolean; labels: string[]; contactId: string | null; dealId: string | null; companyId: string | null }>) =>
    api<EiMessage>(`/email-intel/messages/${id}`, { method: "PATCH", json: patch }),
  deleteMessage: (id: string) => api<{ deleted: boolean; id: string }>(`/email-intel/messages/${id}`, { method: "DELETE" }),
  sendMessage: (id: string) =>
    api<{ sent: boolean; reason: string; response?: string | null; error?: string | null }>(`/email-intel/messages/${id}/send`, { method: "POST" }),

  draft: (input: { context: string; tone?: string; length?: "short" | "medium" | "long"; recipient?: string; subjectHint?: string }) =>
    api<EiDraftResult>("/email-intel/intelligence/draft", { method: "POST", json: input }),
  summarize: (threadId: string) =>
    api<EiThreadSummary>("/email-intel/intelligence/summarize", { method: "POST", json: { threadId } }),
  triage: (threadId: string) =>
    api<EiTriageResult>("/email-intel/intelligence/triage", { method: "POST", json: { threadId } }),
};
