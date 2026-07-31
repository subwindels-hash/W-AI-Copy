import { SdkService } from "./sdk.service.js";

export async function bootstrapSdk({ logger, defaultOrgId: oid = "org-windels" }: any = {}) {
  try {
    await SdkService.ensureBootstrapped(logger, oid);
  } catch (e) {
    logger?.error?.("[sdk] bootstrap failed", { err: e instanceof Error ? e.message : e });
  }
}
