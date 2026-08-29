/**
 * Session 90 — CRM bootstrap.
 *
 * A fresh organization starts empty; the CRM dashboard shows real activity
 * only. `WINDELS_DEMO_DATA=true` opts a demo/local environment into a
 * deterministic seed (idempotent — skips when the demo org already has
 * contacts).
 */
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { CrmService } from "./crm.service.js";

export async function bootstrapCrm(logger?: any) {
  if (!demoDataEnabled()) return skipDemoSeed("crm", logger);
  try {
    await CrmService.ensureDemoSeed(logger);
  } catch (e) {
    logger?.warn?.("[crm] demo seed failed", { err: e });
  }
}
