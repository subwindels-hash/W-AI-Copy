import { DataMarketplaceService } from "./dataMarketplace.service.js";

export async function bootstrapDataMarketplace({ logger, defaultOrgId: oid = "org-windels", defaultUserId: uid = "user-admin" }: any = {}) {
  try {
    await DataMarketplaceService.ensureBootstrapped(logger, oid, uid);
  } catch (e) {
    logger?.error?.("[data-mp] bootstrap failed", { err: e instanceof Error ? e.message : e });
  }
}
