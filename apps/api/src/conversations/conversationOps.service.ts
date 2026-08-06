/**
 * Session 112 — Conversations / Messaging operations.
 *
 * Sessions 2–4 delivered the thread itself: create a conversation, stream a
 * reply, list the messages. Everything *around* the thread was missing, and
 * the gaps were not cosmetic — they were columns the schema already had and
 * nothing ever wrote:
 *
 *   - `ConversationParticipant.lastReadAt` existed since Session 2 and was
 *     never set by any code path, so an unread count could not be computed at
 *     all. There was also no way to add or remove a participant after the
 *     conversation was created: the creator plus whichever agents were
 *     @mentioned on the first send were the permanent roster.
 *   - A stored `Message` could never be corrected or withdrawn. A typo, or a
 *     credential pasted into a thread, was permanent.
 *   - Search matched conversation *titles* only; the message bodies — the part
 *     users actually remember — were unsearchable.
 *   - `deleteConversation` soft-deleted, but nothing could list or restore a
 *     soft-deleted thread, so the soft delete was a hard delete with extra
 *     rows.
 *
 * This service adds those operations, and is deliberately careful about the
 * claims it makes:
 *
 *   - **Unread counts state their basis.** A participant who has never marked
 *     the thread read reports `basis: "never_marked_read"`; the count is then
 *     every message they did not author, which is a definition, not a guess.
 *     Own messages are never counted as unread.
 *   - **Usage totals only sum recorded values.** Messages written before token
 *     accounting report `messagesMissingUsage`, and a counter no message
 *     recorded comes back `null` rather than a confident `0`.
 *   - **Search says what it is.** `matchKind: "substring_case_insensitive"`.
 *     Excerpts are verbatim slices at a reported offset; nothing is ranked,
 *     rewritten or semantically expanded.
 *   - **The digest calls no model.** It quotes the first and last readable
 *     bodies and counts terms, and is labelled
 *     `kind: "extractive_deterministic"`, `aiGenerated: false`.
 *   - **Nothing is destroyed.** Redaction blanks a body and records who did it,
 *     when, why, and how long the body was. Edits keep an append-only trail of
 *     the same shape. Both survive in `Message.metadata.conv`.
 *
 * Storage is Prisma/Postgres — this module's records are relational rows, not
 * Redis blobs, so tenant isolation is enforced in the query layer: every read
 * and write is filtered by the caller's `organizationId` *and* by participant
 * access, and the loaded row's `organizationId` is re-checked before use.
 */
import { z } from "zod";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "../services/workspace.service.js";
import {
  CONV_DIGEST_DISCLAIMER,
  CONV_DIGEST_STOP_WORDS,
  CONV_MESSAGE_ROLES,
  CONV_MESSAGE_STATUSES,
  type ConvDeletedConversation,
  type ConvDeletedQuery,
  type ConvDigest,
  type ConvDigestQuery,
  type ConvDigestTerm,
  type ConvEditMessageInput,
  type ConvMessage,
  type ConvMessageRole,
  type ConvMessageStatus,
  type ConvAddParticipantInput,
  type ConvMarkReadInput,
  type ConvParticipant,
  type ConvReadBasis,
  type ConvReadState,
  type ConvSearchHit,
  type ConvSearchQuery,
  type ConvSearchResult,
  type ConvStats,
  type ConvTranscript,
  type ConvTranscriptEntry,
  type ConvTranscriptQuery,
  type ConvUnreadItem,
  type ConvUnreadQuery,
  type ConvUnreadSummary,
} from "@windels/shared/conversations";

/* ── Local constants ──────────────────────────────────────────────────── */

/** Edits kept per message. Older entries are dropped, the count is not. */
const MAX_EDIT_TRAIL = 20;
/** Characters of context kept on each side of a search match. */
const EXCERPT_RADIUS = 100;
/** Characters quoted verbatim in a digest excerpt. */
const DIGEST_EXCERPT_CHARS = 240;
/** Upper bound on messages scanned when building a digest for one thread. */
const DIGEST_SCAN_LIMIT = 500;

const STOP_WORDS = new Set(CONV_DIGEST_STOP_WORDS);

/* ── Small helpers ────────────────────────────────────────────────────── */

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function isoOr(value: unknown, fallback: string): string {
  return iso(value) ?? fallback;
}

/**
 * Prisma `Json` columns come back as objects, but a fixture (or an older row
 * written before the column was used) may hold the raw string form. Read both
 * rather than crashing on one.
 */
function readMeta(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as Record<string, any>;
  return {};
}

function convMeta(raw: unknown): Record<string, any> {
  const meta = readMeta(raw);
  const scoped = meta.conv;
  return scoped && typeof scoped === "object" ? (scoped as Record<string, any>) : {};
}

function toRole(raw: unknown): ConvMessageRole {
  const lowered = String(raw ?? "").toLowerCase();
  return (CONV_MESSAGE_ROLES as readonly string[]).includes(lowered)
    ? (lowered as ConvMessageRole)
    : "system";
}

function toStatus(raw: unknown): ConvMessageStatus {
  const lowered = String(raw ?? "").toLowerCase();
  return (CONV_MESSAGE_STATUSES as readonly string[]).includes(lowered)
    ? (lowered as ConvMessageStatus)
    : "pending";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Load a conversation the caller may actually see.
 *
 * Fail-closed: the organization filter is applied in the query *and* the loaded
 * row's `organizationId` is compared again before the record is handed back, so
 * a mis-scoped query can never surface another tenant's thread.
 */
async function requireAccess(userId: string, conversationId: string) {
  const ctx = await resolveUserContext(userId);
  const conv = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      organizationId: ctx.organizationId,
      deletedAt: null,
      OR: [{ createdById: userId }, { participants: { some: { userId } } }],
    },
    include: { participants: true },
  });
  if (!conv) throw AppError.notFound("Conversation not found");
  if (conv.organizationId !== ctx.organizationId) throw AppError.notFound("Conversation not found");
  return { conv, ctx };
}

/** Ids of every non-deleted conversation the caller can read in their org. */
async function accessibleConversations(userId: string, organizationId: string, onlyId?: string) {
  const rows = await prisma.conversation.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(onlyId ? { id: onlyId } : {}),
      OR: [{ createdById: userId }, { participants: { some: { userId } } }],
    },
    select: { id: true, title: true },
  });
  return rows as Array<{ id: string; title: string }>;
}

/* ── Participants ─────────────────────────────────────────────────────── */

async function labelParticipants(
  rows: Array<Record<string, any>>,
  conversationId: string,
  createdById: string
): Promise<ConvParticipant[]> {
  const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];
  const agentIds = [...new Set(rows.map((r) => r.agentId).filter(Boolean))] as string[];

  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, include: { profile: true } })
    : [];
  const agents = agentIds.length
    ? await prisma.agent.findMany({ where: { id: { in: agentIds } } })
    : [];

  const userById = new Map<string, any>(users.map((u: any) => [u.id, u]));
  const agentById = new Map<string, any>(agents.map((a: any) => [a.id, a]));

  return rows
    .map((row) => {
      const kind = row.agentId ? "agent" : "user";
      const user = row.userId ? userById.get(row.userId) : null;
      const agent = row.agentId ? agentById.get(row.agentId) : null;
      const displayName = agent
        ? (agent.name ?? null)
        : (user?.profile?.displayName ?? user?.email ?? null);
      return {
        id: row.id,
        conversationId,
        kind,
        userId: row.userId ?? null,
        agentId: row.agentId ?? null,
        displayName,
        joinedAt: isoOr(row.joinedAt, isoOr(row.createdAt, new Date(0).toISOString())),
        lastReadAt: iso(row.lastReadAt),
        isCreator: Boolean(row.userId) && row.userId === createdById,
      } satisfies ConvParticipant;
    })
    .sort((a, b) => (a.joinedAt === b.joinedAt ? a.id.localeCompare(b.id) : a.joinedAt.localeCompare(b.joinedAt)));
}

export async function listParticipants(userId: string, conversationId: string): Promise<ConvParticipant[]> {
  const { conv } = await requireAccess(userId, conversationId);
  const rows = await prisma.conversationParticipant.findMany({ where: { conversationId } });
  return labelParticipants(rows as any[], conversationId, conv.createdById);
}

export async function addParticipant(
  userId: string,
  conversationId: string,
  input: ConvAddParticipantInput
): Promise<ConvParticipant> {
  const { conv, ctx } = await requireAccess(userId, conversationId);

  if (input.userId) {
    // A participant must already belong to the conversation's organization —
    // adding someone to a thread must never widen their tenant access.
    const membership = await prisma.membership.findFirst({
      where: { userId: input.userId, organizationId: ctx.organizationId },
    });
    if (!membership) throw AppError.notFound("User is not a member of this organization");
    const existing = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: input.userId },
    });
    if (existing) throw AppError.conflict("User is already a participant");
  } else {
    const agent = await prisma.agent.findFirst({
      where: { id: input.agentId!, organizationId: ctx.organizationId },
    });
    if (!agent) throw AppError.notFound("Agent not found");
    const existing = await prisma.conversationParticipant.findFirst({
      where: { conversationId, agentId: input.agentId },
    });
    if (existing) throw AppError.conflict("Agent is already a participant");
  }

  const created = await prisma.conversationParticipant.create({
    data: {
      conversationId,
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
    },
  });
  const [labelled] = await labelParticipants([created as any], conversationId, conv.createdById);
  return labelled!;
}

export async function removeParticipant(
  userId: string,
  conversationId: string,
  participantId: string
): Promise<{ removed: true; id: string }> {
  const { conv } = await requireAccess(userId, conversationId);
  const row = await prisma.conversationParticipant.findFirst({
    where: { id: participantId, conversationId },
  });
  if (!row) throw AppError.notFound("Participant not found");
  // The creator keeps access through `createdById` regardless, so removing the
  // row would only desynchronise the roster from reality.
  if (row.userId && row.userId === conv.createdById) {
    throw AppError.conflict("The conversation creator cannot be removed from their own conversation");
  }
  await prisma.conversationParticipant.delete({ where: { id: participantId } });
  return { removed: true, id: participantId };
}

/* ── Read state ───────────────────────────────────────────────────────── */

async function computeReadState(
  conversationId: string,
  userId: string,
  lastReadAt: Date | null
): Promise<ConvReadState> {
  const basis: ConvReadBasis = lastReadAt ? "last_read_at" : "never_marked_read";
  const unreadCount = await prisma.message.count({
    where: {
      conversationId,
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
      // Assistant/agent messages carry a null userId, so both branches are
      // needed to mean "not authored by the caller".
      OR: [{ userId: null }, { userId: { not: userId } }],
    },
  });
  const latest = await prisma.message.findFirst({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
  });
  return {
    conversationId,
    userId,
    lastReadAt: iso(lastReadAt),
    basis,
    unreadCount,
    excludesOwnMessages: true,
    latestMessageAt: latest ? iso(latest.createdAt) : null,
  };
}

export async function getReadState(userId: string, conversationId: string): Promise<ConvReadState> {
  await requireAccess(userId, conversationId);
  const row = await prisma.conversationParticipant.findFirst({ where: { conversationId, userId } });
  const lastReadAt = row?.lastReadAt ? new Date(row.lastReadAt) : null;
  return computeReadState(conversationId, userId, lastReadAt);
}

export async function markRead(
  userId: string,
  conversationId: string,
  input: ConvMarkReadInput
): Promise<ConvReadState> {
  await requireAccess(userId, conversationId);
  const now = new Date();
  const at = input.at ? new Date(input.at) : now;
  if (Number.isNaN(at.getTime())) throw AppError.badRequest("Invalid timestamp");
  if (at.getTime() > now.getTime()) {
    throw AppError.badRequest("Cannot mark a conversation read at a future time");
  }

  const existing = await prisma.conversationParticipant.findFirst({ where: { conversationId, userId } });
  if (existing) {
    await prisma.conversationParticipant.update({ where: { id: existing.id }, data: { lastReadAt: at } });
  } else {
    // A creator whose participant row predates Session 2's auto-enrolment (or
    // was never written) gets one now rather than being denied a read marker.
    await prisma.conversationParticipant.create({ data: { conversationId, userId, lastReadAt: at } });
  }
  return computeReadState(conversationId, userId, at);
}

export async function unreadSummary(userId: string, query: ConvUnreadQuery): Promise<ConvUnreadSummary> {
  const ctx = await resolveUserContext(userId);
  const where = {
    organizationId: ctx.organizationId,
    deletedAt: null,
    OR: [{ createdById: userId }, { participants: { some: { userId } } }],
  };
  const total = await prisma.conversation.count({ where });
  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: query.limit,
    include: { participants: true },
  });

  const items: ConvUnreadItem[] = [];
  for (const conv of conversations as any[]) {
    const mine = (conv.participants ?? []).find((p: any) => p.userId === userId);
    const lastReadAt = mine?.lastReadAt ? new Date(mine.lastReadAt) : null;
    const state = await computeReadState(conv.id, userId, lastReadAt);
    if (state.unreadCount === 0) continue;
    items.push({
      conversationId: conv.id,
      title: conv.title,
      unreadCount: state.unreadCount,
      lastMessageAt: isoOr(conv.lastMessageAt, isoOr(conv.createdAt, new Date(0).toISOString())),
      lastReadAt: state.lastReadAt,
      basis: state.basis,
    });
  }

  return {
    items,
    totalUnread: items.reduce((sum, i) => sum + i.unreadCount, 0),
    conversationsWithUnread: items.length,
    inspectedConversations: conversations.length,
    truncated: total > conversations.length,
    generatedAt: new Date().toISOString(),
  };
}

/* ── Messages ─────────────────────────────────────────────────────────── */

function mapMessage(row: Record<string, any>): ConvMessage {
  const scoped = convMeta(row.metadata);
  const edits = Array.isArray(scoped.edits) ? scoped.edits : [];
  const redaction = scoped.redaction && typeof scoped.redaction === "object" ? scoped.redaction : null;
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: toRole(row.role),
    content: row.content ?? "",
    status: toStatus(row.status),
    modelId: row.modelId ?? null,
    agentId: row.agentId ?? null,
    userId: row.userId ?? null,
    parentId: row.parentId ?? null,
    tokensIn: numberOrNull(row.tokensIn),
    tokensOut: numberOrNull(row.tokensOut),
    costMicros: numberOrNull(row.costMicros),
    durationMs: numberOrNull(row.durationMs),
    createdAt: isoOr(row.createdAt, new Date(0).toISOString()),
    attachments: (row.attachments ?? []).map((a: any) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
    edits: edits.map((e: any) => ({
      editedAt: isoOr(e.editedAt, new Date(0).toISOString()),
      editedBy: String(e.editedBy ?? ""),
      reason: e.reason ?? null,
      previousLength: Number(e.previousLength ?? 0),
    })),
    redaction: redaction
      ? {
          redactedAt: isoOr(redaction.redactedAt, new Date(0).toISOString()),
          redactedBy: String(redaction.redactedBy ?? ""),
          reason: redaction.reason ?? null,
          redactedLength: Number(redaction.redactedLength ?? 0),
        }
      : null,
  };
}

async function loadMessage(conversationId: string, messageId: string) {
  const row = await prisma.message.findFirst({
    where: { id: messageId, conversationId },
    include: { attachments: true },
  });
  if (!row) throw AppError.notFound("Message not found");
  return row as Record<string, any>;
}

export async function getMessage(
  userId: string,
  conversationId: string,
  messageId: string
): Promise<ConvMessage> {
  await requireAccess(userId, conversationId);
  return mapMessage(await loadMessage(conversationId, messageId));
}

export async function editMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  input: ConvEditMessageInput
): Promise<ConvMessage> {
  await requireAccess(userId, conversationId);
  const row = await loadMessage(conversationId, messageId);

  if (toRole(row.role) !== "user") {
    throw AppError.conflict("Only a user message can be edited; model output is kept as produced");
  }
  if (row.userId !== userId) throw AppError.forbidden("Only the author can edit this message");
  const scoped = convMeta(row.metadata);
  if (scoped.redaction) throw AppError.conflict("A redacted message cannot be edited");

  const previous: string = row.content ?? "";
  const trail = Array.isArray(scoped.edits) ? [...scoped.edits] : [];
  trail.push({
    editedAt: new Date().toISOString(),
    editedBy: userId,
    reason: input.reason ?? null,
    previousLength: previous.length,
  });

  const metadata = {
    ...readMeta(row.metadata),
    conv: { ...scoped, edits: trail.slice(-MAX_EDIT_TRAIL), editCount: trail.length },
  };
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content: input.content, metadata },
    include: { attachments: true },
  });
  return mapMessage(updated as Record<string, any>);
}

export async function redactMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  input: { reason?: string }
): Promise<ConvMessage> {
  const { conv } = await requireAccess(userId, conversationId);
  const row = await loadMessage(conversationId, messageId);

  const isAuthor = row.userId === userId;
  const isOwner = conv.createdById === userId;
  if (!isAuthor && !isOwner) {
    throw AppError.forbidden("Only the message author or the conversation creator can redact a message");
  }
  const scoped = convMeta(row.metadata);
  if (scoped.redaction) throw AppError.conflict("Message is already redacted");

  const previous: string = row.content ?? "";
  const metadata = {
    ...readMeta(row.metadata),
    conv: {
      ...scoped,
      redaction: {
        redactedAt: new Date().toISOString(),
        redactedBy: userId,
        reason: input.reason ?? null,
        redactedLength: previous.length,
      },
    },
  };
  // The row, its ordering and its usage counters survive; only the body goes.
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content: "", metadata },
    include: { attachments: true },
  });
  return mapMessage(updated as Record<string, any>);
}

/* ── Statistics ───────────────────────────────────────────────────────── */

export async function conversationStats(userId: string, conversationId: string): Promise<ConvStats> {
  const { conv } = await requireAccess(userId, conversationId);
  const messages = (await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  })) as Array<Record<string, any>>;

  const byRole = Object.fromEntries(CONV_MESSAGE_ROLES.map((r) => [r, 0])) as Record<ConvMessageRole, number>;
  const byStatus = Object.fromEntries(CONV_MESSAGE_STATUSES.map((s) => [s, 0])) as Record<ConvMessageStatus, number>;

  let redactedMessages = 0;
  let editedMessages = 0;
  let messagesWithUsage = 0;
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  let costMicros: number | null = null;
  let durationSum = 0;
  let durationCount = 0;

  for (const m of messages) {
    byRole[toRole(m.role)] += 1;
    byStatus[toStatus(m.status)] += 1;
    const scoped = convMeta(m.metadata);
    if (scoped.redaction) redactedMessages += 1;
    if (Array.isArray(scoped.edits) && scoped.edits.length) editedMessages += 1;

    const ti = numberOrNull(m.tokensIn);
    const to = numberOrNull(m.tokensOut);
    const cm = numberOrNull(m.costMicros);
    if (ti !== null || to !== null || cm !== null) messagesWithUsage += 1;
    if (ti !== null) tokensIn = (tokensIn ?? 0) + ti;
    if (to !== null) tokensOut = (tokensOut ?? 0) + to;
    if (cm !== null) costMicros = (costMicros ?? 0) + cm;

    const dur = numberOrNull(m.durationMs);
    if (toRole(m.role) === "assistant" && dur !== null) {
      durationSum += dur;
      durationCount += 1;
    }
  }

  const participants = (conv.participants ?? []) as Array<Record<string, any>>;
  const now = new Date().toISOString();

  return {
    conversationId,
    messageCount: messages.length,
    byRole,
    byStatus,
    participantCount: participants.length,
    humanParticipants: participants.filter((p) => p.userId).length,
    agentParticipants: participants.filter((p) => p.agentId).length,
    redactedMessages,
    editedMessages,
    firstMessageAt: messages.length ? isoOr(messages[0]!.createdAt, now) : null,
    lastMessageAt: messages.length ? isoOr(messages[messages.length - 1]!.createdAt, now) : null,
    usage: {
      messagesWithUsage,
      messagesMissingUsage: messages.length - messagesWithUsage,
      tokensIn,
      tokensOut,
      costMicros,
      avgAssistantDurationMs: durationCount ? Math.round(durationSum / durationCount) : null,
    },
    measuredFrom: "stored_messages",
    generatedAt: now,
  };
}

/* ── Search ───────────────────────────────────────────────────────────── */

function buildExcerpt(content: string, needle: string): { excerpt: string; offset: number; truncated: boolean } {
  const offset = content.toLowerCase().indexOf(needle.toLowerCase());
  if (offset < 0) return { excerpt: content.slice(0, EXCERPT_RADIUS * 2), offset: -1, truncated: content.length > EXCERPT_RADIUS * 2 };
  const start = Math.max(0, offset - EXCERPT_RADIUS);
  const end = Math.min(content.length, offset + needle.length + EXCERPT_RADIUS);
  return {
    excerpt: content.slice(start, end),
    offset,
    truncated: start > 0 || end < content.length,
  };
}

export async function searchMessages(userId: string, query: ConvSearchQuery): Promise<ConvSearchResult> {
  const ctx = await resolveUserContext(userId);
  const conversations = await accessibleConversations(userId, ctx.organizationId, query.conversationId);
  const titleById = new Map(conversations.map((c) => [c.id, c.title]));
  const ids = conversations.map((c) => c.id);

  const empty: ConvSearchResult = {
    query: query.q,
    hits: [],
    pagination: { page: query.page, perPage: query.perPage, total: 0, totalPages: 0 },
    searchedConversations: ids.length,
    matchKind: "substring_case_insensitive",
  };
  if (!ids.length) return empty;

  const where = {
    conversationId: { in: ids },
    content: { contains: query.q, mode: "insensitive" as const },
    ...(query.role ? { role: query.role.toUpperCase() } : {}),
  };
  const total = await prisma.message.count({ where });
  const rows = (await prisma.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (query.page - 1) * query.perPage,
    take: query.perPage,
  })) as Array<Record<string, any>>;

  const hits: ConvSearchHit[] = rows.map((m) => {
    const content: string = m.content ?? "";
    const { excerpt, offset, truncated } = buildExcerpt(content, query.q);
    return {
      messageId: m.id,
      conversationId: m.conversationId,
      conversationTitle: titleById.get(m.conversationId) ?? "",
      role: toRole(m.role),
      createdAt: isoOr(m.createdAt, new Date(0).toISOString()),
      excerpt,
      matchOffset: offset,
      excerptTruncated: truncated,
    };
  });

  return {
    query: query.q,
    hits,
    pagination: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.ceil(total / query.perPage),
    },
    searchedConversations: ids.length,
    matchKind: "substring_case_insensitive",
  };
}

/* ── Transcript / export ──────────────────────────────────────────────── */

export async function transcript(
  userId: string,
  conversationId: string,
  query: ConvTranscriptQuery
): Promise<ConvTranscript> {
  const { conv } = await requireAccess(userId, conversationId);
  const rows = (await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  })) as Array<Record<string, any>>;

  const included = query.includeSystem === "false" ? rows.filter((m) => toRole(m.role) !== "system") : rows;

  const userIds = [...new Set(included.map((m) => m.userId).filter(Boolean))] as string[];
  const agentIds = [...new Set(included.map((m) => m.agentId).filter(Boolean))] as string[];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, include: { profile: true } })
    : [];
  const agents = agentIds.length ? await prisma.agent.findMany({ where: { id: { in: agentIds } } }) : [];
  const userById = new Map<string, any>(users.map((u: any) => [u.id, u]));
  const agentById = new Map<string, any>(agents.map((a: any) => [a.id, a]));

  let redactedMessages = 0;
  const entries: ConvTranscriptEntry[] = included.map((m, index) => {
    const scoped = convMeta(m.metadata);
    const redacted = Boolean(scoped.redaction);
    if (redacted) redactedMessages += 1;
    const role = toRole(m.role);
    const user = m.userId ? userById.get(m.userId) : null;
    const agent = m.agentId ? agentById.get(m.agentId) : null;
    const author = agent?.name ?? user?.profile?.displayName ?? user?.email ?? role;
    return {
      index,
      role,
      author,
      // A redacted body is reported as redacted rather than silently blank.
      content: redacted ? "[redacted]" : (m.content ?? ""),
      createdAt: isoOr(m.createdAt, new Date(0).toISOString()),
      redacted,
    };
  });

  const exportedAt = new Date().toISOString();
  const markdown =
    query.format === "markdown"
      ? [
          `# ${conv.title}`,
          "",
          `_Exported ${exportedAt} — ${entries.length} message(s), ${redactedMessages} redacted._`,
          "",
          ...entries.map((e) => `### ${e.author} (${e.role}) — ${e.createdAt}\n\n${e.content}\n`),
        ].join("\n")
      : null;

  return {
    conversationId,
    title: conv.title,
    format: query.format,
    entries,
    markdown,
    messageCount: entries.length,
    redactedMessages,
    exportedAt,
    exportedBy: userId,
  };
}

/* ── Extractive digest ────────────────────────────────────────────────── */

export async function digest(
  userId: string,
  conversationId: string,
  query: ConvDigestQuery
): Promise<ConvDigest> {
  const { conv } = await requireAccess(userId, conversationId);
  const rows = (await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: DIGEST_SCAN_LIMIT,
  })) as Array<Record<string, any>>;

  const readable = rows.filter((m) => {
    const scoped = convMeta(m.metadata);
    return !scoped.redaction && typeof m.content === "string" && m.content.trim().length > 0;
  });

  const counts = new Map<string, number>();
  for (const m of readable) {
    const tokens = String(m.content).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? [];
    for (const raw of tokens) {
      const term = raw.replace(/^['-]+|['-]+$/g, "");
      if (term.length < 3 || STOP_WORDS.has(term)) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  // Deterministic ordering: occurrences descending, then term ascending, so the
  // same thread always yields the same digest.
  const keywords: ConvDigestTerm[] = [...counts.entries()]
    .map(([term, occurrences]) => ({ term, occurrences }))
    .sort((a, b) => (b.occurrences - a.occurrences) || a.term.localeCompare(b.term))
    .slice(0, query.maxKeywords);

  const first = readable[0];
  const last = readable[readable.length - 1];

  return {
    conversationId,
    kind: "extractive_deterministic",
    aiGenerated: false,
    disclaimer: CONV_DIGEST_DISCLAIMER,
    openingExcerpt: first ? String(first.content).slice(0, DIGEST_EXCERPT_CHARS) : null,
    latestExcerpt: last ? String(last.content).slice(0, DIGEST_EXCERPT_CHARS) : null,
    keywords,
    messageCount: rows.length,
    skippedMessages: rows.length - readable.length,
    participantCount: ((conv.participants ?? []) as unknown[]).length,
    generatedAt: new Date().toISOString(),
  };
}

/* ── Soft-deleted conversations ───────────────────────────────────────── */

export async function listDeletedConversations(
  userId: string,
  query: ConvDeletedQuery
): Promise<{ items: ConvDeletedConversation[]; pagination: { page: number; perPage: number; total: number; totalPages: number } }> {
  const ctx = await resolveUserContext(userId);
  const where = {
    organizationId: ctx.organizationId,
    createdById: userId,
    deletedAt: { not: null },
  };
  const total = await prisma.conversation.count({ where });
  const rows = (await prisma.conversation.findMany({
    where,
    orderBy: { deletedAt: "desc" },
    skip: (query.page - 1) * query.perPage,
    take: query.perPage,
    include: { _count: { select: { messages: true } } },
  })) as Array<Record<string, any>>;

  return {
    items: rows.map((c) => ({
      id: c.id,
      title: c.title,
      deletedAt: isoOr(c.deletedAt, new Date(0).toISOString()),
      lastMessageAt: isoOr(c.lastMessageAt, isoOr(c.createdAt, new Date(0).toISOString())),
      messageCount: c._count?.messages ?? 0,
      // This listing is creator-scoped, so every row in it is restorable.
      restorableByCaller: true,
    })),
    pagination: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.ceil(total / query.perPage),
    },
  };
}

export async function restoreConversation(
  userId: string,
  conversationId: string
): Promise<{ id: string; title: string; restoredAt: string }> {
  const ctx = await resolveUserContext(userId);
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: ctx.organizationId },
  });
  if (!conv) throw AppError.notFound("Conversation not found");
  if (conv.organizationId !== ctx.organizationId) throw AppError.notFound("Conversation not found");
  if (conv.createdById !== userId) {
    throw AppError.forbidden("Only the creator can restore a deleted conversation");
  }
  if (!conv.deletedAt) throw AppError.conflict("Conversation is not deleted");

  const restoredAt = new Date();
  await prisma.conversation.update({ where: { id: conversationId }, data: { deletedAt: null } });
  return { id: conv.id, title: conv.title, restoredAt: restoredAt.toISOString() };
}

/* ── Route-facing schema re-exports ───────────────────────────────────── */

export const ConversationIdParam = z.object({ id: z.string().cuid() });
export const MessageIdParam = z.object({ id: z.string().cuid(), messageId: z.string().cuid() });
export const ParticipantIdParam = z.object({ id: z.string().cuid(), participantId: z.string().cuid() });
