/**
 * Publish job engine — state machine, retry/backoff, scheduling, idempotency.
 * Runs fully in-memory: FakeKv replaces Redis; fake adapters replace platform
 * HTTP; `now` is injected so backoff windows are deterministic.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createPublishEngine, backoffMs, type PublishEngine } from "./publishJobs.js";
import { saveToken, connectionStatus, saveOrgToken } from "./tokens.js";
import { FakeKv } from "./fakeKv.js";
import { PlatformPublishError, type PlatformAdapter } from "./platforms.js";

const OID = "org-test";
const UID = "user-test";
const MEDIA = { buffer: Buffer.from("tiny-mp4"), contentType: "video/mp4" };

function fakeAdapter(run: (ctx: any) => Promise<{ postId?: string; url?: string; warnings?: string[] }>): PlatformAdapter {
  return {
    id: "youtube",
    oauth: { envClientId: "X", envClientSecret: "Y", scope: "", authorizeUrl: "", tokenUrl: "" },
    constraints: { requiresMedia: true, mediaKinds: ["video"], maxTitle: 100, maxDescription: 5000, maxMediaMB: 100 },
    exchangeCode: async () => ({ accessToken: "x" }),
    refreshToken: async () => ({ accessToken: "x" }),
    publish: run,
  };
}

describe("publish job engine", () => {
  let kv: FakeKv;
  let clock: number;
  let engine: PublishEngine;
  let calls: number;

  function setup(adapter: PlatformAdapter, opts: { maxAttempts?: number } = {}) {
    kv = new FakeKv();
    clock = 1_000_000;
    const deps: any = {
      kv,
      adapters: { youtube: adapter as any },
      now: () => clock,
      resolveMedia: async () => MEDIA,
      kernelDispatch: async () => {}, // kernel routing is out of scope here
      ...(opts.maxAttempts ? { maxAttempts: opts.maxAttempts } : {}),
    };
    engine = createPublishEngine(deps);
  }

  beforeEach(async () => { calls = 0; });

  async function connectAccount() {
    await saveToken(UID, "youtube", { accessToken: "test-token" }, null, kv as any);
  }

  it("backoff grows exponentially with cap", () => {
    expect(backoffMs(1, 0)).toBe(30_000);
    expect(backoffMs(2, 0)).toBe(60_000);
    expect(backoffMs(3, 0)).toBe(120_000);
    expect(backoffMs(100, 0)).toBe(15 * 60_000);
  });

  it("queued job → published on first due pass, with audit trail", async () => {
    setup(fakeAdapter(async (ctx) => {
      calls++;
      expect(ctx.accessToken).toBe("test-token");
      expect(ctx.media?.buffer.toString()).toBe("tiny-mp4");
      return { postId: "vid-1", url: "https://youtu.be/vid-1" };
    }));
    await connectAccount();

    const { job, deduplicated } = await engine.createJob(OID, UID, "youtube", { title: "Hello", mediaUrl: "/api/v1/media-factory/render/a.mp4" });
    expect(deduplicated).toBe(false);
    expect(job.status).toBe("queued");

    const { processed } = await engine.processDueJobs();
    expect(processed).toBe(1);
    expect(calls).toBe(1);

    const done = await engine.getJob(OID, job.id);
    expect(done.status).toBe("published");
    expect(done.result?.url).toBe("https://youtu.be/vid-1");
    expect(done.attempts).toBe(1);
    expect(done.publishedAt).toBeTruthy();

    const audit = await engine.listAudit(OID);
    expect(audit.map((a) => a.kind)).toEqual(["job.published", "job.attempt", "job.created"]);
  });

  it("transient failure retries with backoff, then succeeds", async () => {
    setup(fakeAdapter(async () => {
      calls++;
      if (calls === 1) throw new PlatformPublishError("PLATFORM_5XX", "server blew up", false);
      return { postId: "vid-2", url: "https://youtu.be/vid-2" };
    }));
    await connectAccount();

    const { job } = await engine.createJob(OID, UID, "youtube", { title: "Retry me", mediaUrl: "https://cdn.example.com/v.mp4" });
    await engine.processDueJobs();
    let cur = await engine.getJob(OID, job.id);
    expect(cur.status).toBe("queued");
    expect(cur.attempts).toBe(1);
    expect(cur.error?.code).toBe("PLATFORM_5XX");
    expect(cur.nextAttemptAt).toBeGreaterThan(clock); // scheduled for retry

    // Not due yet — worker skips it.
    expect((await engine.processDueJobs()).processed).toBe(0);

    clock += 60_000; // past attempt-1 backoff (30s + jitter)
    expect((await engine.processDueJobs()).processed).toBe(1);
    cur = await engine.getJob(OID, job.id);
    expect(cur.status).toBe("published");
    expect(cur.result?.postId).toBe("vid-2");
    expect(cur.error).toBeUndefined();

    const audit = await engine.listAudit(OID);
    expect(audit.map((a) => a.kind)).toEqual(["job.published", "job.attempt", "job.retry", "job.attempt", "job.created"]);
  });

  it("permanent failure (missing connection) fails immediately, never retries", async () => {
    setup(fakeAdapter(async () => { calls++; return { postId: "x" }; }));
    // No token stored → NOT_CONNECTED is permanent.

    const { job } = await engine.createJob(OID, UID, "youtube", { title: "No token", mediaUrl: "https://cdn.example.com/v.mp4" });
    await engine.processDueJobs();
    const cur = await engine.getJob(OID, job.id);
    expect(cur.status).toBe("failed");
    expect(cur.error?.code).toBe("NOT_CONNECTED");
    expect(calls).toBe(0);
    expect((await engine.processDueJobs()).processed).toBe(0); // not requeued
  });

  it("gives up after maxAttempts on persistent transient errors", async () => {
    setup(fakeAdapter(async () => { calls++; throw new PlatformPublishError("PLATFORM_5XX", "still down", false); }), { maxAttempts: 2 });
    await connectAccount();

    const { job } = await engine.createJob(OID, UID, "youtube", { title: "Always failing", mediaUrl: "https://cdn.example.com/v.mp4" });
    await engine.processDueJobs(); // attempt 1 → queued
    clock += 60_000;
    await engine.processDueJobs(); // attempt 2 → failed (max reached)
    const cur = await engine.getJob(OID, job.id);
    expect(cur.status).toBe("failed");
    expect(cur.attempts).toBe(2);
    expect(calls).toBe(2);
  });

  it("manual retry requeues a failed job", async () => {
    setup(fakeAdapter(async () => {
      calls++;
      if (calls === 1) throw new PlatformPublishError("AUTH", "bad token", true);
      return { postId: "vid-3", url: "https://youtu.be/vid-3" };
    }));
    await connectAccount();

    const { job } = await engine.createJob(OID, UID, "youtube", { title: "Fix and retry", mediaUrl: "https://cdn.example.com/v.mp4" });
    await engine.processDueJobs();
    expect((await engine.getJob(OID, job.id)).status).toBe("failed");

    const retried = await engine.retryJob(OID, job.id, UID);
    expect(retried.status).toBe("queued");
    await engine.processDueJobs();
    expect((await engine.getJob(OID, job.id)).status).toBe("published");
  });

  it("scheduled jobs stay pending until their scheduled time", async () => {
    setup(fakeAdapter(async () => { calls++; return { postId: "vid-4", url: "https://youtu.be/vid-4" }; }));
    await connectAccount();

    const future = new Date(clock + 3_600_000).toISOString();
    const { job } = await engine.createJob(OID, UID, "youtube", { title: "Later", mediaUrl: "https://cdn.example.com/v.mp4", scheduledAt: future });
    expect(job.status).toBe("scheduled");

    expect((await engine.processDueJobs()).processed).toBe(0);
    expect(calls).toBe(0);

    clock += 3_600_001;
    expect((await engine.processDueJobs()).processed).toBe(1);
    expect((await engine.getJob(OID, job.id)).status).toBe("published");
  });

  it("cancel removes a queued job from the due set", async () => {
    setup(fakeAdapter(async () => { calls++; return { postId: "never" }; }));
    await connectAccount();

    const { job } = await engine.createJob(OID, UID, "youtube", { title: "Cancel me", mediaUrl: "https://cdn.example.com/v.mp4" });
    const cancelled = await engine.cancelJob(OID, job.id, UID);
    expect(cancelled.status).toBe("cancelled");
    expect((await engine.processDueJobs()).processed).toBe(0);
    await expect(engine.cancelJob(OID, job.id, UID)).rejects.toThrow(/Cannot cancel/);
  });

  it("idempotencyKey deduplicates repeat submissions", async () => {
    setup(fakeAdapter(async () => ({ postId: "vid-5", url: "https://youtu.be/vid-5" })));
    await connectAccount();

    const first = await engine.createJob(OID, UID, "youtube", { title: "Same", mediaUrl: "https://cdn.example.com/v.mp4", idempotencyKey: "launch-video" });
    const second = await engine.createJob(OID, UID, "youtube", { title: "Same", mediaUrl: "https://cdn.example.com/v.mp4", idempotencyKey: "launch-video" });
    expect(second.deduplicated).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    expect((await engine.listJobs(OID)).length).toBe(1);
  });

  it("validates platform constraints before persistence", async () => {
    setup(fakeAdapter(async () => ({ postId: "x" })));
    await connectAccount();

    await expect(engine.createJob(OID, UID, "youtube", { title: "" })).rejects.toThrow(/Title is required/);
    await expect(engine.createJob(OID, UID, "youtube", { title: "x".repeat(101) })).rejects.toThrow(/exceeds 100/);
    await expect(engine.createJob(OID, UID, "youtube", { title: "No media" })).rejects.toThrow(/requires a videoUrl/);
    await expect(engine.createJob(OID, UID, "youtube", { title: "Bad date", mediaUrl: "https://x.co/a.mp4", scheduledAt: "not-a-date" })).rejects.toThrow(/ISO datetime/);
    expect((await engine.listJobs(OID)).length).toBe(0);
  });

  it("jobs are org-scoped (no cross-org visibility)", async () => {
    setup(fakeAdapter(async () => ({ postId: "scoped", url: "https://youtu.be/scoped" })));
    await connectAccount();

    await engine.createJob(OID, UID, "youtube", { title: "Org A job", mediaUrl: "https://cdn.example.com/v.mp4" });
    expect((await engine.listJobs(OID)).length).toBe(1);
    expect((await engine.listJobs("org-other")).length).toBe(0);
    await expect(engine.getJob("org-other", (await engine.listJobs(OID))[0]!.id)).rejects.toThrow(/not found/i);
  });
});

describe("token store", () => {
  it("stores tokens encrypted and reports connection status", async () => {
    const kv = new FakeKv();
    await saveToken("u1", "youtube", { accessToken: "super-secret-token", scope: "yt.upload" }, null, kv as any);
    const raw = await kv.get("pub:tok:u1:youtube");
    expect(raw).toBeTruthy();
    expect(raw!).not.toContain("super-secret-token"); // encrypted at rest
    const st = await connectionStatus("u1", "youtube", kv as any);
    expect(st.connected).toBe(true);
    expect(st.scope).toBe("yt.upload");
  });
});

describe("token scope on jobs", () => {
  let kv: FakeKv;
  let clock: number;

  it("org-scoped jobs execute with the org token, not the user token", async () => {
    kv = new FakeKv();
    clock = 1_000_000;
    let usedToken: string | undefined;
    const deps: any = {
      kv,
      adapters: { youtube: fakeAdapter(async (ctx) => { usedToken = ctx.accessToken; return { postId: "org-post" }; }) },
      now: () => clock,
      resolveMedia: async () => MEDIA,
      kernelDispatch: async () => {},
    };
    const eng = createPublishEngine(deps);
    // User token exists but is NOT used for an org-scoped job.
    await saveToken(UID, "youtube", { accessToken: "user-token" }, null, kv as any);
    await saveOrgToken(OID, "youtube", { accessToken: "org-token" }, null, kv as any);

    const { job } = await eng.createJob(OID, UID, "youtube", { title: "Org post", mediaUrl: "/render/a.mp4" }, { tokenScope: "org" });
    expect(job.tokenScope).toBe("org");
    await eng.processDueJobs();
    expect(usedToken).toBe("org-token");
    const done = await eng.getJob(OID, job.id);
    expect(done.status).toBe("published");
    expect(done.statusHistory?.map((h) => h.status)).toContain("uploading");
  });

  it("fails an org-scoped job permanently when no org token is connected", async () => {
    kv = new FakeKv();
    clock = 1_000_000;
    const deps: any = {
      kv,
      adapters: { youtube: fakeAdapter(async () => ({ postId: "x" })) },
      now: () => clock,
      resolveMedia: async () => MEDIA,
      kernelDispatch: async () => {},
    };
    const eng = createPublishEngine(deps);
    const { job } = await eng.createJob(OID, UID, "youtube", { title: "Org post", mediaUrl: "/render/a.mp4" }, { tokenScope: "org" });
    await eng.processDueJobs();
    const done = await eng.getJob(OID, job.id);
    expect(done.status).toBe("failed");
    expect(done.error?.code).toBe("NOT_CONNECTED");
  });
});

describe("status history", () => {
  let kv: FakeKv;
  let clock: number;

  it("records every transition on the job (create → uploading → published)", async () => {
    kv = new FakeKv();
    clock = 1_000_000;
    const deps: any = {
      kv,
      adapters: { youtube: fakeAdapter(async () => ({ postId: "h-1", url: "https://youtu.be/h-1" })) },
      now: () => clock,
      resolveMedia: async () => MEDIA,
      kernelDispatch: async () => {},
    };
    const eng = createPublishEngine(deps);
    await saveToken(UID, "youtube", { accessToken: "t" }, null, kv as any);
    const { job } = await eng.createJob(OID, UID, "youtube", { title: "Hist", mediaUrl: "/render/a.mp4" });
    await eng.processDueJobs();
    const done = await eng.getJob(OID, job.id);
    const statuses = done.statusHistory?.map((h) => h.status) ?? [];
    expect(statuses).toEqual(["queued", "uploading", "published"]);
  });

  it("cancel and retry append history entries", async () => {
    kv = new FakeKv();
    clock = 1_000_000;
    const deps: any = {
      kv,
      adapters: { youtube: fakeAdapter(async () => { throw new PlatformPublishError("HARD_FAIL", "permanent", true); }) },
      now: () => clock,
      resolveMedia: async () => MEDIA,
      kernelDispatch: async () => {},
    };
    const eng = createPublishEngine(deps);
    await saveToken(UID, "youtube", { accessToken: "t" }, null, kv as any);
    const { job } = await eng.createJob(OID, UID, "youtube", { title: "Fail", mediaUrl: "/render/a.mp4" });
    await eng.processDueJobs();
    const failed = await eng.getJob(OID, job.id);
    expect(failed.status).toBe("failed");
    await eng.retryJob(OID, job.id, UID);
    await eng.cancelJob(OID, job.id, UID);
    const final = await eng.getJob(OID, job.id);
    const statuses = final.statusHistory?.map((h) => h.status) ?? [];
    expect(statuses).toContain("failed");
    expect(statuses).toContain("queued"); // retry
    expect(statuses).toContain("cancelled");
  });
});
