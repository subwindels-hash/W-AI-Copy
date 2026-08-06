/** Session 108 — Camera feed registry/alert tests. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv }));
vi.mock("../kernel/kernel.service.js", () => ({ KernelService: { dispatch: vi.fn(async () => ({})) } }));

const { CameraService: Camera } = await import("./camera.service.js");
const { CamAlertCreateSchema, CamFeedCreateSchema, CamFeedUpdateSchema } = await import("@windels/shared/camera");
const A = "org-camera-a";
const B = "org-camera-b";
const input = (overrides: Partial<Parameters<typeof Camera.createFeed>[1]> = {}) => ({ name: "Warehouse East", streamUrl: "rtsp://camera.example/live", locationName: "East", resolution: "1920x1080", ...overrides });

beforeEach(() => { kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear(); });

describe("Camera feed registry", () => {
  it("creates and lists an offline feed under an org-scoped key", async () => {
    const feed = await Camera.createFeed(A, input());
    expect(feed.id).toMatch(/^cam_/);
    expect(feed.status).toBe("offline");
    expect((await Camera.listFeeds(A))).toHaveLength(1);
    expect([...kv.hashes.keys()].some((key) => key.startsWith(`cam:feed:i:${A}:`))).toBe(true);
  });

  it("does not expose feeds across organizations", async () => {
    const feed = await Camera.createFeed(A, input());
    expect(await Camera.listFeeds(B)).toHaveLength(0);
    expect(await Camera.getFeed(B, feed.id)).toBeNull();
    expect(await Camera.updateFeed(B, feed.id, { status: "online" })).toBeNull();
    expect(await Camera.deleteFeed(B, feed.id)).toBe(false);
  });

  it("updates status and metadata without losing the feed record", async () => {
    const feed = await Camera.createFeed(A, input());
    const updated = await Camera.updateFeed(A, feed.id, { status: "online", locationName: "North" });
    expect(updated).toMatchObject({ id: feed.id, status: "online", locationName: "North" });
    expect((await Camera.getFeed(A, feed.id))?.streamUrl).toBe(input().streamUrl);
  });

  it("creates alerts only for an in-scope feed and lists them by org", async () => {
    const feed = await Camera.createFeed(A, input());
    const alert = await Camera.triggerAlert(A, feed.id, { severity: "critical", triggerClass: "intrusion", metadata: { confidencePct: 92 } });
    expect(alert.id).toMatch(/^alrt_/);
    expect((await Camera.listAlerts(A, feed.id))[0]).toMatchObject({ cameraId: feed.id, severity: "critical" });
    await expect(Camera.triggerAlert(B, feed.id, { severity: "warning", triggerClass: "intrusion" })).rejects.toThrow("Feed not found");
    await expect(Camera.listAlerts(B, feed.id)).rejects.toThrow("Feed not found");
  });

  it("returns a time-limited stream handoff without pretending media is live", async () => {
    const feed = await Camera.createFeed(A, input());
    const session = await Camera.streamSession(A, feed.id);
    expect(session.webrtcSessionToken).toMatch(/^session_/);
    expect(session.streamAvailable).toBe(false);
    expect(session.expiresInSeconds).toBe(60);
    expect(session.note).toMatch(/external|not online/i);
  });

  it("reports live availability only when an administrator-observed status is online", async () => {
    const feed = await Camera.createFeed(A, input());
    await Camera.updateFeed(A, feed.id, { status: "online" });
    expect((await Camera.streamSession(A, feed.id)).streamAvailable).toBe(true);
  });

  it("cascades alert metadata when a feed is deleted", async () => {
    const feed = await Camera.createFeed(A, input());
    await Camera.triggerAlert(A, feed.id, { severity: "info", triggerClass: "operator-note" });
    expect(await Camera.deleteFeed(A, feed.id)).toBe(true);
    await expect(Camera.listAlerts(A, feed.id)).rejects.toThrow("Feed not found");
    expect(await Camera.listFeeds(A)).toHaveLength(0);
  });

  it("migrates legacy feed keys into the org-scoped index", async () => {
    const legacy = { id: "cam_legacy", organizationId: A, ...input(), status: "offline", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await kv.hset(`cam:feed:${A}:${legacy.id}`, "_doc", JSON.stringify(legacy));
    await kv.sadd(`cam:feeds:${A}`, legacy.id);
    expect((await Camera.listFeeds(A))[0]!.id).toBe(legacy.id);
    expect([...kv.hashes.keys()].some((key) => key.startsWith(`cam:feed:i:${A}:`))).toBe(true);
  });
});

describe("Camera contracts", () => {
  it("validates feed, update and alert inputs", () => {
    expect(CamFeedCreateSchema.safeParse(input()).success).toBe(true);
    expect(CamFeedCreateSchema.safeParse({ ...input(), streamUrl: "file:///tmp/camera" }).success).toBe(false);
    expect(CamFeedUpdateSchema.safeParse({ status: "online" }).success).toBe(true);
    expect(CamFeedUpdateSchema.safeParse({}).success).toBe(false);
    expect(CamAlertCreateSchema.safeParse({ severity: "critical", triggerClass: "fire" }).success).toBe(true);
    expect(CamAlertCreateSchema.safeParse({ severity: "urgent", triggerClass: "fire" }).success).toBe(false);
  });
});
