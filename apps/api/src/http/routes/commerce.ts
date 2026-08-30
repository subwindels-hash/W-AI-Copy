import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import commerceService from "../../commerce/commerce.service.js";
import { commerceRoutesSchema } from "@windels/shared/commerce";
import { z } from "zod";

export function registerCommerceRoutes(router: Router) {
  router.use(authenticate);
  router.get("/products", validate({ query: commerceRoutesSchema.queryProducts }), async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      const q = req.query as any;
      const products = await commerceService.getProducts(orgId, { category: q.category, search: q.search, inStock: q.inStock==="true"? true: undefined, limit: q.limit? Number(q.limit):20, offset: q.offset? Number(q.offset):0 });
      res.json({ ok: true, data: products, meta: { requestId: req.requestId } });
    } catch(e){ next(e); }
  });
  router.get("/products/:id", validate({ params: commerceRoutesSchema.productId }), async (req, res, next) => {
    try {
      const prod = await commerceService.getProduct(req.user!.organizationId!, req.params.id);
      if (!prod) return res.status(404).json({ ok:false, error:{ code:"NOT_FOUND" }});
      res.json({ ok:true, data: prod, meta:{ requestId: req.requestId }});
    } catch(e){ next(e); }
  });
  // Catalog writes — the only path by which a product price enters the system.
  // Without these, getProduct() is always null and nothing can be priced.
  router.put("/products/:id", validate({ params: commerceRoutesSchema.productId, body: commerceRoutesSchema.upsertProduct }), async (req, res, next) => {
    try {
      const orgId = req.user!.organizationId!;
      if (req.body.id !== req.params.id) {
        return res.status(400).json({ ok:false, error:{ code:"BAD_REQUEST", message:"Body id must match the path id" }});
      }
      const prod = await commerceService.upsertProduct(orgId, req.body);
      res.json({ ok:true, data: prod, meta:{ requestId: req.requestId }});
    } catch(e){ next(e); }
  });
  router.delete("/products/:id", validate({ params: commerceRoutesSchema.productId }), async (req, res, next) => {
    try {
      const deleted = await commerceService.deleteProduct(req.user!.organizationId!, req.params.id);
      if (!deleted) return res.status(404).json({ ok:false, error:{ code:"NOT_FOUND" }});
      res.json({ ok:true, data:{ deleted:true }, meta:{ requestId: req.requestId }});
    } catch(e){ next(e); }
  });
  router.get("/cart", async (req, res, next) => {
    try { const cart = await commerceService.getCart(req.user!.id, req.user!.organizationId!); res.json({ ok:true, data: cart, meta:{ requestId: req.requestId }}); } catch(e){ next(e); }
  });
  router.post("/cart/items", validate({ body: commerceRoutesSchema.addCartItem }), async (req, res, next) => {
    try { const cart = await commerceService.addToCart(req.user!.id, req.user!.organizationId!, req.body); res.json({ ok:true, data: cart, meta:{ requestId: req.requestId }}); } catch(e){ next(e); }
  });
  router.patch("/cart/items/:productId", validate({ params: commerceRoutesSchema.cartProductId, body: commerceRoutesSchema.updateCartItem }), async (req, res, next) => {
    try { const cart = await commerceService.updateCartItem(req.user!.id, req.user!.organizationId!, req.params.productId, req.body.quantity); res.json({ ok:true, data: cart, meta:{ requestId: req.requestId }}); } catch(e){ next(e); }
  });
  router.delete("/cart/items/:productId", validate({ params: commerceRoutesSchema.cartProductId }), async (req, res, next) => {
    try { const cart = await commerceService.removeFromCart(req.user!.id, req.user!.organizationId!, req.params.productId); res.json({ ok:true, data: cart, meta:{ requestId: req.requestId }}); } catch(e){ next(e); }
  });
  router.delete("/cart", async (req, res, next) => {
    try { await commerceService.clearCart(req.user!.id, req.user!.organizationId!); res.json({ ok:true, data:{ cleared:true }, meta:{ requestId: req.requestId }}); } catch(e){ next(e); }
  });
  router.post("/checkout", validate({ body: commerceRoutesSchema.checkout }), async (req, res, next) => {
    try { const order = await commerceService.createOrder(req.user!.id, req.user!.organizationId!, req.body.shippingAddress, req.body.billingAddress); res.status(201).json({ ok:true, data: order, meta:{ requestId: req.requestId }}); } catch(e){ next(e); }
  });
  router.get("/orders", validate({ query: commerceRoutesSchema.queryOrders }), async (req, res, next) => {
    try {
      const q = req.query as any;
      const orders = await commerceService.getOrders(req.user!.id, req.user!.organizationId!, { status: q.status, limit: q.limit? Number(q.limit):20, offset: q.offset? Number(q.offset):0 });
      res.json({ ok:true, data: orders, meta:{ requestId: req.requestId }});
    } catch(e){ next(e); }
  });
  router.get("/orders/:id", validate({ params: commerceRoutesSchema.orderId }), async (req, res, next) => {
    try { const o = await commerceService.getOrder(req.user!.id, req.user!.organizationId!, req.params.id); if (!o) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"}}); res.json({ ok:true, data:o, meta:{ requestId:req.requestId}}); } catch(e){ next(e); }
  });
  router.patch("/orders/:id/status", validate({ params: commerceRoutesSchema.orderId, body: commerceRoutesSchema.updateOrderStatus }), async (req, res, next) => {
    try { const o = await commerceService.updateOrderStatus(req.user!.id, req.user!.organizationId!, req.params.id, req.body.status); res.json({ ok:true, data:o, meta:{ requestId:req.requestId}}); } catch(e){ next(e); }
  });
  router.get("/dashboard", async (req, res, next) => {
    try { const d = await commerceService.getDashboard(req.user!.organizationId!); res.json({ ok:true, data:d, meta:{ requestId:req.requestId}}); } catch(e){ next(e); }
  });
  // Notes (kept as-is)
  router.get("/notes", async (req, res) => { res.json({ ok:true, data:[], meta:{ requestId: (req as any).requestId }}); });
  router.post("/notes", async (req, res) => { res.json({ ok:true, data: (req as any).body, meta:{ requestId: (req as any).requestId }}); });
  router.patch("/notes/:id", async (req, res) => { res.json({ ok:true, data:{ ...(req as any).body, id: (req as any).params.id }, meta:{ requestId: (req as any).requestId }}); });
  router.delete("/notes/:id", async (req, res) => { res.json({ ok:true, data:{ deleted:true }, meta:{ requestId: (req as any).requestId }}); });
}
