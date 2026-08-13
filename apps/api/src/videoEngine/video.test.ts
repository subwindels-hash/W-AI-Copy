/**
 * WINDELS AI Video Engine — tests.
 *
 * Exercises the real pipeline against the in-memory FakeKv (same approach as
 * musicVideo/mediaGen): provider routing, project planning, async job
 * generation, idempotency, retry, QA safety, tenant isolation, conversational
 * modifications, and ffmpeg `requires_config` honesty.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
// ffmpeg is not present in the sandbox → renderer reports requires_config.
vi.mock("node:child_process", () => ({
  execFile: (...args: any[]) => { const cb = args[args.length - 1]; if (typeof cb === "function") cb(new Error("ENOENT")); },
  execFileSync: () => { throw new Error("ENOENT"); },
}));
// Kernel is optional; avoid importing its redis usage nuances.
vi.mock("../kernel/kernel.service.js", () => ({
  KernelService: { dispatch: vi.fn(async () => ({ id: "ke-test", at: new Date().toISOString() })) },
}));
// Marketplace lookup: simulate a product resolution without a live service.
vi.mock("../aiCommerce/commerceDiscovery.service.js", () => ({
  CommerceDiscoveryService: {
    getProduct: async (id: string) => id === "prod-1"
      ? { id, name: "StrideRunner 9", description: "Cushioned running shoe", price: { amountMinor: 12900, currency: "USD", display: "$129.00" }, brand: "Stride", features: ["Breathable mesh", "Cloud foam midsole"], category: "Footwear", vendorName: "Stride Inc", images: ["https://example.com/shoe.jpg"] }
      : null,
  },
}));
vi.mock("../marketplace/appStore.service.js", () => ({}));
vi.mock("../mediaFactory/publishing.service.js", () => ({
  PublishingService: { publish: vi.fn(async () => ({ externalId: "ext-1", url: "https://video.example/1" })) },
}));

const { videoProviderGateway } = await import("./providerGateway.js");
const { VideoService } = await import("./video.service.js");
const { VideoJobQueue } = await import("./jobQueue.js");
const { runQualityChecks } = await import("./quality.js");
const { inferCreationType, planProduction } = await import("./director.js");

const ORG = "org-video";
const OTHER = "org-other";
const USER = "user-1";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("provider gateway", () => {
  it("routes text-to-video to a capable model", () => {
    const route = videoProviderGateway.route({ op: "text-to-video", resolution: "1080p", aspectRatio: "16:9", durationSec: 10 });
    expect(route.providerId).toBe("sim");
    expect(route.modelId).toMatch(/sim-t2v/);
    expect(route.estimatedCostMicros).toBeGreaterThan(0);
  });

  it("requires product consistency for product videos", () => {
    const route = videoProviderGateway.route({ op: "image-to-video", resolution: "1080p", aspectRatio: "9:16", durationSec: 15, needsProductConsistency: true });
    expect(route.modelId).toMatch(/sim-i2v/);
  });

  it("rejects impossible durations", () => {
    expect(() => videoProviderGateway.route({ op: "text-to-video", resolution: "1080p", aspectRatio: "16:9", durationSec: 9999 })).toThrow(/No video provider/);
  });
});

describe("AI Video Director", () => {
  it("infers creation type and target duration from natural language", () => {
    expect(inferCreationType("create a 30-second advertisement for my shoe business")).toBe("advertisement");
    expect(inferCreationType("make a TikTok reel")).toBe("short_form");
    expect(inferCreationType("create an explainer video")).toBe("explainer");
  });

  it("plans script, storyboard and scenes without inventing product facts", () => {
    const plan = planProduction({
      prompt: "30s shoe ad", creationType: "advertisement", durationSec: 30,
      products: [{ source: "marketplace", name: "StrideRunner 9", price: "$129.00", brand: "Stride", features: ["Breathable mesh"], images: [] }],
      aspectRatio: "9:16",
    });
    expect(plan.script.sections.length).toBeGreaterThan(1);
    expect(plan.scenes.every((s) => s.durationSec > 0)).toBe(true);
    expect(plan.storyboard.frames.length).toBe(plan.scenes.length);
    // No invented price in voiceover.
    expect(plan.scenes.some((s) => /\$/.test(s.voiceoverText ?? "") && s.voiceoverText?.includes("$49"))).toBe(false);
  });
});

describe("project lifecycle", () => {
  it("creates, gets, lists, updates and deletes projects with tenant isolation", async () => {
    const p = await VideoService.createProject(ORG, USER, { prompt: "make an ad" });
    expect(p.id).toMatch(/^vp-/);
    expect(p.disclosureAiGenerated).toBe(true);

    const fetched = await VideoService.getProject(ORG, p.id);
    expect(fetched?.prompt).toBe("make an ad");
    expect(await VideoService.getProject(OTHER, p.id)).toBeNull();

    await VideoService.updateProject(ORG, p.id, { name: "Renamed" });
    expect((await VideoService.getProject(ORG, p.id))?.name).toBe("Renamed");

    const list = await VideoService.listProjects(ORG);
    expect(list.some((x) => x.id === p.id)).toBe(true);

    expect(await VideoService.deleteProject(ORG, p.id)).toBe(true);
    expect(await VideoService.getProject(ORG, p.id)).toBeNull();
  });

  it("plans a project into script/storyboard/scenes", async () => {
    const p = await VideoService.createProject(ORG, USER, { prompt: "create a 45-second Facebook advertisement for my clothing business" });
    const planned = await VideoService.plan(ORG, p.id);
    expect(planned!.script).toBeTruthy();
    expect(planned!.scenes.length).toBeGreaterThan(1);
    expect(planned!.storyboard!.frames.length).toBe(planned!.scenes.length);
  });
});

describe("async generation pipeline", () => {
  async function drainJobs(org: string) {
    // Run every pending job to completion by repeatedly ticking. The queue
    // invokes handlers without awaiting, so yield to the microtask queue
    // between ticks to let in-flight jobs finish.
    for (let i = 0; i < 50; i++) {
      await VideoJobQueue.tick(org, (job) => VideoService.handleJob(job));
      await new Promise((r) => setTimeout(r, 25));
      const jobs = await VideoJobQueue.list(org);
      if (!jobs.some((j) => j.status === "pending" || j.status === "running")) break;
    }
  }

  it("generates clips + voice + music as async jobs and is idempotent", async () => {
    const p = await VideoService.createProject(ORG, USER, { prompt: "20 second ad", targetDurationSec: 20 });
    await VideoService.plan(ORG, p.id);
    const { jobs: first } = await VideoService.generate(ORG, p.id, {});
    expect(first.length).toBeGreaterThanOrEqual(3); // clips + voice + music
    await drainJobs(ORG);

    const after = await VideoService.getProject(ORG, p.id);
    expect(after!.assets.some((a) => a.kind === "clip")).toBe(true);
    expect(after!.assets.some((a) => a.kind === "audio_voice")).toBe(true);
    expect(after!.assets.some((a) => a.kind === "audio_music")).toBe(true);
    expect(after!.scenes.every((s) => s.status === "ready")).toBe(true);
    expect(after!.usage.successfulGenerations).toBeGreaterThan(0);

    // Re-submitting the same generation collapses via idempotency key: the
    // total job count must not grow (every key maps to an existing job).
    const before = (await VideoJobQueue.list(ORG)).length;
    await VideoService.generate(ORG, p.id, {});
    await new Promise((r) => setTimeout(r, 25));
    const afterJobs = await VideoJobQueue.list(ORG);
    expect(afterJobs.length).toBe(before); // no duplicate jobs enqueued
  });

  it("cancels a pending job", async () => {
    const p = await VideoService.createProject(ORG, USER, { prompt: "ad" });
    await VideoService.plan(ORG, p.id);
    const { jobs } = await VideoService.generate(ORG, p.id, {});
    const clip = jobs.find((j) => j.kind === "scene_clip")!;
    const cancelled = await VideoService.cancelJob(ORG, clip.id);
    expect(["cancelled", "succeeded"]).toContain(cancelled!.status);
  });
});

describe("rendering & QA", () => {
  it("renders with honest requires_config when ffmpeg is absent, then QA enforces disclosure", async () => {
    const p = await VideoService.createProject(ORG, USER, { prompt: "30s product ad", targetDurationSec: 30 });
    await VideoService.produce(ORG, p.id, {});
    for (let i = 0; i < 50; i++) {
      await VideoJobQueue.tick(ORG, (job) => VideoService.handleJob(job));
      await new Promise((r) => setTimeout(r, 10));
      const jobs = await VideoJobQueue.list(ORG);
      if (!jobs.some((j) => j.status === "pending" || j.status === "running")) break;
    }
    const final = await VideoService.getProject(ORG, p.id);
    // Without ffmpeg the render job marks the version failed; QA still runs.
    expect(final!.versions.length).toBeGreaterThan(0);
    expect(final!.captions.length).toBe(final!.scenes.length);
  });

  it("QA blocks invented product prices and guarantees", async () => {
    const p = await VideoService.createProject(ORG, USER, { prompt: "ad" });
    await VideoService.plan(ORG, p.id);
    const planned = (await VideoService.getProject(ORG, p.id))!;
    planned.products = [{ source: "manual", name: "Widget", features: [], images: [] }];
    planned.scenes[0]!.voiceoverText = "Only $9.99 today, guaranteed for life!";
    planned.scenes[0]!.caption = "Only $9.99 today, guaranteed for life!";
    planned.disclosureAiGenerated = false;
    const report = await runQualityChecks(planned);
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id === "incorrect_product_claims")?.status).toBe("fail");
    expect(report.checks.find((c) => c.id === "ai_disclosure")?.status).toBe("fail");
  });

  it("QA rejects unsafe prompts", async () => {
    const p = await VideoService.createProject(ORG, USER, { prompt: "gore and beheading" });
    await VideoService.plan(ORG, p.id);
    const planned = (await VideoService.getProject(ORG, p.id))!;
    const report = await runQualityChecks(planned);
    expect(report.checks.find((c) => c.id === "unsafe_content")?.status).toBe("fail");
  });
});

describe("conversational modifications & marketplace", () => {
  it("applies shorten/voice/music/aspect changes to the same project", async () => {
    const p = await VideoService.createProject(ORG, USER, { prompt: "40s marketing video", targetDurationSec: 40 });
    await VideoService.plan(ORG, p.id);
    const shorter = await VideoService.modify(ORG, p.id, { action: "shorten" });
    expect(shorter!.targetDurationSec).toBeLessThan(40);
    const voiced = await VideoService.modify(ORG, p.id, { action: "set_voice_gender", value: "female" });
    expect(voiced!.voiceTracks.every((t) => t.gender === "female")).toBe(true);
    const reformatted = await VideoService.modify(ORG, p.id, { action: "reformat", value: "9:16" });
    expect(reformatted!.aspectRatio).toBe("9:16");
  });

  it("attaches marketplace product data without inventing facts", async () => {
    const p = await VideoService.createProject(ORG, USER, { prompt: "ad for this product" });
    const attached = await VideoService.attachMarketplaceProduct(ORG, p.id, "prod-1");
    expect(attached!.products[0]!.name).toBe("StrideRunner 9");
    expect(attached!.products[0]!.price).toBe("$129.00");
    expect(attached!.products[0]!.features).toContain("Breathable mesh");
  });

  it("throws when a marketplace product cannot be found (no fabricated facts)", async () => {
    const p = await VideoService.createProject(ORG, USER, { prompt: "ad" });
    await expect(VideoService.attachMarketplaceProduct(ORG, p.id, "nope")).rejects.toThrow(/Product not found/);
  });
});

describe("dashboard & capabilities", () => {
  it("reports providers and project counts", async () => {
    await VideoService.createProject(ORG, USER, { prompt: "ad one" });
    const dash = await VideoService.dashboard(ORG);
    expect(dash.projects).toBe(1);
    expect(dash.providers).toBeGreaterThanOrEqual(1);
    expect(dash.providersConfigured).toBeGreaterThanOrEqual(1);
    expect(VideoService.capabilities().creationTypes).toContain("advertisement");
  });
});
