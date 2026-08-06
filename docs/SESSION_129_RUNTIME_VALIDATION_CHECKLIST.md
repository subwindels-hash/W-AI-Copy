# Session 129 Runtime Validation Checklist — Global Currency, Payment Orchestration & Geo-Aware Billing Engine (`geoBilling`)

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 129 stays 🟡 VERIFIED (partial).

The unit suites prove country detection, tax calculation, WMPC Gift Card priority, payment provider failover routing, and webhook event normalization against FakePrisma and FakeKv; only a live deployment proves real geo-IP lookups, provider HTTP endpoints, and live WMPC gift card balances behave as assumed.

---

## 1. Backwards Compatibility & Route Mounting

- [ ] `GET /api/v1/global-currency/*`, `GET/POST /api/v1/payments/*`, `GET/POST /api/v1/billing/*`, and `GET/POST /api/v1/gift-cards/*` answer on their original paths and shapes without interruption.
- [ ] `GET /api/v1/geo-billing/context` returns `200 OK` with automatically detected country, currency, tax rules, and prioritized payment methods.
- [ ] All authenticated `/api/v1/geo-billing/*` endpoints refuse anonymous callers (`401 Unauthorized`) and enforce organization scoping (`403 Forbidden`).

---

## 2. Automatic Localization & Country Payment Profiles

- [ ] A caller from Nigeria (`NG`) receives default currency `NGN` (₦), 7.5% VAT, and payment priority `["wmpc-gift-card", "paystack", "flutterwave", "crypto"]`.
- [ ] A caller from the United States (`US`) receives default currency `USD` ($), state sales tax, and payment priority `["wmpc-gift-card", "stripe", "paypal", "crypto"]`.
- [ ] A caller from the United Kingdom (`GB`) receives default currency `GBP` (£), 20% VAT, and payment priority `["wmpc-gift-card", "stripe", "paypal", "crypto"]`.
- [ ] A caller from Europe (`DE` / `FR`) receives default currency `EUR` (€), 19%/20% VAT, and payment priority `["wmpc-gift-card", "stripe", "paypal", "crypto"]`.
- [ ] `PUT /api/v1/geo-billing/profiles/:country` updates tax rules and supported payment methods without application downtime.

---

## 3. WMPC Gift Card Priority & Payment Routing

- [ ] When `useGiftCardBalance: true` is passed to `POST /api/v1/geo-billing/route-payment` and an active gift card covers the total, `wmpc-gift-card` is selected as the primary payment method.
- [ ] When a gift card partially covers the total, the remaining balance is routed automatically to the country's prioritized payment gateway (`paystack`, `flutterwave`, `paypal`, or `crypto`).
- [ ] If a prioritized payment provider is unconfigured or unavailable, the routing engine automatically fails over to the next supported provider in the country profile.

---

## 4. Tax Engine & Unified Webhook Normalizer

- [ ] `POST /api/v1/geo-billing/tax-calculate` correctly computes gross and net amounts for regional VAT, GST, Sales Tax, and DST, and zeros tax when `isExempt: true`.
- [ ] `POST /api/v1/geo-billing/webhook/normalize` accepts provider webhooks from Flutterwave, Paystack, PayPal, Stripe, and Blockonomics, converts them into a standard `UnifiedPaymentEvent`, and dispatches to `EventBus`.

---

## 5. UI & Audit Verification

- [ ] `/app/geo-billing` renders the Geo-Billing Context card, Dynamic Checkout Tester, Country Payment Profiles table, and AI Billing Insights without console errors.
- [ ] Verify S89 tenant isolation sweep confirms `geob:profile` namespace is `org_scoped` and conforming without org-segment index shifts.
- [ ] Verify `node audit/build-inventory.mjs` lists `geoBilling` as **COMPLETE** and reports **110 COMPLETE / 0 PARTIAL / 0 STUB / 0 DEMO DATA / 0 MISSING** across 110 modules.
