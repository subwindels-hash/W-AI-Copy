import { VoiceFoundryService as Vf } from "./voiceFoundry.service.js";
export async function bootstrapVoiceFoundry(logger?: any) {
  if ((await Vf.dashboard()).generatedVoices > 0) { logger?.info("[voice-foundry] bootstrap skipped"); return; }
  await Vf.ensureBootstrapped(logger);
  logger?.info("[voice-foundry] bootstrap complete", { voices: 13, categories: 13, languages: 16 });
}
