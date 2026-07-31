import { V76ValidationService as V76 } from "./v76validation.service.js";
export async function bootstrapV76Validation(logger?: any) {
  // Session 76 is on-demand; we pre-compute a cold report and log summary.
  try {
    const report = await V76.runReport();
    logger?.info("[v76-validation] initial report", { wired: report.wired, stubs: report.stubs, missing: report.missing, duplicates: report.duplicatesDetected, consentGate: report.consentGateEnforced });
  } catch (e: any) {
    logger?.warn("[v76-validation] bootstrap report failed", { err: e?.message });
  }
}
