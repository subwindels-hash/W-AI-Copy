import { HybridExecService as Hx } from "./hybridExec.service.js";
export async function bootstrapHybridExec(logger?: any) {
  if ((await Hx.dashboard()).modelsRegistered > 0) { logger?.info("[hybrid-exec] bootstrap skipped"); return; }
  await Hx.ensureBootstrapped(logger);
  logger?.info("[hybrid-exec] bootstrap complete", { models: 6, nodes: 4, modes: 3 });
}
