import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/redis.js", () => {
  const store = new Map<string,string>();
  const sets = new Map<string, Set<string>>();
  return {
    redisCmd: {
      async get(k:string){ return store.get(k) ?? null; },
      async set(k:string, v:string, ..._a:any[]){ store.set(k,v); return "OK"; },
      async del(k:string){ store.delete(k); return 1; },
      async sadd(k:string, m:string){ let s=sets.get(k); if(!s){ s=new Set(); sets.set(k,s);} s.add(m); return 1; },
      async smembers(k:string){ return [...(sets.get(k) ?? [])]; },
      async srem(k:string, m:string){ const s=sets.get(k); if(s) s.delete(m); return 1; },
      async keys(pat:string){ const rx=new RegExp("^"+pat.replace(/\*/g,".*")+"$"); return [...store.keys()].filter(k=> rx.test(k)); },
    }
  };
});

const { commerceService } = await import("./commerce.service.js");
const ORG_A = "org-commerce-a";
const ORG_B = "org-commerce-b";
const USER_A = "user-commerce-a";
const USER_B = "user-commerce-b";

/** Seed a real catalog product so the item can be priced. */
async function seedProduct(org: string, id: string, priceCents: number) {
  return commerceService.upsertProduct(org, {
    id, name: `Product ${id}`, priceCents, currency: "USD",
    stockQuantity: 100, isActive: true,
  } as any);
}

beforeEach(async()=>{
  // clear via clearing cart + not needed; redis is fresh per mock? mock persists across tests but we clear carts
  await commerceService.clearCart(USER_A, ORG_A);
  await commerceService.clearCart(USER_B, ORG_B);
  // clear products caches not needed
});

describe("commerce", ()=>{
  it("cart is org-scoped", async()=>{
    await seedProduct(ORG_A, "cabc123456789012345678901", 100);
    await commerceService.addToCart(USER_A, ORG_A, { productId: "cabc123456789012345678901", quantity: 2 });
    const cartA = await commerceService.getCart(USER_A, ORG_A);
    expect(cartA.items).toHaveLength(1);
    const cartB = await commerceService.getCart(USER_A, ORG_B);
    expect(cartB.items).toHaveLength(0);
    expect(cartB.organizationId).toBe(ORG_B);
    // verify cross-org not leaked
    await commerceService.clearCart(USER_A, ORG_A);
  });
  it("add increments quantity", async()=>{
    const pid="cabc123456789012345678902";
    await seedProduct(ORG_A, pid, 100);
    await commerceService.addToCart(USER_A, ORG_A, { productId: pid, quantity: 1 });
    await seedProduct(ORG_A, pid, 100);
    await commerceService.addToCart(USER_A, ORG_A, { productId: pid, quantity: 2 });
    const c = await commerceService.getCart(USER_A, ORG_A);
    expect(c.items.find(i=> i.productId===pid)?.quantity).toBe(3);
    await commerceService.clearCart(USER_A, ORG_A);
  });
  it("update and remove", async()=>{
    const pid="cabc123456789012345678903";
    await seedProduct(ORG_A, pid, 100);
    await commerceService.addToCart(USER_A, ORG_A, { productId: pid, quantity: 5 });
    await commerceService.updateCartItem(USER_A, ORG_A, pid, 2);
    let c = await commerceService.getCart(USER_A, ORG_A);
    expect(c.items[0].quantity).toBe(2);
    await commerceService.removeFromCart(USER_A, ORG_A, pid);
    c = await commerceService.getCart(USER_A, ORG_A);
    expect(c.items).toHaveLength(0);
  });
  it("update missing throws", async()=>{
    await expect(commerceService.updateCartItem(USER_A, ORG_A, "cabc123456789012345678904", 1)).rejects.toThrow(/not in cart/i);
  });
  it("clear empties", async()=>{
    await seedProduct(ORG_A, "cabc123456789012345678905", 100);
    await commerceService.addToCart(USER_A, ORG_A, { productId:"cabc123456789012345678905", quantity:1});
    await commerceService.clearCart(USER_A, ORG_A);
    const c = await commerceService.getCart(USER_A, ORG_A);
    expect(c.items).toHaveLength(0);
  });
  it("checkout empty fails", async()=>{
    await commerceService.clearCart(USER_A, ORG_A);
    await expect(commerceService.createOrder(USER_A, ORG_A, {street:"a"})).rejects.toThrow(/empty/i);
  });
  it("checkout creates order and clears cart", async()=>{
    const pid="cabc123456789012345678906";
    await seedProduct(ORG_A, pid, 100);
    await commerceService.addToCart(USER_A, ORG_A, { productId: pid, quantity: 3});
    const order = await commerceService.createOrder(USER_A, ORG_A, {street:"123"}, {street:"123"});
    expect(order.items).toHaveLength(1);
    expect(order.totalCents).toBe(300);
    expect(order.status).toBe("pending");
    const cart = await commerceService.getCart(USER_A, ORG_A);
    expect(cart.items).toHaveLength(0);
  });
  it("orders org isolation", async()=>{
    const pid="cabc123456789012345678907";
    await commerceService.clearCart(USER_A, ORG_A);
    await commerceService.clearCart(USER_B, ORG_B);
    await seedProduct(ORG_A, pid, 100);
    await commerceService.addToCart(USER_A, ORG_A, { productId: pid, quantity:1});
    await commerceService.createOrder(USER_A, ORG_A, {street:"a"});
    await seedProduct(ORG_B, pid, 100);
    await commerceService.addToCart(USER_B, ORG_B, { productId: pid, quantity:1});
    await commerceService.createOrder(USER_B, ORG_B, {street:"b"});
    const aOrders = await commerceService.getOrders(USER_A, ORG_A);
    const bOrders = await commerceService.getOrders(USER_B, ORG_B);
    expect(aOrders.orders.every(o=> o.organizationId===ORG_A)).toBe(true);
    expect(bOrders.orders.every(o=> o.organizationId===ORG_B)).toBe(true);
    expect(aOrders.orders.find(o=> o.organizationId===ORG_B)).toBeUndefined();
  });
  it("getOrder org check", async()=>{
    const pid="cabc123456789012345678908";
    await commerceService.clearCart(USER_A, ORG_A);
    await seedProduct(ORG_A, pid, 100);
    await commerceService.addToCart(USER_A, ORG_A, { productId: pid, quantity:1});
    const order = await commerceService.createOrder(USER_A, ORG_A, {street:"x"});
    const found = await commerceService.getOrder(USER_A, ORG_A, order.id);
    expect(found?.id).toBe(order.id);
    const notFound = await commerceService.getOrder(USER_B, ORG_B, order.id);
    expect(notFound).toBeNull();
  });
  it("updateOrderStatus", async()=>{
    const pid="cabc123456789012345678909";
    await commerceService.clearCart(USER_A, ORG_A);
    await seedProduct(ORG_A, pid, 100);
    await commerceService.addToCart(USER_A, ORG_A, { productId: pid, quantity:1});
    const order = await commerceService.createOrder(USER_A, ORG_A, {street:"x"});
    const upd = await commerceService.updateOrderStatus(USER_A, ORG_A, order.id, "confirmed");
    expect(upd.status).toBe("confirmed");
  });
  it("dashboard null avg when no orders", async()=>{
    const d = await commerceService.getDashboard("org-empty-dashboard-"+Date.now());
    expect(d.totalOrders).toBe(0);
    expect(d.avgOrderValueCents).toBeNull();
  });
  it("dashboard computes totals", async()=>{
    const org = "org-dashboard-"+Date.now();
    const user = "user-dashboard-"+Date.now();
    await seedProduct(org, "cabc123456789012345678910", 100);
    await commerceService.addToCart(user, org, { productId:"cabc123456789012345678910", quantity:2});
    await commerceService.createOrder(user, org, {street:"a"});
    await seedProduct(org, "cabc123456789012345678911", 100);
    await commerceService.addToCart(user, org, { productId:"cabc123456789012345678911", quantity:1});
    await commerceService.createOrder(user, org, {street:"a"});
    const d = await commerceService.getDashboard(org);
    expect(d.totalOrders).toBe(2);
    expect(d.totalRevenueCents).toBe(300);
    expect(d.avgOrderValueCents).toBe(150);
  });
  it("products returns empty honest for an org with no catalog", async()=>{
    const res = await commerceService.getProducts("org-no-catalog-"+Date.now());
    expect(res.products).toEqual([]);
    expect(res.total).toBe(0);
  });
  it("getProduct returns null honest", async()=>{
    const p = await commerceService.getProduct(ORG_A, "missing");
    expect(p).toBeNull();
  });

  // ── Fail-closed pricing (regression) ──────────────────────────────
  // The module used to fall back to PLACEHOLDER_UNIT_PRICE = 100 for any
  // product missing from the catalog. Nothing ever wrote the catalog, so every
  // order in the system was silently billed at 100/unit. Pricing must now fail
  // rather than invent a number.
  it("addToCart refuses a product that is not in the catalog", async()=>{
    const org = "org-failclosed-"+Date.now();
    await expect(
      commerceService.addToCart("user-fc", org, { productId: "not-in-catalog", quantity: 1 }),
    ).rejects.toThrow(/not in the catalog/i);
  });

  it("checkout refuses when a cart item has no catalog price", async()=>{
    const org = "org-failclosed2-"+Date.now();
    const user = "user-fc2";
    const pid = "cabc999999999999999999901";
    await seedProduct(org, pid, 250);
    await commerceService.addToCart(user, org, { productId: pid, quantity: 2 });
    // Product is delisted after it entered the cart.
    await commerceService.deleteProduct(org, pid);
    await expect(
      commerceService.createOrder(user, org, { street: "x" }),
    ).rejects.toThrow(/not in the catalog/i);
  });

  it("prices orders from the real catalog price, not a constant", async()=>{
    const org = "org-realprice-"+Date.now();
    const user = "user-realprice";
    const pid = "cabc999999999999999999902";
    await seedProduct(org, pid, 3750); // $37.50
    await commerceService.addToCart(user, org, { productId: pid, quantity: 4 });
    const order = await commerceService.createOrder(user, org, { street: "x" });
    expect(order.items[0].unitPriceCents).toBe(3750);
    expect(order.totalCents).toBe(15000); // $150.00
    expect(order.items[0].name).toBe(`Product ${pid}`);
  });

  it("upsertProduct rejects a negative price", async()=>{
    await expect(
      commerceService.upsertProduct("org-badprice", { id: "p1", name: "P", priceCents: -1, currency: "USD", stockQuantity: 0, isActive: true } as any),
    ).rejects.toThrow(/non-negative integer/i);
  });

  // ── Integer minor units (regression) ──────────────────────────────
  // The console rendered `price / 100` while the service stored a bare number
  // and the schema accepted decimals, so a product created at 9.99 displayed
  // as "$0.0999". Money is now integer cents end to end.
  it("rejects a fractional price", async()=>{
    await expect(
      commerceService.upsertProduct("org-frac", { id: "p-frac", name: "P", priceCents: 9.99, currency: "USD", stockQuantity: 1, isActive: true } as any),
    ).rejects.toThrow(/non-negative integer/i);
  });

  it("checkout refuses a catalog record carrying a fractional price", async()=>{
    const org = "org-frac2-"+Date.now();
    const user = "user-frac2";
    const pid = "cabc999999999999999999903";
    await seedProduct(org, pid, 500);
    await commerceService.addToCart(user, org, { productId: pid, quantity: 1 });
    // Corrupt the stored record behind the service's back (e.g. a bad import).
    const { redisCmd } = await import("../db/redis.js");
    await (redisCmd as any).set(`commerce:product:${org}:${pid}`, JSON.stringify({
      id: pid, name: "P", priceCents: 12.5, currency: "USD", stockQuantity: 1, isActive: true,
    }));
    await expect(commerceService.createOrder(user, org, { street: "x" })).rejects.toThrow(/non-negative integer/i);
  });

  it("totals stay exact integers across quantities that would drift as floats", async()=>{
    const org = "org-exact-"+Date.now();
    const user = "user-exact";
    const pid = "cabc999999999999999999904";
    await seedProduct(org, pid, 10); // $0.10 — the classic 0.1 float trap
    await commerceService.addToCart(user, org, { productId: pid, quantity: 3 });
    const cart = await commerceService.getCart(user, org);
    expect(cart.subtotalCents).toBe(30);
    expect(Number.isInteger(cart.subtotalCents)).toBe(true);
    const order = await commerceService.createOrder(user, org, { street: "x" });
    expect(order.totalCents).toBe(30);
  });

  it("catalog is org-scoped and listable", async()=>{
    const org = "org-catalog-"+Date.now();
    await seedProduct(org, "p-alpha", 10);
    await seedProduct(org, "p-beta", 20);
    const res = await commerceService.getProducts(org);
    expect(res.total).toBe(2);
    expect(res.products.map((p:any)=> p.id).sort()).toEqual(["p-alpha","p-beta"]);
    const other = await commerceService.getProducts("org-catalog-other-"+Date.now());
    expect(other.total).toBe(0);
  });
});
