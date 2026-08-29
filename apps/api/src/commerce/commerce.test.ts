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
      async keys(pat:string){ const rx=new RegExp("^"+pat.replace(/\*/g,".*")+"$"); return [...store.keys()].filter(k=> rx.test(k)); },
    }
  };
});

const { commerceService } = await import("./commerce.service.js");
const ORG_A = "org-commerce-a";
const ORG_B = "org-commerce-b";
const USER_A = "user-commerce-a";
const USER_B = "user-commerce-b";

beforeEach(async()=>{
  // clear via clearing cart + not needed; redis is fresh per mock? mock persists across tests but we clear carts
  await commerceService.clearCart(USER_A, ORG_A);
  await commerceService.clearCart(USER_B, ORG_B);
  // clear products caches not needed
});

describe("commerce", ()=>{
  it("cart is org-scoped", async()=>{
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
    await commerceService.addToCart(USER_A, ORG_A, { productId: pid, quantity: 1 });
    await commerceService.addToCart(USER_A, ORG_A, { productId: pid, quantity: 2 });
    const c = await commerceService.getCart(USER_A, ORG_A);
    expect(c.items.find(i=> i.productId===pid)?.quantity).toBe(3);
    await commerceService.clearCart(USER_A, ORG_A);
  });
  it("update and remove", async()=>{
    const pid="cabc123456789012345678903";
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
    await commerceService.addToCart(USER_A, ORG_A, { productId: pid, quantity: 3});
    const order = await commerceService.createOrder(USER_A, ORG_A, {street:"123"}, {street:"123"});
    expect(order.items).toHaveLength(1);
    expect(order.total).toBe(300);
    expect(order.status).toBe("pending");
    const cart = await commerceService.getCart(USER_A, ORG_A);
    expect(cart.items).toHaveLength(0);
  });
  it("orders org isolation", async()=>{
    const pid="cabc123456789012345678907";
    await commerceService.clearCart(USER_A, ORG_A);
    await commerceService.clearCart(USER_B, ORG_B);
    await commerceService.addToCart(USER_A, ORG_A, { productId: pid, quantity:1});
    await commerceService.createOrder(USER_A, ORG_A, {street:"a"});
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
    await commerceService.addToCart(USER_A, ORG_A, { productId: pid, quantity:1});
    const order = await commerceService.createOrder(USER_A, ORG_A, {street:"x"});
    const upd = await commerceService.updateOrderStatus(USER_A, ORG_A, order.id, "confirmed");
    expect(upd.status).toBe("confirmed");
  });
  it("dashboard null avg when no orders", async()=>{
    const d = await commerceService.getDashboard("org-empty-dashboard-"+Date.now());
    expect(d.totalOrders).toBe(0);
    expect(d.avgOrderValue).toBeNull();
  });
  it("dashboard computes totals", async()=>{
    const org = "org-dashboard-"+Date.now();
    const user = "user-dashboard-"+Date.now();
    await commerceService.addToCart(user, org, { productId:"cabc123456789012345678910", quantity:2});
    await commerceService.createOrder(user, org, {street:"a"});
    await commerceService.addToCart(user, org, { productId:"cabc123456789012345678911", quantity:1});
    await commerceService.createOrder(user, org, {street:"a"});
    const d = await commerceService.getDashboard(org);
    expect(d.totalOrders).toBe(2);
    expect(d.totalRevenue).toBe(300);
    expect(d.avgOrderValue).toBe(150);
  });
  it("products returns empty honest", async()=>{
    const res = await commerceService.getProducts(ORG_A);
    expect(res.products).toEqual([]);
    expect(res.total).toBe(0);
  });
  it("getProduct returns null honest", async()=>{
    const p = await commerceService.getProduct(ORG_A, "missing");
    expect(p).toBeNull();
  });
});
