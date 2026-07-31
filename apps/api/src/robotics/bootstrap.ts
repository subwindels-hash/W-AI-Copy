import { RoboticsService } from "./robotics.service.js";

export async function bootstrapRobotics({ logger, defaultOrgId: oid = "org-windels" }: any = {}) {
  try {
    await RoboticsService.ensureBootstrapped(logger, oid);
  } catch (e) {
    logger?.error?.("[robotics] bootstrap failed", { err: e instanceof Error ? e.message : e });
  }
}
