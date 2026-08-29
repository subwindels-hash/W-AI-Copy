/**
 * AI Video Studio (Cinematic) tests.
 *
 * Uses FakeKv; verifies model routing/capabilities/failover, character
 * consistency, cinematic control parsing, prompt enhancement, storyboard
 * multi-shot planning, async generation, audio planning, and quality-control
 * retry decisions — all tenant-isolated.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../kernel/kernel.service.js", () => ({ KernelService: { dispatch: vi.fn(async () => ({})) } }));
vi.mock("../mediaFactory/metering.service.js", () => ({ MediaMeteringService: { record: vi.fn(async () => null), recordMany: vi.fn(async () => []) } }));
vi.mock("../notifications/notifications.service.js", () => ({ notificationsService: { createAndSend: vi.fn(async () => "n1") } }));

const { modelRegistry } = await import("./modelRegistry.js");
const { parseCamera, parseLighting, parseMotion, enhancePrompt, defaultShots } = await import("./engines.js");
const { CharacterService, RealismEngine, inheritContinuity } = await import("./consistency.js");
const { VideoDirector, QualityAgent, routeRequestFrom } = await import("./director.js");
const { AudioEngine } = await import("./audio.js");
const { CinematicService } = await import("./cinematic.service.js");

const ORG = "org-cin";

beforeEach(() => { kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear(); });

describe("model registry & router", () => {
  it("routes previews to the fast model and high-realism to cinematic", () => {
    const fast = modelRegistry.route({ mode: "text_to_video", prompt: "car", durationSec: 5, resolution: "720p", aspectRatio: "16:9", referenceCount: 0, needsCharacterConsistency: false, needsAudio: false, needsDialogue: false, preview: true });
    expect(fast.modelId).toBe("windels-fast");
    const hq = modelRegistry.route({ mode: "text_to_video", prompt: "woman", durationSec: 10, resolution: "1080p", aspectRatio: "16:9", referenceCount: 0, needsCharacterConsistency: false, needsAudio: true, needsDialogue: true });
    expect(hq.modelId).toBe("windels-cinema");
  });

  it("routes character requests to the identity model and reports multi-shot for long video", () => {
    const r = modelRegistry.route({ mode: "multi_reference", prompt: "", durationSec: 60, resolution: "1080p", aspectRatio: "16:9", referenceCount: 4, needsCharacterConsistency: true, needsAudio: false, needsDialogue: false });
    expect(r.multiShot).toBe(true);
    expect(["windels-identity", "windels-cinema"]).toContain(r.modelId);
  });

  it("fails over to another model when the selected one fails", () => {
    const req = { mode: "text_to_video" as const, prompt: "", durationSec: 5, resolution: "720p", aspectRatio: "16:9", referenceCount: 0, needsCharacterConsistency: false, needsAudio: false, needsDialogue: false };
    const first = modelRegistry.route(req);
    modelRegistry.markFailure(first.providerId, first.modelId);
    const failover = modelRegistry.failover(req, first.providerId, first.modelId);
    expect(failover).not.toBeNull();
    expect(failover!.modelId).not.toBe(first.modelId);
  });
});

describe("cinematic engines", () => {
  it("parses camera, lighting and motion from natural language", () => {
    expect(parseCamera("slow drone shot with a slow orbit").type).toBe("drone");
    expect(parseLighting("strong neon lighting").preset).toBe("neon");
    expect(parseMotion("the woman is walking toward the camera").action).toBe("walking");
  });

  it("enhances a simple prompt into a structured cinematic prompt", () => {
    const out = enhancePrompt({ prompt: "a car", style: "cinematic", camera: parseCamera("dolly in"), lighting: parseLighting("golden hour"), positions: [], references: [], durationSec: 10 });
    expect(out).toContain("cinematic style");
    expect(out).toContain("camera:");
  });

  it("builds multiple shots for long-form video", () => {
    const shots = defaultShots(30, "cinematic city", 8);
    expect(shots.length).toBe(4);
    expect(shots.reduce((a, s) => a + s.durationSec, 0)).toBeCloseTo(30, 1);
  });

  it("builds a realism negative prompt targeting common artifacts", () => {
    expect(RealismEngine.negativePrompt()).toContain("extra fingers");
    expect(RealismEngine.scoreArtifactSignals({ faceDrift: 0.5 })).toBeLessThan(0.7);
  });

  it("inherits scene continuity between shots", () => {
    const a = inheritContinuity(undefined, { characterIds: ["c1"], lighting: "golden_hour", wardrobe: { c1: "jacket" }, props: ["red car"], palette: ["#000"] });
    const b = inheritContinuity(a, {});
    expect(b.props).toContain("red car");
    expect(b.lighting).toBe("golden_hour");
  });
});

describe("characters", () => {
  it("creates reusable characters with an identity key", async () => {
    const c = await CharacterService.create(ORG, "u1", { name: "Alex", references: [{ id: "r1", role: "face", assetId: "a1", url: "u", strength: "high" }] });
    expect(c.identityKey).toBeTruthy();
    const locked = CharacterService.lock([c]);
    expect(locked.identityKey).toContain(c.identityKey!);
    expect(locked.references[0]!.label).toContain("Alex");
    expect(await CharacterService.get("other-org", c.id)).toBeNull();
  });
});

describe("director + audio", () => {
  it("plans shots for a project and applies direction", () => {
    const p = sampleProject();
    const route = modelRegistry.route(routeRequestFrom(p, p.references.length, false));
    const plan = VideoDirector.plan(p, route, 10);
    expect(plan.shots.length).toBeGreaterThan(0);
    expect(plan.enhancedPrompt).toContain("futuristic");
    const patch = VideoDirector.applyDirection(p, "make it cinematic with an orbit camera");
    expect(patch.camera?.type).toBe("orbit");
  });

  it("plans synchronized dialogue and ambient audio", () => {
    const shots = defaultShots(10, "beach", 10).map((s) => ({ ...s, dialogue: "Hello there" }));
    const plan = AudioEngine.plan(shots, { music: true, sfx: true, ambient: true });
    expect(plan.tracks.some((t) => t.kind === "dialogue")).toBe(true);
    expect(plan.tracks.some((t) => t.kind === "music")).toBe(true);
    expect(plan.cues[0]!.text).toBe("Hello there");
  });

  it("quality agent passes clean output and flags defects", () => {
    const shot = { id: "s1" } as any;
    expect(QualityAgent.inspect(shot, {}).passed).toBe(true);
    expect(QualityAgent.inspect(shot, { faceDrift: 0.9 }).passed).toBe(false);
    expect(QualityAgent.shouldRegenerate(QualityAgent.inspect(shot, { faceDrift: 0.9 })).regen).toBe(true);
  });
});

describe("end-to-end generation", () => {
  it("creates a project, estimates, generates (multi-shot), records credits and is tenant isolated", async () => {
    const p = await CinematicService.createProject(ORG, "u1", { prompt: "a 20-second cinematic shot of a futuristic Lagos at night", durationSec: 20, audioEnabled: true, dialogueEnabled: false });
    expect(p.id).toMatch(/^cp-/);
    const est = CinematicService.estimate(p);
    expect(est.credits).toBeGreaterThan(0);

    const job = await CinematicService.generate(ORG, p.id, { preview: false });
    // Run the async worker to completion.
    await CinematicService.runJob(await CinematicService.getJob(ORG, job.id) as any);
    const done = await CinematicService.getJob(ORG, job.id);
    expect(done!.status).toBe("succeeded");
    expect(done!.creditsUsed).toBeGreaterThan(0);

    const final = await CinematicService.getProject(ORG, p.id);
    expect(final!.status).toBe("ready");
    expect(final!.generations.length).toBeGreaterThan(0);
    expect(final!.audioTracks.length).toBeGreaterThan(0);
    expect(await CinematicService.getProject("other-org", p.id)).toBeNull();
  });
});

function sampleProject() {
  return {
    id: "cp-x", organizationId: ORG, userId: "u1", title: "t", prompt: "woman in a futuristic city",
    mode: "text_to_video" as const, style: "cinematic" as const, aspectRatio: "16:9", resolution: "1080p", fps: 24,
    durationSec: 10, quality: "high" as const, audioEnabled: true, dialogueEnabled: false, musicEnabled: true,
    sfxEnabled: true, lipSync: false, variation: 1, camera: { type: "dolly_in" as const }, lighting: { preset: "cinematic" as const },
    positions: [], references: [], characterIds: [], audioTracks: [], generations: [], jobs: [], version: 1,
    status: "draft" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as any;
}
