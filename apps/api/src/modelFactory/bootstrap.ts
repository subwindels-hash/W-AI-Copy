import { ModelFactoryService as Mf2 } from "./modelFactory.service.js";
export async function bootstrapModelFactory(logger?: any) {
  if ((await Mf2.dashboard()).totalModels > 0) { logger?.info("[model-factory] bootstrap skipped"); return; }
  await Mf2.ensureBootstrapped(logger);
  logger?.info("[model-factory] bootstrap complete", { models: 5 });
}
