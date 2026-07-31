import { ExpertsPlatformService as Ep } from "./expertsPlatform.service.js";
export async function bootstrapExpertsPlatform(logger?: any) {
  if ((await Ep.dashboard()).experts > 0) { logger?.info("[experts] bootstrap skipped"); return; }
  await Ep.ensureBootstrapped();
  const d = await Ep.dashboard();
  logger?.info("[experts] bootstrap complete", { experts: d.experts, courses: d.courses, packages: d.packages });
}
