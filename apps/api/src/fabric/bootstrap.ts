import { FabricService } from "./fabric.service.js";

export async function bootstrapFabric({ logger, defaultOrgId: oid = "org-windels", defaultUserId: uid = "user-admin" }: any = {}) {
  try {
    await FabricService.ensureBootstrapped(logger, oid, uid);
  } catch (e) {
    logger?.error?.("[fabric] bootstrap failed", { err: e instanceof Error ? e.message : e });
  }
}
