/**
 * Session 54 — Enterprise Update & Lifecycle Management bootstrap.
 */
import { UpdateService } from "./updates.service.js";

export async function bootstrapUpdates({ logger, defaultOrgId: oid = "org-windels", defaultUserId: uid = "user-admin" }: any = {}) {
  try {
    await UpdateService.ensureBootstrapped(logger, oid, uid);
  } catch (e) {
    logger?.error?.("[updates] bootstrap failed", { err: e instanceof Error ? e.message : e });
  }
}
