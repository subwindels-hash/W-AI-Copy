/**
 * WhatsApp session management — Phase 2 §8, plus the step-up store for §9.
 *
 * A session is a bounded window of conversational continuity. It is NOT a
 * second memory system: durable history stays in the WINDELS Conversation /
 * Message tables. The session holds only what is genuinely per-window —
 * turn count, the identity context in force, and any action awaiting
 * confirmation.
 *
 * Expiring a session therefore never destroys history; the next message opens
 * a fresh session over the SAME conversation and the same stored messages.
 */
import { prisma } from "../../db/client.js";
import { logger } from "../../observability/logger.js";

/** Idle window before a session is considered stale. */
export const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h, matching WhatsApp's own service window

/** A pending high-risk action must be confirmed promptly or not at all. */
export const PENDING_ACTION_TTL_MS = 5 * 60 * 1000;

export interface PendingAction {
  kind: string;
  argument: string;
  raw: string;
  describe: string;
  risk: string;
  requestedAt: string;
}

export interface WhatsAppSessionView {
  id: string;
  status: string;
  turnCount: number;
  linkedUserId: string | null;
  pendingAction: PendingAction | null;
  /** True when this call created the session (i.e. a new window opened). */
  isNew: boolean;
}

function sessionKeyFor(conversationId: string, windowStart: number): string {
  return `${conversationId}:${windowStart}`;
}

/**
 * Returns the live session for a conversation, opening one when none is
 * active or the previous one has gone idle.
 *
 * The session key is derived from the conversation plus the opening timestamp
 * rounded to the second, and is UNIQUE. Two concurrent workers racing on the
 * same redelivered message therefore converge on one row instead of forking
 * two parallel sessions.
 */
export async function ensureSession(input: {
  organizationId: string;
  conversationId: string;
  linkedUserId: string | null;
}): Promise<WhatsAppSessionView> {
  const db = prisma as any;
  const now = new Date();
  const cutoff = new Date(now.getTime() - SESSION_TIMEOUT_MS);

  const active = await db.whatsAppSession
    .findFirst({
      where: { conversationId: input.conversationId, status: "ACTIVE" },
      orderBy: { lastActivityAt: "desc" },
    })
    .catch(() => null);

  if (active) {
    const idle = new Date(active.lastActivityAt).getTime() < cutoff.getTime();
    const expired = new Date(active.expiresAt).getTime() < now.getTime();
    if (!idle && !expired) {
      const updated = await db.whatsAppSession.update({
        where: { id: active.id },
        data: {
          lastActivityAt: now,
          turnCount: { increment: 1 },
          // Identity can be established mid-session (the user links their
          // number); carry it forward, but never downgrade to null.
          ...(input.linkedUserId && !active.linkedUserId ? { linkedUserId: input.linkedUserId } : {}),
        },
      });
      return {
        id: updated.id,
        status: updated.status,
        turnCount: updated.turnCount,
        linkedUserId: updated.linkedUserId,
        pendingAction: readPendingAction(updated),
        isNew: false,
      };
    }

    // Idle or past its expiry — retire it. History is untouched.
    await db.whatsAppSession
      .update({ where: { id: active.id }, data: { status: "EXPIRED", closedAt: now } })
      .catch(() => { /* a concurrent worker may have retired it first */ });
  }

  const created = await db.whatsAppSession.create({
    data: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      sessionKey: sessionKeyFor(input.conversationId, Math.floor(now.getTime() / 1000)),
      linkedUserId: input.linkedUserId,
      turnCount: 1,
      expiresAt: new Date(now.getTime() + SESSION_TIMEOUT_MS),
      lastActivityAt: now,
    },
  }).catch(async (e: any) => {
    // Unique collision means a parallel worker opened the same window; adopt it.
    if (e?.code === "P2002") {
      return db.whatsAppSession.findUnique({
        where: { sessionKey: sessionKeyFor(input.conversationId, Math.floor(now.getTime() / 1000)) },
      });
    }
    throw e;
  });

  return {
    id: created.id,
    status: created.status,
    turnCount: created.turnCount,
    linkedUserId: created.linkedUserId,
    pendingAction: readPendingAction(created),
    isNew: true,
  };
}

function readPendingAction(session: any): PendingAction | null {
  const pending = session?.pendingAction;
  if (!pending || typeof pending !== "object") return null;
  const expiresAt = session.pendingExpiresAt ? new Date(session.pendingExpiresAt).getTime() : 0;
  if (!expiresAt || expiresAt < Date.now()) return null;
  return pending as PendingAction;
}

/** Records a high-risk action awaiting the user's explicit "confirm". */
export async function setPendingAction(sessionId: string, action: PendingAction): Promise<void> {
  const db = prisma as any;
  await db.whatsAppSession
    .update({
      where: { id: sessionId },
      data: { pendingAction: action as any, pendingExpiresAt: new Date(Date.now() + PENDING_ACTION_TTL_MS) },
    })
    .catch((e: any) => logger.warn("whatsapp pending action not stored", { sessionId, err: e?.message }));
}

/**
 * Atomically consumes the pending action.
 *
 * Clearing it BEFORE the caller executes is deliberate: a confirmation must be
 * single-use, so a duplicate "confirm" (or a Meta redelivery of it) cannot
 * trigger the same financial action twice.
 */
export async function consumePendingAction(sessionId: string): Promise<PendingAction | null> {
  const db = prisma as any;
  const session = await db.whatsAppSession.findUnique({ where: { id: sessionId } }).catch(() => null);
  const pending = readPendingAction(session);
  if (!pending) return null;
  await db.whatsAppSession
    .update({ where: { id: sessionId }, data: { pendingAction: null, pendingExpiresAt: null } })
    .catch(() => { /* already cleared */ });
  return pending;
}

export async function clearPendingAction(sessionId: string): Promise<void> {
  const db = prisma as any;
  await db.whatsAppSession
    .update({ where: { id: sessionId }, data: { pendingAction: null, pendingExpiresAt: null } })
    .catch(() => { /* nothing to clear */ });
}

/**
 * Retires sessions that have gone idle. Called by the WhatsApp worker tick so
 * expiry does not depend on a user happening to send another message.
 */
export async function expireStaleSessions(limit = 100): Promise<number> {
  const db = prisma as any;
  const now = new Date();
  try {
    const stale = await db.whatsAppSession.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { expiresAt: { lt: now } },
          { lastActivityAt: { lt: new Date(now.getTime() - SESSION_TIMEOUT_MS) } },
        ],
      },
      select: { id: true },
      take: limit,
    });
    if (stale.length === 0) return 0;
    await db.whatsAppSession.updateMany({
      where: { id: { in: stale.map((s: any) => s.id) } },
      data: { status: "EXPIRED", closedAt: now },
    });
    return stale.length;
  } catch (e: any) {
    logger.warn("whatsapp session expiry sweep failed", { err: e?.message });
    return 0;
  }
}
