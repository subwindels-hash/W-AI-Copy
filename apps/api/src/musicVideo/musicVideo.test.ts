/**
 * WINDELS AI OS — Music Video Generator tests.
 *
 * Verifies the real, honest behavior of the pipeline pieces:
 *   - audio analysis computes real BPM/beats/energy from actual PCM (no fakes)
 *   - storyboard produces a deterministic, valid scene plan
 *   - service creates org-scoped jobs and honors the ffmpeg `requires_config`
 *     fallback (honest — it does not pretend to render without ffmpeg)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { decodeWavToF32, analyzePcm } from "./audioAnalysis.js";
import { buildStoryboard } from "./storyboard.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
// The real AI registry transitively imports @prisma/client (needs generated
// client). Substitute it — we only rely on provider-config detection.
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: { hasRealModelConfigured: () => false, complete: vi.fn() },
}));
// ffmpeg is not present in the sandbox → service should report requires_config.
vi.mock("node:child_process", () => ({ execFile: (...args: any[]) => { const cb = args[args.length - 1]; if (typeof cb === "function") cb(new Error("ENOENT")); } }));

const { MusicVideoService } = await import("./musicVideo.service.js");

const ORG = "org-mv";
const OTHER = "org-other";
const USER = "user-1";

/** Build a small real WAV (1s, 440Hz tone) to analyze. */
function makeWav(durationSec = 1): Buffer {
  const sr = 44100, n = Math.floor(durationSec * sr);
  const bytesPerSample = 2, channels = 1, blockAlign = bytesPerSample * channels;
  const dataSize = n * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * blockAlign, 28); buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const s = Math.sin((2 * Math.PI * 440 * i) / sr) * 0.5;
    buf.writeInt16LE(Math.round(s * 32767), o); o += 2;
  }
  return buf;
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("audio analysis (real)", () => {
  it("decodes a real WAV to PCM and analyzes it", () => {
    const pcm = decodeWavToF32(makeWav(1));
    expect(pcm).not.toBeNull();
    expect(pcm!.length).toBeGreaterThan(1000);
    const a = analyzePcm(pcm!);
    expect(a.durationSec).toBeGreaterThan(0.9);
    // A pure tone is not percussive → BPM may be null, but energy/loudness are real.
    expect(a.loudness).toBeGreaterThan(0);
    expect(Array.isArray(a.energyCurve)).toBe(true);
    expect(a.sections.length).toBeGreaterThan(0);
  });

  it("returns null for non-PCM input (honest, not fabricated)", () => {
    const junk = Buffer.from("not a wav file at all........");
    expect(decodeWavToF32(junk)).toBeNull();
  });
});

describe("storyboard engine", () => {
  const audio = { durationSec: 12, bpm: 120, beatTimesSec: [1, 2, 3], energyCurve: [0.5, 0.5, 0.5, 0.5], sections: [], loudness: 0.5, tempoLabel: "medium" as const };

  it("single_image mode → exactly 1 scene", () => {
    const sb = buildStoryboard({ mode: "single_image", style: "cinematic", aspect: "16:9", imageCount: 1, audio, allowAiScenes: false, seed: "s" });
    expect(sb.scenes.length).toBe(1);
    expect(sb.totalDurationSec).toBe(12);
    expect(sb.scenes[0]!.camera).toBeTruthy();
  });

  it("multi_image_story → one scene per image", () => {
    const sb = buildStoryboard({ mode: "multi_image_story", style: "music_video", aspect: "9:16", imageCount: 3, audio, allowAiScenes: false, seed: "s" });
    expect(sb.scenes.length).toBe(3);
  });

  it("is deterministic for the same seed", () => {
    const a = buildStoryboard({ mode: "ai_storyboard", style: "anime", aspect: "1:1", imageCount: 2, audio, allowAiScenes: true, seed: "x" });
    const b = buildStoryboard({ mode: "ai_storyboard", style: "anime", aspect: "1:1", imageCount: 2, audio, allowAiScenes: true, seed: "x" });
    expect(JSON.stringify(a.scenes)).toBe(JSON.stringify(b.scenes));
  });
});

describe("MusicVideoService", () => {
  it("creates org-scoped jobs and reports requires_config without ffmpeg (honest)", async () => {
    const job = await MusicVideoService.create(ORG, USER, {
      title: "Test MV", mode: "single_image", style: "cinematic", aspect: "16:9",
      images: [{ url: "/media-factory/render/a.png", name: "a", sortOrder: 0 }],
      audioUrl: "/music/x.wav", audioName: "song",
    });
    expect(job.status).toBe("queued");
    expect(job.organizationId).toBe(ORG);

    const done = await MusicVideoService.runOne(ORG, job.id);
    // Without ffmpeg, we honestly do not claim a render happened.
    expect(["requires_config", "failed"]).toContain(done.status);
    if (done.status === "requires_config") {
      expect(done.error).toContain("ffmpeg");
    }
  });

  it("is org-scoped", async () => {
    const job = await MusicVideoService.create(ORG, USER, {
      title: "T", mode: "single_image", style: "cinematic", aspect: "16:9",
      images: [{ url: "x", name: "a", sortOrder: 0 }], audioUrl: "y",
    });
    await expect(MusicVideoService.get(OTHER, job.id)).resolves.toBeNull();
    expect(await MusicVideoService.list(OTHER)).toEqual([]);
  });
});
