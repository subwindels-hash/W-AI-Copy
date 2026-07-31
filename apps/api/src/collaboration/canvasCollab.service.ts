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
}

export const PRESENCE_TTL_SEC = Number(process.env.CANVAS_PRESENCE_TTL_SEC ?? 30);
const presenceKey = (canvasId: string) => `canvas:presence:${canvasId}`;
const cursorKey = (canvasId: string) => `canvas:cursor:${canvasId}`;
export const collabChannel = (canvasId: string) => `canvas:collab:${canvasId}`;

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
  async heartbeat(canvasId: string, user: { userId: string; displayName: string; avatarColor?: string }, kv?: CanvasCollabKv): Promise<PresenceUser> {
    const k = withDefaults(kv);
    const now = new Date().toISOString();
    const doc: PresenceUser = {
      userId: user.userId,
      displayName: user.displayName,
      avatarColor: user.avatarColor ?? "#38bdf8",
      joinedAt: now,
      lastSeenAt: now,
    };
    await k.hset(presenceKey(canvasId), user.userId, JSON.stringify(doc));
    await k.publish(collabChannel(canvasId), JSON.stringify({ type: "presence", userId: user.userId, displayName: user.displayName, at: now }));
    return doc;
  },

  /** Active collaborators (expired heartbeats are pruned lazily). */
  async presence(canvasId: string, kv?: CanvasCollabKv): Promise<PresenceUser[]> {
    const k = withDefaults(kv);
    const raw = await k.hgetall(presenceKey(canvasId));
    const cutoff = Date.now() - PRESENCE_TTL_SEC * 1000;
    const out: PresenceUser[] = [];
    for (const [uid, value] of Object.entries(raw)) {
      try {
        const doc = JSON.parse(value) as PresenceUser;
        if (Date.parse(doc.lastSeenAt) >= cutoff) out.push(doc);
        else await k.hdel(presenceKey(canvasId), uid);
      } catch { /* corrupt entry — ignore */ }
    }
    return out.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  },

  /** Publishes a cursor move; peers pick it up via the collab channel. */
  async moveCursor(canvasId: string, user: { userId: string; displayName: string }, x: number, y: number, kv?: CanvasCollabKv): Promise<CursorPosition> {
    const k = withDefaults(kv);
    const pos: CursorPosition = { userId: user.userId, displayName: user.displayName, x, y, at: new Date().toISOString() };
    await k.hset(cursorKey(canvasId), user.userId, JSON.stringify(pos));
    await k.publish(collabChannel(canvasId), JSON.stringify({ type: "cursor", ...pos }));
    return pos;
  },

  /** Latest cursors for initial paint. */
  async cursors(canvasId: string, kv?: CanvasCollabKv): Promise<CursorPosition[]> {
    const k = withDefaults(kv);
    const raw = await k.hgetall(cursorKey(canvasId));
    const out: CursorPosition[] = [];
    for (const value of Object.values(raw)) {
      try { out.push(JSON.parse(value) as CursorPosition); } catch { /* skip */ }
    }
    return out;
  },

  /** Leaves the canvas: removes presence + cursor and broadcasts. */
  async leave(canvasId: string, userId: string, kv?: CanvasCollabKv): Promise<void> {
    const k = withDefaults(kv);
    await k.hdel(presenceKey(canvasId), userId);
    await k.hdel(cursorKey(canvasId), userId);
    await k.publish(collabChannel(canvasId), JSON.stringify({ type: "leave", userId, at: new Date().toISOString() }));
  },

  /** Session id helper for the web client to correlate its own events. */
  sessionId(): string {
    return randomUUID();
  },
};

export default CanvasCollabService;
