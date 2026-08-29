/** Session 92 — Enterprise ERP client. */
import { api } from "./api";

export type ErpMovementKind = "receipt" | "sale" | "adjustment" | "transfer_in" | "transfer_out" | "initial";
export type ErpPoStatus = "draft" | "submitted" | "received" | "cancelled";
export type ErpSoStatus = "draft" | "confirmed" | "fulfilled" | "cancelled";

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

export interface ErpProductCreateInput {
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  unit?: string;
  priceCents: number;
  costCents: number;
  taxRatePct?: number;
  reorderLevel?: number;
  tags?: string[];
  isActive?: boolean;
}

export interface ErpWarehouseCreateInput {
  name: string;
  code: string;
  city?: string | null;
  country?: string | null;
  isDefault?: boolean;
}

export interface ErpSupplierCreateInput {
  name: string;
  contactEmail?: string | null;
  phone?: string | null;
  paymentTerms?: string | null;
  leadTimeDays?: number;
  tags?: string[];
}

export interface ErpMovementCreateInput {
  productId: string;
  warehouseId: string;
  kind: ErpMovementKind;
  quantity: number;
  unitCostCents?: number | null;
  reference?: string | null;
  note?: string | null;
  occurredAt?: string | null;
}

export interface ErpPurchaseOrderCreateInput {
  supplierId: string;
  status?: ErpPoStatus;
  items: ErpOrderItem[];
  expectedAt?: string | null;
  note?: string | null;
}

export interface ErpSalesOrderCreateInput {
  customerCompanyId?: string | null;
  status?: ErpSoStatus;
  items: ErpOrderItem[];
  orderDate?: string;
  note?: string | null;
}

export const erpApi = {
  rollup: () => api<ErpOperationsRollup>("/erp/dashboard/rollup"),

  listProducts: (params?: { q?: string; category?: string; lowStock?: boolean }) =>
    api<ErpProduct[]>("/erp/products", { params }),
  createProduct: (input: ErpProductCreateInput) => api<ErpProduct>("/erp/products", { method: "POST", json: input }),
  updateProduct: (id: string, patch: Partial<ErpProductCreateInput>) =>
    api<ErpProduct>(`/erp/products/${id}`, { method: "PATCH", json: patch }),
  deleteProduct: (id: string) => api<{ deleted: boolean; id: string }>(`/erp/products/${id}`, { method: "DELETE" }),

  listWarehouses: () => api<ErpWarehouse[]>("/erp/warehouses"),
  createWarehouse: (input: ErpWarehouseCreateInput) => api<ErpWarehouse>("/erp/warehouses", { method: "POST", json: input }),
  deleteWarehouse: (id: string) => api<{ deleted: boolean; id: string }>(`/erp/warehouses/${id}`, { method: "DELETE" }),

  inventory: () => api<ErpStockRow[]>("/erp/inventory"),
  createMovement: (input: ErpMovementCreateInput) => api<ErpMovement>("/erp/movements", { method: "POST", json: input }),
  listMovements: (params?: { productId?: string; warehouseId?: string; kind?: string }) =>
    api<ErpMovement[]>("/erp/movements", { params }),

  listSuppliers: (params?: { q?: string }) => api<ErpSupplier[]>("/erp/suppliers", { params }),
  createSupplier: (input: ErpSupplierCreateInput) => api<ErpSupplier>("/erp/suppliers", { method: "POST", json: input }),
  deleteSupplier: (id: string) => api<{ deleted: boolean; id: string }>(`/erp/suppliers/${id}`, { method: "DELETE" }),

  listPurchaseOrders: (params?: { status?: ErpPoStatus; supplierId?: string }) =>
    api<ErpPurchaseOrder[]>("/erp/purchase-orders", { params }),
  createPurchaseOrder: (input: ErpPurchaseOrderCreateInput) =>
    api<ErpPurchaseOrder>("/erp/purchase-orders", { method: "POST", json: input }),
  receivePurchaseOrder: (id: string) => api<ErpPurchaseOrder>(`/erp/purchase-orders/${id}/receive`, { method: "POST" }),
  deletePurchaseOrder: (id: string) => api<{ deleted: boolean; id: string }>(`/erp/purchase-orders/${id}`, { method: "DELETE" }),

  listSalesOrders: (params?: { status?: ErpSoStatus }) => api<ErpSalesOrder[]>("/erp/sales-orders", { params }),
  createSalesOrder: (input: ErpSalesOrderCreateInput) =>
    api<ErpSalesOrder>("/erp/sales-orders", { method: "POST", json: input }),
  fulfillSalesOrder: (id: string) => api<ErpSalesOrder>(`/erp/sales-orders/${id}/fulfill`, { method: "POST" }),
  deleteSalesOrder: (id: string) => api<{ deleted: boolean; id: string }>(`/erp/sales-orders/${id}`, { method: "DELETE" }),
  createSalesOrderFromDeal: (dealId: string) =>
    api<{ order: ErpSalesOrder; matchedProduct: boolean }>(`/erp/sales-orders/from-deal/${dealId}`, { method: "POST" }),
};
