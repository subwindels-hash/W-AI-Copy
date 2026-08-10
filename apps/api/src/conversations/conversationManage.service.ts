/**
 * Session — Conversation-management sidebar (pin, archive, share, rename).
 *
 * Additive to the existing Session 2/3/4 + 112 conversation module. This
 * service implements the state transitions the sidebar exposes:
 *
 *   - Rename (title, validated, preserves the conversation id).
 *   - Pin / Unpin (dedicated Pinned section; never destroys data).
 *   - Archive / Unarchive (moves the thread out of the active list while
 *     preserving messages, memory references and metadata; a soft state flag,
 *     never a delete).
 *   - Share links with access-control tiers (anyone_with_link, organization,
 *     restricted, specific) plus optional password and expiry.
 *   - Revocation / permanent deletion of shares.
 *
 * Every read and write is tenant-isolated via `resolveUserContext` plus
 * participant/creator access (fail-closed), matching the rest of the module.
 * Sensitive state transitions are recorded through the existing audit service.
 */
import { z } from "zod";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "../services/workspace.service.js";
import { auditService } from "../audit/audit.service.js";
import type {
  ConvCreateShareInput,
  ConvUpdateShareInput,
  ConvResolveShareInput,
  ConversationShare,
  ConversationShareAccessRecord,
  ConvSharedView,
} from "@windels/shared/conversations";
import { CONV_MESSAGE_ROLES } from "@windels/shared/conversations";

const SHARE_TOKEN_BYTES = 24;

/** Fail-closed access check: caller must be in the org AND a participant/creator. */
async function requireAccess(userId: string, conversationId: string) {
  const ctx = await resolveUserContext(userId);
  const conv = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      organizationId: ctx.organizationId,
      deletedAt: null,
      OR: [{ createdById: userId }, { participants: { some: { userId } } }],
    },
  });
  if (!conv) throw AppError.notFound("Conversation not found");
  if (conv.organizationId !== ctx.organizationId) throw AppError.notFound("Conversation not found");
  return { conv, ctx };
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function token(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString("base64url");
}

/* ── Rename / Pin / Archive ────────────────────────────────────────────── */

export async function renameConversation(
  userId: string,
  conversationId: string,
  title: string,
  req?: { ip?: string; userAgent?: string; requestId?: string }
) {
  const trimmed = title.trim();
  if (!trimmed) throw AppError.badRequest("Title cannot be empty");
  if (trimmed.length > 200) throw AppError.badRequest("Title must be 200 characters or fewer");
  const { ctx } = await requireAccess(userId, conversationId);
  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { title: trimmed },
  });
  await auditService.logFromRequest(
    "data.update",
    { user: { id: userId, organizationId: ctx.organizationId }, ...(req ?? {}) },
    "conversation",
    conversationId,
    { field: "title", title: trimmed }
  );
  return updated;
}

export async function pinConversation(
  userId: string,
  conversationId: string,
  req?: { ip?: string; userAgent?: string; requestId?: string }
) {
  const { ctx } = await requireAccess(userId, conversationId);
  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { pinned: true, pinnedAt: new Date() },
  });
  await auditService.logFromRequest(
    "data.update",
    { user: { id: userId, organizationId: ctx.organizationId }, ...(req ?? {}) },
    "conversation",
    conversationId,
    { action: "pin" }
  );
  return updated;
}

export async function unpinConversation(
  userId: string,
  conversationId: string,
  req?: { ip?: string; userAgent?: string; requestId?: string }
) {
  const { ctx } = await requireAccess(userId, conversationId);
  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { pinned: false, pinnedAt: null },
  });
  await auditService.logFromRequest(
    "data.update",
    { user: { id: userId, organizationId: ctx.organizationId }, ...(req ?? {}) },
    "conversation",
    conversationId,
    { action: "unpin" }
  );
  return updated;
}

export async function archiveConversation(
  userId: string,
  conversationId: string,
  req?: { ip?: string; userAgent?: string; requestId?: string }
) {
  const { ctx } = await requireAccess(userId, conversationId);
  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { isArchived: true, archivedAt: new Date() },
  });
  await auditService.logFromRequest(
    "data.update",
    { user: { id: userId, organizationId: ctx.organizationId }, ...(req ?? {}) },
    "conversation",
    conversationId,
    { action: "archive" }
  );
  return updated;
}

export async function unarchiveConversation(
  userId: string,
  conversationId: string,
  req?: { ip?: string; userAgent?: string; requestId?: string }
) {
  const { ctx } = await requireAccess(userId, conversationId);
  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { isArchived: false, archivedAt: null },
  });
  await auditService.logFromRequest(
    "data.update",
    { user: { id: userId, organizationId: ctx.organizationId }, ...(req ?? {}) },
    "conversation",
    conversationId,
    { action: "unarchive" }
  );
  return updated;
}

/**
 * Permanent deletion. Soft delete is the default path (see
 * conversations.service.deleteConversation); this hard-deletes the thread and
 * cascades to its messages. Only the creator may purge, and the transition is
 * audited. Conversation memory references (AgentMemory.sourceRef) are not
 * foreign keys, so they are left to the memory-retention policy, matching the
 * module's "conversation history vs long-term memory" distinction.
 */
export async function purgeConversation(
  userId: string,
  conversationId: string,
  req?: { ip?: string; userAgent?: string; requestId?: string }
) {
  // Unlike the other transitions this may operate on an already soft-deleted
  // conversation, so the org + creator check is done explicitly rather than via
  // requireAccess (which filters out deleted rows).
  const ctx = await resolveUserContext(userId);
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || conv.organizationId !== ctx.organizationId) throw AppError.notFound("Conversation not found");
  if (conv.createdById !== userId) {
    throw AppError.forbidden("Only the creator can permanently delete a conversation");
  }
  await prisma.conversation.delete({ where: { id: conversationId } });
  await auditService.logFromRequest(
    "data.delete",
    { user: { id: userId, organizationId: ctx.organizationId }, ...(req ?? {}) },
    "conversation",
    conversationId,
    { action: "permanent_delete" }
  );
  return { deleted: true, id: conversationId, permanent: true };
}

/* ── Sharing ───────────────────────────────────────────────────────────── */

function toShareDto(row: any): ConversationShare {
  return {
    id: row.id,
    conversationId: row.conversationId,
    token: row.token,
    access: row.access,
    permissions: row.permissions,
    allowed: row.allowed ?? [],
    hasPassword: Boolean(row.passwordHash),
    expiresAt: iso(row.expiresAt),
    revokedAt: iso(row.revokedAt),
    lastAccessedAt: iso(row.lastAccessedAt),
    accessCount: row.accessCount ?? 0,
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    url: `/share/${row.token}`,
  };
}

export async function createShare(
  userId: string,
  conversationId: string,
  input: ConvCreateShareInput,
  req?: { ip?: string; userAgent?: string; requestId?: string }
): Promise<ConversationShare> {
  const { ctx } = await requireAccess(userId, conversationId);
  const shareToken = token();
  const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : null;
  const created = await prisma.conversationShare.create({
    data: {
      conversationId,
      createdById: userId,
      token: shareToken,
      access: input.access,
      permissions: input.permissions,
      allowed: input.allowed ?? [],
      passwordHash,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
  await auditService.logFromRequest(
    "data.create",
    { user: { id: userId, organizationId: ctx.organizationId }, ...(req ?? {}) },
    "conversation",
    conversationId,
    { action: "share_created", shareId: created.id, access: input.access, permissions: input.permissions }
  );
  return toShareDto(created);
}

export async function listShares(userId: string, conversationId: string): Promise<ConversationShare[]> {
  await requireAccess(userId, conversationId);
  const rows = await prisma.conversationShare.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toShareDto);
}

async function loadShare(userId: string, conversationId: string, shareId: string) {
  const { conv, ctx } = await requireAccess(userId, conversationId);
  const row = await prisma.conversationShare.findFirst({ where: { id: shareId, conversationId } });
  if (!row) throw AppError.notFound("Share not found");
  return { row, conv, ctx };
}

export async function updateShare(
  userId: string,
  conversationId: string,
  shareId: string,
  input: ConvUpdateShareInput,
  req?: { ip?: string; userAgent?: string; requestId?: string }
): Promise<ConversationShare> {
  const { ctx } = await requireAccess(userId, conversationId);
  const { row } = await loadShare(userId, conversationId, shareId);

  const data: Record<string, unknown> = {};
  if (input.access !== undefined) data.access = input.access;
  if (input.permissions !== undefined) data.permissions = input.permissions;
  if (input.allowed !== undefined) data.allowed = input.allowed;
  if (input.expiresAt !== undefined) {
    data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  }
  if (input.password !== undefined) {
    // null clears password protection; a string sets/replaces it.
    data.passwordHash = input.password ? await bcrypt.hash(input.password, 10) : null;
  }
  // Re-enable a previously revoked link is expressed by updating it while
  // leaving revokedAt untouched; to truly clear revocation use unrevoke below.
  const updated = await prisma.conversationShare.update({ where: { id: row.id }, data });
  await auditService.logFromRequest(
    "data.update",
    { user: { id: userId, organizationId: ctx.organizationId }, ...(req ?? {}) },
    "conversation",
    conversationId,
    { action: "share_updated", shareId: row.id, changes: Object.keys(data) }
  );
  return toShareDto(updated);
}

/** Re-enable a share that was disabled via revokeShare. */
export async function enableShare(
  userId: string,
  conversationId: string,
  shareId: string,
  req?: { ip?: string; userAgent?: string; requestId?: string }
): Promise<ConversationShare> {
  const { ctx } = await requireAccess(userId, conversationId);
  const { row } = await loadShare(userId, conversationId, shareId);
  const updated = await prisma.conversationShare.update({ where: { id: row.id }, data: { revokedAt: null } });
  await auditService.logFromRequest(
    "data.update",
    { user: { id: userId, organizationId: ctx.organizationId }, ...(req ?? {}) },
    "conversation",
    conversationId,
    { action: "share_enabled", shareId: row.id }
  );
  return toShareDto(updated);
}

/** Disable a link (reversible). Sets revokedAt so it stops working. */
export async function revokeShare(
  userId: string,
  conversationId: string,
  shareId: string,
  req?: { ip?: string; userAgent?: string; requestId?: string }
): Promise<ConversationShare> {
  const { ctx } = await requireAccess(userId, conversationId);
  const { row } = await loadShare(userId, conversationId, shareId);
  const updated = await prisma.conversationShare.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  await auditService.logFromRequest(
    "data.update",
    { user: { id: userId, organizationId: ctx.organizationId }, ...(req ?? {}) },
    "conversation",
    conversationId,
    { action: "share_revoked", shareId: row.id }
  );
  return toShareDto(updated);
}

/** Permanently delete a share link. */
export async function deleteShare(
  userId: string,
  conversationId: string,
  shareId: string,
  req?: { ip?: string; userAgent?: string; requestId?: string }
): Promise<{ deleted: true; id: string }> {
  const { ctx } = await requireAccess(userId, conversationId);
  const { row } = await loadShare(userId, conversationId, shareId);
  await prisma.conversationShare.delete({ where: { id: row.id } });
  await auditService.logFromRequest(
    "data.delete",
    { user: { id: userId, organizationId: ctx.organizationId }, ...(req ?? {}) },
    "conversation",
    conversationId,
    { action: "share_deleted", shareId: row.id }
  );
  return { deleted: true, id: row.id };
}

export async function shareAccessLog(
  userId: string,
  conversationId: string,
  shareId: string
): Promise<ConversationShareAccessRecord[]> {
  await requireAccess(userId, conversationId);
  const { row } = await loadShare(userId, conversationId, shareId);
  const rows = await prisma.conversationShareAccess.findMany({
    where: { shareId: row.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((r: any) => ({
    id: r.id,
    shareId: r.shareId,
    userId: r.userId ?? null,
    ipAddress: r.ipAddress ?? null,
    userAgent: r.userAgent ?? null,
    granted: r.granted ?? false,
    reason: r.reason ?? null,
    createdAt: iso(r.createdAt) ?? new Date(0).toISOString(),
  }));
}

/**
 * Resolve a share link token into a read model. `authUser` is optional — the
 * route may be hit anonymously (anyone_with_link) or authenticated. Access is
 * enforced here and the attempt is recorded in the access log.
 */
export async function resolveShare(
  token: string,
  input: ConvResolveShareInput,
  authUser?: { id: string; email: string; organizationId: string | null },
  req?: { ip?: string; userAgent?: string; requestId?: string }
): Promise<ConvSharedView> {
  const row = await prisma.conversationShare.findUnique({ where: { token } });
  if (!row) throw AppError.notFound("Share not found");

  const record = async (granted: boolean, reason: string) => {
    try {
      await prisma.conversationShareAccess.create({
        data: {
          shareId: row.id,
          userId: authUser?.id ?? null,
          ipAddress: req?.ip ?? null,
          userAgent: req?.userAgent ?? null,
          granted,
          reason,
        },
      });
    } catch {
      /* access-log best effort */
    }
  };

  const conv = await prisma.conversation.findUnique({
    where: { id: row.conversationId },
    include: { createdBy: { include: { profile: true } } },
  });
  if (!conv || conv.deletedAt) {
    await record(false, "conversation_deleted");
    throw AppError.notFound("Share not found");
  }
  if (row.revokedAt) {
    await record(false, "revoked");
    throw AppError.forbidden("This share link has been revoked");
  }
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    await record(false, "expired");
    throw AppError.forbidden("This share link has expired");
  }
  if (row.passwordHash && !input.password) {
    await record(false, "password_required");
    throw AppError.unauthorized("This share link is password protected");
  }
  if (row.passwordHash && input.password) {
    const ok = await bcrypt.compare(input.password, row.passwordHash);
    if (!ok) {
      await record(false, "invalid_password");
      throw AppError.unauthorized("Invalid password");
    }
  }

  // Access-tier enforcement.
  const owner = authUser?.id === row.createdById;
  const isOrgMember = authUser
    ? Boolean(await prisma.membership.findFirst({ where: { userId: authUser.id, organizationId: conv.organizationId } }))
    : false;
  const allowedSet = new Set(row.allowed ?? []);
  const inAllowed = authUser
    ? allowedSet.has(authUser.id) || allowedSet.has(authUser.email)
    : false;

  let granted = false;
  let reason = "";
  switch (row.access) {
    case "anyone_with_link":
      granted = true;
      reason = "anyone_with_link";
      break;
    case "organization":
      granted = Boolean(authUser) && isOrgMember;
      reason = granted ? "organization_member" : "not_org_member";
      break;
    case "restricted":
      // Named users within the org.
      granted = Boolean(authUser) && isOrgMember && (owner || inAllowed);
      reason = granted ? "restricted_allowed" : "restricted_denied";
      break;
    case "specific":
      granted = Boolean(authUser) && (owner || inAllowed);
      reason = granted ? "specific_allowed" : "specific_denied";
      break;
  }
  if (!granted) {
    await record(false, reason);
    throw AppError.forbidden("You do not have access to this shared conversation");
  }

  await prisma.conversationShare.update({
    where: { id: row.id },
    data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } },
  });
  await record(true, reason);

  // Build the shared view — never exposes private admin data.
  const msgs = await prisma.message.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "asc" },
    include: { user: { include: { profile: true } }, agent: true },
  });
  const ownerName = conv.createdBy?.profile?.displayName ?? conv.createdBy?.email ?? null;

  return {
    conversationId: conv.id,
    title: conv.title,
    summary: conv.summary,
    permissions: row.permissions as ConvSharedView["permissions"],
    ownerName,
    createdAt: iso(conv.createdAt) ?? new Date(0).toISOString(),
    lastMessageAt: iso(conv.lastMessageAt) ?? iso(conv.createdAt) ?? new Date(0).toISOString(),
    messages: msgs
      .filter((m: any) => {
        const role = String(m.role ?? "").toLowerCase();
        return role === "user" || role === "assistant";
      })
      .map((m: any) => {
        const role = String(m.role ?? "").toLowerCase();
        const author =
          m.agent?.name ??
          m.user?.profile?.displayName ??
          m.user?.email ??
          (role === "user" ? "You" : "Assistant");
        return {
          id: m.id,
          role,
          author,
          content: m.content ?? "",
          createdAt: iso(m.createdAt) ?? new Date(0).toISOString(),
          redacted: false,
        };
      }),
  };
}

/* ── Route-facing schema re-exports ────────────────────────────────────── */

export const ConversationIdParam = z.object({ id: z.string().cuid() });
export const ShareIdParam = z.object({ id: z.string().cuid(), shareId: z.string().cuid() });
export const ShareTokenParam = z.object({ token: z.string().min(20).max(200) });
