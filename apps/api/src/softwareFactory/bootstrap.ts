/**
 * Session 99 — Software Factory Studios & Build Farm bootstrap.
 *
 * Fresh organizations start with no studio plans; `WINDELS_DEMO_DATA=true`
 * opts a demo/local environment into a deterministic seed (idempotent —
 * skips when the demo org already has plans). Compile targets are always a
 * pure projection of real runs — never seeded as facts.
 */
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { SoftwareFactoryService } from "./softwareFactory.service.js";

export async function bootstrapSoftwareFactory(logger?: any) {
  if (!demoDataEnabled()) return skipDemoSeed("softwareFactory", logger);
  try {
    await SoftwareFactoryService.ensureDemoSeed(logger);
  } catch (e) {
    logger?.warn?.("[software-factory] demo seed failed", { err: e });
  }
}
