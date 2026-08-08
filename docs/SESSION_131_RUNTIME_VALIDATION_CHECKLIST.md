# Session 131 Runtime Validation Checklist — Commerce (`commerce`)

> 🟡 pending target-environment execution (live Redis 8, API booted).

## 1. Routes & Validation
- [ ] `GET /api/v1/commerce/products` 200 with `{ products, total }`; `?category=&search=&limit=&offset=` filtered.
- [ ] `GET /products/:id` 404 for missing, 200 for existing.
- [ ] Cart flow `GET/POST/PATCH/DELETE /cart*` validates via `validate()` — bad body returns 400 not 500.
- [ ] `POST /cart/items` with `quantity:0` rejected 400; `quantity:101` rejected 400.
- [ ] `PATCH /orders/:id/status` with invalid enum rejected 400.

## 2. Tenant Isolation
- [ ] Cart key is `commerce:cart:<org>:<user>` — user in org A cannot read org B's cart.
- [ ] `getOrders(user, orgA)` never returns orders from org B (index `commerce:order:idx:<org>` scoped).
- [ ] `getOrder`/`updateOrderStatus` return 404 for cross-org id.

## 3. Checkout & Dashboard Honesty
- [ ] Empty cart `POST /checkout` → 400 “Cart is empty”, no order created.
- [ ] Successful checkout clears cart (`GET /cart` empty).
- [ ] `GET /dashboard` with no orders returns `totalOrders:0, totalRevenue:0, avgOrderValue:null` (not 0).

## 4. UI
- [ ] `/app/commerce` renders catalog, cart, checkout, orders, dashboard without console errors.
- [ ] Add to cart → cart count updates; checkout → order appears in orders table.

## 5. Inventory
- [ ] `node audit/build-inventory.mjs` lists `commerce` as COMPLETE (routes=16, hasClient, hasTypes, hasTests).
