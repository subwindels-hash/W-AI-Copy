/**
 * AI VIDEO TRANSFORMER tests.
 *
 * Covers the natural-language edit parser (the deterministic heart of the
 * feature), video understanding structure, provider routing/failover, and the
 * async job pipeline's honest failure when no transformation provider can run.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import { parseEditInstruction } from "./editParser.js";

describe("edit command parser", () => {
  it("parses a clothing + environment multi-edit", () => {
    const plan = parseEditInstruction("Change my shirt to a black suit and put me inside a luxury hotel.");
    const targets = plan.edits.map((e) => e.target).sort();
    expect(targets).toContain("clothing");
    expect(targets.some((t) => t === "environment" || t === "background")).toBe(true);
    const clothing = plan.edits.find((e) => e.target === "clothing")!;
    expect(clothing.value.toLowerCase()).toContain("black");
    expect(clothing.action).toBe("replace");
  });

  it("parses object-in-hand replacement", () => {
    const plan = parseEditInstruction("Replace the glass with a coconut.");
    expect(plan.edits.some((e) => e.target === "object_held")).toBe(true);
    expect(plan.edits.find((e) => e.target === "object_held")!.value.toLowerCase()).toContain("coconut");
  });

  it("parses environment/background from put-me-on phrasing", () => {
    const plan = parseEditInstruction("Take this video and put me on top of the clouds.");
    expect(plan.edits.some((e) => e.target === "background" || e.target === "environment")).toBe(true);
  });

  it("parses identity transformation", () => {
    const plan = parseEditInstruction("Turn me into an astronaut while preserving my movements.");
    const id = plan.edits.find((e) => e.target === "identity");
    expect(id).toBeTruthy();
    expect(id!.value.toLowerCase()).toContain("astronaut");
    expect(plan.preserve.identity).toBe(true);
    expect(plan.preserve.motion).toBe(true);
  });

  it("preserves motion/camera/audio by default and detects 'exactly the same'", () => {
    const plan = parseEditInstruction("Change the room, keep me exactly the same.");
    expect(plan.preserve.identity).toBe(true);
    expect(plan.preserve.motion).toBe(true);
    expect(plan.preserve.camera).toBe(true);
    expect(plan.edits.some((e) => e.target === "background" || e.target === "environment")).toBe(true);
  });

  it("deduplicates overlapping edits", () => {
    const plan = parseEditInstruction("Change my shirt to a black tuxedo. Change my clothes to a black tuxedo.");
    expect(plan.edits.filter((e) => e.target === "clothing")).toHaveLength(1);
  });

  it("returns no edits for an unrelated greeting rather than inventing one", () => {
    const plan = parseEditInstruction("Hello there, how are you?");
    expect(plan.edits.length).toBe(0);
  });
});

describe("video understanding", () => {
  it("builds a structured scene with people, held objects and editable regions", async () => {
    const { understand } = await import("./understanding.js");
    const scene = understand({
      sourceAssetId: "src1", path: "/tmp/fake.mp4", sizeBytes: 1000,
      prompt: "Replace the glass with a coconut while I'm drinking.",
      meta: { width: 1920, height: 1080, durationSec: 10, fps: 30, frameCount: 300 },
    });
    expect(scene.people.some((p) => p.kind === "person")).toBe(true);
    expect(scene.objects.some((o) => /coconut|glass|drink/i.test(o.label))).toBe(true);
    expect(scene.regions.some((r) => r.target === "clothing")).toBe(true);
    expect(scene.regions.some((r) => r.target === "background")).toBe(true);
    expect(scene.audio.hasAmbient).toBe(true);
  });
});

describe("provider gateway", () => {
  it("selects a capable model and reports a multi-stage plan for complex edits", async () => {
    const { vtxGateway } = await import("./providerGateway.js");
    const plan = parseEditInstruction("Change my shirt to a suit and put me on a beach.");
    const route = vtxGateway.route({ durationSec: 10, resolution: "1080p", edits: plan.edits });
    expect(route.estimatedCredits).toBeGreaterThan(0);
    expect(Array.isArray(route.stages) && route.stages.length > 0).toBe(true);
  });
});

describe("transform job pipeline", () => {
  const { fakeRedis, fakeSorted } = vi.hoisted(() => {
    const fakeRedis: Record<string, any> = {};
    const fakeSorted: Record<string, string[]> = {};
    return { fakeRedis, fakeSorted };
  });
  vi.mock("../db/redis.js", () => ({ redisCmd: {
    get: vi.fn(async (k: string) => fakeRedis[k] ?? null),
    set: vi.fn(async (k: string, v: any) => { fakeRedis[k] = v; return "OK"; }),
    hset: vi.fn(async (k: string, _f: string, v: any) => { fakeRedis[k] = { _doc: v }; return 1; }),
    hget: vi.fn(async (k: string) => fakeRedis[k]?._doc ?? null),
    del: vi.fn(async (k: string) => { delete fakeRedis[k]; return 1; }),
    incr: vi.fn(async () => 1), decr: vi.fn(async () => 0),
    expire: vi.fn(async () => 1), rpush: vi.fn(async () => 1), lpop: vi.fn(async () => null),
    zadd: vi.fn(async (k: string, _s: any, m: string) => { fakeSorted[k] = Array.from(new Set([...(fakeSorted[k] ?? []), m])); return 1; }),
    zrange: vi.fn(async (k: string) => fakeSorted[k] ?? []),
    keys: vi.fn(async () => []), llen: vi.fn(async () => 0),
  } }));
  vi.mock("../config/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
  vi.mock("../mediaFactory/metering.service.js", () => ({ MediaMeteringService: { recordRender: vi.fn(async () => ({})) } }));
  vi.mock("../notifications/notifications.service.js", () => ({ notificationsService: { createAndSend: vi.fn(async () => "n1") } }));

  // ffmpeg is absent in the sandbox; local-composite provider must honestly fail.
  it("fails honestly with a configuration error rather than faking a result", async () => {
    const { VtxService } = await import("./transform.service.js");
    // Seed a fake uploaded source so transform() does not 404.
    fakeRedis["vtx:source:src-fake"] = JSON.stringify({
      assetId: "src-fake", path: "/nonexistent.mp4", url: "u", bytes: 100,
      meta: { width: 0, height: 0, durationSec: 5, fps: 30, frameCount: 150, sizeBytes: 100 },
    });
    const job = await VtxService.transform("org1", "user1", {
      sourceAssetId: "src-fake", prompt: "Put me on the clouds.", resolution: "720p", preview: true, previewSeconds: 3,
    });
    // Run the worker inline.
    await VtxService.runJob(await VtxService.getJob("org1", job.id) as any);
    const done = await VtxService.getJob("org1", job.id);
    expect(done!.status).toBe("failed");
    // No fabricated output asset.
    expect(done!.resultAssetId).toBeUndefined();
    expect(done!.error).toBeTruthy();
  });
});
