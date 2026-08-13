/**
 * AI Commerce HTTP surface.
 *
 * Every route delegates to the SAME tools the agent uses, so the HTTP path and
 * the agent path cannot diverge in behaviour or in authorization. Nothing here
 * talks to a database table of products, carts or orders — WMPC is
 * authoritative and is reached only through the connector.
 *
 * Mounted at /api/ai-commerce.
 */
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { aiCommerceRoutesSchema } from "@windels/shared";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { logger } from "../../observability/logger.js";
import { COMMERCE_TOOLS, commerceToolDefinitions } from "../../aiCommerce/tools/commerceTools.js";
import { commerceIntentService } from "../../aiCommerce/commerceIntent.service.js";
import { commerceSessionService } from "../../aiCommerce/commerceSession.service.js";
import { wmpcEventConsumer, type WmpcEventOutcome } from "../../aiCommerce/events/wmpcEventConsumer.service.js";
import { getWmpcConnectorInfo } from "../../aiCommerce/wmpc/connectorFactory.js";
import { AI_COMMERCE_FLAG_SEEDS, provisionCommerceFlags } from "../../aiCommerce/commerceFlags.js";
import { recordCommerceAnalytics } from "../../aiCommerce/commerceAnalytics.service.js";
import { commerceAgentSpec, ensureCommerceAgent } from "../../aiCommerce/commerceAgent.service.js";
import { httpStatusForCommerceError } from "../../aiCommerce/commerceErrors.js";
import type { ToolContext } from "../../services/tools/toolRegistry.js";

const toolByName = new Map(COMMERCE_TOOLS.map((t) => [t.definition.name, t]));

/** Build a ToolContext from the authenticated request. */
function contextOf(req: any): ToolContext {
  return {
    userId: req.user?.id,
    organizationId: req.user?.organizationId,
    conversationId: req.body?.sessionId || req.query?.sessionId,
    isAdmin: req.user?.role === "OWNER" || req.user?.role === "ADMIN",
  } as ToolContext;
}

/**
 * Run a commerce tool and translate its ToolResult into the platform's
 * standard HTTP envelope. Denials become real 401/403 responses, not empty
 * success payloads.
 */
async function runTool(req: any, res: any, name: string, params: Record<string, unknown>) {
  const tool = toolByName.get(name);
  if (!tool) {
    return res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: `Unknown commerce tool ${name}` } });
  }
  const result = await tool.execute(params, contextOf(req));
  if (result.success) {
    return res.json({ ok: true, data: result.data, meta: { requestId: req.requestId, ...(result.metadata ?? {}) } });
  }
  const code = (result.metadata as any)?.code ?? "WMPC_ERROR";
  return res
    .status(httpStatusForCommerceError(code))
    .json({ ok: false, error: { code, message: result.error }, meta: { requestId: req.requestId } });
}

export function registerAiCommerceRoutes(router: Router) {
  // ── Webhook: PUBLIC path, verified by HMAC. Registered BEFORE authenticate. ──
  router.post("/webhooks/wmpc", async (req: any, res) => {
    const rawBody: string =
      typeof req.rawBody === "string" ? req.rawBody : req.rawBody ? String(req.rawBody) : JSON.stringify(req.body ?? {});
    const outcome = await wmpcEventConsumer.handleInbound({
      rawBody,
      signature: (req.headers["x-wmpc-signature"] || req.headers["x-webhook-signature"]) as string | undefined,
      timestamp: (req.headers["x-wmpc-timestamp"] || req.headers["x-webhook-timestamp"]) as string | undefined,
      parsedBody: req.body,
    });

    if (outcome.accepted !== true) {
      // `apps/api` runs with strictNullChecks off, so narrow explicitly.
      const rejected = outcome as Extract<WmpcEventOutcome, { accepted: false }>;
      const status = rejected.reason === "not_configured" ? 503 : rejected.reason === "invalid_payload" ? 400 : 401;
      return res.status(status).json({ ok: false, error: { code: "WEBHOOK_REJECTED", reason: rejected.reason } });
    }
    const accepted = outcome as Extract<WmpcEventOutcome, { accepted: true }>;
    // Always 200 on an accepted event (including duplicates) so WMPC stops retrying.
    return res.json({ ok: true, data: { received: true, duplicate: accepted.duplicate, eventId: accepted.event.id } });
  });

  // ── Everything below requires an authenticated WINDELS user. ──
  router.use(authenticate);

  /** §3 — natural language to structured intent. */
  router.post("/interpret", validate({ body: aiCommerceRoutesSchema.interpret }), async (req: any, res, next) => {
    try {
      const intent = await commerceIntentService.interpret(req.body.text, {
        userId: req.user!.id,
        organizationId: req.user!.organizationId!,
      });
      const session = await commerceSessionService.getOrCreate({
        sessionId: req.body.sessionId,
        userId: req.user!.id,
        organizationId: req.user!.organizationId!,
        channel: req.body.channel ?? "web",
      });
      await commerceSessionService.update(session, { lastIntent: intent.intent });
      res.json({ ok: true, data: { intent, sessionId: session.sessionId }, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  /** §9 — product discovery. */
  router.post("/search", validate({ body: aiCommerceRoutesSchema.search }), (req, res) =>
    runTool(req, res, "search_products", {
      query: (req.body as any).query,
      filters: (req.body as any).filters,
      sort: (req.body as any).sort,
      limit: (req.body as any).limit,
      cursor: (req.body as any).cursor,
    }),
  );

  router.get("/products/:id", validate({ params: aiCommerceRoutesSchema.productId }), (req, res) =>
    runTool(req, res, "get_product", { productId: req.params.id }),
  );

  /** §11 — comparison. */
  router.post("/compare", validate({ body: aiCommerceRoutesSchema.compare }), (req, res) =>
    runTool(req, res, "compare_products", { productIds: (req.body as any).productIds }),
  );

  /** §14 — cart orchestration. WMPC holds the cart. */
  router.get("/cart", (req, res) => runTool(req, res, "get_cart", {}));

  router.post("/cart/items", validate({ body: aiCommerceRoutesSchema.addToCart }), (req, res) =>
    runTool(req, res, "add_to_cart", {
      productId: (req.body as any).productId,
      quantity: (req.body as any).quantity,
      variantId: (req.body as any).variantId,
    }),
  );

  router.patch("/cart/items", validate({ body: aiCommerceRoutesSchema.updateCart }), (req, res) =>
    runTool(req, res, "update_cart", {
      itemId: (req.body as any).itemId,
      quantity: (req.body as any).quantity,
    }),
  );

  router.delete("/cart/items/:itemId", (req, res) =>
    runTool(req, res, "remove_from_cart", { itemId: req.params.itemId }),
  );

  router.delete("/cart", (req: any, res) =>
    // Destructive: the caller must explicitly confirm, exactly as the agent must.
    runTool(req, res, "clear_cart", { confirmed: req.query?.confirmed === "true" || req.body?.confirmed === true }),
  );

  /** §15 — checkout. WMPC computes every figure. */
  router.post("/checkout", validate({ body: aiCommerceRoutesSchema.createCheckout }), (req: any, res) =>
    runTool(req, res, "create_checkout", { cartId: req.body?.cartId, confirmed: req.body?.confirmed === true }),
  );

  router.get("/checkout/:id", validate({ params: aiCommerceRoutesSchema.checkoutId }), (req, res) =>
    runTool(req, res, "get_checkout", { checkoutId: req.params.id }),
  );

  /** §16 — payment. Read-only: WINDELS never initiates or confirms payment. */
  router.get("/payment-methods", (req, res) => runTool(req, res, "get_payment_methods", {}));

  router.get("/payments/:id", validate({ params: aiCommerceRoutesSchema.paymentId }), (req, res) =>
    runTool(req, res, "get_payment_status", { paymentId: req.params.id }),
  );

  /** §17 — orders and tracking. */
  router.get("/orders", validate({ query: aiCommerceRoutesSchema.queryOrders }), (req: any, res) =>
    runTool(req, res, "get_orders", { status: req.query?.status, limit: req.query?.limit, cursor: req.query?.cursor }),
  );

  router.get("/orders/:id", validate({ params: aiCommerceRoutesSchema.orderId }), (req, res) =>
    runTool(req, res, "get_order", { orderId: req.params.id }),
  );

  router.get("/orders/:id/tracking", validate({ params: aiCommerceRoutesSchema.orderId }), (req, res) =>
    runTool(req, res, "track_order", { orderId: req.params.id }),
  );

  /** Gift cards — WMPC's, not the WINDELS-local gift card system. */
  router.post("/gift-cards/validate", validate({ body: aiCommerceRoutesSchema.giftCardValidate }), (req, res) =>
    runTool(req, res, "validate_gift_card", { code: (req.body as any).code }),
  );

  router.post("/gift-cards/apply", validate({ body: aiCommerceRoutesSchema.giftCardApply }), (req, res) =>
    runTool(req, res, "apply_gift_card", {
      code: (req.body as any).code,
      checkoutId: (req.body as any).checkoutId,
      cartId: (req.body as any).cartId,
    }),
  );

  /** §8 — AI orchestration session (ids only; not a cart). */
  router.get("/session/:sessionId", async (req: any, res, next) => {
    try {
      const session = await commerceSessionService.get(
        req.user!.organizationId!,
        req.params.sessionId,
        req.user!.id,
      );
      if (!session) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: session, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  // ── §30 Admin / observability surface ──

  /** Status of the commerce subsystem: which adapter, which flags, which tools. */
  router.get("/admin/status", async (req: any, res, next) => {
    try {
      const info = getWmpcConnectorInfo();
      res.json({
        ok: true,
        data: {
          connector: info,
          tools: commerceToolDefinitions().map((d) => ({ name: d.name, hasSideEffects: d.hasSideEffects })),
          flags: AI_COMMERCE_FLAG_SEEDS.map((f) => ({ key: f.key, name: f.name, description: f.description })),
          agent: commerceAgentSpec(),
        },
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /** Provision the commerce feature flags (disabled) into the existing flag store. */
  router.post("/admin/flags/provision", async (req: any, res, next) => {
    try {
      if (!(req.user?.role === "OWNER" || req.user?.role === "ADMIN")) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN" } });
      }
      const result = await provisionCommerceFlags(req.user!.id);
      res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  /** Provision the commerce agent into the org's existing AI Workforce. */
  router.post("/admin/agent/provision", async (req: any, res, next) => {
    try {
      if (!(req.user?.role === "OWNER" || req.user?.role === "ADMIN")) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN" } });
      }
      const agentId = await ensureCommerceAgent(req.user!.organizationId!);
      const correlationId = randomUUID();
      logger.info("[aiCommerce] agent provision requested", { agentId, correlationId });
      await recordCommerceAnalytics("commerce.support_requested", {
        organizationId: req.user!.organizationId!,
        userId: req.user!.id,
        correlationId,
        properties: { action: "agent_provision", agentId },
      });
      res.json({ ok: true, data: { agentId }, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });
}
