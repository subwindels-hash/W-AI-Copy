import { UxIntelligenceService as Ux } from "./uxIntelligence.service.js";
export async function bootstrapUxIntelligence(logger?: any) {
  if ((await Ux.dashboard()).components > 0) { logger?.info("[ux-intelligence] bootstrap skipped"); return; }
  await Ux.ensureBootstrapped();
  const d = await Ux.dashboard();
  logger?.info("[ux-intelligence] bootstrap complete", { components: d.components, tokens: d.tokens, agents: d.agentsOnline });
}
