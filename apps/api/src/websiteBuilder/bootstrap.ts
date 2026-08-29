/**
 * Session 93 — Website Builder bootstrap.
 *
 * Fresh organizations start with no sites; `WINDELS_DEMO_DATA=true` opts a
 * demo/local environment into a deterministic seed (idempotent — skips when
 * the demo org already has sites).
 */
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { WebsiteBuilderService } from "./websiteBuilder.service.js";

export async function bootstrapWebsiteBuilder(logger?: any) {
  if (!demoDataEnabled()) return skipDemoSeed("websiteBuilder", logger);
  try {
    await WebsiteBuilderService.ensureDemoSeed(logger);
  } catch (e) {
    logger?.warn?.("[website-builder] demo seed failed", { err: e });
  }
}
