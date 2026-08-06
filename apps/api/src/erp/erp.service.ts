/**
 * Session 92 — Enterprise ERP (Enterprise Resource Planning).
 *
 * Org-scoped product catalog, warehouse/inventory with a real movements
 * ledger (stock computed per read — never stored as a fact), suppliers,
 * purchase orders and sales orders with honest lifecycles, a CRM hook
 * (won deal → sales order) and a deterministic operations rollup.
 *
 * Honesty rules:
 *   - No Math.random anywhere; ids come from CSPRNG (randomUUID).
 *   - Stock on hand is always Σ of movement quantities — a balance is never
 *     persisted.
 *   - Order totals are computed from items at write time and re-verified on
 *     read (hydrate recalculates totalCents).
 *   - `receive` on a PO and `fulfill` on an SO really create the movement
 *     ledger rows; status timestamps are stamped only on the actual
 *     transition.
 *   - The CRM hook refuses to invent a product line: when a won deal has no
 *     matching product, the SO is created with the company link and the deal
 *     amount recorded in `note`, never as a fabricated line item.
 *
 * Keys: erp:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  ErpProduct,
  ErpWarehouse,
  ErpMovement,
  ErpSupplier,
  ErpPurchaseOrder,
  ErpSalesOrder,
  ErpOrderItem,
  ErpStockRow,
  ErpOperationsRollup,
  ErpLowStockItem,
  ErpMovementCreateRequest,
  ErpProductCreateInput,
  ErpWarehouseCreateInput,
  ErpSupplierCreateInput,
  ErpPurchaseOrderCreateInput,
  ErpSalesOrderCreateInput,
  ErpProductUpsertInput,
  ErpWarehouseUpsertInput,
  ErpSupplierUpsertInput,
  ErpPurchaseOrderUpsertInput,
  ErpSalesOrderUpsertInput,
  ErpPoStatus,
  ErpSoStatus,
} from "@windels/shared/erp";

type Entity = "product" | "warehouse" | "movement" | "supplier" | "po" | "so";

const K = {
  item: (e: Entity, org: string, id: string) => `erp:${e}:i:${org}:${id}`,
  idx: (e: Entity, org: string) => `erp:${e}:idx:${org}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

/** Read a record ONLY when it belongs to `org` — fail-closed cross-tenant. */
async function readOwned<T extends { organizationId: string }>(
  entity: Entity,
  org: string,
  id: string
): Promise<T | null> {
  const raw = await redis.hget(K.item(entity, org, id), "_doc");
  if (!raw) return null;
  const rec = j<T>(raw);
  return rec && rec.organizationId === org ? rec : null;
}

async function writeItem(entity: Entity, org: string, rec: unknown): Promise<void> {
  await redis.hset(K.item(entity, org, (rec as { id: string }).id), "_doc", s2(rec));
  await redis.zadd(K.idx(entity, org), Date.now(), (rec as { id: string }).id);
}

async function deleteItem(entity: Entity, org: string, id: string): Promise<boolean> {
  const existed = await readOwned<{ organizationId: string }>(entity, org, id);
  if (!existed) return false;
  await redis.del(K.item(entity, org, id));
  await redis.zrem(K.idx(entity, org), id);
  return true;
}

async function listIds(entity: Entity, org: string): Promise<string[]> {
  return redis.zrange(K.idx(entity, org), 0, -1);
}

const uid = (p: string) => p + randomUUID().slice(0, 8);

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "erp", payload });
  } catch {
    /* best effort */
  }
}

const orderTotal = (items: ErpOrderItem[]) => items.reduce((s, i) => s + i.qty * i.unitPriceCents, 0);

export const ErpService = {
  // ── Products ──────────────────────────────────────────────────────
  async listProducts(org: string, filter?: { q?: string; category?: string; lowStock?: boolean }): Promise<ErpProduct[]> {
    const ids = await listIds("product", org);
    const out: ErpProduct[] = [];
    for (const id of ids) {
      const p = await readOwned<ErpProduct>("product", org, id);
      if (!p) continue;
      if (filter?.category && p.category !== filter.category) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!`${p.sku} ${p.name} ${p.category ?? ""}`.toLowerCase().includes(q)) continue;
      }
      out.push(p);
    }
    out.sort((a, b) => (a.sku < b.sku ? -1 : 1));
    if (filter?.lowStock) {
      const stock = await this.currentStock(org);
      const low = new Set(stock.filter((r) => r.quantity < (out.find((p) => p.id === r.productId)?.reorderLevel ?? 0)).map((r) => r.productId));
      return out.filter((p) => low.has(p.id));
    }
    return out;
  },

  async getProduct(org: string, id: string): Promise<ErpProduct | null> {
    return readOwned<ErpProduct>("product", org, id);
  },

  async createProduct(org: string, input: ErpProductCreateInput, _userId: string | null): Promise<ErpProduct> {
    const existing = await this.listProducts(org);
    if (existing.some((p) => p.sku === input.sku)) throw new Error("SKU_ALREADY_EXISTS");
    const now = new Date().toISOString();
    const rec: ErpProduct = {
      id: uid("erpp-"),
      organizationId: org,
      sku: input.sku,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      unit: input.unit ?? "each",
      priceCents: input.priceCents,
      costCents: input.costCents,
      taxRatePct: input.taxRatePct ?? 0,
      reorderLevel: input.reorderLevel ?? 0,
      tags: input.tags ?? [],
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("product", org, rec);
    void emitKernel("erp.product.created", { id: rec.id, organizationId: org });
    return rec;
  },

  async updateProduct(org: string, id: string, patch: Partial<ErpProductUpsertInput>, _userId: string | null): Promise<ErpProduct | null> {
    const cur = await readOwned<ErpProduct>("product", org, id);
    if (!cur) return null;
    if (patch.sku && patch.sku !== cur.sku) {
      const existing = await this.listProducts(org);
      if (existing.some((p) => p.sku === patch.sku && p.id !== id)) throw new Error("SKU_ALREADY_EXISTS");
    }
    const next: ErpProduct = {
      ...cur,
      ...(patch.sku !== undefined ? { sku: patch.sku } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description ?? null } : {}),
      ...(patch.category !== undefined ? { category: patch.category ?? null } : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
      ...(patch.priceCents !== undefined ? { priceCents: patch.priceCents } : {}),
      ...(patch.costCents !== undefined ? { costCents: patch.costCents } : {}),
      ...(patch.taxRatePct !== undefined ? { taxRatePct: patch.taxRatePct } : {}),
      ...(patch.reorderLevel !== undefined ? { reorderLevel: patch.reorderLevel } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      updatedAt: new Date().toISOString(),
    };
    await writeItem("product", org, next);
    void emitKernel("erp.product.updated", { id, organizationId: org });
    return next;
  },

  async deleteProduct(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("product", org, id);
    if (ok) void emitKernel("erp.product.deleted", { id, organizationId: org });
    return ok;
  },

  // ── Warehouses ────────────────────────────────────────────────────
  async listWarehouses(org: string): Promise<ErpWarehouse[]> {
    const ids = await listIds("warehouse", org);
    const out: ErpWarehouse[] = [];
    for (const id of ids) {
      const w = await readOwned<ErpWarehouse>("warehouse", org, id);
      if (w) out.push(w);
    }
    return out.sort((a, b) => (a.code < b.code ? -1 : 1));
  },

  async getWarehouse(org: string, id: string): Promise<ErpWarehouse | null> {
    return readOwned<ErpWarehouse>("warehouse", org, id);
  },

  async createWarehouse(org: string, input: ErpWarehouseCreateInput, _userId: string | null): Promise<ErpWarehouse> {
    const now = new Date().toISOString();
    const rec: ErpWarehouse = {
      id: uid("erpw-"),
      organizationId: org,
      name: input.name,
      code: input.code,
      city: input.city ?? null,
      country: input.country ?? null,
      isDefault: input.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("warehouse", org, rec);
    void emitKernel("erp.warehouse.created", { id: rec.id, organizationId: org });
    return rec;
  },

  async updateWarehouse(org: string, id: string, patch: Partial<ErpWarehouseUpsertInput>, _userId: string | null): Promise<ErpWarehouse | null> {
    const cur = await readOwned<ErpWarehouse>("warehouse", org, id);
    if (!cur) return null;
    const next: ErpWarehouse = {
      ...cur,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.code !== undefined ? { code: patch.code } : {}),
      ...(patch.city !== undefined ? { city: patch.city ?? null } : {}),
      ...(patch.country !== undefined ? { country: patch.country ?? null } : {}),
      ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
      updatedAt: new Date().toISOString(),
    };
    await writeItem("warehouse", org, next);
    void emitKernel("erp.warehouse.updated", { id, organizationId: org });
    return next;
  },

  async deleteWarehouse(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("warehouse", org, id);
    if (ok) void emitKernel("erp.warehouse.deleted", { id, organizationId: org });
    return ok;
  },

  // ── Movements & stock (ledger is the source of truth) ─────────────
  async createMovement(org: string, input: ErpMovementCreateRequest, userId: string | null): Promise<ErpMovement> {
    const product = await this.getProduct(org, input.productId);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    const wh = await this.getWarehouse(org, input.warehouseId);
    if (!wh) throw new Error("WAREHOUSE_NOT_FOUND");
    if (input.quantity === 0) throw new Error("ZERO_QUANTITY");
    const now = new Date().toISOString();
    const rec: ErpMovement = {
      id: uid("erpm-"),
      organizationId: org,
      productId: input.productId,
      warehouseId: input.warehouseId,
      kind: input.kind,
      quantity: input.quantity,
      unitCostCents: input.unitCostCents ?? product.costCents,
      reference: input.reference ?? null,
      note: input.note ?? null,
      occurredAt: input.occurredAt ?? now,
      createdAt: now,
      createdBy: userId,
    };
    await writeItem("movement", org, rec);
    void emitKernel("erp.movement.created", { id: rec.id, organizationId: org, kind: rec.kind });
    return rec;
  },

  async listMovements(org: string, filter?: { productId?: string; warehouseId?: string; kind?: string }): Promise<ErpMovement[]> {
    const ids = await listIds("movement", org);
    const out: ErpMovement[] = [];
    for (const id of ids) {
      const m = await readOwned<ErpMovement>("movement", org, id);
      if (!m) continue;
      if (filter?.productId && m.productId !== filter.productId) continue;
      if (filter?.warehouseId && m.warehouseId !== filter.warehouseId) continue;
      if (filter?.kind && m.kind !== filter.kind) continue;
      out.push(m);
    }
    return out.sort((a, b) => (a.occurredAt === b.occurredAt ? (a.id < b.id ? -1 : 1) : a.occurredAt < b.occurredAt ? -1 : 1));
  },

  /** Current stock per product+warehouse — computed from the ledger, never stored. */
  async currentStock(org: string): Promise<ErpStockRow[]> {
    const [movements, products, warehouses] = await Promise.all([
      ErpService.listMovements(org),
      ErpService.listProducts(org),
      ErpService.listWarehouses(org),
    ]);
    const byKey = new Map<string, number>();
    for (const m of movements) {
      const key = `${m.productId}:${m.warehouseId}`;
      byKey.set(key, (byKey.get(key) ?? 0) + m.quantity);
    }
    const prodById = new Map(products.map((p) => [p.id, p]));
    const whById = new Map(warehouses.map((w) => [w.id, w]));
    return [...byKey.entries()]
      .map(([key, quantity]) => {
        const [productId, warehouseId] = key.split(":");
        const p = prodById.get(productId);
        const w = whById.get(warehouseId);
        if (!p || !w) return null;
        return {
          productId,
          productSku: p.sku,
          productName: p.name,
          warehouseId,
          warehouseName: w.name,
          quantity,
          costCents: p.costCents,
        } satisfies ErpStockRow;
      })
      .filter((r): r is ErpStockRow => r !== null)
      .sort((a, b) => (a.productSku < b.productSku ? -1 : 1));
  },

  // ── Suppliers ─────────────────────────────────────────────────────
  async listSuppliers(org: string, filter?: { q?: string }): Promise<ErpSupplier[]> {
    const ids = await listIds("supplier", org);
    const out: ErpSupplier[] = [];
    for (const id of ids) {
      const s = await readOwned<ErpSupplier>("supplier", org, id);
      if (!s) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!`${s.name} ${s.contactEmail ?? ""}`.toLowerCase().includes(q)) continue;
      }
      out.push(s);
    }
    return out.sort((a, b) => (a.name < b.name ? -1 : 1));
  },

  async getSupplier(org: string, id: string): Promise<ErpSupplier | null> {
    return readOwned<ErpSupplier>("supplier", org, id);
  },

  async createSupplier(org: string, input: ErpSupplierCreateInput, _userId: string | null): Promise<ErpSupplier> {
    const now = new Date().toISOString();
    const rec: ErpSupplier = {
      id: uid("erps-"),
      organizationId: org,
      name: input.name,
      contactEmail: input.contactEmail ?? null,
      phone: input.phone ?? null,
      paymentTerms: input.paymentTerms ?? null,
      leadTimeDays: input.leadTimeDays ?? 0,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("supplier", org, rec);
    void emitKernel("erp.supplier.created", { id: rec.id, organizationId: org });
    return rec;
  },

  async updateSupplier(org: string, id: string, patch: Partial<ErpSupplierUpsertInput>, _userId: string | null): Promise<ErpSupplier | null> {
    const cur = await readOwned<ErpSupplier>("supplier", org, id);
    if (!cur) return null;
    const next: ErpSupplier = {
      ...cur,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.contactEmail !== undefined ? { contactEmail: patch.contactEmail ?? null } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone ?? null } : {}),
      ...(patch.paymentTerms !== undefined ? { paymentTerms: patch.paymentTerms ?? null } : {}),
      ...(patch.leadTimeDays !== undefined ? { leadTimeDays: patch.leadTimeDays } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      updatedAt: new Date().toISOString(),
    };
    await writeItem("supplier", org, next);
    void emitKernel("erp.supplier.updated", { id, organizationId: org });
    return next;
  },

  async deleteSupplier(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("supplier", org, id);
    if (ok) void emitKernel("erp.supplier.deleted", { id, organizationId: org });
    return ok;
  },

  // ── Purchase orders ───────────────────────────────────────────────
  async listPurchaseOrders(org: string, filter?: { status?: ErpPoStatus; supplierId?: string }): Promise<ErpPurchaseOrder[]> {
    const ids = await listIds("po", org);
    const out: ErpPurchaseOrder[] = [];
    for (const id of ids) {
      const po = await readOwned<ErpPurchaseOrder>("po", org, id);
      if (!po) continue;
      if (filter?.status && po.status !== filter.status) continue;
      if (filter?.supplierId && po.supplierId !== filter.supplierId) continue;
      out.push({ ...po, totalCents: orderTotal(po.items) });
    }
    return out.sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1));
  },

  async getPurchaseOrder(org: string, id: string): Promise<ErpPurchaseOrder | null> {
    const po = await readOwned<ErpPurchaseOrder>("po", org, id);
    return po ? { ...po, totalCents: orderTotal(po.items) } : null;
  },

  async createPurchaseOrder(org: string, input: ErpPurchaseOrderCreateInput, userId: string | null): Promise<ErpPurchaseOrder> {
    const supplier = await this.getSupplier(org, input.supplierId);
    if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
    for (const it of input.items) {
      if (!(await this.getProduct(org, it.productId))) throw new Error("PRODUCT_NOT_FOUND");
    }
    const now = new Date().toISOString();
    const rec: ErpPurchaseOrder = {
      id: uid("erp-p-"),
      organizationId: org,
      supplierId: input.supplierId,
      status: input.status ?? "draft",
      items: input.items,
      totalCents: orderTotal(input.items),
      expectedAt: input.expectedAt ?? null,
      receivedAt: null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("po", org, rec);
    void emitKernel("erp.po.created", { id: rec.id, organizationId: org, status: rec.status });
    return rec;
  },

  async updatePurchaseOrder(org: string, id: string, patch: Partial<ErpPurchaseOrderUpsertInput>, _userId: string | null): Promise<ErpPurchaseOrder | null> {
    const cur = await readOwned<ErpPurchaseOrder>("po", org, id);
    if (!cur) return null;
    if (cur.status === "received" || cur.status === "cancelled") throw new Error("PO_CLOSED");
    const items = patch.items ?? cur.items;
    const next: ErpPurchaseOrder = {
      ...cur,
      ...(patch.supplierId !== undefined ? { supplierId: patch.supplierId } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.items !== undefined ? { items: patch.items } : {}),
      ...(patch.expectedAt !== undefined ? { expectedAt: patch.expectedAt ?? null } : {}),
      ...(patch.note !== undefined ? { note: patch.note ?? null } : {}),
      totalCents: orderTotal(items),
      updatedAt: new Date().toISOString(),
    };
    await writeItem("po", org, next);
    void emitKernel("erp.po.updated", { id, organizationId: org });
    return next;
  },

  async deletePurchaseOrder(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("po", org, id);
    if (ok) void emitKernel("erp.po.deleted", { id, organizationId: org });
    return ok;
  },

  /** Mark a PO received and create real `receipt` movements for its items. */
  async receivePurchaseOrder(org: string, id: string, userId: string | null): Promise<ErpPurchaseOrder | null> {
    const po = await readOwned<ErpPurchaseOrder>("po", org, id);
    if (!po) return null;
    if (po.status === "received") return po;
    if (po.status === "cancelled") throw new Error("PO_CANCELLED");
    const warehouse = await this.defaultWarehouse(org);
    const now = new Date().toISOString();
    for (const it of po.items) {
      await this.createMovement(org, {
        productId: it.productId,
        warehouseId: warehouse.id,
        kind: "receipt",
        quantity: it.qty,
        unitCostCents: it.unitPriceCents,
        reference: po.id,
        note: `Receipt of PO ${po.id}`,
        occurredAt: now,
      }, userId);
    }
    const next: ErpPurchaseOrder = { ...po, status: "received", receivedAt: now, updatedAt: now };
    await writeItem("po", org, next);
    void emitKernel("erp.po.received", { id, organizationId: org });
    return next;
  },

  // ── Sales orders ──────────────────────────────────────────────────
  async listSalesOrders(org: string, filter?: { status?: ErpSoStatus }): Promise<ErpSalesOrder[]> {
    const ids = await listIds("so", org);
    const out: ErpSalesOrder[] = [];
    for (const id of ids) {
      const so = await readOwned<ErpSalesOrder>("so", org, id);
      if (!so) continue;
      if (filter?.status && so.status !== filter.status) continue;
      out.push({ ...so, totalCents: orderTotal(so.items) });
    }
    return out.sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1));
  },

  async getSalesOrder(org: string, id: string): Promise<ErpSalesOrder | null> {
    const so = await readOwned<ErpSalesOrder>("so", org, id);
    return so ? { ...so, totalCents: orderTotal(so.items) } : null;
  },

  async createSalesOrder(org: string, input: ErpSalesOrderCreateInput, userId: string | null): Promise<ErpSalesOrder> {
    for (const it of input.items) {
      if (!(await this.getProduct(org, it.productId))) throw new Error("PRODUCT_NOT_FOUND");
    }
    const now = new Date().toISOString();
    const rec: ErpSalesOrder = {
      id: uid("erp-s-"),
      organizationId: org,
      customerCompanyId: input.customerCompanyId ?? null,
      status: input.status ?? "draft",
      items: input.items,
      totalCents: orderTotal(input.items),
      orderDate: input.orderDate,
      fulfilledAt: null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("so", org, rec);
    void emitKernel("erp.so.created", { id: rec.id, organizationId: org, status: rec.status });
    return rec;
  },

  async updateSalesOrder(org: string, id: string, patch: Partial<ErpSalesOrderUpsertInput>, _userId: string | null): Promise<ErpSalesOrder | null> {
    const cur = await readOwned<ErpSalesOrder>("so", org, id);
    if (!cur) return null;
    if (cur.status === "fulfilled" || cur.status === "cancelled") throw new Error("SO_CLOSED");
    const items = patch.items ?? cur.items;
    const next: ErpSalesOrder = {
      ...cur,
      ...(patch.customerCompanyId !== undefined ? { customerCompanyId: patch.customerCompanyId ?? null } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.items !== undefined ? { items: patch.items } : {}),
      ...(patch.orderDate !== undefined ? { orderDate: patch.orderDate } : {}),
      ...(patch.note !== undefined ? { note: patch.note ?? null } : {}),
      totalCents: orderTotal(items),
      updatedAt: new Date().toISOString(),
    };
    await writeItem("so", org, next);
    void emitKernel("erp.so.updated", { id, organizationId: org });
    return next;
  },

  async deleteSalesOrder(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("so", org, id);
    if (ok) void emitKernel("erp.so.deleted", { id, organizationId: org });
    return ok;
  },

  /** Mark an SO fulfilled and create real `sale` movements for its items. */
  async fulfillSalesOrder(org: string, id: string, userId: string | null): Promise<ErpSalesOrder | null> {
    const so = await readOwned<ErpSalesOrder>("so", org, id);
    if (!so) return null;
    if (so.status === "fulfilled") return so;
    if (so.status === "cancelled") throw new Error("SO_CANCELLED");
    const warehouse = await this.defaultWarehouse(org);
    const now = new Date().toISOString();
    for (const it of so.items) {
      await this.createMovement(org, {
        productId: it.productId,
        warehouseId: warehouse.id,
        kind: "sale",
        quantity: -it.qty,
        unitCostCents: it.unitPriceCents,
        reference: so.id,
        note: `Fulfillment of SO ${so.id}`,
        occurredAt: now,
      }, userId);
    }
    const next: ErpSalesOrder = { ...so, status: "fulfilled", fulfilledAt: now, updatedAt: now };
    await writeItem("so", org, next);
    void emitKernel("erp.so.fulfilled", { id, organizationId: org });
    return next;
  },

  /** The default warehouse for an org (first one, or the flagged default). */
  async defaultWarehouse(org: string): Promise<ErpWarehouse> {
    const whs = await this.listWarehouses(org);
    const def = whs.find((w) => w.isDefault) ?? whs[0];
    if (!def) throw new Error("NO_WAREHOUSE");
    return def;
  },

  // ── CRM hook: won deal → sales order ──────────────────────────────
  /**
   * Create a sales order from a Session 90 CRM deal. Honest behavior: the SO
   * is linked to the deal's company; when a product matching the deal name is
   * found it becomes the line item, otherwise the SO is created with the
   * company link and the deal amount recorded in `note` — never a fabricated
   * product line.
   */
  async createSalesOrderFromDeal(org: string, dealId: string, userId: string | null): Promise<{ order: ErpSalesOrder; matchedProduct: boolean } | null> {
    try {
      const { CrmService } = await import("../crm/crm.service.js");
      const deal = await CrmService.getDeal(org, dealId);
      if (!deal) return null;
      const products = await this.listProducts(org);
      const match = products.find((p) =>
        deal.name.toLowerCase().includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes(deal.name.toLowerCase())
      );
      const items: ErpOrderItem[] = match
        ? [{ productId: match.id, qty: 1, unitPriceCents: match.priceCents || deal.amountCents }]
        : [];
      const order = await this.createSalesOrder(org, {
        customerCompanyId: deal.companyId,
        status: "confirmed",
        items,
        orderDate: new Date().toISOString().slice(0, 10),
        note: `Created from CRM deal ${deal.name}${match ? "" : ` (no product match — deal amount ${deal.amountCents} cents recorded; add line items manually)`}`,
      }, userId);
      return { order, matchedProduct: Boolean(match) };
    } catch {
      return null; // best effort — never fail the CRM write because ERP is down
    }
  },

  // ── Operations rollup (computed per read — never invented) ────────
  async rollup(org: string): Promise<ErpOperationsRollup> {
    const [products, warehouses, suppliers, movements, pos, sos, stock] = await Promise.all([
      ErpService.listProducts(org),
      ErpService.listWarehouses(org),
      ErpService.listSuppliers(org),
      ErpService.listMovements(org),
      ErpService.listPurchaseOrders(org),
      ErpService.listSalesOrders(org),
      ErpService.currentStock(org),
    ]);

    const poCounts: Record<ErpPoStatus, number> = { draft: 0, submitted: 0, received: 0, cancelled: 0 };
    for (const po of pos) poCounts[po.status]++;
    const soCounts: Record<ErpSoStatus, number> = { draft: 0, confirmed: 0, fulfilled: 0, cancelled: 0 };
    for (const so of sos) soCounts[so.status]++;

    const inventoryValueCents = stock.reduce((s, r) => s + r.quantity * r.costCents, 0);
    const byWarehouse = new Map<string, { name: string; valueCents: number }>();
    for (const r of stock) {
      const cur = byWarehouse.get(r.warehouseId) ?? { name: r.warehouseName, valueCents: 0 };
      cur.valueCents += r.quantity * r.costCents;
      byWarehouse.set(r.warehouseId, cur);
    }
    const stockValueByWarehouse = [...byWarehouse.entries()].map(([warehouseId, v]) => ({ warehouseId, ...v }));

    const prodById = new Map(products.map((p) => [p.id, p]));
    const lowStock: ErpLowStockItem[] = [];
    for (const r of stock) {
      const p = prodById.get(r.productId);
      if (p && r.quantity < p.reorderLevel) {
        lowStock.push({ productId: p.id, sku: p.sku, name: p.name, stockOnHand: r.quantity, reorderLevel: p.reorderLevel });
      }
    }
    lowStock.sort((a, b) => a.stockOnHand - b.stockOnHand);

    const stamps = [products[0]?.createdAt, movements[0]?.occurredAt, pos[0]?.createdAt, sos[0]?.createdAt]
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;

    return {
      counts: {
        products: products.length,
        activeProducts: products.filter((p) => p.isActive).length,
        warehouses: warehouses.length,
        suppliers: suppliers.length,
        movements: movements.length,
        purchaseOrders: poCounts,
        salesOrders: soCounts,
      },
      inventoryValueCents,
      stockValueByWarehouse,
      lowStock,
      purchaseOrderTotalsCents: pos.reduce((s, po) => s + po.totalCents, 0),
      salesOrderTotalsCents: sos.reduce((s, so) => s + so.totalCents, 0),
      recentMovements: [...movements].reverse().slice(0, 8),
      lastUpdatedAt: stamps,
    };
  },

  // ── Idempotent demo seed (opt-in only) ─────────────────────────────
  async ensureDemoSeed(logger?: { info?: (...a: any[]) => void }): Promise<boolean> {
    const demoOrg = "org-demo-erp";
    const existing = await this.listProducts(demoOrg);
    if (existing.length > 0) return false;

    const wh = await this.createWarehouse(demoOrg, {
      name: "Main warehouse", code: "WH-MAIN", city: "Enugu", country: "NG", isDefault: true,
    }, null);

    const laptop = await this.createProduct(demoOrg, {
      sku: "HW-LAP-001", name: "Developer Laptop", category: "Hardware", unit: "each",
      priceCents: 1_200_000, costCents: 950_000, taxRatePct: 7.5, reorderLevel: 5, tags: ["hardware"],
    }, null);
    const chair = await this.createProduct(demoOrg, {
      sku: "FUR-CHAIR-100", name: "Ergonomic Chair", category: "Furniture", unit: "each",
      priceCents: 350_000, costCents: 210_000, reorderLevel: 10, tags: ["office"],
    }, null);
    const license = await this.createProduct(demoOrg, {
      sku: "SW-SEAT-01", name: "Platform Seat License (annual)", category: "Software", unit: "seat",
      priceCents: 99_000, costCents: 20_000, reorderLevel: 0, tags: ["software"],
    }, null);
    const desk = await this.createProduct(demoOrg, {
      sku: "FUR-DESK-200", name: "Standing Desk", category: "Furniture", unit: "each",
      priceCents: 520_000, costCents: 330_000, reorderLevel: 4, tags: ["office"],
    }, null);

    await this.createMovement(demoOrg, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 12, note: "Opening stock" }, null);
    await this.createMovement(demoOrg, { productId: chair.id, warehouseId: wh.id, kind: "initial", quantity: 8, note: "Opening stock" }, null);
    await this.createMovement(demoOrg, { productId: desk.id, warehouseId: wh.id, kind: "initial", quantity: 3, note: "Opening stock" }, null);

    const supplierA = await this.createSupplier(demoOrg, {
      name: "TechSource Distribution", contactEmail: "orders@techsource.example.com",
      paymentTerms: "Net 30", leadTimeDays: 7, tags: ["hardware"],
    }, null);
    await this.createSupplier(demoOrg, {
      name: "OfficeWorks Ltd", contactEmail: "sales@officeworks.example.com",
      paymentTerms: "Net 15", leadTimeDays: 10, tags: ["furniture"],
    }, null);

    await this.createPurchaseOrder(demoOrg, {
      supplierId: supplierA.id, status: "submitted",
      items: [{ productId: laptop.id, qty: 5, unitPriceCents: 950_000 }],
      expectedAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      note: "Quarterly laptop refresh",
    }, null);

    await this.createSalesOrder(demoOrg, {
      customerCompanyId: "crmco-acme",
      status: "confirmed",
      items: [{ productId: chair.id, qty: 4, unitPriceCents: 350_000 }],
      orderDate: new Date().toISOString().slice(0, 10),
      note: "Office refit order",
    }, null);

    logger?.info?.("[erp] demo seed complete (org-demo-erp): 4 products, 1 warehouse, 2 suppliers, 1 PO, 1 SO");
    return true;
  },
};
