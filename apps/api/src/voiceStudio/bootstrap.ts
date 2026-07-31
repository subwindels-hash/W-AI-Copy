/**
 * Voice Studio bootstrap (Session 40) — 13000ms slot.
 */
import { VoiceStudioService as Vs } from "./voiceStudio.service.js";
import { redisCmd as redis } from "../db/redis.js";

export async function bootstrapVoiceStudio(logger?: any): Promise<void> {
  if (await redis.zcard("vs:builtin") > 0) { logger?.info("[voice-studio] bootstrap skipped"); return; }
  await Vs.ensureBootstrapped();
  // Create one demo custom voice (pre-consented, admin-owned)
  const cv = await Vs.cloneVoice({
    ownerId: "admin", name: "My WINDELS Voice",
    gender: "feminine", age: "adult", language: "en", method: "fast-clone",
    consentGranted: true, consentRecordedBy: "admin",
  });
  await Vs.createPreset({ voiceId: cv.id, name: "Briefing Warm", settings: { warmth:0.9, energy:0.7, speed:0.95, emotion:"calm" }, description: "Warm executive briefing tone" });
  await Vs.createPreset({ voiceId: cv.id, name: "Energetic Update", settings: { energy:0.95, speed:1.1, emotion:"excited", pauseMs:150 }, description: "Standup-style energetic delivery" });
  // Warm TTS jobs
  await Vs.synthesize({ voiceId: (await Vs.listBuiltIn())[0].id, text: "Welcome to WINDELS Voice Studio." });
  logger?.info("[voice-studio] bootstrap complete", { builtin: (await Vs.listBuiltIn()).length, custom: (await Vs.listCustom()).length });
}
