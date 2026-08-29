import { VoiceOwnershipService as Vo } from "./voiceOwnership.service.js";
export async function bootstrapVoiceOwnership(logger?: any) {
  if ((await Vo.dashboard()).voicesTracked > 0) { logger?.info("[voice-ownership] bootstrap skipped"); return; }
  await Vo.ensureBootstrapped(logger);
  logger?.info("[voice-ownership] bootstrap complete");
}
