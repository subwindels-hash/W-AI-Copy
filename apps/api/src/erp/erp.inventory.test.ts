/**
 * Session 200 — deeper ERP inventory/ledger coverage.
 *
 * The Session-92 suite covers CRUD + PO/SO happy paths + the CRM hook. This
 * suite hardens the stock-ledger invariants and guard rails that the ledger
 * (the single source of truth for stock) depends on:
 *   - movement validation (zero qty, unknown product/warehouse)
 *   - currentStock aggregation across many movements & warehouses
 *   - the ledger honestly allows overselling to a negative balance (it records
 *     reality; it does not silently clamp)
 *   - SO fulfill idempotency + cancelled guard
 *   - low-stock filter / rollup low-stock + inventory value math
 *   - defaultWarehouse NO_WAREHOUSE
 *   - cross-tenant stock isolation
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
      return entries.slice(start, stop === -1 ? undefined : stop + 1).map(([m]) => m);
    }
    async zrem(key: string, member: string) {
      const map = this.store.get(key);
      if (map instanceof Map) return map.delete(member) ? 1 : 0;
      return 0;
    }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({ redisCmd: fake }));

import { ErpService } from "./erp.service.js";

const ORG = "org-inv";

beforeEach(() => { fake.store.clear(); });

async function seed() {
  const wh = await ErpService.createWarehouse(ORG, { name: "Main", code: "WH1", isDefault: true }, null);
  const wh2 = await ErpService.createWarehouse(ORG, { name: "East", code: "WH2" }, null);
  const laptop = await ErpService.createProduct(ORG, {
    sku: "LAP-1", name: "Laptop", category: "Hardware", priceCents: 1_000_000, costCents: 700_000, reorderLevel: 3,
  }, null);
  const chair = await ErpService.createProduct(ORG, {
    sku: "CHAIR-1", name: "Chair", category: "Furniture", priceCents: 200_000, costCents: 100_000, reorderLevel: 5,
  }, null);
  return { wh, wh2, laptop, chair };
}

describe("movement validation", () => {
  it("rejects a zero-quantity movement", async () => {
    const { wh, laptop } = await seed();
    await expect(ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 0 }, null))
      .rejects.toThrow("ZERO_QUANTITY");
  });
  it("rejects a movement for an unknown product or warehouse", async () => {
    const { wh, laptop } = await seed();
    await expect(ErpService.createMovement(ORG, { productId: "nope", warehouseId: wh.id, kind: "initial", quantity: 1 }, null))
      .rejects.toThrow("PRODUCT_NOT_FOUND");
    await expect(ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: "nope", kind: "initial", quantity: 1 }, null))
      .rejects.toThrow("WAREHOUSE_NOT_FOUND");
  });
  it("defaults unitCostCents to the product cost when omitted", async () => {
    const { wh, laptop } = await seed();
    const m = await ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 5 }, null);
    expect(m.unitCostCents).toBe(700_000);
  });
});

describe("currentStock — ledger aggregation", () => {
  it("sums positive and negative movements per product+warehouse", async () => {
    const { wh, laptop } = await seed();
    await ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 10 }, null);
    await ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh.id, kind: "sale", quantity: -4 }, null);
    await ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh.id, kind: "adjustment", quantity: 2 }, null);
    const row = (await ErpService.currentStock(ORG)).find((r) => r.productId === laptop.id);
    expect(row?.quantity).toBe(8);
  });

  it("keeps stock separate per warehouse", async () => {
    const { wh, wh2, laptop } = await seed();
    await ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 6 }, null);
    await ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh2.id, kind: "initial", quantity: 9 }, null);
    const rows = (await ErpService.currentStock(ORG)).filter((r) => r.productId === laptop.id);
    const byWh = Object.fromEntries(rows.map((r) => [r.warehouseId, r.quantity]));
    expect(byWh[wh.id]).toBe(6);
    expect(byWh[wh2.id]).toBe(9);
  });

  it("honestly records a negative balance when oversold (does not silently clamp)", async () => {
    const { wh, laptop } = await seed();
    await ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 2 }, null);
    await ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh.id, kind: "sale", quantity: -5 }, null);
    const row = (await ErpService.currentStock(ORG)).find((r) => r.productId === laptop.id);
    expect(row?.quantity).toBe(-3);
  });
});

describe("sales order fulfillment guards", () => {
  it("is idempotent — fulfilling twice creates only one sale movement", async () => {
    const { wh, laptop } = await seed();
    await ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 10 }, null);
    const so = await ErpService.createSalesOrder(ORG, { status: "confirmed", items: [{ productId: laptop.id, qty: 3, unitPriceCents: 900_000 }], orderDate: "2026-01-01" }, null);
    await ErpService.fulfillSalesOrder(ORG, so.id, null);
    await ErpService.fulfillSalesOrder(ORG, so.id, null);
    expect(await ErpService.listMovements(ORG, { kind: "sale" })).toHaveLength(1);
    const row = (await ErpService.currentStock(ORG)).find((r) => r.productId === laptop.id);
    expect(row?.quantity).toBe(7);
  });

  it("refuses to fulfill a cancelled SO", async () => {
    const { wh, laptop } = await seed();
    await ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 10 }, null);
    const so = await ErpService.createSalesOrder(ORG, { status: "confirmed", items: [{ productId: laptop.id, qty: 1, unitPriceCents: 100 }], orderDate: "2026-01-01" }, null);
    await ErpService.updateSalesOrder(ORG, so.id, { status: "cancelled" }, null);
    await expect(ErpService.fulfillSalesOrder(ORG, so.id, null)).rejects.toThrow("SO_CANCELLED");
  });

  it("returns null when fulfilling an unknown SO", async () => {
    expect(await ErpService.fulfillSalesOrder(ORG, "nope", null)).toBeNull();
  });
});

describe("low-stock detection", () => {
  it("listProducts lowStock filter returns only products below reorder level", async () => {
    const { wh, laptop, chair } = await seed();
    // laptop reorder 3 -> stock 1 (low); chair reorder 5 -> stock 8 (ok)
    await ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 1 }, null);
    await ErpService.createMovement(ORG, { productId: chair.id, warehouseId: wh.id, kind: "initial", quantity: 8 }, null);
    const low = await ErpService.listProducts(ORG, { lowStock: true });
    expect(low.map((p) => p.id)).toContain(laptop.id);
    expect(low.map((p) => p.id)).not.toContain(chair.id);
  });

  it("rollup reports inventory value and low-stock items", async () => {
    const { wh, laptop, chair } = await seed();
    await ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 2 }, null); // low (reorder 3)
    await ErpService.createMovement(ORG, { productId: chair.id, warehouseId: wh.id, kind: "initial", quantity: 10 }, null);
    const r = await ErpService.rollup(ORG);
    // inventory value = 2*700000 + 10*100000 = 2_400_000
    expect(r.inventoryValueCents).toBe(2 * 700_000 + 10 * 100_000);
    expect(r.lowStock.some((l) => l.productId === laptop.id)).toBe(true);
    expect(r.lowStock.some((l) => l.productId === chair.id)).toBe(false);
    expect(r.counts.warehouses).toBe(2);
  });

  it("rollup on an empty org is zeroed and valid", async () => {
    const r = await ErpService.rollup(ORG);
    expect(r.inventoryValueCents).toBe(0);
    expect(r.lowStock).toEqual([]);
    expect(r.counts.products).toBe(0);
    expect(r.lastUpdatedAt).toBeNull();
  });
});

describe("default warehouse", () => {
  it("throws NO_WAREHOUSE when the org has none", async () => {
    await expect(ErpService.defaultWarehouse(ORG)).rejects.toThrow("NO_WAREHOUSE");
  });
  it("prefers the flagged default over the first created", async () => {
    await ErpService.createWarehouse(ORG, { name: "First", code: "W1" }, null);
    const def = await ErpService.createWarehouse(ORG, { name: "Flagged", code: "W2", isDefault: true }, null);
    expect((await ErpService.defaultWarehouse(ORG)).id).toBe(def.id);
  });
});

describe("cross-tenant stock isolation", () => {
  it("does not surface another org's movements or stock", async () => {
    const { wh, laptop } = await seed();
    await ErpService.createMovement(ORG, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 5 }, null);
    expect(await ErpService.currentStock("org-other")).toEqual([]);
    expect(await ErpService.listMovements("org-other")).toEqual([]);
  });
});
