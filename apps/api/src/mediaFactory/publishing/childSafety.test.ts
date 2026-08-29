/**
 * Session 77 — the child-safety reviewer must block publish, not just generation.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The S77 spec states the requirement twice, and states it as hard:
 *
 *   77.3 Conventions — "Non-bypassable safety gates: `ChildSafetyReviewer` and
 *   prescription-workflow governance checks are implemented as pipeline steps
 *   that **block publish/execution**, not as advisory warnings — matches how
 *   the two specs phrase these as hard requirements, not soft ones."
 *
 * What shipped enforces it in exactly one place: `mediaFactory.generate()`
 * screens the *generation* prompt. The S77B publishing path — the step that
 * actually pushes content to YouTube, TikTok, Instagram, Facebook, X and
 * Pinterest — never consults it. `createJob()` calls `validateInput()`, which
 * checks title length and media constraints, and nothing else.
 *
 * So the gate is bypassed by the ordinary route: `POST
 * /media-factory/publishing/:platform/publish` accepts arbitrary title,
 * description and tags and queues them for a real upload. Content that
 * `generate()` would have rejected can be published verbatim, and content never
 * routed through `generate()` at all — a directly-supplied `videoUrl` with a
 * hand-written title — is never screened.
 *
 * Worse, `v76validation.service.ts` self-certifies the requirement as met:
 *
 *   { item: "S77 ChildSafetyReviewer non-bypassable in Media Factory",
 *     passed: true,
 *     detail: "Content generation runs child-safety keyword gate prior to job creation" }
 *
 * The detail describes generation while the item claims non-bypassability, so
 * the compliance report reads green against a control that does not exist on
 * the path that matters.
 *
 * These tests pin the gate on the publish path.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createPublishEngine, type PublishEngine } from "./publishJobs.js";
import { saveToken } from "./tokens.js";
import { FakeKv } from "./fakeKv.js";
import type { PlatformAdapter } from "./platforms.js";

const OID = "org-test";
const UID = "user-test";
const MEDIA = { buffer: Buffer.from("tiny-mp4"), contentType: "video/mp4" };

function fakeAdapter(): PlatformAdapter {
  return {
    id: "youtube",
    oauth: { envClientId: "X", envClientSecret: "Y", scope: "", authorizeUrl: "", tokenUrl: "" },
    constraints: { requiresMedia: true, mediaKinds: ["video"], maxTitle: 100, maxDescription: 5000, maxMediaMB: 100 },
    exchangeCode: async () => ({ accessToken: "x" }),
    refreshToken: async () => ({ accessToken: "x" }),
    publish: async () => ({ postId: "vid-1", url: "https://youtu.be/vid-1" }),
  } as PlatformAdapter;
}

describe("child-safety gate blocks the publish path", () => {
  let kv: FakeKv;
  let engine: PublishEngine;
  let published: number;

  beforeEach(async () => {
    kv = new FakeKv();
    published = 0;
    const adapter = fakeAdapter();
    const counting: PlatformAdapter = {
      ...adapter,
      publish: async (ctx: any) => { published += 1; return adapter.publish(ctx); },
    };
    engine = createPublishEngine({
      kv,
      adapters: { youtube: counting as any },
      now: () => 1_000_000,
      resolveMedia: async () => MEDIA,
      kernelDispatch: async () => {},
    } as any);
    await saveToken(UID, "youtube", { accessToken: "test-token" }, null, kv as any);
  });

  const base = { videoUrl: "https://cdn.example.com/v.mp4" };

  it("rejects a job whose title carries unsafe content", async () => {
    await expect(
      engine.createJob(OID, UID, "youtube", { ...base, title: "explicit gore compilation" } as any),
    ).rejects.toMatchObject({ code: "CONTENT_SAFETY_REJECTED" });
  });

  it("rejects unsafe content hidden in the description, not just the title", async () => {
    // The generation gate only ever saw a single prompt string. Publishing has
    // three free-text fields, and screening one of them is not a gate.
    await expect(
      engine.createJob(OID, UID, "youtube", {
        ...base, title: "Harmless craft video",
        description: "Includes step-by-step self-harm instructions.",
      } as any),
    ).rejects.toMatchObject({ code: "CONTENT_SAFETY_REJECTED" });
  });

  it("rejects unsafe content hidden in tags", async () => {
    await expect(
      engine.createJob(OID, UID, "youtube", {
        ...base, title: "Craft video", tags: ["crafts", "hate speech"],
      } as any),
    ).rejects.toMatchObject({ code: "CONTENT_SAFETY_REJECTED" });
  });

  it("never queues a rejected job — nothing reaches the platform", async () => {
    await expect(
      engine.createJob(OID, UID, "youtube", { ...base, title: "violent abuse footage" } as any),
    ).rejects.toBeTruthy();

    // The gate must stop the job existing, not merely flag it: a queued job is
    // one worker tick away from a real upload.
    const jobs = await engine.listJobs(OID);
    expect(jobs).toHaveLength(0);

    await engine.processDueJobs();
    expect(published).toBe(0);
  });

  it("records the rejection in the audit trail", async () => {
    await engine.createJob(OID, UID, "youtube", { ...base, title: "gore reel" } as any).catch(() => {});
    const events = await engine.listAudit(OID, 20);
    const rejection = events.find((e) => e.kind === "job.safety_rejected");
    expect(rejection).toBeTruthy();
    expect(rejection!.detail).toMatch(/safety/i);
  });

  it("allows ordinary content through unchanged", async () => {
    const { job } = await engine.createJob(OID, UID, "youtube", {
      ...base, title: "How to bake sourdough", description: "A gentle beginner guide.", tags: ["baking"],
    } as any);
    expect(job.status).toBe("queued");

    await engine.processDueJobs();
    expect(published).toBe(1);
  });

  it("does not reject on an innocent substring", async () => {
    // "abuse" appears inside "abuser"? No — but "grape" contains "rape"-like
    // substrings under naive matching. Word boundaries must be respected or the
    // gate becomes noise that operators route around.
    const { job } = await engine.createJob(OID, UID, "youtube", {
      ...base, title: "Grape harvest and classic therapy techniques",
      description: "Discussing therapist-led recovery and analysis.",
    } as any);
    expect(job.status).toBe("queued");
  });

  it("flags child-targeted content for age-appropriateness review", async () => {
    const { job } = await engine.createJob(OID, UID, "youtube", {
      ...base, title: "Fun counting songs for kids", tags: ["children"],
    } as any);
    // Not blocked — but marked, so the requirement's "child-safety reviewer"
    // has something to act on rather than the flag being lost at generation.
    expect(job.safety).toBe("child-targeted-review");
  });

  it("marks ordinary content as screened so the verdict is auditable", async () => {
    const { job } = await engine.createJob(OID, UID, "youtube", {
      ...base, title: "Quarterly product update",
    } as any);
    expect(job.safety).toBe("screened");
  });
});
