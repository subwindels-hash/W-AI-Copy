import { TrainingService } from "./training.service.js";

export async function bootstrapTraining({ logger, defaultOrgId: oid = "org-windels", defaultUserId: uid = "user-admin" }: any = {}) {
  try {
    await TrainingService.ensureBootstrapped(logger, oid, uid);
  } catch (e) {
    logger?.error?.("[training] bootstrap failed", { err: e instanceof Error ? e.message : e });
  }
}
