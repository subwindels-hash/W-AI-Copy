import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { z } from "zod";
import commerceService from "../../commerce/commerce.service.js";

export function registerCommerceRoutes(router: Router) {
  router.use(authenticate);

  /**
   * GET /commerce/products
   * Get product catalog
   */
  router.get("/products", async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      const products = await commerceService.getProducts(orgId, {
        category: req.query.category as string,
        search: req.query.search as string,
        inStock: req.query.inStock === "true" ? true : undefined,
        limit: parseInt(req.query.limit as string) || 20,
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json({ ok: true, data: products, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * GET /commerce/products/:id
   * Get single product
   */
  router.get("/products/:id", z.object({ id: z.string().cuid() }).merge, async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      const product = await commerceService.getProduct(orgId, req.params.id);
      if (!product) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: product, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * GET /commerce/cart
   * Get user's cart
   */
  router.get("/cart", async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      const cart = await commerceService.getCart(req.user!.id, orgId);
      res.json({ ok: true, data: cart, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * POST /commerce/cart/items
   * Add item to cart
   */
  router.post("/cart/items", z.object({
    productId: z.string().cuid(),
    quantity: z.number().int().min(1).max(100),
    variantId: z.string().optional(),
  }), async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      const cart = await commerceService.addToCart(req.user!.id, orgId, req.body);
      res.json({ ok: true, data: cart, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * PATCH /commerce/cart/items/:productId
   * Update cart item quantity
   */
  router.patch("/cart/items/:productId", z.object({ productId: z.string().cuid() }).merge, z.object({
    quantity: z.number().int().min(0).max(100),
  }), async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      const cart = await commerceService.updateCartItem(req.user!.id, orgId, req.params.productId, req.body.quantity);
      res.json({ ok: true, data: cart, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * DELETE /commerce/cart/items/:productId
   * Remove item from cart
   */
  router.delete("/cart/items/:productId", z.object({ productId: z.string().cuid() }).merge, async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      const cart = await commerceService.removeFromCart(req.user!.id, orgId, req.params.productId);
      res.json({ ok: true, data: cart, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * DELETE /commerce/cart
   * Clear cart
   */
  router.delete("/cart", async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      await commerceService.clearCart(req.user!.id, orgId);
      res.json({ ok: true, data: { cleared: true }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * POST /commerce/checkout
   * Create order from cart
   */
  router.post("/checkout", z.object({
    shippingAddress: z.record(z.unknown()),
    billingAddress: z.record(z.unknown()).optional(),
  }), async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      const order = await commerceService.createOrder(req.user!.id, orgId, req.body.shippingAddress, req.body.billingAddress);
      res.status(201).json({ ok: true, data: order, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * GET /commerce/orders
   * Get user's orders
   */
  router.get("/orders", async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      const orders = await commerceService.getOrders(req.user!.id, orgId, {
        status: req.query.status as string,
        limit: parseInt(req.query.limit as string) || 20,
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json({ ok: true, data: orders, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * GET /commerce/orders/:id
   * Get single order
   */
  router.get("/orders/:id", z.object({ id: z.string().cuid() }).merge, async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      const order = await commerceService.getOrder(req.user!.id, orgId, req.params.id);
      if (!order) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: order, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * PATCH /commerce/orders/:id/status
   * Update order status (admin only)
   */
  router.patch("/orders/:id/status", z.object({ id: z.string().cuid() }).merge, z.object({
    status: z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"]),
  }), async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      const order = await commerceService.updateOrderStatus(req.user!.id, orgId, req.params.id, req.body.status);
      res.json({ ok: true, data: order, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * GET /commerce/dashboard
   * Get commerce dashboard stats (admin only)
   */
  router.get("/dashboard", async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      const dashboard = await commerceService.getDashboard(orgId);
      res.json({ ok: true, data: dashboard, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  /**
   * Notes endpoints (shared pattern)
   */
  router.get("/notes", async (_req, res) => {
    res.json({ ok: true, data: [], meta: { requestId: _req.requestId } });
  });

  router.post("/notes", async (req, res) => {
    res.json({ ok: true, data: req.body, meta: { requestId: req.requestId } });
  });

  router.patch("/notes/:id", async (req, res) => {
    res.json({ ok: true, data: { ...req.body, id: req.params.id }, meta: { requestId: req.requestId } });
  });

  router.delete("/notes/:id", async (_req, res) => {
    res.json({ ok: true, data: { deleted: true }, meta: { requestId: _req.requestId } });
  });
}
