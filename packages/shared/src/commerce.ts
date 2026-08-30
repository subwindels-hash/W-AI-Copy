import { z } from "zod";

export const COMMERCE_ORDER_STATUSES = ["pending","confirmed","processing","shipped","delivered","cancelled","refunded"] as const;
export type CommerceOrderStatus = typeof COMMERCE_ORDER_STATUSES[number];
export const COMMERCE_PAYMENT_STATUSES = ["pending","authorized","captured","refunded","failed"] as const;
export type CommercePaymentStatus = typeof COMMERCE_PAYMENT_STATUSES[number];

export interface CommerceCartItem { productId: string; quantity: number; variantId?: string; }
export interface CommerceCart { id: string; userId: string; organizationId: string; items: CommerceCartItem[]; subtotal: number; currency: string; createdAt: string; updatedAt: string; }
export interface CommerceProduct { id: string; name: string; description?: string; price: number; currency: string; stockQuantity: number; images?: string[]; category?: string; attributes?: Record<string, unknown>; isActive: boolean; }
export interface CommerceOrderItem { productId: string; name: string; quantity: number; unitPrice: number; totalPrice: number; }
export interface CommerceOrder { id: string; userId: string; organizationId: string; items: CommerceOrderItem[]; subtotal: number; tax?: number; shipping?: number; total: number; status: CommerceOrderStatus; paymentStatus: CommercePaymentStatus; shippingAddress?: Record<string, unknown>; billingAddress?: Record<string, unknown>; createdAt: string; updatedAt: string; }
export interface CommerceDashboard { totalOrders: number; totalRevenue: number; avgOrderValue: number | null; ordersByStatus: Record<string, number>; }

export const commerceRoutesSchema = {
  addCartItem: z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(100), variantId: z.string().optional() }),
  updateCartItem: z.object({ quantity: z.number().int().min(0).max(100) }),
  checkout: z.object({ shippingAddress: z.record(z.unknown()), billingAddress: z.record(z.unknown()).optional() }),
  updateOrderStatus: z.object({ status: z.enum(COMMERCE_ORDER_STATUSES) }),
  queryProducts: z.object({ category: z.string().optional(), search: z.string().optional(), inStock: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).optional(), offset: z.coerce.number().int().min(0).optional() }),
  queryOrders: z.object({ status: z.enum(COMMERCE_ORDER_STATUSES).optional(), limit: z.coerce.number().int().min(1).max(100).optional(), offset: z.coerce.number().int().min(0).optional() }),
  upsertProduct: z.object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
    price: z.number().nonnegative().finite(),
    currency: z.string().min(3).max(3).default("USD"),
    stockQuantity: z.number().int().min(0).default(0),
    images: z.array(z.string().max(2000)).max(20).optional(),
    category: z.string().max(120).optional(),
    attributes: z.record(z.unknown()).optional(),
    isActive: z.boolean().default(true),
  }),
  productId: z.object({ id: z.string().min(1) }),
  orderId: z.object({ id: z.string().min(1) }),
  cartProductId: z.object({ productId: z.string().min(1) }),
  notesId: z.object({ id: z.string().min(1) }),
};
