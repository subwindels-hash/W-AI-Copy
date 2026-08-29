import { SpatialService } from "./spatial.service.js";

export async function bootstrapSpatial({ logger, defaultOrgId: oid = "org-windels", defaultUserId: uid = "user-admin" }: any = {}) {
  try {
    await SpatialService.ensureBootstrapped(logger, oid, uid);
  } catch (e) {
    logger?.error?.("[spatial] bootstrap failed", { err: e instanceof Error ? e.message : e });
  }
}
