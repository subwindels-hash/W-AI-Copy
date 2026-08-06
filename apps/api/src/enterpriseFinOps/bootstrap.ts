// Session 100 — Enterprise FinOps depth bootstrap.
//
// Fresh organizations remain empty. Synthetic cost centers, budgets, costs
// and allocations are created only when WINDELS_DEMO_DATA=true and the demo
// org has not already been seeded.
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { EnterpriseFinOpsService } from "./enterpriseFinOps.service.js";

export async function bootstrapEnterpriseFinOps(logger?: { info?: (...args: any[]) => void; warn?: (...args: any[]) => void }) {
  if (!demoDataEnabled()) return skipDemoSeed("enterprise-finops", logger);
  try {
    await EnterpriseFinOpsService.ensureDemoSeed(logger);
  } catch (error) {
    logger?.warn?.("[enterprise-finops] demo seed failed", { err: error });
  }
}
