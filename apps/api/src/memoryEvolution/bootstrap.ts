import { MemoryEvolutionService as Me } from "./memoryEvolution.service.js";
export async function bootstrapMemoryEvolution(logger?: any) {
  if ((await Me.dashboard()).total > 0) { logger?.info("[memory-evolution] bootstrap skipped"); return; }
  await Me.ensureBootstrapped(logger);
  logger?.info("[memory-evolution] bootstrap complete", { memories: 9 });
}
