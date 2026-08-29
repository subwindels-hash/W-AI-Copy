/**
 * Sports Intelligence bootstrap.
 *
 * A fresh organization starts empty. SANDBOX fixtures are ingested only when
 * the operating mode is SANDBOX (explicit config or WINDELS_DEMO_DATA=true).
 * They are always labelled SANDBOX and never mixed into production stats.
 */

import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { SportsIntelligenceService } from "./sportsIntelligence.service.js";

export async function bootstrapSportsIntelligence(logger?: { info?: Function; warn?: Function }) {
  if (!demoDataEnabled()) return skipDemoSeed("sports-intelligence", logger as any);
  try {
    const org = "org-demo-sports";
    const cfg = await SportsIntelligenceService.getConfig(org);
    if (cfg.mode !== "SANDBOX") {
      await SportsIntelligenceService.updateConfig(org, { mode: "SANDBOX", reason: "demo bootstrap" }, "system");
    }
    await SportsIntelligenceService.runPipeline(org, "system");
    logger?.info?.("[sports-intelligence] sandbox pipeline seeded for org-demo-sports");
  } catch (e) {
    logger?.warn?.("[sports-intelligence] bootstrap failed", { err: e });
  }
}
