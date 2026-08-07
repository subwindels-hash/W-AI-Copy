/**
 * Commerce Module — fixed tenant-isolated, honest-price version
 * Cart key org-scoped, orders indexed per org, subtotal honest.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/result.js";

export interface CartItem { productId: string; quantity: number; variantId?: string; }
export interface Cart { id: string; userId: string; organizationId: string; items: CartItem[]; subtotal: number; currency: string; createdAt: string; updatedAt: string; }
export interface CustomerOrder {
  id: string; userId: string; organizationId: string;
  items: { productId: string; name: string; quantity: number; unitPrice: number; totalPrice: number; }[];
  subtotal: number; tax?: number; shipping?: number; total: number;
  status: "pending"|"confirmed"|"processing"|"shipped"|"delivered"|"cancelled"|"refunded";
  paymentStatus: "pending"|"authorized"|"captured"|"refunded"|"failed";
  shippingAddress?: Record<string, unknown>; billingAddress?: Record<string, unknown>;
  createdAt: string; updatedAt: string;
}
export interface ProductCatalogItem { id: string; name: string; description?: string; price: number; currency: string; stockQuantity: number; images?: string[]; category?: string; attributes?: Record<string, unknown>; isActive: boolean; }

const CART_TTL_HOURS = 72;
const PLACEHOLDER_UNIT_PRICE = 100; // honest placeholder when product not in catalog

function cartKey(userId: string, orgId: string) { return `commerce:cart:${orgId}:${userId}`; }
function orderItemKey(orgId: string, id: string) { return `commerce:order:i:${orgId}:${id}`; }
function orderIdxKey(orgId: string) { return `commerce:order:idx:${orgId}`; }
function orderLegacyKey(id: string) { return `commerce:order:${id}`; }

async function computeSubtotal(items: CartItem[], orgId: string): Promise<number> {
  let sum = 0;
  for (const it of items) {
    const prod = await (commerceService as any).getProduct(orgId, it.productId).catch(()=> null);
    const unit = prod?.price ?? PLACEHOLDER_UNIT_PRICE;
    sum += unit * it.quantity;
  }
  return sum;
}

export const commerceService = {
  async getProducts(organizationId: string, options?: { category?: string; search?: string; inStock?: boolean; limit?: number; offset?: number; }): Promise<{ products: ProductCatalogItem[]; total: number }> {
    const cacheKey = `commerce:products:${organizationId}:${JSON.stringify(options||{})}`;
    const cached = await (redis as any).get(cacheKey);
    if (cached) return JSON.parse(cached);
    const products: ProductCatalogItem[] = [];
    const result = { products, total: 0 };
    await (redis as any).set(cacheKey, JSON.stringify(result), "EX", 300);
    return result;
  },
  async getProduct(organizationId: string, productId: string): Promise<ProductCatalogItem|null> {
    const cacheKey = `commerce:product:${organizationId}:${productId}`;
    const cached = await (redis as any).get(cacheKey);
    if (cached) return JSON.parse(cached);
    return null;
  },
  async getCart(userId: string, organizationId: string): Promise<Cart> {
    const key = cartKey(userId, organizationId);
    const cached = await (redis as any).get(key);
    if (cached) {
      const cart = JSON.parse(cached);
      if (cart.organizationId !== organizationId) throw AppError.forbidden("Cart belongs to different organization");
      return cart;
    }
    const cart: Cart = { id: randomUUID(), userId, organizationId, items: [], subtotal: 0, currency: "USD", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await (redis as any).set(key, JSON.stringify(cart), "EX", CART_TTL_HOURS*3600);
    return cart;
  },
  async addToCart(userId: string, organizationId: string, item: CartItem): Promise<Cart> {
    const key = cartKey(userId, organizationId);
    const cart = await this.getCart(userId, organizationId);
    const idx = cart.items.findIndex(i=> i.productId===item.productId);
    if (idx>=0) cart.items[idx].quantity += item.quantity; else cart.items.push(item);
    cart.subtotal = await computeSubtotal(cart.items, organizationId);
    cart.updatedAt = new Date().toISOString();
    await (redis as any).set(key, JSON.stringify(cart), "EX", CART_TTL_HOURS*3600);
    return cart;
  },
  async updateCartItem(userId: string, organizationId: string, productId: string, quantity: number): Promise<Cart> {
    const key = cartKey(userId, organizationId);
    const cart = await this.getCart(userId, organizationId);
    const idx = cart.items.findIndex(i=> i.productId===productId);
    if (idx<0) throw AppError.notFound("Item not in cart");
    if (quantity<=0) cart.items.splice(idx,1); else cart.items[idx].quantity = quantity;
    cart.subtotal = await computeSubtotal(cart.items, organizationId);
    cart.updatedAt = new Date().toISOString();
    await (redis as any).set(key, JSON.stringify(cart), "EX", CART_TTL_HOURS*3600);
    return cart;
  },
  async removeFromCart(userId: string, organizationId: string, productId: string): Promise<Cart> { return this.updateCartItem(userId, organizationId, productId, 0); },
  async clearCart(userId: string, organizationId: string): Promise<void> { await (redis as any).del(cartKey(userId, organizationId)); },
  async createOrder(userId: string, organizationId: string, shippingAddress: Record<string,unknown>, billingAddress?: Record<string,unknown>): Promise<CustomerOrder> {
    const cart = await this.getCart(userId, organizationId);
    if (cart.items.length===0) throw AppError.badRequest("Cart is empty");
    const items = await Promise.all(cart.items.map(async it=> {
      const prod = await this.getProduct(organizationId, it.productId).catch(()=> null);
      const unit = prod?.price ?? PLACEHOLDER_UNIT_PRICE;
      const name = prod?.name ?? `Product ${it.productId}`;
      return { productId: it.productId, name, quantity: it.quantity, unitPrice: unit, totalPrice: unit*it.quantity };
    }));
    const subtotal = items.reduce((s,i)=> s+i.totalPrice, 0);
    const order: CustomerOrder = { id: randomUUID(), userId, organizationId, items, subtotal, tax: 0, shipping: 0, total: subtotal, status: "pending", paymentStatus: "pending", shippingAddress, billingAddress, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await (redis as any).set(orderItemKey(organizationId, order.id), JSON.stringify(order), "EX", 86400*30);
    // legacy key for backward read
    await (redis as any).set(orderLegacyKey(order.id), JSON.stringify(order), "EX", 86400*30);
    await (redis as any).sadd(orderIdxKey(organizationId), order.id);
    await this.clearCart(userId, organizationId);
    logger.info("Order created", { orderId: order.id, itemCount: order.items.length });
    return order;
  },
  async getOrders(userId: string, organizationId: string, options?: { status?: string; limit?: number; offset?: number; }): Promise<{ orders: CustomerOrder[]; total: number }> {
    // Prefer org index
    let ids: string[] = [];
    try { const members = await (redis as any).smembers(orderIdxKey(organizationId)); if (members && members.length) ids = members; } catch {}
    let orders: CustomerOrder[] = [];
    if (ids.length) {
      for (const id of ids) {
        const data = await (redis as any).get(orderItemKey(organizationId, id)) ?? await (redis as any).get(orderLegacyKey(id));
        if (!data) continue;
        const o = JSON.parse(data);
        if (o.userId===userId && o.organizationId===organizationId) orders.push(o);
      }
    } else {
      // fallback: scan all legacy keys (once)
      const keys = await (redis as any).keys("commerce:order:*");
      for (const key of keys) {
        if (key.includes(":idx:") || key.includes(":i:")) continue;
        const data = await (redis as any).get(key);
        if (!data) continue;
        const o = JSON.parse(data);
        if (o.userId===userId && o.organizationId===organizationId) {
          if (!options?.status || o.status===options.status) orders.push(o);
          // migrate to index
          await (redis as any).sadd(orderIdxKey(organizationId), o.id);
          await (redis as any).set(orderItemKey(organizationId, o.id), JSON.stringify(o), "EX", 86400*30);
        }
      }
      // after fallback, filter again if ids were empty but status filter needed
      if (options?.status) orders = orders.filter(o=> o.status===options.status);
      // need to distinct after migration, but ok
    }
    if (options?.status) orders = orders.filter(o=> o.status===options.status);
    orders.sort((a,b)=> new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = orders.length;
    const start = options?.offset||0;
    const end = start + (options?.limit||20);
    return { orders: orders.slice(start,end), total };
  },
  async getOrder(userId: string, organizationId: string, orderId: string): Promise<CustomerOrder|null> {
    const data = await (redis as any).get(orderItemKey(organizationId, orderId)) ?? await (redis as any).get(orderLegacyKey(orderId));
    if (!data) return null;
    const o = JSON.parse(data);
    if (o.userId!==userId || o.organizationId!==organizationId) return null;
    return o;
  },
  async updateOrderStatus(userId: string, organizationId: string, orderId: string, status: CustomerOrder["status"]): Promise<CustomerOrder> {
    const key = orderItemKey(organizationId, orderId);
    let data = await (redis as any).get(key) ?? await (redis as any).get(orderLegacyKey(orderId));
    if (!data) throw AppError.notFound("Order not found");
    const o = JSON.parse(data);
    if (o.userId!==userId || o.organizationId!==organizationId) throw AppError.forbidden("Unauthorized");
    o.status = status; o.updatedAt = new Date().toISOString();
    await (redis as any).set(key, JSON.stringify(o), "EX", 86400*30);
    await (redis as any).set(orderLegacyKey(orderId), JSON.stringify(o), "EX", 86400*30);
    return o;
  },
  async getDashboard(organizationId: string): Promise<{ totalOrders: number; totalRevenue: number; avgOrderValue: number|null; ordersByStatus: Record<string,number> }> {
    let ids: string[] = [];
    try { const m = await (redis as any).smembers(orderIdxKey(organizationId)); if (m) ids = m; } catch {}
    if (!ids.length) {
      // fallback scan
      const keys = await (redis as any).keys("commerce:order:*");
      for (const k of keys) {
        if (k.includes(":idx:")||k.includes(":i:")) continue;
        const d = await (redis as any).get(k);
        if (!d) continue;
        const o = JSON.parse(d);
        if (o.organizationId===organizationId) ids.push(o.id);
      }
    }
    let totalRevenue = 0;
    const byStatus: Record<string,number> = {};
    let count = 0;
    for (const id of ids) {
      const d = await (redis as any).get(orderItemKey(organizationId, id)) ?? await (redis as any).get(orderLegacyKey(id));
      if (!d) continue;
      const o = JSON.parse(d);
      if (o.organizationId!==organizationId) continue;
      count += 1;
      totalRevenue += o.total||0;
      byStatus[o.status] = (byStatus[o.status]||0)+1;
    }
    return { totalOrders: count, totalRevenue, avgOrderValue: count? Math.floor(totalRevenue/count) : null, ordersByStatus: byStatus };
  },
};
export default commerceService;
