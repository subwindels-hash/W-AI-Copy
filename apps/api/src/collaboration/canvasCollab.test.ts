/**
 * Canvas Collab — presence heartbeats, cursor sync, leave. In-memory kv.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { CanvasCollabService, PRESENCE_TTL_SEC } from "./canvasCollab.service.js";
import type { CanvasCollabKv } from "./canvasCollab.service.js";

class FakeKv implements CanvasCollabKv {
  hashes = new Map<string, Record<string, string>>();
  published: Array<{ channel: string; message: string }> = [];
  clock: number = Date.now();

  async hset(key: string, field: string, value: string) { const h = this.hashes.get(key) ?? {}; h[field] = value; this.hashes.set(key, h); return 1; }
  async hgetall(key: string) { return this.hashes.get(key) ?? {}; }
  async hdel(key: string, field: string) { const h = this.hashes.get(key); if (h) delete h[field]; return 1; }
  async del(key: string) { this.hashes.delete(key); return 1; }
  async publish(channel: string, message: string) { this.published.push({ channel, message }); return 1; }
}

describe("CanvasCollabService", () => {
  let kv: FakeKv;

  beforeEach(() => { kv = new FakeKv(); });

  it("heartbeat registers presence and publishes a presence event", async () => {
    const doc = await CanvasCollabService.heartbeat("c1", { userId: "u1", displayName: "Ada", avatarColor: "#f0f" }, kv as any);
    expect(doc.userId).toBe("u1");
    expect(doc.displayName).toBe("Ada");
    expect(doc.joinedAt).toBeTruthy();
    expect(kv.published.some((p) => p.channel === "canvas:collab:c1" && p.message.includes("presence"))).toBe(true);
    const presence = await CanvasCollabService.presence("c1", kv as any);
    expect(presence).toHaveLength(1);
  });

  it("prunes stale heartbeats lazily based on lastSeenAt", async () => {
    const now = Date.now();
    await CanvasCollabService.heartbeat("c1", { userId: "fresh", displayName: "F" }, kv as any);
    // Inject a stale doc whose lastSeenAt is older than the TTL.
    const stale = JSON.stringify({ userId: "stale", displayName: "S", avatarColor: "#000", joinedAt: new Date(now - 60000).toISOString(), lastSeenAt: new Date(now - PRESENCE_TTL_SEC * 1000 - 1000).toISOString() });
    await kv.hset("canvas:presence:c1", "stale", stale);
    const presence = await CanvasCollabService.presence("c1", kv as any);
    expect(presence.map((p) => p.userId)).toEqual(["fresh"]);
  });

  it("moveCursor stores position and publishes it; cursors returns them", async () => {
    await CanvasCollabService.moveCursor("c1", { userId: "u1", displayName: "Ada" }, 120.5, 88, kv as any);
    const cursors = await CanvasCollabService.cursors("c1", kv as any);
    expect(cursors).toHaveLength(1);
    expect(cursors[0]!.x).toBe(120.5);
    expect(cursors[0]!.y).toBe(88);
    expect(kv.published.at(-1)?.message).toContain('"type":"cursor"');
  });

  it("leave removes presence + cursor and broadcasts leave", async () => {
    await CanvasCollabService.heartbeat("c1", { userId: "u1", displayName: "Ada" }, kv as any);
    await CanvasCollabService.moveCursor("c1", { userId: "u1", displayName: "Ada" }, 1, 2, kv as any);
    await CanvasCollabService.leave("c1", "u1", kv as any);
    expect(await CanvasCollabService.presence("c1", kv as any)).toHaveLength(0);
    expect(await CanvasCollabService.cursors("c1", kv as any)).toHaveLength(0);
    expect(kv.published.at(-1)?.message).toContain('"type":"leave"');
  });
});
