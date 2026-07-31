import { DigitalHumanService } from "./digitalHumans.service.js";

export async function bootstrapDigitalHumans({ logger, defaultOrgId: oid = "org-windels", defaultUserId: uid = "user-admin" }: any = {}) {
  try {
    await DigitalHumanService.ensureBootstrapped(logger, oid, uid);
  } catch (e) {
    logger?.error?.("[digital-humans] bootstrap failed", { err: e instanceof Error ? e.message : e });
  }
}
