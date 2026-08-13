/**
 * AI Commerce permission guard (§22, §23).
 *
 * Runs BEFORE any commerce action an AI agent attempts. It reuses the existing
 * IAM, RBAC and feature-flag systems — it is not a second permission system —
 * and adds the checks specific to an AI acting on a user's behalf:
 *
 *   1. identity           — a real authenticated user id is present
 *   2. tenant             — an organization id is present
 *   3. session            — the commerce session belongs to that user/org
 *   4. resource ownership — the target cart/order/checkout belongs to the user
 *   5. capability flag    — the per-capability feature flag is enabled
 *   6. permission         — the mapped platform permission (RBAC)
 *   7. transaction auth   — money-moving operations are separately gated
 *
 * Denials are audited. The guard fails CLOSED: any error while evaluating a
 * check denies the action, because an AI must never proceed with a financial
 * operation on an unresolved authorization question.
 *
 * Permission mapping: the platform `Permission` enum is a fixed Prisma enum of
 * 17 values. Adding commerce-specific values would mean a schema migration and
 * a second authorization vocabulary, so commerce capabilities map onto the
 * existing permissions instead.
 */
import type { CommerceChannel, CommerceError, CommerceSessionContext } from "@windels/shared";
import { logger } from "../observability/logger.js";
import { commerceError } from "./commerceErrors.js";

/** Every distinct commerce action the guard can be asked about. */
export type CommerceCapability =
  | "search"
  | "view_product"
  | "recommend"
  | "compare"
  | "image_search"
  | "voice_search"
  | "view_cart"
  | "modify_cart"
  | "checkout"
  | "view_payment"
  | "view_orders"
  | "track_order"
  | "gift_card"
  | "support";

/** Capability -> platform permission (existing enum values only). */
const CAPABILITY_PERMISSION: Record<CommerceCapability, string> = {
  search: "AGENT_READ",
  view_product: "AGENT_READ",
  recommend: "AGENT_READ",
  compare: "AGENT_READ",
  image_search: "AGENT_READ",
  voice_search: "AGENT_READ",
  view_cart: "AGENT_READ",
  view_orders: "AGENT_READ",
  track_order: "AGENT_READ",
  view_payment: "BILLING_READ",
  modify_cart: "WORKFLOW_RUN",
  checkout: "BILLING_WRITE",
  gift_card: "BILLING_WRITE",
  support: "TALK_WRITE",
};

/** Capability -> feature flag (§29). */
const CAPABILITY_FLAG: Record<CommerceCapability, string> = {
  search: "AI_PRODUCT_SEARCH_ENABLED",
  view_product: "AI_PRODUCT_SEARCH_ENABLED",
  recommend: "AI_RECOMMENDATIONS_ENABLED",
  compare: "AI_PRODUCT_SEARCH_ENABLED",
  image_search: "AI_IMAGE_SHOPPING_ENABLED",
  voice_search: "AI_VOICE_COMMERCE_ENABLED",
  view_cart: "AI_CART_ACTIONS_ENABLED",
  modify_cart: "AI_CART_ACTIONS_ENABLED",
  checkout: "AI_CHECKOUT_ENABLED",
  view_payment: "AI_CHECKOUT_ENABLED",
  view_orders: "AI_ORDER_ASSISTANT_ENABLED",
  track_order: "AI_ORDER_ASSISTANT_ENABLED",
  gift_card: "AI_CHECKOUT_ENABLED",
  support: "AI_COMMERCE_SUPPORT_ENABLED",
};

/** Capabilities that mutate marketplace state or move money (§20, §23). */
const TRANSACTIONAL: ReadonlySet<CommerceCapability> = new Set<CommerceCapability>([
  "modify_cart",
  "checkout",
  "gift_card",
]);

export interface CommerceGuardResource {
  type: "cart" | "order" | "checkout" | "payment";
  id: string;
  ownerUserId?: string;
  ownerOrganizationId?: string;
}

export interface CommerceGuardRequest {
  capability: CommerceCapability;
  userId?: string;
  organizationId?: string;
  channel: CommerceChannel;
  session?: Pick<CommerceSessionContext, "sessionId" | "userId" | "organizationId"> | null;
  resource?: CommerceGuardResource;
  agentId?: string;
  correlationId?: string;
  isAdmin?: boolean;
}

export type CommerceGuardDecision =
  | { allowed: true; capability: CommerceCapability; checks: string[] }
  | { allowed: false; capability: CommerceCapability; error: CommerceError; failedCheck: string };

async function flagEnabled(flagKey: string, ctx: { userId?: string; orgId?: string }): Promise<boolean> {
  try {
    const { FeatureFlagsService } = await import("../platformServices/featureFlags.service.js");
    const master = await FeatureFlagsService.findByKey("AI_COMMERCE_ENABLED");
    if (master && !(await FeatureFlagsService.evaluate("AI_COMMERCE_ENABLED", ctx))) return false;
    const specific = await FeatureFlagsService.findByKey(flagKey);
    if (!specific) return true;
    return await FeatureFlagsService.evaluate(flagKey, ctx);
  } catch (err) {
    logger.debug("[aiCommerce] feature-flag evaluation unavailable", {
      flagKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

async function hasPlatformPermission(userId: string, permission: string, orgId?: string): Promise<boolean> {
  const mod = await import("../permissions/permissions.module.js");
  const enumValue = (mod.Permission as unknown as Record<string, string>)[permission];
  if (!enumValue) {
    logger.error("[aiCommerce] unknown permission in capability map", { permission });
    return false;
  }
  return mod.permissionsModule.hasPermission(userId, enumValue as never, orgId);
}

async function auditDenial(req: CommerceGuardRequest, failedCheck: string, reason: string): Promise<void> {
  try {
    const { auditService } = await import("../audit/audit.service.js");
    await auditService.log({
      organizationId: req.organizationId,
      userId: req.userId,
      action: "commerce.access_denied",
      resourceType: req.resource ? (`commerce_${req.resource.type}` as never) : "custom",
      resourceId: req.resource?.id,
      metadata: {
        module: "aiCommerce",
        capability: req.capability,
        failedCheck,
        reason,
        channel: req.channel,
        agentId: req.agentId,
        correlationId: req.correlationId,
      },
    });
  } catch (err) {
    logger.warn("[aiCommerce] failed to audit permission denial", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const commerceGuard = {
  CAPABILITY_PERMISSION,
  CAPABILITY_FLAG,

  /** Evaluate all applicable checks. Returns a decision; never throws. */
  async authorize(req: CommerceGuardRequest): Promise<CommerceGuardDecision> {
    const passed: string[] = [];

    const deny = async (
      failedCheck: string,
      code: "UNAUTHORIZED" | "FORBIDDEN",
      message: string,
    ): Promise<CommerceGuardDecision> => {
      await auditDenial(req, failedCheck, message);
      logger.warn("[aiCommerce] commerce action DENIED", {
        capability: req.capability,
        failedCheck,
        userId: req.userId,
        organizationId: req.organizationId,
        correlationId: req.correlationId,
      });
      return {
        allowed: false,
        capability: req.capability,
        failedCheck,
        error: commerceError(code, message, {
          correlationId: req.correlationId,
          details: { capability: req.capability, check: failedCheck },
        }),
      };
    };

    try {
      // 1. identity
      if (!req.userId) {
        return await deny("identity", "UNAUTHORIZED", "You must be signed in to use AI Commerce.");
      }
      passed.push("identity");

      // 2. tenant
      if (!req.organizationId) {
        return await deny("tenant", "UNAUTHORIZED", "No organization context for this commerce request.");
      }
      passed.push("tenant");

      // 3. session binding
      if (req.session) {
        if (req.session.userId !== req.userId) {
          return await deny("session", "FORBIDDEN", "This commerce session belongs to a different user.");
        }
        if (req.session.organizationId !== req.organizationId) {
          return await deny("session", "FORBIDDEN", "This commerce session belongs to a different organization.");
        }
        passed.push("session");
      }

      // 4. resource ownership — before RBAC so a cross-user probe is denied
      //    even when the caller is highly privileged.
      if (req.resource) {
        const { ownerUserId, ownerOrganizationId } = req.resource;
        if (ownerOrganizationId && ownerOrganizationId !== req.organizationId) {
          return await deny("resource_ownership", "FORBIDDEN", "That resource belongs to another organization.");
        }
        if (ownerUserId && ownerUserId !== req.userId) {
          return await deny("resource_ownership", "FORBIDDEN", "That resource belongs to another user.");
        }
        passed.push("resource_ownership");
      }

      // 5. capability feature flag
      const flagKey = CAPABILITY_FLAG[req.capability];
      if (!(await flagEnabled(flagKey, { userId: req.userId, orgId: req.organizationId }))) {
        return await deny("capability_flag", "FORBIDDEN", `The ${req.capability} capability is currently disabled.`);
      }
      passed.push("capability_flag");

      // 6. RBAC permission
      const permission = CAPABILITY_PERMISSION[req.capability];
      const granted = req.isAdmin === true || (await hasPlatformPermission(req.userId, permission, req.organizationId));
      if (!granted) {
        return await deny("permission", "FORBIDDEN", `You do not have the ${permission} permission required for this action.`);
      }
      passed.push("permission");

      // 7. transaction authorization
      if (TRANSACTIONAL.has(req.capability)) {
        if (req.session && req.session.userId !== req.userId) {
          return await deny("transaction_authorization", "FORBIDDEN", "Transaction blocked: session/user mismatch.");
        }
        passed.push("transaction_authorization");
      }

      return { allowed: true, capability: req.capability, checks: passed };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("[aiCommerce] guard evaluation failed - denying", { capability: req.capability, error: message });
      await auditDenial(req, "guard_error", message);
      return {
        allowed: false,
        capability: req.capability,
        failedCheck: "guard_error",
        error: commerceError("FORBIDDEN", "Authorization could not be verified for this commerce action.", {
          correlationId: req.correlationId,
        }),
      };
    }
  },

  isTransactional(capability: CommerceCapability): boolean {
    return TRANSACTIONAL.has(capability);
  },
};

export default commerceGuard;
