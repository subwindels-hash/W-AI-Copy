// Session 92 — Enterprise ERP (Enterprise Resource Planning).
//
// The master spec's Phase-3 Enterprise Applications list names ERP; after
// Sessions 90 (CRM) and 91 (Email Intelligence) it is the last major named
// application still missing. This module ships an org-scoped product
// catalog, warehouse/inventory with a real movements ledger (stock computed
// per read — never stored), suppliers, purchase orders and sales orders with
// honest lifecycles, plus a CRM hook (won deal → sales order) and a
// deterministic operations rollup.
//
// Types are prefixed `Erp`. Single source of truth shared by the API
// service, the HTTP routes and the web client.

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────────

export const ERP_MOVEMENT_KINDS = ["receipt", "sale", "adjustment", "transfer_in", "transfer_out", "initial"] as const;
export type ErpMovementKind = (typeof ERP_MOVEMENT_KINDS)[number];

export const ERP_PO_STATUSES = ["draft", "submitted", "received", "cancelled"] as const;
export type ErpPoStatus = (typeof ERP_PO_STATUSES)[number];

export const ERP_SO_STATUSES = ["draft", "confirmed", "fulfilled", "cancelled"] as const;
export type ErpSoStatus = (typeof ERP_SO_STATUSES)[number];

// ─── Records ────────────────────────────────────────────────────────────

export interface ErpProduct {
  id: string;
  organizationId: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  priceCents: number;
  costCents: number;
  taxRatePct: number;
  reorderLevel: number;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ErpWarehouse {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  city: string | null;
  country: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ErpMovement {
  id: string;
  organizationId: string;
  productId: string;
  warehouseId: string;
  kind: ErpMovementKind;
  /** Signed: receipt/initial/transfer_in positive, sale/transfer_out negative, adjustment any. */
  quantity: number;
  unitCostCents: number | null;
  reference: string | null;
  note: string | null;
  occurredAt: string;
  createdAt: string;
  createdBy: string | null;
}

export interface ErpSupplier {
  id: string;
  organizationId: string;
  name: string;
  contactEmail: string | null;
  phone: string | null;
  paymentTerms: string | null;
  leadTimeDays: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ErpOrderItem {
  productId: string;
  qty: number;
  unitPriceCents: number;
}

export interface ErpPurchaseOrder {
  id: string;
  organizationId: string;
  supplierId: string;
  status: ErpPoStatus;
  items: ErpOrderItem[];
  totalCents: number;
  expectedAt: string | null;
  receivedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ErpSalesOrder {
  id: string;
  organizationId: string;
  customerCompanyId: string | null;
  status: ErpSoStatus;
  items: ErpOrderItem[];
  totalCents: number;
  orderDate: string;
  fulfilledAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Computed stock-on-hand for one product+warehouse pair. */
export interface ErpStockRow {
  productId: string;
  productSku: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  costCents: number;
}

export interface ErpLowStockItem {
  productId: string;
  sku: string;
  name: string;
  stockOnHand: number;
  reorderLevel: number;
}

export interface ErpOperationsRollup {
  counts: {
    products: number;
    activeProducts: number;
    warehouses: number;
    suppliers: number;
    movements: number;
    purchaseOrders: Record<ErpPoStatus, number>;
    salesOrders: Record<ErpSoStatus, number>;
  };
  inventoryValueCents: number;
  stockValueByWarehouse: Array<{ warehouseId: string; name: string; valueCents: number }>;
  lowStock: ErpLowStockItem[];
  purchaseOrderTotalsCents: number;
  salesOrderTotalsCents: number;
  recentMovements: ErpMovement[];
  lastUpdatedAt: string | null;
}

// ─── Input schemas (validated at the API boundary) ──────────────────────

export const ErpProductUpsertSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  unit: z.string().trim().max(20).default("each"),
  priceCents: z.number().int().min(0).max(10_000_000_000_000),
  costCents: z.number().int().min(0).max(10_000_000_000_000),
  taxRatePct: z.number().min(0).max(100).default(0),
  reorderLevel: z.number().int().min(0).max(10_000_000).default(0),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  isActive: z.boolean().default(true),
});
export type ErpProductUpsertInput = z.infer<typeof ErpProductUpsertSchema>;
export type ErpProductCreateInput = z.input<typeof ErpProductUpsertSchema>;

export const ErpWarehouseUpsertSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(40),
  city: z.string().trim().max(100).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  isDefault: z.boolean().default(false),
});
export type ErpWarehouseUpsertInput = z.infer<typeof ErpWarehouseUpsertSchema>;
export type ErpWarehouseCreateInput = z.input<typeof ErpWarehouseUpsertSchema>;

export const ErpMovementCreateSchema = z.object({
  productId: z.string().trim().min(1).max(64),
  warehouseId: z.string().trim().min(1).max(64),
  kind: z.enum(ERP_MOVEMENT_KINDS),
  quantity: z.number().int().min(-10_000_000).max(10_000_000),
  unitCostCents: z.number().int().min(0).nullable().optional(),
  reference: z.string().trim().max(160).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  occurredAt: z.string().datetime().nullable().optional(),
});
export type ErpMovementCreateInput = z.infer<typeof ErpMovementCreateSchema>;
export type ErpMovementCreateRequest = z.input<typeof ErpMovementCreateSchema>;

export const ErpSupplierUpsertSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactEmail: z.string().trim().email().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  paymentTerms: z.string().trim().max(120).nullable().optional(),
  leadTimeDays: z.number().int().min(0).max(3650).default(0),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type ErpSupplierUpsertInput = z.infer<typeof ErpSupplierUpsertSchema>;
export type ErpSupplierCreateInput = z.input<typeof ErpSupplierUpsertSchema>;

export const ErpOrderItemSchema = z.object({
  productId: z.string().trim().min(1).max(64),
  qty: z.number().int().min(1).max(10_000_000),
  unitPriceCents: z.number().int().min(0).max(10_000_000_000_000),
});

export const ErpPurchaseOrderUpsertSchema = z.object({
  supplierId: z.string().trim().min(1).max(64),
  status: z.enum(ERP_PO_STATUSES).default("draft"),
  items: z.array(ErpOrderItemSchema).min(1).max(200),
  expectedAt: z.string().datetime().nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});
export type ErpPurchaseOrderUpsertInput = z.infer<typeof ErpPurchaseOrderUpsertSchema>;
export type ErpPurchaseOrderCreateInput = z.input<typeof ErpPurchaseOrderUpsertSchema>;

export const ErpSalesOrderUpsertSchema = z.object({
  customerCompanyId: z.string().trim().max(64).nullable().optional(),
  status: z.enum(ERP_SO_STATUSES).default("draft"),
  // Zero-item orders are permitted: the CRM hook (won deal → SO) creates an
  // empty order with the deal amount in `note` when no product matches —
  // never a fabricated line item. Fulfilling an empty order simply closes it.
  items: z.array(ErpOrderItemSchema).max(200),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => new Date().toISOString().slice(0, 10)),
  note: z.string().max(1000).nullable().optional(),
});
export type ErpSalesOrderUpsertInput = z.infer<typeof ErpSalesOrderUpsertSchema>;
export type ErpSalesOrderCreateInput = z.input<typeof ErpSalesOrderUpsertSchema>;
