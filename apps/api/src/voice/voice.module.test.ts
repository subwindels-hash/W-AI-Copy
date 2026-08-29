/**
 * Session 206 — the voice module's synthesis is REAL or honestly failed.
 *
 * These tests lock in the removal of the last fake-output marker: the old
 * `// Simulate completion` setTimeout marked every TTS job "ready" after 1s
 * with an audioUrl (`/api/v1/voice/audio/:id.wav`) that no route ever served.
 * Now synthesis delegates to the real VoiceService engine, so:
 *
 *   - browser voices (win-* and builtin) → `clientSide: true` jobs, ready without
 *     a fabricated audio URL (the browser's SpeechSynthesis speaks them)
 *   - server-side synthesis with no provider configured → `failed` with the
 *     VOICE_MODEL_NOT_CONFIGURED reason and NO audioUrl — never fake-ready
 *   - the job registry (vs:jobs) persists exactly what the engine returned
 *
 * Runs fully in-memory: FakeKv replaces Redis; provider env vars are cleared
 * and espeak detection is pinned off so the unconfigured path is deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { voiceModule } = await import("./voice.module.js");
const { setEspeakDetectedForTests } = await import("../voiceStudio/voice.service.js");

const ENV_KEYS = [
  "ELEVENLABS_API_KEY", "PLAYHT_API_KEY", "PLAYHT_USER_ID",
  "OPENAI_API_KEY", "OPENAI_BASE_URL",
] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  savedEnv = {};
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  setEspeakDetectedForTests(false);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  setEspeakDetectedForTests(null);
});

describe("voice synthesize — real engine, honest states (Session 206)", () => {
  it("a browser (win-*) voice returns a clientSide job with no fabricated audio URL", async () => {
    const job = await voiceModule.synthesize("Hello from the console", "win-male-ya");
    expect(job.clientSide).toBe(true);
    expect(job.status).toBe("ready");
    // clientSide jobs are spoken by the browser's SpeechSynthesis — there is
    // no server audio file, so there must be no audioUrl.
    expect(job.audioUrl).toBeUndefined();
    expect(job.text).toBe("Hello from the console");
    expect(job.voiceId).toBe("win-male-ya");
  });

  it("server-side synthesis with no provider configured FAILS honestly — never fake-ready", async () => {
    const job = await voiceModule.synthesize("Hello", "win-male-ya", { clientSide: false } as any);
    expect(job.status).toBe("failed");
    expect(job.error).toContain("VOICE_MODEL_NOT_CONFIGURED");
    expect(job.audioUrl).toBeUndefined();
    expect(job.durationMs).toBeUndefined();
  });

  it("the failed job is persisted verbatim in the job registry", async () => {
    const job = await voiceModule.synthesize("Hello", "win-male-ya", { clientSide: false } as any);
    const doc = await kv.hgetall(`vs:jobs:${job.id}`);
    expect(doc._doc).toBeTruthy();
    const stored = JSON.parse(doc._doc as string);
    expect(stored.status).toBe("failed");
    expect(stored.error).toContain("VOICE_MODEL_NOT_CONFIGURED");
    expect(stored.audioUrl).toBeUndefined();
    const ids = await kv.zrange("vs:jobs", 0, -1);
    expect(ids).toContain(job.id);
  });

  it("a clientSide job is persisted with clientSide flag intact", async () => {
    const job = await voiceModule.synthesize("Hi there", "win-female-ya");
    const doc = await kv.hgetall(`vs:jobs:${job.id}`);
    const stored = JSON.parse(doc._doc as string);
    expect(stored.clientSide).toBe(true);
    expect(stored.status).toBe("ready");
    expect(stored.audioUrl).toBeUndefined();
  });

  it("no timer ever flips a failed job to ready later", async () => {
    const job = await voiceModule.synthesize("Hello", "win-male-ya", { clientSide: false } as any);
    expect(job.status).toBe("failed");
    await new Promise((r) => setTimeout(r, 1200)); // longer than the old 1s simulation
    const doc = await kv.hgetall(`vs:jobs:${job.id}`);
    const stored = JSON.parse(doc._doc as string);
    expect(stored.status).toBe("failed");
    expect(stored.audioUrl).toBeUndefined();
  });
});
