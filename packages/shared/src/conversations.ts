/**
 * Sessions 2/3/4 + 112 — Conversations / Messaging contracts.
 *
 * Sessions 2–4 shipped the Prisma-backed conversation and message services but
 * never published a shared contract: the web client re-declared its own
 * `Conversation`/`ChatMessage` interfaces in `apps/web/src/lib/chat.ts`, so the
 * two halves of the module could drift silently. This file is that contract,
 * and it is deliberately conservative about what the platform claims to know:
 *
 *   - **Unread counts are derived, not asserted.** `ConvReadState.basis` says
 *     exactly how the number was produced. A participant who has never marked
 *     the thread read reports `never_marked_read` rather than pretending that
 *     every message is unread by policy, and the caller's own messages are
 *     never counted against them (`excludesOwnMessages`).
 *   - **Usage totals only sum rows that recorded usage.** A conversation whose
 *     messages predate token accounting reports `tokensIn: null` alongside
 *     `messagesMissingUsage`, instead of a confident `0`.
 *   - **Search is substring matching, and says so.** `matchKind` is
 *     `"substring_case_insensitive"`; nothing here is semantic or ranked, and
 *     excerpts are verbatim slices of the stored message.
 *   - **The digest is extractive and machine-checkable.** `ConvDigest.kind` is
 *     `"extractive_deterministic"` with `aiGenerated: false`: it quotes stored
 *     text and counts terms. No model is called, and no sentence is invented.
 *   - **Nothing is destroyed.** Redaction blanks a message body and records who
 *     did it and when; the row, its ordering and its usage counters survive for
 *     audit. Deleting a conversation remains a soft delete and is reversible by
 *     its creator.
 */
import { z } from "zod";

/* ── Enumerations ─────────────────────────────────────────────────────── */

export const CONV_PARTICIPANT_KINDS = ["user", "agent"] as const;
export type ConvParticipantKind = typeof CONV_PARTICIPANT_KINDS[number];

export const CONV_MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;
export type ConvMessageRole = typeof CONV_MESSAGE_ROLES[number];

export const CONV_MESSAGE_STATUSES = [
  "pending", "streaming", "completed", "failed", "cancelled",
] as const;
export type ConvMessageStatus = typeof CONV_MESSAGE_STATUSES[number];

/** How an unread count was arrived at. Never omitted from a read state. */
export const CONV_READ_BASES = ["last_read_at", "never_marked_read"] as const;
export type ConvReadBasis = typeof CONV_READ_BASES[number];

export const CONV_TRANSCRIPT_FORMATS = ["json", "markdown"] as const;
export type ConvTranscriptFormat = typeof CONV_TRANSCRIPT_FORMATS[number];

/* ── Participants ─────────────────────────────────────────────────────── */

export interface ConvParticipant {
  id: string;
  conversationId: string;
  kind: ConvParticipantKind;
  userId: string | null;
  agentId: string | null;
  /** Best available human label; `null` when the linked row has no name set. */
  displayName: string | null;
  joinedAt: string;
  /** `null` until this participant marks the conversation read. */
  lastReadAt: string | null;
  /** True for the participant row belonging to the conversation's creator. */
  isCreator: boolean;
}

/* ── Read state ───────────────────────────────────────────────────────── */

export interface ConvReadState {
  conversationId: string;
  userId: string;
  lastReadAt: string | null;
  basis: ConvReadBasis;
  unreadCount: number;
  /** Always true: a participant's own messages are not unread to them. */
  excludesOwnMessages: true;
  latestMessageAt: string | null;
}

export interface ConvUnreadItem {
  conversationId: string;
  title: string;
  unreadCount: number;
  lastMessageAt: string;
  lastReadAt: string | null;
  basis: ConvReadBasis;
}

export interface ConvUnreadSummary {
  items: ConvUnreadItem[];
  totalUnread: number;
  conversationsWithUnread: number;
  /** How many conversations were actually inspected for this answer. */
  inspectedConversations: number;
  /** True when the caller has more conversations than `limit` allowed. */
  truncated: boolean;
  generatedAt: string;
}

/* ── Messages ─────────────────────────────────────────────────────────── */

export interface ConvMessageAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ConvMessageEdit {
  editedAt: string;
  editedBy: string;
  reason: string | null;
  /** Length of the body this edit replaced — the body itself is not retained. */
  previousLength: number;
}

export interface ConvMessageRedaction {
  redactedAt: string;
  redactedBy: string;
  reason: string | null;
  /** Length of the body that was blanked, so the audit trail stays meaningful. */
  redactedLength: number;
}

export interface ConvMessage {
  id: string;
  conversationId: string;
  role: ConvMessageRole;
  content: string;
  status: ConvMessageStatus;
  modelId: string | null;
  agentId: string | null;
  userId: string | null;
  parentId: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costMicros: number | null;
  durationMs: number | null;
  createdAt: string;
  attachments: ConvMessageAttachment[];
  /** Present only when the body has been edited at least once. */
  edits: ConvMessageEdit[];
  /** Present only when the body has been blanked. */
  redaction: ConvMessageRedaction | null;
}

/* ── Statistics ───────────────────────────────────────────────────────── */

export interface ConvUsageTotals {
  /** Messages that recorded at least one usage counter. */
  messagesWithUsage: number;
  /** Messages that recorded none — the reason a total may be `null`. */
  messagesMissingUsage: number;
  /** `null` when no message in the thread recorded the counter. */
  tokensIn: number | null;
  tokensOut: number | null;
  costMicros: number | null;
  /** Mean of recorded assistant durations; `null` when none were recorded. */
  avgAssistantDurationMs: number | null;
}

export interface ConvStats {
  conversationId: string;
  messageCount: number;
  byRole: Record<ConvMessageRole, number>;
  byStatus: Record<ConvMessageStatus, number>;
  participantCount: number;
  humanParticipants: number;
  agentParticipants: number;
  redactedMessages: number;
  editedMessages: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  usage: ConvUsageTotals;
  /** Everything above is counted from stored rows; nothing is estimated. */
  measuredFrom: "stored_messages";
  generatedAt: string;
}

/* ── Search ───────────────────────────────────────────────────────────── */

export interface ConvSearchHit {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  role: ConvMessageRole;
  createdAt: string;
  /** Verbatim slice of the stored body around the first match. */
  excerpt: string;
  /** Character offset of the first match inside the stored body. */
  matchOffset: number;
  excerptTruncated: boolean;
}

export interface ConvSearchResult {
  query: string;
  hits: ConvSearchHit[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
  /** Conversations the caller could see and that were therefore searched. */
  searchedConversations: number;
  /** Honest description of the matcher: not semantic, not ranked. */
  matchKind: "substring_case_insensitive";
}

/* ── Transcript / export ──────────────────────────────────────────────── */

export interface ConvTranscriptEntry {
  index: number;
  role: ConvMessageRole;
  author: string;
  content: string;
  createdAt: string;
  redacted: boolean;
}

export interface ConvTranscript {
  conversationId: string;
  title: string;
  format: ConvTranscriptFormat;
  entries: ConvTranscriptEntry[];
  /** Rendered document; `null` when `format` is `"json"`. */
  markdown: string | null;
  messageCount: number;
  redactedMessages: number;
  exportedAt: string;
  exportedBy: string;
}

/* ── Digest ───────────────────────────────────────────────────────────── */

export interface ConvDigestTerm {
  term: string;
  occurrences: number;
}

export interface ConvDigest {
  conversationId: string;
  /** Extractive: quotes stored text and counts terms. No model is invoked. */
  kind: "extractive_deterministic";
  aiGenerated: false;
  disclaimer: string;
  /** Verbatim opening excerpt, `null` when the thread has no readable body. */
  openingExcerpt: string | null;
  /** Verbatim most-recent excerpt, `null` when the thread has no readable body. */
  latestExcerpt: string | null;
  keywords: ConvDigestTerm[];
  messageCount: number;
  /** Messages skipped because their body was redacted or empty. */
  skippedMessages: number;
  participantCount: number;
  generatedAt: string;
}

/* ── Soft-deleted conversations ───────────────────────────────────────── */

export interface ConvDeletedConversation {
  id: string;
  title: string;
  deletedAt: string;
  lastMessageAt: string;
  messageCount: number;
  /** Only the creator may restore, so the caller can hide the control. */
  restorableByCaller: boolean;
}

/* ── Input schemas ────────────────────────────────────────────────────── */

export const ConvAddParticipantSchema = z
  .object({
    userId: z.string().cuid().optional(),
    agentId: z.string().cuid().optional(),
  })
  .refine((v) => Boolean(v.userId) !== Boolean(v.agentId), {
    message: "Provide exactly one of userId or agentId",
  });
export type ConvAddParticipantInput = z.infer<typeof ConvAddParticipantSchema>;

export const ConvMarkReadSchema = z.object({
  /** Defaults to now. Never accepted in the future. */
  at: z.string().datetime().optional(),
});
export type ConvMarkReadInput = z.infer<typeof ConvMarkReadSchema>;

export const ConvUnreadQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ConvUnreadQuery = z.infer<typeof ConvUnreadQuerySchema>;

export const ConvSearchQuerySchema = z.object({
  q: z.string().min(2).max(200),
  conversationId: z.string().cuid().optional(),
  role: z.enum(CONV_MESSAGE_ROLES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});
export type ConvSearchQuery = z.infer<typeof ConvSearchQuerySchema>;

export const ConvEditMessageSchema = z.object({
  content: z.string().min(1).max(20000),
  reason: z.string().max(500).optional(),
});
export type ConvEditMessageInput = z.infer<typeof ConvEditMessageSchema>;

export const ConvRedactMessageSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type ConvRedactMessageInput = z.infer<typeof ConvRedactMessageSchema>;

export const ConvTranscriptQuerySchema = z.object({
  format: z.enum(CONV_TRANSCRIPT_FORMATS).default("json"),
  includeSystem: z.enum(["true", "false"]).default("true"),
});
export type ConvTranscriptQuery = z.infer<typeof ConvTranscriptQuerySchema>;

export const ConvDigestQuerySchema = z.object({
  maxKeywords: z.coerce.number().int().min(1).max(25).default(8),
});
export type ConvDigestQuery = z.infer<typeof ConvDigestQuerySchema>;

export const ConvDeletedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});
export type ConvDeletedQuery = z.infer<typeof ConvDeletedQuerySchema>;

/** Stop words excluded from the extractive digest's term counts. */
export const CONV_DIGEST_STOP_WORDS: readonly string[] = [
  "a", "about", "after", "all", "also", "am", "an", "and", "any", "are", "as",
  "at", "be", "because", "been", "before", "being", "but", "by", "can", "could",
  "did", "do", "does", "doing", "done", "for", "from", "get", "got", "had",
  "has", "have", "having", "he", "her", "here", "him", "his", "how", "i", "if",
  "in", "into", "is", "it", "its", "just", "like", "make", "many", "may", "me",
  "might", "more", "most", "must", "my", "no", "not", "now", "of", "on", "one",
  "only", "or", "other", "our", "out", "over", "own", "please", "said", "same",
  "see", "she", "should", "so", "some", "such", "than", "that", "the", "their",
  "them", "then", "there", "these", "they", "this", "those", "through", "to",
  "too", "under", "up", "us", "use", "very", "was", "we", "were", "what",
  "when", "where", "which", "while", "who", "why", "will", "with", "would",
  "you", "your",
];

/** Public disclaimer attached to every digest response. */
export const CONV_DIGEST_DISCLAIMER =
  "Extractive digest: excerpts are verbatim slices of stored messages and " +
  "keywords are raw term counts. No language model produced this text and no " +
  "content was summarised or inferred.";

/* ── Conversation-management sidebar (pin / archive / share) ─────────────── */

export const CONV_SHARE_ACCESS = [
  "anyone_with_link",
  "organization",
  "restricted",
  "specific",
] as const;
export type ConvShareAccess = typeof CONV_SHARE_ACCESS[number];

export const CONV_SHARE_PERMISSIONS = ["view", "comment", "edit"] as const;
export type ConvSharePermission = typeof CONV_SHARE_PERMISSIONS[number];

/**
 * What a conversation-management action did, so the UI can show the exact
 * confirmation copy the task description expects.
 */
export interface ConvAction {
  id: string;
  title: string;
  action: string;
  performedAt: string;
}

export interface ConversationShare {
  id: string;
  conversationId: string;
  token: string;
  access: ConvShareAccess;
  permissions: ConvSharePermission;
  allowed: string[];
  hasPassword: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  createdAt: string;
  url: string;
}

export interface ConversationShareAccessRecord {
  id: string;
  shareId: string;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  granted: boolean;
  reason: string | null;
  createdAt: string;
}

export const ConvCreateShareSchema = z.object({
  access: z.enum(CONV_SHARE_ACCESS).default("anyone_with_link"),
  permissions: z.enum(CONV_SHARE_PERMISSIONS).default("view"),
  /** For `restricted`/`specific`: user ids or emails that may open the link. */
  allowed: z.array(z.string().min(3).max(320)).max(100).default([]),
  /** Optional password protection. */
  password: z.string().min(4).max(128).optional(),
  /** Optional expiry. */
  expiresAt: z.string().datetime().optional(),
});
/** Client-facing input: fields with defaults are optional on the way in. */
export type ConvCreateShareInput = z.input<typeof ConvCreateShareSchema>;

export const ConvUpdateShareSchema = z.object({
  access: z.enum(CONV_SHARE_ACCESS).optional(),
  permissions: z.enum(CONV_SHARE_PERMISSIONS).optional(),
  allowed: z.array(z.string().min(3).max(320)).max(100).optional(),
  password: z.string().min(4).max(128).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});
export type ConvUpdateShareInput = z.input<typeof ConvUpdateShareSchema>;

export const ConvResolveShareSchema = z.object({
  password: z.string().min(4).max(128).optional(),
});
export type ConvResolveShareInput = z.infer<typeof ConvResolveShareSchema>;

/** Public-ish representation of a resolved share (never includes private
 * admin data such as the token owner's id or the share id). */
export interface ConvSharedView {
  conversationId: string;
  title: string;
  summary: string | null;
  permissions: ConvSharePermission;
  ownerName: string | null;
  createdAt: string;
  lastMessageAt: string;
  messages: Array<{
    id: string;
    role: string;
    author: string;
    content: string;
    createdAt: string;
    redacted: boolean;
  }>;
}

export const ConvRenameSchema = z.object({
  title: z.string().trim().min(1).max(200),
});
export type ConvRenameInput = z.infer<typeof ConvRenameSchema>;
