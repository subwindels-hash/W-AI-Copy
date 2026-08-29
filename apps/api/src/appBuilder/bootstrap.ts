/**
 * Session 96 — AI Software Factory bootstrap.
 *
 * Fresh organizations start empty; `WINDELS_DEMO_DATA=true` opts a
 * demo/local environment into a deterministic seed (idempotent — skips when
 * the demo org already has projects).
 */
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { AppBuilderService } from "./appBuilder.service.js";

export async function bootstrapAppBuilder(logger?: any) {
  if (!demoDataEnabled()) return skipDemoSeed("appBuilder", logger);
  try {
    await AppBuilderService.ensureDemoSeed(logger);
  } catch (e) {
    logger?.warn?.("[app-builder] demo seed failed", { err: e });
  }
}
