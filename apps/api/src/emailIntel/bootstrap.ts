/**
 * Session 91 — Email Intelligence bootstrap.
 *
 * Fresh organizations start with an empty inbox; `WINDELS_DEMO_DATA=true`
 * opts a demo/local environment into a deterministic seed (idempotent —
 * skips when the demo org already has mailboxes).
 */
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { EmailIntelService } from "./emailIntel.service.js";

export async function bootstrapEmailIntel(logger?: any) {
  if (!demoDataEnabled()) return skipDemoSeed("emailIntel", logger);
  try {
    await EmailIntelService.ensureDemoSeed(logger);
  } catch (e) {
    logger?.warn?.("[email-intel] demo seed failed", { err: e });
  }
}
