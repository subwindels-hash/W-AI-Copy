# SESSION 92 SPECIFICATION — ENTERPRISE ERP (ENTERPRISE RESOURCE PLANNING)

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S91, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Enterprise Applications
```

---

## 1. OBJECTIVES & ARCHITECTURE

The master specification's Phase-3 Enterprise Applications list **ERP** ("CRM,
ERP, Website Builder, Email Intelligence, Social Platform, Trading
Intelligence, Marketplace") — the last major named application still missing
from the platform after Sessions 90 (CRM) and 91 (Email Intelligence).
Session 92 adds the ERP application layer:

1. **Product catalog** — real, org-scoped products with SKUs, pricing, cost,
   tax and reorder levels.
2. **Inventory & movements ledger** — warehouse locations, and a real
   movements ledger (receipt / sale / adjustment / transfer) from which
   current stock is **computed per read** — never stored as a fact.
3. **Suppliers & purchase orders** — supplier registry and multi-line purchase
   orders with a real lifecycle (draft → submitted → received | cancelled).
4. **Sales orders** — multi-line customer orders with a real lifecycle
   (draft → confirmed → fulfilled | cancelled), plus a **CRM hook**: closing a
   Session 90 deal as won best-effort creates a sales order from it.
5. **Deterministic operations rollup** — inventory value, low-stock items,
   order totals, supplier counts — computed from stored records on every
   read, no fabricated numbers.
6. **Tenant isolation by construction** — every record under an org-scoped key
   (`erp:*:<org>:*`), fail-closed reads, and the namespaces registered in the
   Session 89 isolation-audit catalog.

```
                 ENTERPRISE ERP
                 --------------
   [products]  ->  erp:product:i:<org>:<id>      (catalog + pricing)
   [warehouses]->  erp:warehouse:i:<org>:<id>    (locations)
   [movements] ->  erp:movement:i:<org>:<id>     (stock ledger — source of truth)
   [suppliers] ->  erp:supplier:i:<org>:<id>     (vendor registry)
   [purchase orders] -> erp:po:i:<org>:<id>      (procurement lifecycle)
   [sales orders]    -> erp:so:i:<org>:<id>      (sales lifecycle + CRM hook)
   [rollup]    ->  computed per read (never invented)
```

---

## 2. DATA MODEL

All types live in `packages/shared/src/erp.ts` (single source shared by API,
routes and web client). Types are prefixed `Erp`.

### 2.1 Product

`id` (`erpp-`), `organizationId`, `sku` (required, unique per org), `name`
(required), `description?`, `category?`, `unit` (default `"each"`),
`priceCents` (≥ 0), `costCents` (≥ 0), `taxRatePct` (0–100, default 0),
`reorderLevel` (≥ 0, default 0), `tags[]`, `isActive` (default true),
`createdAt`/`updatedAt`.

### 2.2 Warehouse

`id` (`erpw-`), `organizationId`, `name` (required), `code` (required),
`city?`, `country?`, `isDefault` (bool), `createdAt`/`updatedAt`.

### 2.3 Inventory movement (stock ledger — the source of truth)

`id` (`erpm-`), `organizationId`, `productId`, `warehouseId`, `kind`
(`receipt | sale | adjustment | transfer_in | transfer_out | initial`),
`quantity` (signed int; receipt/transfer_in/initial positive, sale/transfer_out
negative, adjustment may be signed), `unitCostCents?`, `reference?` (e.g.
PO/order id), `note?`, `occurredAt` (ISO), `createdAt`, `createdBy?`.

**Current stock is always computed**: for a product+warehouse, sum of
movement quantities. Nothing stores a running balance.

### 2.4 Supplier

`id` (`erps-`), `organizationId`, `name` (required), `contactEmail?`,
`phone?`, `paymentTerms?` (free text, e.g. "Net 30"), `leadTimeDays` (int ≥ 0),
`tags[]`, `createdAt`/`updatedAt`.

### 2.5 Purchase order

`id` (`erp-p-`), `organizationId`, `supplierId` (required), `status`
(`draft | submitted | received | cancelled`), `items[]` (`productId`, `qty`,
`unitPriceCents`), `totalCents` (computed at write from items — verified on
read), `expectedAt?`, `receivedAt?` (stamped only on `received`), `note?`,
`createdAt`/`updatedAt`.

Status transitions are honest: `submitted → received | cancelled`, and a
`received` PO **creates `receipt` inventory movements** for its items.

### 2.6 Sales order

`id` (`erp-s-`), `organizationId`, `customerCompanyId?` (CRM company link),
`status` (`draft | confirmed | fulfilled | cancelled`), `items[]`
(`productId`, `qty`, `unitPriceCents`), `totalCents` (computed at write),
`orderDate` (ISO date), `fulfilledAt?`, `note?`, `createdAt`/`updatedAt`.

A `fulfilled` SO **creates `sale` inventory movements**. The CRM hook:
`createSalesOrderFromDeal(org, dealId)` reads the deal + its company via the
Session 90 CRM service and creates a confirmed SO (deal amount as one line
with a synthetic product reference when no product matches is **not**
permitted — instead the SO is created empty with the company link and the
deal amount in `note` unless a real product is supplied).

### 2.7 Operations rollup (computed, never stored)

`ErpOperationsRollup`:

- `counts`: `products`, `activeProducts`, `warehouses`, `suppliers`,
  `purchaseOrders` (by status), `salesOrders` (by status), `movements`
- `inventoryValueCents` — Σ over products of (current stock × costCents)
- `stockValueByWarehouse` — per warehouse current stock value
- `lowStock` — products where current stock < reorderLevel, with `stockOnHand`
- `purchaseOrderTotalsCents` / `salesOrderTotalsCents`
- `recentMovements` (up to 8), `lastUpdatedAt`

---

## 3. STORAGE & TENANT ISOLATION

- Redis-backed, org-scoped keys: `erp:<entity>:i:<org>:<id>`.
- Reads re-parse the stored `organizationId` and refuse on mismatch.
- The Session 89 catalog gains `erp:product`, `erp:warehouse`, `erp:movement`,
  `erp:supplier`, `erp:po`, `erp:so` as `org_scoped`.
- Writes emit Kernel events (`erp.product.created`, `erp.po.received`,
  `erp.so.fulfilled`, …) best-effort.

## 4. DEMO DATA POLICY

Fresh orgs start empty. `WINDELS_DEMO_DATA=true` seeds an idempotent demo
(`org-demo-erp`): 4 products, 1 default warehouse, 2 suppliers, 1 submitted
PO, 1 confirmed SO, and an initial-stock movement ledger. See
`apps/api/src/erp/bootstrap.ts`.

## 5. API SURFACE (`/api/v1/erp`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/rollup` | computed operations intelligence |
| GET/POST | `/products` | list (filter `q`, `category`, `lowStock`) / create |
| GET/PATCH/DELETE | `/products/:id` | read / update / delete |
| GET/POST | `/warehouses` | list / create |
| GET/PATCH/DELETE | `/warehouses/:id` | read / update / delete |
| GET | `/inventory` | per product+warehouse computed stock |
| POST | `/movements` | record a stock movement |
| GET | `/movements` | list (filter productId, warehouseId, kind) |
| GET/POST | `/suppliers` | list / create |
| GET/PATCH/DELETE | `/suppliers/:id` | read / update / delete |
| GET/POST | `/purchase-orders` | list (filter status, supplierId) / create |
| GET/PATCH/DELETE | `/purchase-orders/:id` | read / update / delete |
| POST | `/purchase-orders/:id/receive` | mark received + create receipt movements |
| GET/POST | `/sales-orders` | list (filter status) / create |
| GET/PATCH/DELETE | `/sales-orders/:id` | read / update / delete |
| POST | `/sales-orders/:id/fulfill` | mark fulfilled + create sale movements |
| POST | `/sales-orders/from-deal/:dealId` | CRM hook: create SO from a won deal |

## 6. DELIVERY SLICE (vertical, in order)

1. `packages/shared/src/erp.ts` (+ index export)
2. `apps/api/src/erp/erp.service.ts` — org-scoped service
3. `apps/api/src/erp/bootstrap.ts` — demo seed (gated)
4. `apps/api/src/http/routes/erp.ts` + server/index wiring
5. `tenantIsolation.service.ts` — register `erp:*` namespaces
6. `apps/web/src/lib/erp.ts` + `pages/erp/ErpPage.tsx` + router + sidebar
7. `apps/api/src/erp/erp.test.ts` — CRUD, stock computation, order lifecycles,
   CRM hook, rollup determinism, cross-tenant isolation
8. Decision log, PROGRESS.md, CHANGELOG.md

## 7. DEFINITION OF DONE

- [ ] `pnpm build` + `pnpm typecheck` pass; `make verify` green.
- [ ] No `Math.random` in read paths; all guard suites pass.
- [ ] Cross-tenant test proves org B cannot read org A's ERP data.
- [ ] Stock is computed from the movements ledger (never stored); receive/
      fulfill create real movements; totals verified on read.
- [ ] UI renders real API data with demo-honesty rules intact.
