import { MediaFactoryService as Mf } from "./mediaFactory.service.js";
export async function bootstrapMediaFactory(logger?: any) {
  if ((await Mf.dashboard()).characters > 0) { logger?.info("[media-factory] bootstrap skipped"); return; }
  await Mf.ensureBootstrapped();
  const d = await Mf.dashboard();
  logger?.info("[media-factory] bootstrap complete", { characters: d.characters, courses: d.courses, channels: d.channelsActive });
}
