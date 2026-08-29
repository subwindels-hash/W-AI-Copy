/**
 * Session 94 — Social Platform bootstrap.
 *
 * Fresh organizations start with an empty feed; `WINDELS_DEMO_DATA=true`
 * opts a demo/local environment into a deterministic seed (idempotent —
 * skips when the demo org already has posts).
 */
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { SocialPlatformService } from "./socialPlatform.service.js";

export async function bootstrapSocialPlatform(logger?: any) {
  if (!demoDataEnabled()) return skipDemoSeed("socialPlatform", logger);
  try {
    await SocialPlatformService.ensureDemoSeed(logger);
  } catch (e) {
    logger?.warn?.("[social-platform] demo seed failed", { err: e });
  }
}
