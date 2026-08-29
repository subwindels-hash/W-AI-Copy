/**
 * Synthetic seed-data gate.
 *
 * Session bootstraps historically seeded randomly generated demo records so
 * that dashboards looked populated on a fresh install — fake service latencies,
 * fake security findings, fake ESG numbers, fake benchmark scores. Rendered in
 * the UI, none of it is distinguishable from a real measurement.
 *
 * Seeding is therefore opt-in. `WINDELS_DEMO_DATA=true` restores the old
 * behaviour for demos and local UI work; by default a fresh organization starts
 * empty and fills from real activity.
 *
 * Usage in a bootstrap:
 *
 *   import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
 *   export async function bootstrapThing(logger?: Logger) {
 *     if (!demoDataEnabled()) return skipDemoSeed("thing", logger);
 *     // …seed synthetic records…
 *   }
 */
import { env } from "./env.js";
import type { Logger } from "pino";

/** True when synthetic demo seeding has been explicitly enabled. */
export function demoDataEnabled(): boolean {
  return env.WINDELS_DEMO_DATA === true;
}

/**
 * Log, once, that a module skipped synthetic seeding. Returns undefined so a
 * bootstrap can `return skipDemoSeed(...)` in a single line.
 */
export function skipDemoSeed(moduleName: string, logger?: Logger | { info?: (...a: any[]) => void }): void {
  const msg =
    `[${moduleName}] synthetic seed skipped — set WINDELS_DEMO_DATA=true to populate demo records`;
  if (logger && typeof (logger as any).info === "function") (logger as any).info(msg);
}
