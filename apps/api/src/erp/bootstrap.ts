/**
 * Session 92 — ERP bootstrap.
 *
 * Fresh organizations start with an empty catalog; `WINDELS_DEMO_DATA=true`
 * opts a demo/local environment into a deterministic seed (idempotent —
 * skips when the demo org already has products).
 */
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { ErpService } from "./erp.service.js";

export async function bootstrapErp(logger?: any) {
  if (!demoDataEnabled()) return skipDemoSeed("erp", logger);
  try {
    await ErpService.ensureDemoSeed(logger);
  } catch (e) {
    logger?.warn?.("[erp] demo seed failed", { err: e });
  }
}
