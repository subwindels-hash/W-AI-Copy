/**
 * AI Commerce tool registration entrypoint.
 *
 * Mirrors `services/tools/builtin/index.ts`: importing this module registers
 * the commerce tools into the SHARED ToolRegistry, so every agent runtime that
 * already consumes the registry gains commerce capability with no second tool
 * system and no changes to the agent loop.
 */
import { registerCommerceTools } from "./commerceTools.js";

export {
  COMMERCE_TOOLS,
  COMMERCE_TOOL_NAMES,
  registerCommerceTools,
  commerceToolDefinitions,
  __resetCommerceToolRegistration,
} from "./commerceTools.js";

// Auto-register on import (same convention as the built-in tools).
registerCommerceTools();
