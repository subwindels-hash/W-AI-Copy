/**
 * Commerce Module (v4.0) — B2C E-commerce
 *
 * Handles customer-facing commerce:
 * - Product catalog (denormalized from ERP)
 * - Cart management
 * - Checkout flows
 * - Customer orders
 * - Order history
 *
 * Dependencies:
 * - ERP: Source of truth for products and inventory
 * - CRM: Customer information
 * - Billing: Payment processing
 * - Payments: Payment gateway integration
 */

import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CartItem {
  productId: string;
  quantity: number;
  variantId?: string;
}

export interface Cart {
  id: string;
  userId: string;
  organizationId: string;
  items: CartItem[];
  subtotal: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerOrder {
  id: string;
  userId: string;
  organizationId: string;
  items: {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[];
  subtotal: number;
  tax?: number;
  shipping?: number;
  total: number;
  status: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
  paymentStatus: "pending" | "authorized" | "captured" | "refunded" | "failed";
  shippingAddress?: Record<string, unknown>;
  billingAddress?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCatalogItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  stockQuantity: number;
  images?: string[];
  category?: string;
  attributes?: Record<string, unknown>;
  isActive: boolean;
}

// ─── Commerce Service ─────────────────────────────────────────────────────────

const CART_TTL_HOURS = 72; // Carts expire after 3 days

export const commerceService = {
  // ─── Product Catalog ────────────────────────────────────────────────────────

  /**
   * Get product catalog (denormalized from ERP)
   */
  async getProducts(organizationId: string, options?: {
    category?: string;
    search?: string;
    inStock?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ products: ProductCatalogItem[]; total: number }> {
    const cacheKey = `commerce:products:${organizationId}:${JSON.stringify(options || {})}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // For now, return empty catalog - in production this would sync from ERP
    const products: ProductCatalogItem[] = [];
    const result = { products, total: 0 };

    // Cache for 5 minutes
    await redis.set(cacheKey, JSON.stringify(result), "EX", 300);

    return result;
  },

  /**
   * Get single product
   */
  async getProduct(organizationId: string, productId: string): Promise<ProductCatalogItem | null> {
    const cacheKey = `commerce:product:${organizationId}:${productId}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Return null - in production this would fetch from ERP
    return null;
  },

  // ─── Cart Management ────────────────────────────────────────────────────────

  /**
   * Get user's cart
   */
  async getCart(userId: string, organizationId: string): Promise<Cart> {
    const cartKey = `commerce:cart:${userId}`;

    const cached = await redis.get(cartKey);
    if (cached) {
      const cart = JSON.parse(cached);
      // Verify organization
      if (cart.organizationId !== organizationId) {
        throw new Error("Cart belongs to different organization");
      }
      return cart;
    }

    // Create new cart
    const cart: Cart = {
      id: randomUUID(),
      userId,
      organizationId,
      items: [],
      subtotal: 0,
      currency: "USD",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await redis.set(cartKey, JSON.stringify(cart), "EX", CART_TTL_HOURS * 3600);

    return cart;
  },

  /**
   * Add item to cart
   */
  async addToCart(userId: string, organizationId: string, item: CartItem): Promise<Cart> {
    const cartKey = `commerce:cart:${userId}`;
    const cart = await this.getCart(userId, organizationId);

    // Check if item already in cart
    const existingIndex = cart.items.findIndex((i) => i.productId === item.productId);
    if (existingIndex >= 0) {
      cart.items[existingIndex].quantity += item.quantity;
    } else {
      cart.items.push(item);
    }

    // Recalculate subtotal
    cart.subtotal = cart.items.reduce((sum, i) => sum + (i.quantity * 100), 0); // Placeholder price
    cart.updatedAt = new Date().toISOString();

    await redis.set(cartKey, JSON.stringify(cart), "EX", CART_TTL_HOURS * 3600);

    return cart;
  },

  /**
   * Update cart item quantity
   */
  async updateCartItem(userId: string, organizationId: string, productId: string, quantity: number): Promise<Cart> {
    const cartKey = `commerce:cart:${userId}`;
    const cart = await this.getCart(userId, organizationId);

    const itemIndex = cart.items.findIndex((i) => i.productId === productId);
    if (itemIndex < 0) {
      throw new Error("Item not in cart");
    }

    if (quantity <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = quantity;
    }

    cart.subtotal = cart.items.reduce((sum, i) => sum + (i.quantity * 100), 0);
    cart.updatedAt = new Date().toISOString();

    await redis.set(cartKey, JSON.stringify(cart), "EX", CART_TTL_HOURS * 3600);

    return cart;
  },

  /**
   * Remove item from cart
   */
  async removeFromCart(userId: string, organizationId: string, productId: string): Promise<Cart> {
    return this.updateCartItem(userId, organizationId, productId, 0);
  },

  /**
   * Clear cart
   */
  async clearCart(userId: string, organizationId: string): Promise<void> {
    const cartKey = `commerce:cart:${userId}`;
    await redis.del(cartKey);
  },

  // ─── Checkout ───────────────────────────────────────────────────────────────

  /**
   * Create order from cart
   */
  async createOrder(userId: string, organizationId: string, shippingAddress: Record<string, unknown>, billingAddress: Record<string, unknown>): Promise<CustomerOrder> {
    const cart = await this.getCart(userId, organizationId);

    if (cart.items.length === 0) {
      throw new Error("Cart is empty");
    }

    const order: CustomerOrder = {
      id: randomUUID(),
      userId,
      organizationId,
      items: cart.items.map((item) => ({
        productId: item.productId,
        name: `Product ${item.productId}`, // Would fetch real name from ERP
        quantity: item.quantity,
        unitPrice: 100, // Placeholder price
        totalPrice: item.quantity * 100,
      })),
      subtotal: cart.subtotal,
      tax: 0,
      shipping: 0,
      total: cart.subtotal,
      status: "pending",
      paymentStatus: "pending",
      shippingAddress,
      billingAddress,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store order in Redis (would use PostgreSQL in production)
    const orderKey = `commerce:order:${order.id}`;
    await redis.set(orderKey, JSON.stringify(order), "EX", 86400 * 30); // 30 days

    // Clear the cart
    await this.clearCart(userId, organizationId);

    logger.info("Order created", { orderId: order.id, itemCount: order.items.length });

    return order;
  },

  // ─── Order Management ───────────────────────────────────────────────────────

  /**
   * Get user's orders
   */
  async getOrders(userId: string, organizationId: string, options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: CustomerOrder[]; total: number }> {
    // In production, this would query PostgreSQL
    // For now, scan Redis for orders
    const orders: CustomerOrder[] = [];
    const pattern = `commerce:order:*`;

    const keys = await redis.keys(pattern);
    for (const key of keys) {
      const orderData = await redis.get(key);
      if (orderData) {
        const order = JSON.parse(orderData);
        if (order.userId === userId && order.organizationId === organizationId) {
          if (!options?.status || order.status === options.status) {
            orders.push(order);
          }
        }
      }
    }

    // Sort by date descending
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = orders.length;
    const start = (options?.offset || 0);
    const end = start + (options?.limit || 20);

    return { orders: orders.slice(start, end), total };
  },

  /**
   * Get single order
   */
  async getOrder(userId: string, organizationId: string, orderId: string): Promise<CustomerOrder | null> {
    const orderKey = `commerce:order:${orderId}`;
    const orderData = await redis.get(orderKey);

    if (!orderData) return null;

    const order = JSON.parse(orderData);
    if (order.userId !== userId || order.organizationId !== organizationId) {
      return null;
    }

    return order;
  },

  /**
   * Update order status
   */
  async updateOrderStatus(userId: string, organizationId: string, orderId: string, status: CustomerOrder["status"]): Promise<CustomerOrder> {
    const orderKey = `commerce:order:${orderId}`;
    const orderData = await redis.get(orderKey);

    if (!orderData) {
      throw new Error("Order not found");
    }

    const order = JSON.parse(orderData);
    if (order.userId !== userId || order.organizationId !== organizationId) {
      throw new Error("Unauthorized");
    }

    order.status = status;
    order.updatedAt = new Date().toISOString();

    await redis.set(orderKey, JSON.stringify(order), "EX", 86400 * 30);

    return order;
  },

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  /**
   * Get commerce dashboard stats
   */
  async getDashboard(organizationId: string): Promise<{
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
    ordersByStatus: Record<string, number>;
  }> {
    // In production, this would query PostgreSQL
    return {
      totalOrders: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      ordersByStatus: {},
    };
  },
};

export default commerceService;
