# Session 128 Runtime Validation Checklist — Multi-Provider Payment Gateways (Flutterwave, Paystack, PayPal & Crypto/Blockonomics)

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 128 stays 🟡 VERIFIED (partial).

The unit suites prove Flutterwave, Paystack, PayPal, and Blockonomics (BTC, Tron TRC-20, ETH ERC-20, BNB Chain) initialization, HMAC signature verification, crypto exchange conversion, confirmation thresholds, and invoice settlement against FakePrisma and FakeKv; only a live deployment proves provider HTTP endpoints, live webhooks, and real block confirmations behave as assumed.

---

## 1. Backwards Compatibility & Route Mounting

- [ ] `GET /api/v1/billing/*` and `POST /api/v1/billing/webhook` answer on their original paths and shapes without interruption.
- [ ] `GET /api/v1/payments/providers` returns `200 OK` with configured status for all 4 providers (`flutterwave`, `paystack`, `paypal`, `crypto`).
- [ ] All authenticated `/api/v1/payments/*` endpoints refuse anonymous callers (`401 Unauthorized`) and enforce organization scoping (`403 Forbidden`).

---

## 2. Flutterwave & Paystack (African & Global Gateways)

- [ ] `POST /api/v1/payments/flutterwave/initialize` initiates a transaction in NGN, GHS, KES, ZAR, or USD and returns a valid checkout URL and `FLW_WIN_...` reference.
- [ ] `GET /api/v1/payments/flutterwave/verify/:reference` confirms transaction status and settles the organization ledger.
- [ ] `POST /api/v1/payments/flutterwave/webhook` verifies `verif-hash` signature in constant time and ignores requests with invalid hashes (`401 Unauthorized`).
- [ ] `POST /api/v1/payments/paystack/initialize` initiates checkout and returns `PYS_WIN_...` reference.
- [ ] `POST /api/v1/payments/paystack/webhook` verifies SHA512 HMAC `x-paystack-signature` header in constant time.

---

## 3. PayPal (Global Alternative Checkout)

- [ ] `POST /api/v1/payments/paypal/create-order` creates a PayPal Checkout order (`PPL_WIN_...`) and returns an approval link.
- [ ] `POST /api/v1/payments/paypal/capture-order` captures approved orders and marks the transaction `completed`.
- [ ] `POST /api/v1/payments/paypal/webhook` validates transmission ID and webhook signature headers.

---

## 4. Blockonomics & Crypto Payments (BTC, Tron TRC-20, ETH ERC-20, BNB Chain)

- [ ] `POST /api/v1/payments/crypto/create-charge` supports `btc`, `tron_trc20`, `eth_erc20`, and `bnb_chain` networks, calculates real-time crypto amounts, and returns an on-chain deposit address.
- [ ] Confirm required confirmation thresholds hold:
  - **Bitcoin (BTC):** 1 confirmation
  - **Tron (TRC-20 USDT/TRX):** 19 confirmations
  - **Ethereum (ERC-20 USDT/ETH):** 12 confirmations
  - **BNB Chain (BNB/BEP-20 USDT):** 15 confirmations
- [ ] `POST /api/v1/payments/crypto/callback` verifies callback secret, checks paid confirmations against network threshold, and marks transaction `completed` when threshold is reached.

---

## 5. UI & Audit Verification

- [ ] `/app/payments` renders Provider Status cards, Multi-Chain Crypto checkout selector, and Organization Payment Transactions table without console errors.
- [ ] Verify S89 tenant isolation sweep confirms `pay:tx` namespace is `org_scoped` and conforming without org-segment index shifts.
- [ ] Verify `node audit/build-inventory.mjs` lists `payments` as **COMPLETE** and reports **109 COMPLETE / 0 PARTIAL / 0 STUB / 0 DEMO DATA / 0 MISSING** across 109 modules.
