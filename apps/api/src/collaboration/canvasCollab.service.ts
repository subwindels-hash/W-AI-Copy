/**
 * Session 22 — Canvas Collab: realtime presence + cursor sync.
 *
 * A canvas document is already editable via the S5 CRUD API (`/canvases`).
 * This service adds the collaborative layer: who is viewing a canvas right now
 * (presence heartbeats with TTL expiry), and live cursor positions broadcast
 * over Redis pub/sub so collaborators' cursors move in real time.
 *
 * Keys: `canvas:presence:<canvasId>` (hash member -> JSON presence doc)
 *       `canvas:cursor:<canvasId>`   (hash member -> {x, y, at})
 * Channel: `canvas:collab:<canvasId>` (pub/sub cursor + presence events)
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis, redisSub as redisSubClient } from "../db/redis.js";
import { logger } from "../config/logger.js";

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarColor: string;
  joinedAt: string;
  lastSeenAt: string;
}

export interface CursorPosition {
  userId: string;
  displayName: string;
  x: number;
  y: number;
  at: string;
}

export interface CanvasCollabKv {
  hset(key: string, field: string, value: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, field: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
  // Optional set ops for the org-scoped active-canvas index. They are optional
  // so existing injected fakes keep working; when absent the index is skipped.
  sadd?(key: string, member: string): Promise<unknown>;
  srem?(key: string, member: string): Promise<unknown>;
  smembers?(key: string): Promise<string[]>;
}

export const PRESENCE_TTL_SEC = Number(process.env.CANVAS_PRESENCE_TTL_SEC ?? 30);
const presenceKey = (canvasId: string, organizationId?: string) => organizationId ? `canvas:presence:i:${organizationId}:${canvasId}` : `canvas:presence:${canvasId}`;
const cursorKey = (canvasId: string, organizationId?: string) => organizationId ? `canvas:cursor:i:${organizationId}:${canvasId}` : `canvas:cursor:${canvasId}`;
export const collabChannel = (canvasId: string, organizationId?: string) => organizationId ? `canvas:collab:${organizationId}:${canvasId}` : `canvas:collab:${canvasId}`;
/** Org-scoped index of canvas ids that have (or recently had) live presence. */
const activeCanvasIndexKey = (organizationId: string) => `canvas:active:i:${organizationId}`;

/** Shared Redis subscriber — one subscription per canvas id (idempotent). */
const subscribers = new Set<string>();
export function subscribeCollab(canvasId: string, onEvent: (channel: string, message: string) => void): void {
  if (subscribers.has(canvasId)) return;
  subscribers.add(canvasId);
  redisSubClient.subscribe(collabChannel(canvasId), (err) => {
    if (err) logger.warn("canvas collab subscribe failed", { err: err.message, canvasId });
  });
  redisSubClient.on("message", (channel, message) => {
    if (channel === collabChannel(canvasId)) onEvent(channel, message);
  });
}

function withDefaults(kv: CanvasCollabKv | undefined): CanvasCollabKv {
  return kv ?? (redis as unknown as CanvasCollabKv);
}

export const CanvasCollabService = {
  /** Registers a heartbeat; expires via TTL when the collaborator stops. */
  async heartbeat(canvasId: string, user: { userId: string; displayName: string; avatarColor?: string }, kv?: CanvasCollabKv, organizationId?: string): Promise<PresenceUser> {
    const k = withDefaults(kv);
    const now = new Date().toISOString();
    const doc: PresenceUser = {
      userId: user.userId,
      displayName: user.displayName,
      avatarColor: user.avatarColor ?? "#38bdf8",
      joinedAt: now,
      lastSeenAt: now,
    };
    await k.hset(presenceKey(canvasId, organizationId), user.userId, JSON.stringify(doc));
    // Track this canvas in the org-scoped active index so opex (and any other
    // org-level rollup) can count active collaboration sessions truthfully.
    // Membership is authoritative only together with a live presence check:
    // activeSessionCount() prunes canvases whose heartbeats have all expired.
    if (organizationId && k.sadd) await k.sadd(activeCanvasIndexKey(organizationId), canvasId);
    await k.publish(collabChannel(canvasId, organizationId), JSON.stringify({ type: "presence", userId: user.userId, displayName: user.displayName, at: now }));
    return doc;
  },

  /**
   * Count active collaboration sessions for an organization — a session being a
   * canvas that currently has at least one non-expired presence heartbeat. Reads
   * the org-scoped active-canvas index and re-checks live presence per canvas
   * (pruning canvases whose heartbeats have all expired), so the count reflects
   * real current activity rather than stale index membership. Never estimated.
   */
  async activeSessionCount(organizationId: string, kv?: CanvasCollabKv): Promise<number> {
    if (!organizationId) throw new Error("organizationId is required");
    const k = withDefaults(kv);
    if (!k.smembers || !k.srem) return 0;
    const canvasIds = await k.smembers(activeCanvasIndexKey(organizationId));
    let active = 0;
    for (const canvasId of canvasIds) {
      const present = await this.presence(canvasId, kv, organizationId);
      if (present.length > 0) active += 1;
      else await k.srem(activeCanvasIndexKey(organizationId), canvasId); // prune dead session
    }
    return active;
  },

  /** Active collaborators (expired heartbeats are pruned lazily). */
  async presence(canvasId: string, kv?: CanvasCollabKv, organizationId?: string): Promise<PresenceUser[]> {
    const k = withDefaults(kv);
    const scopedKey = presenceKey(canvasId, organizationId);
    let raw = await k.hgetall(scopedKey);
    // Backward-compatible read/migration for the pre-org key. New heartbeats
    // never write to this key, and the caller must already have verified the
    // canvas organization at the route boundary.
    if (organizationId && Object.keys(raw).length === 0) {
      const legacy = await k.hgetall(presenceKey(canvasId));
      for (const [uid, value] of Object.entries(legacy)) await k.hset(scopedKey, uid, value);
      raw = legacy;
    }
    const cutoff = Date.now() - PRESENCE_TTL_SEC * 1000;
    const out: PresenceUser[] = [];
    for (const [uid, value] of Object.entries(raw)) {
      try {
        const doc = JSON.parse(value) as PresenceUser;
        if (Date.parse(doc.lastSeenAt) >= cutoff) out.push(doc);
        else await k.hdel(scopedKey, uid);
      } catch { /* corrupt entry — ignore */ }
    }
    return out.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  },

  /** Publishes a cursor move; peers pick it up via the collab channel. */
  async moveCursor(canvasId: string, user: { userId: string; displayName: string }, x: number, y: number, kv?: CanvasCollabKv, organizationId?: string): Promise<CursorPosition> {
    const k = withDefaults(kv);
    const pos: CursorPosition = { userId: user.userId, displayName: user.displayName, x, y, at: new Date().toISOString() };
    await k.hset(cursorKey(canvasId, organizationId), user.userId, JSON.stringify(pos));
    await k.publish(collabChannel(canvasId, organizationId), JSON.stringify({ type: "cursor", ...pos }));
    return pos;
  },

  /** Latest cursors for initial paint. */
  async cursors(canvasId: string, kv?: CanvasCollabKv, organizationId?: string): Promise<CursorPosition[]> {
    const k = withDefaults(kv);
    const scopedKey = cursorKey(canvasId, organizationId);
    let raw = await k.hgetall(scopedKey);
    if (organizationId && Object.keys(raw).length === 0) {
      const legacy = await k.hgetall(cursorKey(canvasId));
      for (const [uid, value] of Object.entries(legacy)) await k.hset(scopedKey, uid, value);
      raw = legacy;
    }
    const out: CursorPosition[] = [];
    for (const value of Object.values(raw)) {
      try { out.push(JSON.parse(value) as CursorPosition); } catch { /* skip */ }
    }
    return out;
  },

  /** Leaves the canvas: removes presence + cursor and broadcasts. */
  async leave(canvasId: string, userId: string, kv?: CanvasCollabKv, organizationId?: string): Promise<void> {
    const k = withDefaults(kv);
    await k.hdel(presenceKey(canvasId, organizationId), userId);
    await k.hdel(cursorKey(canvasId, organizationId), userId);
    // If that was the last collaborator, drop the canvas from the org active
    // index so the session is no longer counted as active.
    if (organizationId && k.srem) {
      const remaining = await k.hgetall(presenceKey(canvasId, organizationId));
      if (Object.keys(remaining).length === 0) await k.srem(activeCanvasIndexKey(organizationId), canvasId);
    }
    await k.publish(collabChannel(canvasId, organizationId), JSON.stringify({ type: "leave", userId, at: new Date().toISOString() }));
  },

  /** Session id helper for the web client to correlate its own events. */
  sessionId(): string {
    return randomUUID();
  },
};

export default CanvasCollabService;
