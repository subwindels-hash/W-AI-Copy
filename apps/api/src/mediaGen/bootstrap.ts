import { MediaGenService as Mg } from "./mediaGen.service.js";
export async function bootstrapMediaGen(logger?: any) {
  if ((await Mg.dashboard("org-windels")).capabilities > 0) { logger?.info("[media-gen] bootstrap skipped"); return; }
  await Mg.ensureBootstrapped(logger);
  logger?.info("[media-gen] bootstrap complete", { capabilities: 24 });
}
