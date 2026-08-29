import { UsageService } from "./usage.service.js";

export async function bootstrapUsage({ logger, defaultOrgId: oid = "org-windels" }: any = {}) {
  try {
    await UsageService.ensureBootstrapped(logger, oid);
  } catch (e) {
    logger?.error?.("[usage] bootstrap failed", { err: e instanceof Error ? e.message : e });
  }
}
