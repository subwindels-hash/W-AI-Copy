/**
 * Webhook status sync — registration, HMAC verification, and job sync.
 * Fully in-memory: FakeKv replaces Redis; the engine runs with fake adapters.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { registerWebhook, getWebhookConfig, listWebhooks, deleteWebhook, verifySignature } from "./webhooks.js";
import { createPublishEngine, type PublishEngine } from "./publishJobs.js";
import { saveToken, saveOrgToken } from "./tokens.js";
import { FakeKv } from "./fakeKv.js";
import type { PlatformAdapter } from "./platforms.js";

const OID = "org-wh";
const UID = "user-wh";
const MEDIA = { buffer: Buffer.from("tiny-mp4"), contentType: "video/mp4" };

function fakeAdapter(): PlatformAdapter {
  return {
    id: "youtube",
    oauth: { envClientId: "X", envClientSecret: "Y", scope: "", authorizeUrl: "", tokenUrl: "" },
    constraints: { requiresMedia: true, mediaKinds: ["video"], maxTitle: 100, maxDescription: 5000, maxMediaMB: 100 },
    exchangeCode: async () => ({ accessToken: "x" }),
    refreshToken: async () => ({ accessToken: "x" }),
    publish: async () => ({ postId: "vid-1", url: "https://youtu.be/vid-1" }),
  };
}

describe("webhook config lifecycle", () => {
  let kv: FakeKv;

  beforeEach(() => { kv = new FakeKv(); });

  it("registers a callback URL + secret and returns the secret once", async () => {
    const reg = await registerWebhook(OID, "youtube", kv as any);
    expect(reg.platform).toBe("youtube");
    expect(reg.secret).toHaveLength(64);
    expect(reg.enabled).toBe(true);
    expect(reg.callbackUrl).toContain("/media-factory/publishing/webhooks/youtube/callback");
    expect(reg.callbackUrl).toContain(`oid=${OID}`);
  });

  it("reads back the stored config and masks secrets in list", async () => {
    await registerWebhook(OID, "youtube", kv as any);
    const cfg = await getWebhookConfig(OID, "youtube", kv as any);
    expect(cfg?.secret).toHaveLength(64);
    const listed = await listWebhooks(OID, kv as any, ["youtube", "tiktok"] as any);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.secret).not.toBe(cfg?.secret);
    expect(listed[0]!.secret).toContain("••••");
  });

  it("rotates the secret on re-register and removes on delete", async () => {
    const a = await registerWebhook(OID, "youtube", kv as any);
    const b = await registerWebhook(OID, "youtube", kv as any);
    expect(b.secret).not.toBe(a.secret);
    await deleteWebhook(OID, "youtube", kv as any);
    expect(await getWebhookConfig(OID, "youtube", kv as any)).toBeNull();
  });
});

describe("verifySignature", () => {
  const secret = "deadbeef".repeat(8); // 64 hex
  const body = Buffer.from(JSON.stringify({ postId: "vid-1", status: "available" }));

  it("accepts a correct sha256 X-Windels-Signature", () => {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifySignature(secret, body, { "x-windels-signature": `sha256=${sig}` })).toBe(true);
  });

  it("accepts a PubSubHubbub-style sha1 X-Hub-Signature", () => {
    const sig = createHmac("sha1", secret).update(body).digest("hex");
    expect(verifySignature(secret, body, { "x-hub-signature": `sha1=${sig}` })).toBe(true);
  });

  it("rejects wrong secrets, tampered bodies, and missing signatures", () => {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifySignature("0".repeat(64), body, { "x-windels-signature": `sha256=${sig}` })).toBe(false);
    const tampered = Buffer.from(JSON.stringify({ postId: "vid-1", status: "rejected" }));
    expect(verifySignature(secret, tampered, { "x-windels-signature": `sha256=${sig}` })).toBe(false);
    expect(verifySignature(secret, body, {})).toBe(false);
    expect(verifySignature(secret, body, { "x-windels-signature": "sha256=zzz" })).toBe(false);
  });
});

describe("applyPlatformWebhook (job sync)", () => {
  let kv: FakeKv;
  let clock: number;
  let engine: PublishEngine;
  let events: Array<{ kind: string; payload: Record<string, unknown> }>;

  beforeEach(() => {
    kv = new FakeKv();
    clock = 1_000_000;
    events = [];
    const deps: any = {
      kv,
      adapters: { youtube: fakeAdapter() },
      now: () => clock,
      resolveMedia: async () => MEDIA,
      kernelDispatch: async (e: any) => { events.push(e); },
    };
    engine = createPublishEngine(deps);
  });

  it("syncs a non-terminal platform status onto a published job (idempotent)", async () => {
    await saveToken(UID, "youtube", { accessToken: "t" }, null, kv as any);
    const { job } = await engine.createJob(OID, UID, "youtube", { title: "Hello", mediaUrl: "/render/a.mp4" });
    await engine.processDueJobs(); // → published with postId vid-1

    const updated = await engine.applyPlatformWebhook(OID, job.id, { postId: "vid-1", status: "processing" });
    expect(updated.status).toBe("published"); // platform accepted it; still published
    expect(updated.platformStatus).toBe("processing");
    expect(updated.statusHistory?.at(-1)?.detail).toContain("processing");
    expect(events.some((e) => e.kind === "media.publish.status")).toBe(true);

    // Idempotent repeat: no extra history entry.
    const again = await engine.applyPlatformWebhook(OID, job.id, { postId: "vid-1", status: "processing" });
    expect(again.statusHistory?.length).toBe(updated.statusHistory?.length);

    // Terminal availability stamps the timestamp.
    const done = await engine.applyPlatformWebhook(OID, job.id, { postId: "vid-1", status: "available", availableAt: "2026-07-31T12:00:00.000Z" });
    expect(done.platformStatus).toBe("available");
    expect(done.platformAvailableAt).toBe("2026-07-31T12:00:00.000Z");
  });

  it("fails a published job when the platform rejects it after upload", async () => {
    await saveToken(UID, "youtube", { accessToken: "t" }, null, kv as any);
    const { job } = await engine.createJob(OID, UID, "youtube", { title: "Hello", mediaUrl: "/render/a.mp4" });
    await engine.processDueJobs();

    const updated = await engine.applyPlatformWebhook(OID, job.id, { postId: "vid-1", status: "rejected", reason: "community guidelines" });
    expect(updated.status).toBe("failed");
    expect(updated.error?.code).toBe("PLATFORM_REJECTED");
    expect(updated.error?.message).toContain("community guidelines");
    // Never re-queued: a due pass must not resurrect it.
    const { processed } = await engine.processDueJobs();
    expect(processed).toBe(0);
  });

  it("does not sync a webhook whose postId does not match the job", async () => {
    await saveToken(UID, "youtube", { accessToken: "t" }, null, kv as any);
    const { job } = await engine.createJob(OID, UID, "youtube", { title: "Hello", mediaUrl: "/render/a.mp4" });
    await engine.processDueJobs();
    await expect(engine.applyPlatformWebhook(OID, job.id, { postId: "other-vid", status: "processing" }))
      .rejects.toThrow(/does not match/i);
  });

  it("findJobByPlatformRef resolves the job that produced the post id", async () => {
    await saveToken(UID, "youtube", { accessToken: "t" }, null, kv as any);
    const { job } = await engine.createJob(OID, UID, "youtube", { title: "Hello", mediaUrl: "/render/a.mp4" });
    await engine.processDueJobs();
    const found = await engine.findJobByPlatformRef(OID, "youtube", "vid-1");
    expect(found?.id).toBe(job.id);
    expect(await engine.findJobByPlatformRef(OID, "youtube", "nope")).toBeNull();
  });

  it("org-scoped jobs execute with the org token and webhooks still sync", async () => {
    await saveOrgToken(OID, "youtube", { accessToken: "org-tok" }, null, kv as any);
    const { job } = await engine.createJob(OID, UID, "youtube", { title: "Org post", mediaUrl: "/render/a.mp4" }, { tokenScope: "org" });
    expect(job.tokenScope).toBe("org");
    await engine.processDueJobs();
    const done = await engine.getJob(OID, job.id);
    expect(done.status).toBe("published");
    const synced = await engine.applyPlatformWebhook(OID, job.id, { postId: "vid-1", status: "processed" });
    expect(synced.platformStatus).toBe("processed");
  });
});
