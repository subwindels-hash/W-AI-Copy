/**
 * Voice TTS honesty: no placeholder beep, no invented duration on failure.
 * Built-in win-/bv- voices stay client-side so Voice Studio isolation tests
 * keep passing without a provider.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setEspeakDetectedForTests, VoiceService } from "./voice.service.js";

const saved = {
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  PLAYHT_API_KEY: process.env.PLAYHT_API_KEY,
  PLAYHT_USER_ID: process.env.PLAYHT_USER_ID,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

function clearServerTtsEnv() {
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.PLAYHT_API_KEY;
  delete process.env.PLAYHT_USER_ID;
  delete process.env.OPENAI_API_KEY;
  setEspeakDetectedForTests(false);
}

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  setEspeakDetectedForTests(null);
  vi.unstubAllGlobals();
});

describe("VoiceService — fail closed", () => {
  beforeEach(() => clearServerTtsEnv());

  it("keeps built-in catalogue voices on the client (no file, no provider call)", async () => {
    const job = await VoiceService.synthesize({ voiceId: "bv-adult-female", text: "hello" });
    expect(job.clientSide).toBe(true);
    expect(job.status).toBe("ready");
    expect(job.audioUrl).toBeUndefined();
    expect(job.error).toBeUndefined();
  });

  it("does not write a beep when clientSide=false and no provider is configured", async () => {
    const job = await VoiceService.synthesize({
      voiceId: "en-us-female",
      text: "this must not become a 440Hz tone",
      clientSide: false,
    });
    expect(job.status).toBe("failed");
    expect(job.audioUrl).toBeUndefined();
    expect(job.durationMs).toBeUndefined();
    expect(job.error).toMatch(/VOICE_MODEL_NOT_CONFIGURED/);
  });

  it("lists openai only when OPENAI_API_KEY is set", () => {
    expect(VoiceService.configuredProviders().openai).toBe(false);
    expect(VoiceService.listVoices().some((v) => v.provider === "openai")).toBe(false);
    process.env.OPENAI_API_KEY = "sk-test-not-real";
    expect(VoiceService.configuredProviders().openai).toBe(true);
    expect(VoiceService.listVoices().some((v) => v.id === "openai-nova")).toBe(true);
  });

  it("reports espeak only after a successful binary probe", () => {
    setEspeakDetectedForTests(false);
    expect(VoiceService.configuredProviders().espeak).toBe(false);
    setEspeakDetectedForTests(true);
    expect(VoiceService.configuredProviders().espeak).toBe(true);
    expect(VoiceService.listVoices().some((v) => v.provider === "local-espeak")).toBe(true);
  });

  it("uses OpenAI /audio/speech when a key is present and clientSide is false", async () => {
    process.env.OPENAI_API_KEY = "sk-test-not-real";
    // Signature mirrors global fetch so the mocked `calls` tuple carries the
    // URL argument the assertions below read back.
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([0x49, 0x44, 0x33, 0x04]).buffer,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const job = await VoiceService.synthesize({
      voiceId: "openai-nova",
      text: "hello from openai",
      clientSide: false,
    });
    expect(job.status).toBe("ready");
    expect(job.provider).toBe("openai");
    expect(job.audioUrl).toMatch(/\/api\/v1\/voice-studio\/audio\/tts-/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toMatch(/\/audio\/speech$/);
  });

  it("does not invent a duration when the provider HTTP call fails", async () => {
    process.env.OPENAI_API_KEY = "sk-test-not-real";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const job = await VoiceService.synthesize({
      voiceId: "openai-alloy",
      text: "fail closed",
      clientSide: false,
    });
    expect(job.status).toBe("failed");
    expect(job.audioUrl).toBeUndefined();
    expect(job.durationMs).toBeUndefined();
    expect(job.error).toMatch(/OpenAI TTS HTTP 401/);
  });
});
