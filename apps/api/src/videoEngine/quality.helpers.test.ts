/**
 * Session 200 — deeper Video Engine QA + helper coverage.
 *
 * The base suite covers provider gateway, director planning, project lifecycle,
 * the async pipeline and a few QA cases (product claims, disclosure, unsafe).
 * This suite hardens the remaining QA-engine checks and the pure helpers that
 * were unverified: duration inference, silent-WAV synthesis, caption timing,
 * and the QA branches for failures/media/av-sync/captions/copyright/skips.
 */
import { describe, it, expect } from "vitest";
import type { VideoProject, VideoScene } from "@windels/shared";
import { runQualityChecks } from "./quality.js";
import { inferTargetDuration } from "./director.js";
import { synthSilentWav, buildCaptions } from "./audio.js";

function scene(over: Partial<VideoScene> = {}): VideoScene {
  return {
    index: 0, title: "S", description: "d", visualPrompt: "a calm shot",
    cameraMovement: "static", durationSec: 5, environment: "studio",
    characterIds: [], productIds: [], status: "ready", clipAssetId: "clip-1",
    ...over,
  };
}

function project(over: Partial<VideoProject> = {}): VideoProject {
  const base: VideoProject = {
    id: "vp-1", organizationId: "org", userId: "u", name: "n", prompt: "a product ad",
    creationType: "advertisement", status: "ready", aspectRatio: "16:9", resolution: "1080p",
    quality: "standard", targetDurationSec: 10,
    scenes: [scene()],
    characters: [], products: [], assets: [], voiceTracks: [], music: [],
    captions: [{ sceneIndex: 0, text: "hello", startSec: 0, endSec: 5 }],
    versions: [], jobs: [],
    usage: { creditsUsed: 0, providerCostMicros: 0 } as any,
    disclosureAiGenerated: true,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  return { ...base, ...over };
}

describe("inferTargetDuration", () => {
  it("parses an explicit duration from the prompt", () => {
    expect(inferTargetDuration("make a 30 second ad", 10)).toBe(30);
    expect(inferTargetDuration("a 45s reel", 10)).toBe(45);
  });
  it("clamps to the 5–120 range", () => {
    expect(inferTargetDuration("a 999 second epic", 10)).toBe(120);
    expect(inferTargetDuration("a 2 sec clip", 10)).toBe(5);
  });
  it("falls back when no duration is present", () => {
    expect(inferTargetDuration("make me an ad", 12)).toBe(12);
  });
});

describe("synthSilentWav", () => {
  it("produces a valid WAV header sized to the duration", () => {
    const buf = synthSilentWav(1); // 1 second
    expect(buf.subarray(0, 4).toString()).toBe("RIFF");
    expect(buf.subarray(8, 12).toString()).toBe("WAVE");
    // 44-byte header + 44100 samples * 1ch * 2 bytes.
    expect(buf.length).toBe(44 + 44100 * 2);
  });
});

describe("buildCaptions", () => {
  it("lays captions out sequentially across scene durations", () => {
    const p = project({ scenes: [
      scene({ index: 0, durationSec: 3, caption: "one" }),
      scene({ index: 1, durationSec: 4, voiceoverText: "two" }),
    ] });
    const caps = buildCaptions(p);
    expect(caps).toHaveLength(2);
    expect(caps[0]).toMatchObject({ sceneIndex: 0, text: "one", startSec: 0, endSec: 3 });
    expect(caps[1]).toMatchObject({ sceneIndex: 1, text: "two", startSec: 3, endSec: 7 });
  });
});

describe("runQualityChecks — full check matrix", () => {
  const find = (r: Awaited<ReturnType<typeof runQualityChecks>>, id: string) => r.checks.find((c) => c.id === id);

  it("passes a clean project", async () => {
    const r = await runQualityChecks(project());
    expect(r.passed).toBe(true);
    expect(find(r, "generation_failures")?.status).toBe("pass");
    expect(find(r, "ai_disclosure")?.status).toBe("pass");
  });

  it("fails on a failed scene and a scene without a clip", async () => {
    const r = await runQualityChecks(project({ scenes: [
      scene({ index: 0, status: "failed" }),
      scene({ index: 1, clipAssetId: undefined }),
    ], captions: [] }));
    expect(find(r, "generation_failures")?.status).toBe("fail");
    expect(find(r, "missing_scenes")?.status).toBe("fail");
    expect(r.passed).toBe(false);
  });

  it("fails on a zero-byte asset and warns on an unsupported mime", async () => {
    const r = await runQualityChecks(project({ assets: [
      { id: "a1", kind: "clip", url: "u", mime: "video/mp4", bytes: 0, createdAt: "t" },
      { id: "a2", kind: "clip", url: "u", mime: "video/x-weird", bytes: 10, createdAt: "t" },
    ] }));
    expect(find(r, "corrupted_media")?.status).toBe("fail");
    expect(find(r, "unsupported_media")?.status).toBe("warn");
  });

  it("warns when a voiceover scene lacks a caption (a/v sync)", async () => {
    const r = await runQualityChecks(project({
      scenes: [scene({ voiceoverText: "narration", caption: undefined })],
      captions: [],
    }));
    expect(find(r, "av_sync")?.status).toBe("warn");
  });

  it("fails on an invalid caption (end <= start)", async () => {
    const r = await runQualityChecks(project({ captions: [{ sceneIndex: 0, text: "x", startSec: 5, endSec: 5 }] }));
    expect(find(r, "caption_errors")?.status).toBe("fail");
  });

  it("warns on copyright-sensitive text", async () => {
    const r = await runQualityChecks(project({ prompt: "use the © all rights reserved logo" }));
    expect(find(r, "copyright")?.status).toBe("warn");
  });

  it("skips brand and content-policy checks when not configured, passes when present", async () => {
    const none = await runQualityChecks(project());
    expect(find(none, "brand_restrictions")?.status).toBe("skipped");
    expect(find(none, "content_policy")?.status).toBe("skipped");

    const configured = await runQualityChecks(project({
      products: [{ source: "manual", name: "Widget", brand: "Acme", features: [], images: [] }],
      contentPolicy: { maxRating: "PG" },
    }));
    expect(find(configured, "brand_restrictions")?.status).toBe("pass");
    expect(find(configured, "content_policy")?.status).toBe("pass");
  });
});
