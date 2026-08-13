/**
 * AI Commerce bootstrap.
 *
 * Wires the commerce capability into the systems that already exist:
 *   - registers the 17 tools into the shared ToolRegistry
 *   - subscribes the WMPC event handlers to the shared EventBus
 *   - provisions the 9 feature flags (DISABLED) into the existing flag store
 *   - announces the capability to the God-Node kernel
 *
 * Every step is non-fatal: a commerce bootstrap failure must never stop the
 * API from serving the rest of the platform.
 */
import { logger } from "../observability/logger.js";
import { getWmpcConnectorInfo } from "./wmpc/connectorFactory.js";
import { provisionCommerceFlags } from "./commerceFlags.js";
import { registerWmpcEventHandlers } from "./events/wmpcEventHandlers.js";
import { registerCommerceWithKernel } from "./commerceAgent.service.js";
import { registerCommerceTools, COMMERCE_TOOL_NAMES } from "./tools/commerceTools.js";

let booted = false;

export async function bootstrapAiCommerce(): Promise<void> {
  if (booted) return;
  booted = true;

  try {
    registerCommerceTools();
    registerWmpcEventHandlers();

    const info = getWmpcConnectorInfo();
    if (info.warning) logger.warn(`[aiCommerce] ${info.warning}`);

    const flags = await provisionCommerceFlags();
    await registerCommerceWithKernel();

    logger.info("[aiCommerce] bootstrap complete", {
      connector: info.mode,
      productionData: info.isProductionData,
      tools: COMMERCE_TOOL_NAMES.length,
      flagsCreated: flags.created.length,
      flagsExisting: flags.existing.length,
    });
  } catch (err) {
    logger.warn("[aiCommerce] bootstrap failed (commerce disabled, platform unaffected)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function __resetAiCommerceBootstrap(): void {
  booted = false;
}
