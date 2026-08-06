# Session 129 — Global Currency, Payment Orchestration & Geo-Aware Billing Engine (`geoBilling`)

**Module:** `geoBilling` (new core capability)
**Mount:** `/api/v1/geo-billing`
**Status:** COMPLETE (routes = 9, shared contract = 295 LOC, service = 410 LOC, unit suite + E2E spec)
**Date:** 2026-08-06 · **Branch:** `arena/019fd78f-win`

---

## 1. Existing Infrastructure Reused (Untouched Legacy Contracts)

This engine is **not** a standalone currency converter or duplicate billing system. It acts as an intelligent orchestration layer that sits above and integrates directly with existing platform services:

| Existing System | How It Is Reused by `geoBilling` |
| --- | --- |
| **Billing & Subscriptions (`billing`)** | Keeps `/api/v1/billing/*` unchanged; paid checkouts automatically settle subscription invoices via `billing.markInvoicePaid()`. |
| **Multi-Provider Payment Gateways (`payments`)** | Keeps `/api/v1/payments/*` unchanged; checkouts route to Flutterwave, Paystack, PayPal, or Blockonomics/Crypto via `PaymentGatewaysService.initiateCheckout()`. |
| **Global Multi-Currency (`globalCurrency`)** | Keeps `/api/v1/global-currency/*` unchanged; exchange rates and localized formatting use `GlobalCurrencyService.getRate()` and `.localizePrice()`. |
| **WMPC Gift Card System (`giftCards`)** | Keeps `/api/v1/gift-cards/*` unchanged; WMPC Gift Cards are prioritized as the global #1 payment method, redeeming balances via `GiftCardsService.redeem()`. |
| **Inbound Webhook Receiver (`webhook`)** | Keeps `/api/v1/webhook/*` unchanged; raw provider webhooks are ingested and normalized into a standard event schema. |
| **God-Node Orchestrator (`KernelService`)** | Dispatches `geo-billing.*` events to the central kernel for enterprise audit and workflow automation. |

---

## 2. What Was Built (Core Platform Capability)

### 2.1 Shared Contract (`packages/shared/src/geoBilling.ts`)
- **Country Payment Profiles (`CountryPaymentProfile`):** Configurable profiles for 13+ global markets (`NG`, `US`, `GB`, `DE`, `FR`, `JP`, `CN`, `GH`, `KE`, `ZA`, `AE`, `SA`, `BR`, and default fallback).
  - Defines: `countryCode`, `countryName`, `currency`, `currencySymbol`, `supportedPaymentMethods`, `defaultPaymentMethod`, `taxRule` (`VAT`, `GST`, `Sales Tax`, `DST`), `numberFormat`, `dateFormat`, and `billingLanguage`.
- **Zod Schemas:**
  - `GeoBillingContextSchema`: Normalized geo-billing context returned to frontends.
  - `PaymentRoutingRequestSchema`: Input schema for payment routing and failover evaluation.
  - `TaxCalculationRequestSchema`: Input schema for regional tax calculation.
  - `GeoCheckoutRequestSchema`: Combined localized checkout initiator supporting gift card redemption and provider failover.
  - `UnifiedPaymentEventSchema`: Standardized webhook event payload across all payment gateways.

### 2.2 Core Service (`apps/api/src/geoBilling/geoBilling.service.ts`)
1. **Automatic Country & Currency Detection Engine:**
   - Evaluates user account settings, billing addresses, organization location, IP geolocation fallback, and explicit user preference overrides (`gcu:prefs:<userId>`).
   - Resolves caller context into a unified `GeoBillingContext` containing local currency, symbol, number formatting, tax rates, and prioritized payment providers.
2. **Smart Payment Routing & Failover Engine:**
   - Implements regional provider prioritization:
     - **Nigeria (`NG`):** WMPC Gift Card → Paystack → Flutterwave → Blockonomics (Crypto).
     - **United States / UK / Europe:** WMPC Gift Card → Stripe → PayPal → Blockonomics (Crypto).
     - **Other Regions:** Configured regional gateways with fallback to PayPal and Blockonomics.
   - Automatically attempts failover to the next supported provider if the primary provider is unconfigured or unavailable.
3. **WMPC Gift Card Priority Integration:**
   - WMPC Gift Card is integrated as a globally available primary payment method across every country profile.
   - During checkout, existing card balances are applied first; any remaining balance is routed seamlessly to the local payment gateway.
4. **Tax & Compliance Engine:**
   - Computes country-specific tax obligations (e.g., Nigeria: 7.5% VAT; UK: 20% VAT; Germany: 19% VAT; US: State Sales Tax; Japan: 10% Consumption Tax).
   - Supports auditable tax exemptions for qualified organizations (`isExempt: true`).
5. **Unified Webhook Gateway & Normalizer:**
   - Ingests incoming events from Flutterwave, Paystack, PayPal, Stripe, and Blockonomics, converting them into a normalized `UnifiedPaymentEvent` (`payment.initiated`, `payment.completed`, `payment.failed`, `refund.issued`, `chargeback.received`, `gift_card.redeemed`).
   - Emits standardized events to `EventBus` (`geoBilling.event_normalized`) and `KernelService.dispatch()`.
6. **AI Billing Employee Context & Recommendations:**
   - Evaluates organization payment history and country profile to recommend the lowest-cost payment provider, explain local tax rules, and flag failed payment patterns.

### 2.3 Endpoints (`/api/v1/geo-billing/*`)
- `GET /api/v1/geo-billing/context`: Resolve caller's country, currency, tax rules, and prioritized payment methods.
- `GET /api/v1/geo-billing/profiles`: List all configurable Country Payment Profiles.
- `GET /api/v1/geo-billing/profiles/:country`: Retrieve a single Country Payment Profile.
- `PUT /api/v1/geo-billing/profiles/:country`: Admin/Super Admin endpoint to update a Country Payment Profile without application downtime.
- `POST /api/v1/geo-billing/route-payment`: Intelligent payment routing engine evaluation and failover calculation.
- `POST /api/v1/geo-billing/tax-calculate`: Compute local taxes and net/gross totals for any amount and country.
- `POST /api/v1/geo-billing/webhook/normalize`: Unified Webhook Gateway normalizer endpoint.
- `GET /api/v1/geo-billing/ai-insights`: Retrieve AI Billing Employee recommendations and regional cost optimization insights.
- `POST /api/v1/geo-billing/checkout/initiate`: Dynamic localized checkout initiator combining WMPC Gift Card redemption, tax calculation, currency conversion, and provider failover.

---

## 3. Tenant Isolation & Compliance

- Catalogued `{ prefix: "geob:profile", scope: "org_scoped" }` in `TI_NAMESPACE_CATALOG` (`geob:profile:idx:<org>` / `geob:profile:i:<org>:<id>`).
- Bare root prefix (`geob`) is omitted to preserve the S89 org-segment index rule (`prefix.split(":").length = 2`).

---

## 4. UI — Web Client & Console Page

- `apps/web/src/lib/geoBilling.ts`: Typed client for context resolution, profiles, tax calculation, routing, AI insights, and localized checkout.
- `/app/geo-billing` (`apps/web/src/pages/billing/GeoBillingConsolePage.tsx`):
  - **Geo-Billing Context Card:** Real-time caller localization display (Country, Currency, Symbol, Tax Rate, WMPC Gift Card Priority).
  - **Dynamic Localized Checkout Tester:** Multi-currency checkout form with gift card balance application and provider failover routing.
  - **Country Payment Profiles Manager:** Table of all 13+ regional payment profiles with admin edit controls for taxes, currencies, and prioritized providers.
  - **AI Billing Employee Insights:** Natural language recommendations for regional payment optimization and fee reduction.

---

## 5. Audit & Verification

- **Unit tests:** `apps/api/src/geoBilling/geoBilling.test.ts` (12 unit tests covering country detection, tax calculation, WMPC gift card priority, provider failover routing, profile updates, webhook normalization, and AI recommendations).
- **E2E tests:** `tests/e2e/geoBilling.spec.ts` (10 Playwright E2E cases covering all 9 `/api/v1/geo-billing/*` endpoints).
- **Module Inventory:** New module `geoBilling` added as **COMPLETE** (`routeCount = 9`, `svc = 410 LOC`, `tests = 12`, web client + console). Total repository inventory: **110 COMPLETE / 0 PARTIAL / 0 STUB / 0 DEMO DATA / 0 MISSING (100% COMPLETE)** across 110 modules.
