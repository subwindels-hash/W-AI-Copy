/**
 * Voice Studio bootstrap (Session 40) — 13000ms slot.
 * Session 162 — completion.
 *
 * Two changes:
 *   1. The legacy migration runs here, never from a read path (the S156 rule).
 *   2. The demo voice, presets and warm TTS job are gated behind
 *      WINDELS_DEMO_DATA. They used to be created unconditionally, so every
 *      deployment started with a cloned voice nobody had consented to and a
 *      synthesis job nobody requested — which also seeded the latency sample
 *      that made `avgSynthLatencyMs` look measured.
 */
import { VoiceStudioService as Vs } from "./voiceStudio.service.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";

export async function bootstrapVoiceStudio(logger?: any, oid = "org-windels"): Promise<void> {
  // Always safe: adopts any pre-S162 global records into the org namespace.
  await Vs.ensureBootstrapped(logger, oid);

  if (!demoDataEnabled()) return skipDemoSeed("voice-studio", logger);

  if ((await Vs.listCustom(oid)).length > 0) {
    logger?.info?.("[voice-studio] demo seed skipped — org already has custom voices");
    return;
  }

  const cv = await Vs.cloneVoice({
    organizationId: oid,
    ownerId: "admin", name: "My WINDELS Voice",
    gender: "feminine", age: "adult", language: "en", method: "fast-clone",
    consentGranted: true, consentRecordedBy: "admin",
  });
  await Vs.createPreset(oid, { voiceId: cv.id, name: "Briefing Warm", settings: { warmth: 0.9, energy: 0.7, speed: 0.95, emotion: "calm" }, description: "Warm executive briefing tone" });
  await Vs.createPreset(oid, { voiceId: cv.id, name: "Energetic Update", settings: { energy: 0.95, speed: 1.1, emotion: "excited", pauseMs: 150 }, description: "Standup-style energetic delivery" });

  logger?.info?.("[voice-studio] demo seed complete", {
    builtin: (await Vs.listBuiltIn()).length,
    custom: (await Vs.listCustom(oid)).length,
    note: "no synthesis performed — latency stays unmeasured until a real job runs",
  });
}
