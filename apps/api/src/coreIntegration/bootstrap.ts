import { CoreIntegrationService as Cei } from "./coreIntegration.service.js";
export async function bootstrapCoreIntegration(logger?: any) {
  try {
    const r = await Cei.checkpoint();
    logger?.info("[core-integration] checkpoint complete", { wired: r.wired, stubs: r.stubs, missing: r.missing, blockers: r.blockers.length, proceed: r.canProceedToSession46 });
  } catch (e: any) { logger?.warn("[core-integration] checkpoint failed", { err: e.message }); }
}
