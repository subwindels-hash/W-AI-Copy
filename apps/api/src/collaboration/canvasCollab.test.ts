/**
 * Canvas Collab — realtime collaborative canvas (presence, cursor sync, TTL,
 * leave, isolation). Uses an in-memory kv so it runs without Redis.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { CanvasCollabService, PRESENCE_TTL_SEC, collabChannel } from "./canvasCollab.service.js";
import type { CanvasCollabKv } from "./canvasCollab.service.js";

class FakeKv implements CanvasCollabKv {
  hashes = new Map<string, Record<string, string>>();
  sets = new Map<string, Set<string>>();
  published: Array<{ channel: string; message: string }> = [];
  clock: number = Date.now();

  async hset(key: string, field: string, value: string) { const h = this.hashes.get(key) ?? {}; h[field] = value; this.hashes.set(key, h); return 1; }
  async hgetall(key: string) { return this.hashes.get(key) ?? {}; }
  async hdel(key: string, field: string) { const h = this.hashes.get(key); if (h) delete h[field]; return 1; }
  async del(key: string) { this.hashes.delete(key); return 1; }
  async publish(channel: string, message: string) { this.published.push({ channel, message }); return 1; }
  async sadd(key: string, member: string) { const s = this.sets.get(key) ?? new Set(); s.add(member); this.sets.set(key, s); return 1; }
  async srem(key: string, member: string) { this.sets.get(key)?.delete(member); return 1; }
  async smembers(key: string) { return [...(this.sets.get(key) ?? [])]; }
}

describe("CanvasCollabService", () => {
  let kv: FakeKv;
  beforeEach(() => { kv = new FakeKv(); });

  /* ── Presence heartbeats ─────────────────────────────────── */

  it("heartbeat registers presence and publishes a presence event", async () => {
    const doc = await CanvasCollabService.heartbeat("c1", { userId: "u1", displayName: "Ada", avatarColor: "#f0f" }, kv as any);
    expect(doc.userId).toBe("u1");
    expect(doc.displayName).toBe("Ada");
    expect(doc.avatarColor).toBe("#f0f");
    expect(doc.joinedAt).toBeTruthy();
    expect(doc.lastSeenAt).toBeTruthy();
    expect(kv.published.some((p) => p.channel === collabChannel("c1") && p.message.includes("presence"))).toBe(true);
    expect(await CanvasCollabService.presence("c1", kv as any)).toHaveLength(1);
  });

  it("marks multiple active users online", async () => {
    await CanvasCollabService.heartbeat("c1", { userId: "alice", displayName: "Alice" }, kv as any);
    await CanvasCollabService.heartbeat("c1", { userId: "bob", displayName: "Bob" }, kv as any);
    const presence = await CanvasCollabService.presence("c1", kv as any);
    expect(presence.map((p) => p.userId).sort()).toEqual(["alice", "bob"]);
  });

  it("refreshes lastSeenAt on repeated heartbeats (stays active)", async () => {
    await CanvasCollabService.heartbeat("c1", { userId: "u1", displayName: "Ada" }, kv as any);
    const first = await CanvasCollabService.presence("c1", kv as any);
    const later = await CanvasCollabService.heartbeat("c1", { userId: "u1", displayName: "Ada" }, kv as any);
    expect(Date.parse(later.lastSeenAt)).toBeGreaterThanOrEqual(Date.parse(first[0]!.lastSeenAt));
  });

  it("defaults avatarColor when not provided", async () => {
    const doc = await CanvasCollabService.heartbeat("c1", { userId: "u1", displayName: "Ada" }, kv as any);
    expect(doc.avatarColor).toBe("#38bdf8");
  });

  /* ── TTL expiry ──────────────────────────────────────────── */

  it("prunes stale heartbeats lazily based on lastSeenAt", async () => {
    const now = Date.now();
    await CanvasCollabService.heartbeat("c1", { userId: "fresh", displayName: "F" }, kv as any);
    const stale = JSON.stringify({ userId: "stale", displayName: "S", avatarColor: "#000", joinedAt: new Date(now - 60000).toISOString(), lastSeenAt: new Date(now - PRESENCE_TTL_SEC * 1000 - 1000).toISOString() });
    await kv.hset("canvas:presence:c1", "stale", stale);
    const presence = await CanvasCollabService.presence("c1", kv as any);
    expect(presence.map((p) => p.userId)).toEqual(["fresh"]);
  });

  it("removes expired presence records from storage", async () => {
    const now = Date.now();
    const stale = JSON.stringify({ userId: "ghost", displayName: "G", avatarColor: "#000", joinedAt: new Date(now - 60000).toISOString(), lastSeenAt: new Date(now - PRESENCE_TTL_SEC * 1000 - 1000).toISOString() });
    await kv.hset("canvas:presence:c1", "ghost", stale);
    await CanvasCollabService.presence("c1", kv as any);
    const raw = await kv.hgetall("canvas:presence:c1");
    expect(raw["ghost"]).toBeUndefined();
  });

  it("keeps presence within the TTL window", async () => {
    await CanvasCollabService.heartbeat("c1", { userId: "recent", displayName: "R" }, kv as any);
    const presence = await CanvasCollabService.presence("c1", kv as any);
    expect(presence).toHaveLength(1);
  });

  it("tolerates corrupt presence records without crashing", async () => {
    await kv.hset("canvas:presence:c1", "bad", "not-json{{{");
    await CanvasCollabService.heartbeat("c1", { userId: "good", displayName: "G" }, kv as any);
    const presence = await CanvasCollabService.presence("c1", kv as any);
    expect(presence.map((p) => p.userId)).toEqual(["good"]);
  });

  /* ── Cursor synchronization ──────────────────────────────── */

  it("moveCursor stores position and publishes it; cursors returns them", async () => {
    await CanvasCollabService.moveCursor("c1", { userId: "u1", displayName: "Ada" }, 120.5, 88, kv as any);
    const cursors = await CanvasCollabService.cursors("c1", kv as any);
    expect(cursors).toHaveLength(1);
    expect(cursors[0]!.x).toBe(120.5);
    expect(cursors[0]!.y).toBe(88);
    expect(kv.published.at(-1)?.message).toContain('"type":"cursor"');
  });

  it("associates cursor with the correct user", async () => {
    await CanvasCollabService.moveCursor("c1", { userId: "alice", displayName: "Alice" }, 10, 20, kv as any);
    await CanvasCollabService.moveCursor("c1", { userId: "bob", displayName: "Bob" }, 30, 40, kv as any);
    const cursors = await CanvasCollabService.cursors("c1", kv as any);
    const alice = cursors.find((c) => c.userId === "alice");
    expect(alice!.x).toBe(10);
    expect(alice!.displayName).toBe("Alice");
  });

  it("overwrites a user's cursor on subsequent moves", async () => {
    await CanvasCollabService.moveCursor("c1", { userId: "u1", displayName: "Ada" }, 1, 1, kv as any);
    await CanvasCollabService.moveCursor("c1", { userId: "u1", displayName: "Ada" }, 9, 9, kv as any);
    const cursors = await CanvasCollabService.cursors("c1", kv as any);
    expect(cursors).toHaveLength(1);
    expect(cursors[0]!.x).toBe(9);
  });

  it("does not leak cursors across unrelated canvases", async () => {
    await CanvasCollabService.moveCursor("c1", { userId: "u1", displayName: "Ada" }, 5, 5, kv as any);
    await CanvasCollabService.moveCursor("c2", { userId: "u2", displayName: "Bob" }, 7, 7, kv as any);
    expect(await CanvasCollabService.cursors("c1", kv as any)).toHaveLength(1);
    expect(await CanvasCollabService.cursors("c2", kv as any)).toHaveLength(1);
    expect(await CanvasCollabService.cursors("c3", kv as any)).toHaveLength(0);
  });

  it("tolerates corrupt cursor records", async () => {
    await kv.hset("canvas:cursor:c1", "bad", "{{{");
    await CanvasCollabService.moveCursor("c1", { userId: "ok", displayName: "O" }, 1, 1, kv as any);
    const cursors = await CanvasCollabService.cursors("c1", kv as any);
    expect(cursors).toHaveLength(1);
  });

  /* ── Leave events ────────────────────────────────────────── */

  it("leave removes presence + cursor and broadcasts leave", async () => {
    await CanvasCollabService.heartbeat("c1", { userId: "u1", displayName: "Ada" }, kv as any);
    await CanvasCollabService.moveCursor("c1", { userId: "u1", displayName: "Ada" }, 1, 2, kv as any);
    await CanvasCollabService.leave("c1", "u1", kv as any);
    expect(await CanvasCollabService.presence("c1", kv as any)).toHaveLength(0);
    expect(await CanvasCollabService.cursors("c1", kv as any)).toHaveLength(0);
    expect(kv.published.at(-1)?.message).toContain('"type":"leave"');
  });

  it("leave notifies other collaborators via the collab channel", async () => {
    await CanvasCollabService.heartbeat("c1", { userId: "alice", displayName: "Alice" }, kv as any);
    await CanvasCollabService.leave("c1", "alice", kv as any);
    const leaveMsg = kv.published.find((p) => p.channel === collabChannel("c1") && p.message.includes("leave"));
    expect(leaveMsg).toBeTruthy();
    expect(leaveMsg!.message).toContain('"userId":"alice"');
  });

  it("leave only removes the leaving user, not others", async () => {
    await CanvasCollabService.heartbeat("c1", { userId: "alice", displayName: "Alice" }, kv as any);
    await CanvasCollabService.heartbeat("c1", { userId: "bob", displayName: "Bob" }, kv as any);
    await CanvasCollabService.leave("c1", "alice", kv as any);
    const presence = await CanvasCollabService.presence("c1", kv as any);
    expect(presence.map((p) => p.userId)).toEqual(["bob"]);
  });

  it("is safe to leave a canvas the user is not on", async () => {
    await expect(CanvasCollabService.leave("c1", "ghost", kv as any)).resolves.toBeUndefined();
    expect(await CanvasCollabService.presence("c1", kv as any)).toHaveLength(0);
  });

  /* ── Session / misc ──────────────────────────────────────── */

  it("generates a fresh session id each call", () => {
    const a = CanvasCollabService.sessionId();
    const b = CanvasCollabService.sessionId();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it("presence is ordered by join time", async () => {
    await CanvasCollabService.heartbeat("c1", { userId: "second", displayName: "S" }, kv as any);
    await new Promise((r) => setTimeout(r, 2));
    await CanvasCollabService.heartbeat("c1", { userId: "first", displayName: "F" }, kv as any);
    const presence = await CanvasCollabService.presence("c1", kv as any);
    expect(presence.map((p) => p.userId)).toEqual(["second", "first"]);
  });

  it("writes org-scoped presence and cursor keys when an organization is supplied", async () => {
    await CanvasCollabService.heartbeat("c1", { userId: "u1", displayName: "Ada" }, kv as any, "org-a");
    await CanvasCollabService.moveCursor("c1", { userId: "u1", displayName: "Ada" }, 4, 5, kv as any, "org-a");
    expect(kv.hashes.has("canvas:presence:i:org-a:c1")).toBe(true);
    expect(kv.hashes.has("canvas:cursor:i:org-a:c1")).toBe(true);
    expect(await CanvasCollabService.presence("c1", kv as any, "org-b")).toHaveLength(0);
    expect(await CanvasCollabService.cursors("c1", kv as any, "org-b")).toHaveLength(0);
  });

  /* ── Org-scoped active session count (opex source) ────────── */

  it("counts distinct canvases with live presence per organization", async () => {
    await CanvasCollabService.heartbeat("c1", { userId: "u1", displayName: "A" }, kv as any, "org-a");
    await CanvasCollabService.heartbeat("c1", { userId: "u2", displayName: "B" }, kv as any, "org-a"); // same canvas, still 1
    await CanvasCollabService.heartbeat("c2", { userId: "u3", displayName: "C" }, kv as any, "org-a");
    expect(await CanvasCollabService.activeSessionCount("org-a", kv as any)).toBe(2);
  });

  it("isolates the count by organization", async () => {
    await CanvasCollabService.heartbeat("c1", { userId: "u1", displayName: "A" }, kv as any, "org-a");
    await CanvasCollabService.heartbeat("c9", { userId: "u9", displayName: "Z" }, kv as any, "org-b");
    expect(await CanvasCollabService.activeSessionCount("org-a", kv as any)).toBe(1);
    expect(await CanvasCollabService.activeSessionCount("org-b", kv as any)).toBe(1);
    expect(await CanvasCollabService.activeSessionCount("org-c", kv as any)).toBe(0);
  });

  it("prunes a canvas from the active count once all heartbeats expire", async () => {
    const now = Date.now();
    await CanvasCollabService.heartbeat("c1", { userId: "fresh", displayName: "F" }, kv as any, "org-a");
    // Overwrite with an expired heartbeat so presence() prunes it.
    const stale = JSON.stringify({ userId: "fresh", displayName: "F", avatarColor: "#000", joinedAt: new Date(now - 60000).toISOString(), lastSeenAt: new Date(now - PRESENCE_TTL_SEC * 1000 - 1000).toISOString() });
    await kv.hset("canvas:presence:i:org-a:c1", "fresh", stale);
    expect(await CanvasCollabService.activeSessionCount("org-a", kv as any)).toBe(0);
    // The dead canvas is removed from the index too.
    expect(await kv.smembers("canvas:active:i:org-a")).toEqual([]);
  });

  it("drops a canvas from the count when the last collaborator leaves", async () => {
    await CanvasCollabService.heartbeat("c1", { userId: "u1", displayName: "A" }, kv as any, "org-a");
    expect(await CanvasCollabService.activeSessionCount("org-a", kv as any)).toBe(1);
    await CanvasCollabService.leave("c1", "u1", kv as any, "org-a");
    expect(await CanvasCollabService.activeSessionCount("org-a", kv as any)).toBe(0);
  });

  it("returns 0 when the kv lacks set operations (graceful)", async () => {
    const bare = {
      hset: async () => 1, hgetall: async () => ({}), hdel: async () => 1, del: async () => 1, publish: async () => 1,
    };
    expect(await CanvasCollabService.activeSessionCount("org-a", bare as any)).toBe(0);
  });
});
