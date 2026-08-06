/**
 * Session 97 — Business Intelligence bootstrap.
 *
 * Fresh organizations start with no BI config; `WINDELS_DEMO_DATA=true` opts
 * a demo/local environment into a deterministic seed (idempotent — skips
 * when the demo org already has sources). The demo defines sources/KPIs/
 * reports but NEVER fabricates module data — KPI values evaluate against
 * whatever the module stores actually contain.
 */
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { BusinessIntelligenceService } from "./businessIntelligence.service.js";

export async function bootstrapBusinessIntelligence(logger?: any) {
  if (!demoDataEnabled()) return skipDemoSeed("businessIntelligence", logger);
  try {
    await BusinessIntelligenceService.ensureDemoSeed(logger);
  } catch (e) {
    logger?.warn?.("[bi] demo seed failed", { err: e });
  }
}
