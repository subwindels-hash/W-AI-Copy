/**
 * AI Commerce feature flags (§29) and their admin provisioning (§30).
 *
 * These flags live in the EXISTING FeatureFlagsService, so the existing admin
 * dashboard, override machinery and kill-switch semantics apply unchanged. No
 * second flag system is introduced.
 *
 * Default posture: every commerce flag is provisioned DISABLED. Commerce only
 * becomes reachable when an administrator turns the master flag and the
 * relevant capability flag on.
 */
import type { FeatureFlag } from "@windels/shared";
import { logger } from "../observability/logger.js";

export const AI_COMMERCE_FLAG_KEYS = [
  "AI_COMMERCE_ENABLED",
  "AI_PRODUCT_SEARCH_ENABLED",
  "AI_RECOMMENDATIONS_ENABLED",
  "AI_IMAGE_SHOPPING_ENABLED",
  "AI_VOICE_COMMERCE_ENABLED",
  "AI_CART_ACTIONS_ENABLED",
  "AI_CHECKOUT_ENABLED",
  "AI_ORDER_ASSISTANT_ENABLED",
  "AI_COMMERCE_SUPPORT_ENABLED",
] as const;
export type AiCommerceFlagKey = (typeof AI_COMMERCE_FLAG_KEYS)[number];

interface FlagSeed {
  key: AiCommerceFlagKey;
  name: string;
  description: string;
}

export const AI_COMMERCE_FLAG_SEEDS: FlagSeed[] = [
  {
    key: "AI_COMMERCE_ENABLED",
    name: "AI Commerce (master)",
    description:
      "Master kill-switch for all AI Commerce capabilities. When off, every commerce tool is denied regardless of the capability flags.",
  },
  {
    key: "AI_PRODUCT_SEARCH_ENABLED",
    name: "AI Product Search",
    description: "Natural-language product search and product detail lookup against the WMPC marketplace.",
  },
  {
    key: "AI_RECOMMENDATIONS_ENABLED",
    name: "AI Recommendations",
    description: "Recommendations derived from WMPC catalogue results. Never invents products.",
  },
  {
    key: "AI_IMAGE_SHOPPING_ENABLED",
    name: "AI Image Shopping",
    description: "Shop-by-photo using the existing vision pipeline; matches are labelled by confidence tier.",
  },
  {
    key: "AI_VOICE_COMMERCE_ENABLED",
    name: "AI Voice Commerce",
    description: "Voice-driven shopping through the existing Voice Command Center, wake word, STT and TTS.",
  },
  {
    key: "AI_CART_ACTIONS_ENABLED",
    name: "AI Cart Actions",
    description: "Allows the assistant to add, update, remove and clear items in the WMPC cart on the user's behalf.",
  },
  {
    key: "AI_CHECKOUT_ENABLED",
    name: "AI Checkout",
    description: "Allows the assistant to create and read WMPC checkout sessions. WMPC remains authoritative for all totals.",
  },
  {
    key: "AI_ORDER_ASSISTANT_ENABLED",
    name: "AI Order Assistant",
    description: "Order history, order detail and shipment tracking read from WMPC.",
  },
  {
    key: "AI_COMMERCE_SUPPORT_ENABLED",
    name: "AI Commerce Support",
    description: "Commerce-related customer support handled through the existing helpdesk.",
  },
];

/**
 * Create any missing AI Commerce flags, disabled, as a kill-switch strategy.
 * Existing flags are left exactly as the administrator configured them.
 */
export async function provisionCommerceFlags(owner = "system"): Promise<{
  created: string[];
  existing: string[];
  skipped: boolean;
}> {
  try {
    const { FeatureFlagsService } = await import("../platformServices/featureFlags.service.js");
    const created: string[] = [];
    const existing: string[] = [];

    for (const seed of AI_COMMERCE_FLAG_SEEDS) {
      const found = await FeatureFlagsService.findByKey(seed.key);
      if (found) {
        existing.push(seed.key);
        continue;
      }
      const flag: Omit<FeatureFlag, "id" | "createdAt" | "updatedAt" | "version"> = {
        key: seed.key,
        name: seed.name,
        description: seed.description,
        status: "paused",
        enabled: false,
        rolloutPct: 0,
        strategy: "kill-switch",
        overrides: [],
        segments: [],
        tags: ["ai-commerce", "wmpc"],
        owner,
      };
      await FeatureFlagsService.create(flag);
      created.push(seed.key);
    }

    if (created.length) {
      logger.info("[aiCommerce] provisioned feature flags (disabled by default)", { created });
    }
    return { created, existing, skipped: false };
  } catch (err) {
    // Redis-backed flag store unavailable (e.g. during tests). The guard
    // treats an absent flag as "not explicitly disabled", so commerce still
    // depends on permissions; we simply record that provisioning was skipped.
    logger.debug("[aiCommerce] feature-flag provisioning skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { created: [], existing: [], skipped: true };
  }
}
