# Session 131 — Commerce Completion (`commerce`)

**Module:** `commerce` (B2C product catalog, cart, checkout, orders)
**Mount:** `/api/v1/commerce`
**Status:** COMPLETE (routes 16, shared contract 0 → 320 LOC, service fixes, web client + console)
**Date:** 2026-08-07 · Branch: `arena/019fde50-win`

---

## 1. What Was Wrong (PARTIAL → COMPLETE)

| Gap | Before | After |
|---|---|---|
| Shared contract | ❌ none — `findSharedTypes(commerce)` null → PARTIAL | `packages/shared/src/commerce.ts` (320 LOC) — Product, Cart, Order, OrderStatus, Zod schemas + `commerceRoutesSchema` |
| Route validation | `z.object({...}).merge` with no args + schemas passed directly as handler — **all 16 routes type-errored** (`tsc` 4 errors) and would 500 at runtime | All routes now `validate({ body, params, query })` with proper schemas from shared |
| Cart tenant isolation | `commerce:cart:${userId}` — **cross-org leak**: same userId in two orgs shares cart; user switching org sees other org's cart | `commerce:cart:${orgId}:${userId}` — org-scoped, verified on read |
| Pricing | `subtotal = items.length * 100` placeholder, order items hardcoded `unitPrice: 100` — **fabricated money** | Cart subtotal recomputed from real product price when found (via `getProduct`), else honest placeholder with `priceSource: "placeholder"` flag; dashboard stats derived from real orders (SUM, not hardcoded 0) |
| Order scan | `KEYS commerce:order:*` scans **all orgs**, then filters JS — leaks timing, returns cross-org keys under load | Orders indexed by `commerce:order:idx:${orgId}` (sorted set) + `commerce:order:i:${orgId}:${id}`; legacy fallback scan kept once then migrated |
| Dashboard | Hardcoded `0` zeros (perfect 0% badge) | `getDashboard(orgId)` counts real orders by scanning org index, computes `totalRevenue`, `avgOrderValue`, `ordersByStatus`, `null` when no orders (never 0 as false success) |
| Web client / console | ❌ none → PARTIAL | `apps/web/src/lib/commerce.ts` + `/app/commerce` (`CommercePage.tsx` — catalog, cart, checkout, orders, dashboard) |
| Tests | 0 | **Unit** `commerce.test.ts` (14 tests) + **E2E** `commerce.spec.ts` (9 cases) |

Additive-only: all 16 existing paths/shapes kept; 4 notes routes kept as-is.

---

## 2. Shared Contract (`packages/shared/src/commerce.ts`)

- `CommerceOrderStatus = pending|confirmed|processing|shipped|delivered|cancelled|refunded`
- `CommercePaymentStatus`, `CommerceProduct`, `CommerceCartItem`, `CommerceCart`, `CommerceOrder`, `CommerceDashboard`
- `commerceRoutesSchema`: `addCartItem`, `updateCartItem`, `checkout`, `updateOrderStatus`, `queryProducts`, `queryOrders`

## 3. Service (`apps/api/src/commerce/commerce.service.ts`)

- `cartKey(userId, orgId)` = `commerce:cart:${orgId}:${userId}` (TTL 72h)
- `orderKey(id)` + `orderIdxKey(orgId)` / `orderItemKey(orgId,id)` for indexed storage
- `getProducts`/`getProduct` cache `commerce:products:${orgId}:*` (EX 300)
- `getCart` verifies org on read, creates new cart with `currency: "USD"` if missing
- `addToCart`/`updateCartItem` recompute `subtotal` from product price if known
- `createOrder` validates non-empty cart, maps items with real names/prices, stores under `commerce:order:i:${orgId}:${id}` and `ZADD idx`
- `getOrders` reads from `SMEMBERS idx` then `MGET` items; falls back to legacy `KEYS` scan once
- `getOrder` / `updateOrderStatus` org-scoped checks
- `getDashboard` tallies `totalOrders`, `totalRevenue`, `avgOrderValue`, `ordersByStatus` from real orders; `null` avg when no orders

## 4. Routes (`/api/v1/commerce` — 16)

| # | Method | Path | Validates | Auth |
|---|---|---|---|---|
|1|GET|`/products`|query|user|
|2|GET|`/products/:id`|params|user|
|3|GET|`/cart`|—|user|
|4|POST|`/cart/items`|body|user|
|5|PATCH|`/cart/items/:productId`|params+body|user|
|6|DELETE|`/cart/items/:productId`|params|user|
|7|DELETE|`/cart`|—|user|
|8|POST|`/checkout`|body|user|
|9|GET|`/orders`|query|user|
|10|GET|`/orders/:id`|params|user|
|11|PATCH|`/orders/:id/status`|params+body|user|
|12|GET|`/dashboard`|—|user|
|13|GET|`/notes`|—|user|
|14|POST|`/notes`|body|user|
|15|PATCH|`/notes/:id`|params+body|user|
|16|DELETE|`/notes/:id`|params|user|

## 5. Web Client & Console

**Client** `apps/web/src/lib/commerce.ts`: `listProducts`, `getProduct`, `getCart`, `addToCart`, `updateCartItem`, `removeFromCart`, `clearCart`, `checkout`, `listOrders`, `getOrder`, `updateOrderStatus`, `getDashboard`.

**Console** `/app/commerce` (`CommercePage.tsx`): catalog grid, cart drawer, checkout form, orders table with status badge, dashboard KPI cards (orders, revenue, AOV, by-status). Admin status updates inline.

## 6. Tests

- **Unit** `commerce.test.ts` — 14 tests covering cart org isolation, add/update/remove/clear, empty-cart checkout rejection, order creation clears cart, order list org isolation, dashboard null vs zero, product cache.
- **E2E** `tests/e2e/commerce.spec.ts` — 9 cases covering products, cart flow, checkout, orders, dashboard, notes.
