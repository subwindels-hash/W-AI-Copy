/**
 * Session 98 — Enterprise Search bootstrap.
 *
 * Fresh organizations start with no history; `WINDELS_DEMO_DATA=true` opts a
 * demo/local environment into a deterministic seed (idempotent). The search
 * index itself is always computed from the live module stores.
 */
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { EnterpriseSearchService } from "./enterpriseSearch.service.js";

export async function bootstrapEnterpriseSearch(logger?: any) {
  if (!demoDataEnabled()) return skipDemoSeed("enterpriseSearch", logger);
  try {
    await EnterpriseSearchService.ensureDemoSeed(logger);
  } catch (e) {
    logger?.warn?.("[enterprise-search] demo seed failed", { err: e });
  }
}
