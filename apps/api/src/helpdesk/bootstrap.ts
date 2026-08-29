/**
 * Session 95 — Helpdesk bootstrap.
 *
 * Fresh organizations start with an empty queue; `WINDELS_DEMO_DATA=true`
 * opts a demo/local environment into a deterministic seed (idempotent —
 * skips when the demo org already has tickets).
 */
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { HelpdeskService } from "./helpdesk.service.js";

export async function bootstrapHelpdesk(logger?: any) {
  if (!demoDataEnabled()) return skipDemoSeed("helpdesk", logger);
  try {
    await HelpdeskService.ensureDemoSeed(logger);
  } catch (e) {
    logger?.warn?.("[helpdesk] demo seed failed", { err: e });
  }
}
