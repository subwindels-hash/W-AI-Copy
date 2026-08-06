import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ErpService } from "../../erp/erp.service.js";
// Request contracts live in @windels/shared so the API and the web client
// validate against one definition instead of hand-copied ones.
import {
  ErpProductUpsertSchema,
  ErpWarehouseUpsertSchema,
  ErpMovementCreateSchema,
  ErpSupplierUpsertSchema,
  ErpPurchaseOrderUpsertSchema,
  ErpSalesOrderUpsertSchema,
} from "@windels/shared/erp";

const orgOf = (req: any) => req.user!.organizationId!;
const userOf = (req: any): string | null => req.user?.id ?? null;

const IdParam = z.object({ id: z.string().min(1).max(64) });

export function registerErpRoutes(router: Router) {
  router.use(authenticate);

  // ── Dashboard ─────────────────────────────────────────────────────
  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const data = await ErpService.rollup(orgOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Products ──────────────────────────────────────────────────────
  router.get("/products", async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const lowStock = req.query.lowStock === "true";
      const data = await ErpService.listProducts(orgOf(req), { q, category, lowStock: lowStock || undefined });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/products", validate({ body: ErpProductUpsertSchema }), async (req, res, next) => {
    try {
      const data = await ErpService.createProduct(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/products/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await ErpService.getProduct(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Product not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/products/:id", validate({ params: IdParam, body: ErpProductUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await ErpService.updateProduct(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Product not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/products/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await ErpService.deleteProduct(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Product not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Warehouses ────────────────────────────────────────────────────
  router.get("/warehouses", async (_req, res, next) => {
    try {
      res.json({ ok: true, data: await ErpService.listWarehouses(orgOf(_req)), meta: { requestId: _req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/warehouses", validate({ body: ErpWarehouseUpsertSchema }), async (req, res, next) => {
    try {
      const data = await ErpService.createWarehouse(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/warehouses/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await ErpService.getWarehouse(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Warehouse not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/warehouses/:id", validate({ params: IdParam, body: ErpWarehouseUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await ErpService.updateWarehouse(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Warehouse not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/warehouses/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await ErpService.deleteWarehouse(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Warehouse not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Inventory & movements ─────────────────────────────────────────
  router.get("/inventory", async (_req, res, next) => {
    try {
      const data = await ErpService.currentStock(orgOf(_req));
      res.json({ ok: true, data, meta: { requestId: _req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/movements", validate({ body: ErpMovementCreateSchema }), async (req, res, next) => {
    try {
      const data = await ErpService.createMovement(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/movements", async (req, res, next) => {
    try {
      const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;
      const warehouseId = typeof req.query.warehouseId === "string" ? req.query.warehouseId : undefined;
      const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
      const data = await ErpService.listMovements(orgOf(req), { productId, warehouseId, kind });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Suppliers ─────────────────────────────────────────────────────
  router.get("/suppliers", async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json({ ok: true, data: await ErpService.listSuppliers(orgOf(req), { q }), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/suppliers", validate({ body: ErpSupplierUpsertSchema }), async (req, res, next) => {
    try {
      const data = await ErpService.createSupplier(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/suppliers/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await ErpService.getSupplier(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Supplier not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/suppliers/:id", validate({ params: IdParam, body: ErpSupplierUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await ErpService.updateSupplier(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Supplier not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/suppliers/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await ErpService.deleteSupplier(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Supplier not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Purchase orders ───────────────────────────────────────────────
  router.get("/purchase-orders", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? (req.query.status as any) : undefined;
      const supplierId = typeof req.query.supplierId === "string" ? req.query.supplierId : undefined;
      const data = await ErpService.listPurchaseOrders(orgOf(req), { status, supplierId });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/purchase-orders", validate({ body: ErpPurchaseOrderUpsertSchema }), async (req, res, next) => {
    try {
      const data = await ErpService.createPurchaseOrder(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/purchase-orders/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await ErpService.getPurchaseOrder(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Purchase order not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/purchase-orders/:id", validate({ params: IdParam, body: ErpPurchaseOrderUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await ErpService.updatePurchaseOrder(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Purchase order not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/purchase-orders/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await ErpService.deletePurchaseOrder(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Purchase order not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/purchase-orders/:id/receive", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await ErpService.receivePurchaseOrder(orgOf(req), req.params.id, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Purchase order not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Sales orders ──────────────────────────────────────────────────
  router.get("/sales-orders", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? (req.query.status as any) : undefined;
      const data = await ErpService.listSalesOrders(orgOf(req), { status });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/sales-orders", validate({ body: ErpSalesOrderUpsertSchema }), async (req, res, next) => {
    try {
      const data = await ErpService.createSalesOrder(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/sales-orders/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await ErpService.getSalesOrder(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Sales order not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/sales-orders/:id", validate({ params: IdParam, body: ErpSalesOrderUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await ErpService.updateSalesOrder(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Sales order not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/sales-orders/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await ErpService.deleteSalesOrder(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Sales order not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/sales-orders/:id/fulfill", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await ErpService.fulfillSalesOrder(orgOf(req), req.params.id, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Sales order not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // CRM hook: won deal → sales order
  router.post("/sales-orders/from-deal/:dealId", validate({ params: z.object({ dealId: z.string().min(1).max(64) }) }), async (req, res, next) => {
    try {
      const data = await ErpService.createSalesOrderFromDeal(orgOf(req), req.params.dealId, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Deal not found" } });
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
