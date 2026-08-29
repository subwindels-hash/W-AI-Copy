/**
 * Session 92 — Enterprise ERP.
 *
 * Exercises the real service against a fake KV (same pattern as the other
 * Redis-backed suites): product/warehouse/supplier CRUD, the movements
 * ledger as the single source of truth for stock, purchase/sales order
 * lifecycles (receive/fulfill create real movements), the CRM won-deal hook
 * (never fabricating a line item), deterministic rollup math, cross-tenant
 * isolation, demo-seed idempotency, and the shared Zod input contracts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | Set<string> | string>();
    async keys(pattern: string) {
      const regex = new RegExp("^" + pattern.replace(/[*]/g, ".*") + "$");
      return Array.from(this.store.keys()).filter((k) => regex.test(k));
    }
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
    async hset(key: string, field: string, value: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(field, value); return 1;
    }
    async hget(key: string, field: string) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return null;
      const v = map.get(field);
      return v !== undefined ? String(v) : null;
    }
    async zadd(key: string, score: number, member: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(member, String(score)); return 1;
    }
    async zrange(key: string, start: number, stop: number) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return [];
      const entries = Array.from(map.entries());
      entries.sort((a, b) => Number(a[1]) - Number(b[1]) || (a[0] < b[0] ? -1 : 1));
      const slice = entries.slice(start, stop === -1 ? undefined : stop + 1);
      return slice.map(([m]) => m);
    }
    async zrem(key: string, member: string) {
      const map = this.store.get(key);
      if (map instanceof Map) return map.delete(member) ? 1 : 0;
      return 0;
    }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({
  redisCmd: fake,
}));
// The CRM hook resolves lazily; the CRM service is Redis-backed too, so we
// point it at the same fake store.
vi.mock("../crm/crm.service.js", async () => {
  const actual = await vi.importActual<typeof import("../crm/crm.service.js")>("../crm/crm.service.js");
  return { CrmService: actual.CrmService };
});

import { ErpService } from "./erp.service.js";
import {
  ErpProductUpsertSchema,
  ErpWarehouseUpsertSchema,
  ErpSupplierUpsertSchema,
  ErpMovementCreateSchema,
  ErpPurchaseOrderUpsertSchema,
  ErpSalesOrderUpsertSchema,
} from "@windels/shared/erp";

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => {
  fake.store.clear();
});

async function seedOrgA() {
  const wh = await ErpService.createWarehouse(ORG_A, { name: "Main", code: "WH1", isDefault: true }, null);
  const laptop = await ErpService.createProduct(ORG_A, {
    sku: "LAP-1", name: "Laptop", category: "Hardware", priceCents: 1_000_000, costCents: 700_000, reorderLevel: 3,
  }, null);
  const chair = await ErpService.createProduct(ORG_A, {
    sku: "CHAIR-1", name: "Chair", category: "Furniture", priceCents: 200_000, costCents: 100_000, reorderLevel: 5,
  }, null);
  const supplier = await ErpService.createSupplier(ORG_A, { name: "TechSource", leadTimeDays: 7 }, null);
  return { wh, laptop, chair, supplier };
}

describe("ERP — products, warehouses, suppliers (org-scoped)", () => {
  it("creates, lists with filters, updates and deletes a product; enforces unique SKU", async () => {
    const p = await ErpService.createProduct(ORG_A, { sku: "SKU-1", name: "Widget", priceCents: 100, costCents: 50 }, null);
    expect(p.id).toMatch(/^erpp-/);
    expect(p.unit).toBe("each");
    expect(p.isActive).toBe(true);

    await expect(ErpService.createProduct(ORG_A, { sku: "SKU-1", name: "Duplicate", priceCents: 1, costCents: 1 }, null))
      .rejects.toThrow("SKU_ALREADY_EXISTS");

    expect(await ErpService.listProducts(ORG_A, { q: "widget" })).toHaveLength(1);
    const updated = await ErpService.updateProduct(ORG_A, p.id, { priceCents: 150 }, null);
    expect(updated?.priceCents).toBe(150);
    expect(await ErpService.deleteProduct(ORG_A, p.id)).toBe(true);
    expect(await ErpService.getProduct(ORG_A, p.id)).toBeNull();
  });

  it("rejects a zero-quantity movement and unknown product/warehouse", async () => {
    const { wh, laptop } = await seedOrgA();
    await expect(ErpService.createMovement(ORG_A, { productId: laptop.id, warehouseId: wh.id, kind: "adjustment", quantity: 0 }, null))
      .rejects.toThrow("ZERO_QUANTITY");
    await expect(ErpService.createMovement(ORG_A, { productId: "nope", warehouseId: wh.id, kind: "initial", quantity: 1 }, null))
      .rejects.toThrow("PRODUCT_NOT_FOUND");
  });
});

describe("ERP — movements ledger is the source of truth for stock", () => {
  it("computes stock on hand from the sum of movements (never stored)", async () => {
    const { wh, laptop } = await seedOrgA();
    await ErpService.createMovement(ORG_A, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 10, note: "Opening" }, null);
    await ErpService.createMovement(ORG_A, { productId: laptop.id, warehouseId: wh.id, kind: "sale", quantity: -3 }, null);
    await ErpService.createMovement(ORG_A, { productId: laptop.id, warehouseId: wh.id, kind: "receipt", quantity: 5 }, null);

    const stock = await ErpService.currentStock(ORG_A);
    const row = stock.find((r) => r.productId === laptop.id);
    expect(row?.quantity).toBe(12); // 10 - 3 + 5
    expect(row?.costCents).toBe(700_000);
    expect(row?.warehouseName).toBe("Main");
  });

  it("lists movements with filters", async () => {
    const { wh, laptop, chair } = await seedOrgA();
    await ErpService.createMovement(ORG_A, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 1 }, null);
    await ErpService.createMovement(ORG_A, { productId: chair.id, warehouseId: wh.id, kind: "initial", quantity: 2 }, null);

    expect(await ErpService.listMovements(ORG_A, { productId: laptop.id })).toHaveLength(1);
    expect(await ErpService.listMovements(ORG_A, { kind: "initial" })).toHaveLength(2);
    expect(await ErpService.listMovements(ORG_A, { kind: "sale" })).toHaveLength(0);
  });
});

describe("ERP — purchase order lifecycle", () => {
  it("receive creates real receipt movements and stamps receivedAt", async () => {
    const { wh, laptop, supplier } = await seedOrgA();
    const po = await ErpService.createPurchaseOrder(ORG_A, {
      supplierId: supplier.id, status: "submitted",
      items: [{ productId: laptop.id, qty: 4, unitPriceCents: 650_000 }],
    }, null);
    expect(po.totalCents).toBe(2_600_000);
    expect(po.receivedAt).toBeNull();

    const received = await ErpService.receivePurchaseOrder(ORG_A, po.id, null);
    expect(received?.status).toBe("received");
    expect(received?.receivedAt).toBeTruthy();

    // Stock reflects the receipt through the ledger.
    const row = (await ErpService.currentStock(ORG_A)).find((r) => r.productId === laptop.id);
    expect(row?.quantity).toBe(4);
    const movements = await ErpService.listMovements(ORG_A, { kind: "receipt" });
    expect(movements).toHaveLength(1);
    expect(movements[0].reference).toBe(po.id);

    // Receiving again is a no-op (idempotent).
    await ErpService.receivePurchaseOrder(ORG_A, po.id, null);
    expect(await ErpService.listMovements(ORG_A, { kind: "receipt" })).toHaveLength(1);
  });

  it("rejects updates to a closed PO and refuses to receive a cancelled one", async () => {
    const { laptop, supplier } = await seedOrgA();
    const po = await ErpService.createPurchaseOrder(ORG_A, {
      supplierId: supplier.id, items: [{ productId: laptop.id, qty: 1, unitPriceCents: 100 }],
    }, null);
    await ErpService.updatePurchaseOrder(ORG_A, po.id, { status: "cancelled" }, null);
    await expect(ErpService.updatePurchaseOrder(ORG_A, po.id, { note: "nope" }, null)).rejects.toThrow("PO_CLOSED");
    await expect(ErpService.receivePurchaseOrder(ORG_A, po.id, null)).rejects.toThrow("PO_CANCELLED");
  });
});

describe("ERP — sales order lifecycle", () => {
  it("fulfill creates real sale movements and stamps fulfilledAt", async () => {
    const { wh, laptop } = await seedOrgA();
    await ErpService.createMovement(ORG_A, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 10 }, null);
    const so = await ErpService.createSalesOrder(ORG_A, {
      status: "confirmed", items: [{ productId: laptop.id, qty: 3, unitPriceCents: 900_000 }],
    }, null);
    expect(so.totalCents).toBe(2_700_000);

    const fulfilled = await ErpService.fulfillSalesOrder(ORG_A, so.id, null);
    expect(fulfilled?.status).toBe("fulfilled");
    expect(fulfilled?.fulfilledAt).toBeTruthy();

    const row = (await ErpService.currentStock(ORG_A)).find((r) => r.productId === laptop.id);
    expect(row?.quantity).toBe(7);
    const sales = await ErpService.listMovements(ORG_A, { kind: "sale" });
    expect(sales).toHaveLength(1);
    expect(sales[0].quantity).toBe(-3);
  });
});

describe("ERP — CRM hook (won deal → sales order)", () => {
  it("creates an SO linked to the deal's company; never fabricates a product line", async () => {
    const { CrmService } = await import("../crm/crm.service.js");
    const co = await CrmService.createCompany(ORG_A, { name: "Acme", industry: "Software" }, null);
    // A deal with no matching product.
    const deal = await CrmService.createDeal(ORG_A, {
      name: "Acme consulting engagement", companyId: co.id, amountCents: 5_000_000, stage: "closed_won",
    }, null);

    const res = await ErpService.createSalesOrderFromDeal(ORG_A, deal.id, null);
    expect(res).not.toBeNull();
    expect(res!.matchedProduct).toBe(false);
    expect(res!.order.customerCompanyId).toBe(co.id);
    expect(res!.order.status).toBe("confirmed");
    // Honest: no fake line item; the deal amount is in the note, not an order line.
    expect(res!.order.items).toHaveLength(0);
    expect(res!.order.totalCents).toBe(0);
    expect(res!.order.note).toContain("5000000");
  });

  it("matches a product by name when one exists", async () => {
    const { CrmService } = await import("../crm/crm.service.js");
    const co = await CrmService.createCompany(ORG_A, { name: "Acme" }, null);
    const laptop = await ErpService.createProduct(ORG_A, { sku: "LAP-1", name: "Laptop", priceCents: 1_000_000, costCents: 700_000 }, null);
    const deal = await CrmService.createDeal(ORG_A, {
      name: "Laptop purchase", companyId: co.id, amountCents: 2_000_000, stage: "closed_won",
    }, null);

    const res = await ErpService.createSalesOrderFromDeal(ORG_A, deal.id, null);
    expect(res!.matchedProduct).toBe(true);
    expect(res!.order.items).toHaveLength(1);
    expect(res!.order.items[0].productId).toBe(laptop.id);
  });
});

describe("ERP — rollup (deterministic, honest)", () => {
  it("computes counts, inventory value, low stock and totals from stored records", async () => {
    const { wh, laptop, chair, supplier } = await seedOrgA();
    await ErpService.createMovement(ORG_A, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 10 }, null);
    await ErpService.createMovement(ORG_A, { productId: chair.id, warehouseId: wh.id, kind: "initial", quantity: 2 }, null);
    const po = await ErpService.createPurchaseOrder(ORG_A, {
      supplierId: supplier.id, status: "submitted",
      items: [{ productId: laptop.id, qty: 5, unitPriceCents: 650_000 }],
    }, null);
    await ErpService.createSalesOrder(ORG_A, {
      status: "confirmed", items: [{ productId: chair.id, qty: 2, unitPriceCents: 200_000 }],
    }, null);

    const r1 = await ErpService.rollup(ORG_A);
    const r2 = await ErpService.rollup(ORG_A);
    expect(r2).toEqual(r1); // deterministic

    expect(r1.counts.products).toBe(2);
    expect(r1.counts.activeProducts).toBe(2);
    expect(r1.counts.warehouses).toBe(1);
    expect(r1.counts.suppliers).toBe(1);
    expect(r1.counts.movements).toBe(2);
    expect(r1.counts.purchaseOrders.submitted).toBe(1);
    expect(r1.counts.salesOrders.confirmed).toBe(1);

    // Inventory value = 10 × 700000 + 2 × 100000
    expect(r1.inventoryValueCents).toBe(7_000_000 + 200_000);
    expect(r1.stockValueByWarehouse[0].valueCents).toBe(7_200_000);

    // Chair stock (2) < reorder (5) → low stock.
    const low = r1.lowStock.find((l) => l.sku === "CHAIR-1");
    expect(low?.stockOnHand).toBe(2);
    expect(low?.reorderLevel).toBe(5);

    expect(r1.purchaseOrderTotalsCents).toBe(po.totalCents);
    expect(r1.salesOrderTotalsCents).toBe(400_000);
    expect(r1.recentMovements).toHaveLength(2);
    expect(r1.lastUpdatedAt).toBeTruthy();
  });

  it("returns an honest empty rollup for a fresh org", async () => {
    const r = await ErpService.rollup(ORG_B);
    expect(r.counts.products).toBe(0);
    expect(r.inventoryValueCents).toBe(0);
    expect(r.lowStock).toEqual([]);
    expect(r.purchaseOrderTotalsCents).toBe(0);
    expect(r.salesOrderTotalsCents).toBe(0);
    expect(r.lastUpdatedAt).toBeNull();
  });
});

describe("ERP — cross-tenant isolation (fail-closed)", () => {
  it("org B cannot read org A products, stock, orders or suppliers", async () => {
    const { wh, laptop, supplier } = await seedOrgA();
    await ErpService.createMovement(ORG_A, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 5 }, null);
    const po = await ErpService.createPurchaseOrder(ORG_A, {
      supplierId: supplier.id, items: [{ productId: laptop.id, qty: 1, unitPriceCents: 100 }],
    }, null);
    const so = await ErpService.createSalesOrder(ORG_A, {
      items: [{ productId: laptop.id, qty: 1, unitPriceCents: 100 }],
    }, null);

    expect(await ErpService.listProducts(ORG_B)).toHaveLength(0);
    expect(await ErpService.getProduct(ORG_B, laptop.id)).toBeNull();
    expect(await ErpService.currentStock(ORG_B)).toHaveLength(0);
    expect(await ErpService.listPurchaseOrders(ORG_B)).toHaveLength(0);
    expect(await ErpService.getPurchaseOrder(ORG_B, po.id)).toBeNull();
    expect(await ErpService.listSalesOrders(ORG_B)).toHaveLength(0);
    expect(await ErpService.getSalesOrder(ORG_B, so.id)).toBeNull();
    expect(await ErpService.listSuppliers(ORG_B)).toHaveLength(0);
    expect(await ErpService.rollup(ORG_B).then((r) => r.counts.products)).toBe(0);

    // Org A data intact.
    expect((await ErpService.currentStock(ORG_A)).find((r) => r.productId === laptop.id)?.quantity).toBe(5);
  });
});

describe("ERP — demo seed is idempotent", () => {
  it("seeds the demo org once and skips on the second call", async () => {
    expect(await ErpService.ensureDemoSeed()).toBe(true);
    const r = await ErpService.rollup("org-demo-erp");
    expect(r.counts.products).toBe(4);
    expect(r.counts.warehouses).toBe(1);
    expect(r.counts.suppliers).toBe(2);
    expect(r.counts.movements).toBeGreaterThan(0);
    expect(r.counts.purchaseOrders.submitted).toBe(1);
    expect(r.counts.salesOrders.confirmed).toBe(1);

    expect(await ErpService.ensureDemoSeed()).toBe(false);
    expect((await ErpService.rollup("org-demo-erp")).counts.products).toBe(4);
  });
});

describe("ERP — shared input contracts", () => {
  it("validates product input", () => {
    expect(ErpProductUpsertSchema.safeParse({ sku: "", name: "X", priceCents: 1, costCents: 1 }).success).toBe(false);
    expect(ErpProductUpsertSchema.safeParse({ sku: "A", name: "X", priceCents: -1, costCents: 1 }).success).toBe(false);
    expect(ErpProductUpsertSchema.safeParse({ sku: "A", name: "X", priceCents: 1, costCents: 1 }).success).toBe(true);
  });

  it("validates movement input", () => {
    expect(ErpMovementCreateSchema.safeParse({ productId: "p", warehouseId: "w", kind: "bogus", quantity: 1 }).success).toBe(false);
    expect(ErpMovementCreateSchema.safeParse({ productId: "p", warehouseId: "w", kind: "receipt", quantity: 1 }).success).toBe(true);
  });

  it("validates supplier and warehouse input", () => {
    expect(ErpSupplierUpsertSchema.safeParse({ name: "" }).success).toBe(false);
    expect(ErpSupplierUpsertSchema.safeParse({ name: "S" }).success).toBe(true);
    expect(ErpWarehouseUpsertSchema.safeParse({ name: "W", code: "" }).success).toBe(false);
    expect(ErpWarehouseUpsertSchema.safeParse({ name: "W", code: "WH1" }).success).toBe(true);
  });

  it("validates purchase and sales order input", () => {
    expect(ErpPurchaseOrderUpsertSchema.safeParse({ supplierId: "s", items: [] }).success).toBe(false); // PO needs ≥1 line
    expect(ErpPurchaseOrderUpsertSchema.safeParse({ supplierId: "s", items: [{ productId: "p", qty: 1, unitPriceCents: 10 }] }).success).toBe(true);
    expect(ErpSalesOrderUpsertSchema.safeParse({ items: [{ productId: "p", qty: 1, unitPriceCents: 10 }] }).success).toBe(true);
    expect(ErpSalesOrderUpsertSchema.safeParse({ items: [] }).success).toBe(true); // SO may be empty (CRM hook)
  });
});
