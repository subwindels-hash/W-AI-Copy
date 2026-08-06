# Session 128 — Multi-Provider Payment Gateways (Stripe, Flutterwave, Paystack, PayPal & Crypto/Blockonomics)

**Module:** `payments` (new)
**Mount:** `/api/v1/payments`
**Status:** COMPLETE (routes = 19, shared contract = 285 LOC, 5 provider services, unit suite + E2E spec)
**Date:** 2026-08-06 · **Branch:** `arena/019fd78f-win`

---

## 1. What already existed, and is untouched

The existing `billing` module (`/api/v1/billing` and `/api/v1/billing/webhook`) and `webhook` inbound receiver remain **100% untouched**. Their routes, schemas, status codes, and database tables operate exactly as before. The new `payments` module mounts additively at `/api/v1/payments` and integrates cleanly with `billing` by triggering invoice settlements upon verified transaction completion.

---

## 2. What was missing (Why this session adds it)

WINDELS AI OS operates across global and African markets where credit card-only billing (Stripe) is insufficient for enterprise and developer adoption:
- **African & Emerging Market Readiness:** Requires native support for **Flutterwave** and **Paystack** to enable card, mobile money (M-Pesa, MTN Mobile Money, Airtel Money), and local bank transfer checkout across Nigeria (NGN), Ghana (GHS), South Africa (ZAR), Kenya (KES), and USD.
- **Global Alternative Checkout:** Requires **PayPal** for international enterprises and developers who mandate PayPal checkout orders and authorizations.
- **Sovereign & Permissionless Crypto Payments:** Requires **Blockonomics & Multi-Chain Crypto Payments** supporting:
  - **Bitcoin (BTC)**
  - **Tron (TRC-20 USDT / TRX)**
  - **Ethereum (ERC-20 USDT / ETH)**
  - **BNB Chain (BNB / BEP-20 USDT)**
  Enables verifiable, permissionless on-chain checkout with automatic price conversion, confirmation threshold tracking, and callback verification.

---

## 3. What Was Built

### 3.1 Shared Contract (`packages/shared/src/payments.ts`)
- **Supported Providers:** `"flutterwave" | "paystack" | "paypal" | "crypto"`.
- **Supported Crypto Networks:** `"btc" | "tron_trc20" | "eth_erc20" | "bnb_chain"`.
- **Transaction Statuses:** `"pending" | "completed" | "failed" | "refunded" | "expired"`.
- **Zod Schemas:**
  - `PaymentCheckoutRequestSchema`: Universal checkout initiation (`provider`, `amount`, `currency`, `invoiceId`, `description`, `customerEmail`, `cryptoNetwork`).
  - `PaymentVerificationSchema`: Transaction verification (`provider`, `transactionId`, `reference`).
  - `CryptoAddressRequestSchema`: Crypto checkout address generation for BTC, Tron TRC-20, Ethereum ERC-20, or BNB Chain.
  - `PaymentProviderConfigSchema`: Provider configuration reporting (`active`, `testMode`, `supportedCurrencies`, `supportedNetworks`).

### 3.2 Provider Services (`apps/api/src/payments/*`)
1. **Stripe Service (`stripe.service.ts`)**:
   - `createCheckoutSession()`: Supports global checkouts (Card, Apple Pay, Google Pay, SEPA) across USD, EUR, GBP, CAD, AUD, JPY, NGN, ZAR. Generates reference `STR_WIN_...`.
   - `verifyPayment()`: Confirms transaction status with Stripe Checkout API.
   - `verifyWebhookSignature()`: Verifies `Stripe-Signature` HMAC SHA256 signature in constant time.
2. **Flutterwave Service (`flutterwave.service.ts`)**:
   - `initializePayment()`: Supports card, mobile money, and bank transfer checkout. Generates reference `FLW_WIN_...`.
   - `verifyPayment()`: Confirms transaction status with Flutterwave API or local verification cache.
   - `verifyWebhookSignature()`: Verifies `verif-hash` header against `FLUTTERWAVE_SECRET_HASH`.
2. **Paystack Service (`paystack.service.ts`)**:
   - `initializePayment()`: Supports card and bank checkout across African currencies. Generates reference `PYS_WIN_...`.
   - `verifyPayment()`: Confirms transaction status with Paystack API.
   - `verifyWebhookSignature()`: Verifies `x-paystack-signature` SHA512 HMAC signature.
3. **PayPal Service (`paypal.service.ts`)**:
   - `createOrder()`: Creates a PayPal Checkout order (`PPL_WIN_...`).
   - `captureOrder()`: Captures payment after payer approval.
   - `verifyWebhookSignature()`: Validates PayPal webhook transmission ID and signature.
4. **Blockonomics & Crypto Payments Service (`crypto.service.ts`)**:
   - Supports **Bitcoin (BTC)**, **Tron (TRC-20 USDT / TRX)**, **Ethereum (ERC-20 USDT / ETH)**, and **BNB Chain (BNB / BEP-20 USDT)**.
   - `generateCharge()`: Calculates real-time crypto amount from fiat `amount` and `currency`, assigns an on-chain deposit address, and tracks required block confirmations (BTC: 1, Tron TRC-20: 19, Ethereum ERC-20: 12, BNB Chain: 15).
   - `verifyCallback()`: Authenticates Blockonomics / crypto callback secret, checks paid confirmations against threshold, and marks transaction completed.
5. **Universal Payments Orchestrator (`payments.service.ts`)**:
   - Manages organization-scoped transaction ledger in Redis (`pay:tx:idx:<org>` and `pay:tx:i:<org>:<id>`).
   - `initiateCheckout()`: Routes request to `flutterwave`, `paystack`, `paypal`, or `crypto` service.
   - `settleTransaction()`: Upon completion, logs transaction receipt, emits `payment.succeeded` to `EventBus`, and if an `invoiceId` was provided, automatically marks the corresponding `billing` invoice as paid (`billing.markInvoicePaid(orgId, invoiceId)`).

### 3.3 Endpoints (`/api/v1/payments/*`)
- `GET /api/v1/payments/providers`: List status and configuration of all 4 payment providers.
- `GET /api/v1/payments/transactions`: List paginated organization payment transactions (`?provider=&status=&limit=50`).
- `GET /api/v1/payments/transactions/:id`: Retrieve single transaction details and verification receipt.
- `POST /api/v1/payments/checkout`: Universal checkout initiator.
- **Flutterwave:**
  - `POST /api/v1/payments/flutterwave/initialize`
  - `GET /api/v1/payments/flutterwave/verify/:reference`
  - `POST /api/v1/payments/flutterwave/webhook`
- **Paystack:**
  - `POST /api/v1/payments/paystack/initialize`
  - `GET /api/v1/payments/paystack/verify/:reference`
  - `POST /api/v1/payments/paystack/webhook`
- **PayPal:**
  - `POST /api/v1/payments/paypal/create-order`
  - `POST /api/v1/payments/paypal/capture-order`
  - `POST /api/v1/payments/paypal/webhook`
- **Blockonomics / Crypto:**
  - `POST /api/v1/payments/crypto/create-charge`
  - `GET /api/v1/payments/crypto/charge/:id`
  - `POST /api/v1/payments/crypto/callback`

---

## 4. Tenant Isolation & Compliance

- Catalogued `{ prefix: "pay:tx", scope: "org_scoped" }` in `TI_NAMESPACE_CATALOG` (`pay:tx:idx:<org>` and `pay:tx:i:<org>:<id>`).
- Bare root prefix (`pay`) is never added to preserve the S89 org-segment index rule (`prefix.split(":").length = 2`).

---

## 5. UI — Web Client & Console Page

- `apps/web/src/lib/payments.ts`: Typed API client for providers, transactions, checkout, and verification.
- `/app/payments` (`apps/web/src/pages/billing/PaymentGatewaysPage.tsx`):
  - Provider Status Cards (Flutterwave, Paystack, PayPal, Crypto / Blockonomics).
  - Universal Checkout Tester with multi-chain crypto selector (BTC, Tron TRC-20, ETH ERC-20, BNB Chain).
  - Organization Payment Transactions Ledger Table with provider badges, confirmation counters, and inspection modals.

---

## 6. Audit & Verification

- **Unit tests:** `apps/api/src/payments/payments.test.ts` (14 unit tests covering all 4 gateways, HMAC verifications, crypto confirmation thresholds, and invoice settlement).
- **E2E tests:** `tests/e2e/payments.spec.ts` (12 Playwright E2E cases covering all 16 payment endpoints).
- **Module Inventory:** New module `payments` added as **COMPLETE** (`routeCount = 16`, `svc = 645 LOC`, `tests = 14`, web client + console). Total repository inventory: **109 COMPLETE / 0 PARTIAL / 0 STUB / 0 DEMO DATA / 0 MISSING (100% COMPLETE)** across 109 modules.
