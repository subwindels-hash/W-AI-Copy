# Blockonomics Integration — Stage 1 Architecture Audit

**Audit date:** 2026-08-17  
**Stage:** 1 of 15 — architecture audit  
**Status:** COMPLETE (design/audit only; no provider is enabled by this stage)  
**Production status:** NOT IMPLEMENTED / NOT VALIDATED

This audit is the mandatory first gate for adding Blockonomics without creating a
second billing system or weakening the fail-closed payment controls delivered in
P0.1. It describes the repository as it exists, the current official
Blockonomics contract, the gaps that must be closed, and the additive target
architecture for Stages 2–15.

## 1. Non-negotiable decisions

1. **Blockonomics will use a new provider ID: `blockonomics`.** It will not
   replace or repurpose the existing `crypto` provider. The existing blocked
   crypto provider and Stripe, PayPal, Paystack, Flutterwave, and WMPC Gift Card
   paths remain present.
2. **PostgreSQL will be the authoritative payment record.** The current bounded
   Redis `pay:tx` ledger may remain a cache/compatibility projection, but cannot
   be the financial source of truth for Blockonomics.
3. **A browser/WebSocket notification never completes a payment.** Only a
   server callback plus independent provider reconciliation can reach
   `COMPLETED`.
4. **Only provider-supported payment networks will be advertised.** The current
   Blockonomics contract supports BTC and USDT on Ethereum/ERC-20 for merchant
   receiving. It does not justify advertising TRON or BNB Chain.
5. **No automatic recurring claim.** Blockonomics payments fund an invoice or
   renewal invoice. A new manual renewal payment is required for the next cycle.
6. **No wallet or generic entitlement claim will be invented.** The repository
   has no authoritative general-purpose user wallet or entitlement service.
   Invoice/subscription activation can be integrated; other entitlements need
   explicit adapters in later stages.
7. **Split tender must be allocation-based.** A WMPC Gift Card contribution and
   Blockonomics remainder must be recorded as separate allocations against one
   invoice. A gift-card debit must never be lost because the external remainder
   expires.

## 2. Official Blockonomics contract verified for this design

Primary references:

- `https://developers.blockonomics.co/docs`
- `https://developers.blockonomics.co/docs/merchants`
- `https://developers.blockonomics.co/docs/guides/receiving-payments`
- `https://developers.blockonomics.co/docs/guides/callbacks`
- `https://developers.blockonomics.co/docs/guides/testing`
- `https://developers.blockonomics.co/openapi.json`

Verified facts:

| Contract area | Official behavior | Design consequence |
|---|---|---|
| Base URL | `https://www.blockonomics.co/api` | HTTPS-only adapter with a fixed production allowlisted origin |
| Authentication | Bearer API key for authenticated endpoints | API key stays server-side in encrypted provider configuration |
| Payment assets | Merchant receiving flow documents BTC and USDT (Ethereum/ERC-20) | Initial provider capabilities are `BTC` and `USDT_ERC20` only |
| BTC address | `POST /new_address?match_callback=...&crypto=BTC&reset=0` | Generate one new address per payment; never reuse with `reset=1` |
| USDT address | `POST /new_address?...&crypto=USDT` | Address may be reused by the provider wallet; transaction hash is required for correlation |
| Price | `GET /price?crypto=BTC|USDT&currency=...` | Crypto amount is calculated server-side from a live provider quote and stored with quote time |
| USDT monitor | `POST /monitor_tx` with `txhash`, `crypto=USDT`, `match_callback`, and `testnet` | Add an authenticated backend endpoint for submitting the wallet-produced tx hash; it does not mark payment paid |
| Callback method | HTTP `GET` to the configured store callback URL | Public GET webhook route, not the existing JSON POST callback shape |
| Callback fields | `addr`, `crypto`, `status`, `value`, `txid`, optional `rbf` | Strict query validation; smallest-unit comparison (BTC 8 decimals, USDT 6) |
| Callback status | `0` unconfirmed, `1` one confirmation, `2` two-or-more/final | Map to DETECTED, CONFIRMING, CONFIRMED; only status 2 is eligible for completion |
| Callback authentication | High-entropy secret embedded in configured callback URL | Constant-time secret comparison plus independent provider reconciliation; no HMAC is documented |
| Callback retries | Failed callbacks retried up to seven times with exponential backoff | Return 200 only after durable event acceptance; async/retry-safe processing |
| Callback idempotency | Provider says a unique `(txid,status,addr)` combination is sent once, but consumers must remain idempotent | Durable unique event key in PostgreSQL, not a short-lived Redis-only lock |
| RBF | May be present for unconfirmed BTC | Never credit unconfirmed; preserve RBF evidence for review |
| Reconciliation | `GET /v2/payments` returns confirmed store payments and supports crypto/timeframe/currency filters | Periodic and operator-triggered reconciliation against durable Payment records |
| Testing | Test Mode is enabled per store and fires real callbacks via Test Bench | `testMode` is configuration/attestation, not a fake local success path or alternate mock API |
| BTC address expiry | Address does not expire; checkout timer only locks the quote | Payment quote may expire while a late blockchain payment is still recorded and sent to review/reconciliation |

## 3. Current WINDELS architecture inventory

### 3.1 Existing provider orchestration

| Component | Current role | Reuse decision |
|---|---|---|
| `apps/api/src/payments/payments.service.ts` | Provider list, checkout routing, reference indexing, settlement invariant checks, Redis transaction projection | Extend provider registry/adapter dispatch additively; preserve existing fiat adapters |
| `apps/api/src/payments/paymentConfig.ts` | Provider configuration errors, callback origin, HTTPS URL validation, money comparison | Reuse shared fail-closed helpers |
| `apps/api/src/payments/{stripe,paypal,paystack,flutterwave}.service.ts` | Real provider-specific adapters | Do not modify for Stage 1; Blockonomics receives its own adapter |
| `apps/api/src/payments/crypto.service.ts` | Safety gate blocking placeholder crypto | Leave blocked; Blockonomics is separate |
| `apps/api/src/http/routes/payments.ts` | Existing versioned `/api/v1/payments` surface, webhooks, history | Add Blockonomics routes under the same router |
| `packages/shared/src/payments.ts` | Shared providers, transaction statuses, checkout contracts | Extend additively with `blockonomics` and crypto detail fields |
| `apps/web/src/pages/billing/PaymentGatewaysPage.tsx` | Existing checkout/provider/history UI | Extend this page; no disconnected checkout product |

### 3.2 Billing, invoice, subscription, and ledger

| Component | Current reality | Blocker/design action |
|---|---|---|
| `BillingSubscription` | Durable Postgres subscription row | Use existing subscription; only activate/restore after a fully paid invoice |
| `Invoice` | Durable Postgres invoice with amount/currency/status | Reuse as payable object; add relations to durable payments/allocations |
| `services/billing.service.ts` | Invoice/subscription lifecycle and audit writes | Add an internal org-scoped verified-payment function; do not pass org ID to a function that expects user ID |
| `BillingLedgerEntry` | Postgres model currently requires `giftCardId` and stores one debit/credit pair | Generalize additively: nullable gift card, optional payment ID/provider, unique journal/idempotency key |
| WMPC Gift Card | Redis card/transaction register plus a gift-card-specific Postgres ledger write | Preserve card engine; add invoice allocations for safe split tender |
| Platform Services billing | Separate Redis operational/demo account module | Not authoritative for Blockonomics; do not integrate payment settlement into it |

### 3.3 Currency

| Component | Current reality | Reuse decision |
|---|---|---|
| Global Currency / Geo Billing | Country preference, fiat display, tax/routing helpers | Reuse display/country selection and invoice currency |
| Exchange rates | Frankfurter/open.er-api with explicitly synthetic fallback | Synthetic/stale rates must be prohibited from financial settlement |
| Blockonomics `/price` | Live crypto/fiat quote from provider | Authoritative checkout crypto quote; store rate, units, and timestamp |

### 3.4 Webhooks, audit, security, and observability

| Component | Current reality | Reuse decision |
|---|---|---|
| Raw-body JSON webhook support | Present for POST providers | Blockonomics uses a separate validated GET callback path |
| Payment idempotency | Redis key with 31-day TTL | Insufficient for financial finality; add durable webhook-event uniqueness |
| Central audit service | Postgres `AuditLog` plus Redis recent stream | Reuse; add Blockonomics payment/webhook/reconciliation actions |
| AES-256-GCM credential envelopes | Key IDs, keyring rotation, plaintext adoption | Reuse for provider API key and callback secret |
| Request rate limiting | Existing `/api` limits | Add a dedicated webhook limit that does not block legitimate callback progressions |
| Metrics/EventBus | Existing payment events and metrics framework | Add provider/API/webhook/confirmation/reconciliation metrics without secrets |

### 3.5 Wallet and entitlements

There is **no authoritative general-purpose billing wallet model/service** in the
current repository. Crypto Intelligence “wallets” are monitoring records, not
customer balances. Licensing has feature checks but is not connected to invoice
payment. Therefore:

- Stage 6 can settle invoices and activate the existing subscription.
- Marketplace/API/agent/token/storage/media entitlements require an explicit
  payment-entitlement adapter or allocation table in a later stage.
- No implementation may say “wallet credited” unless such a durable subsystem
  is added and tested.

## 4. Critical findings that must be repaired during implementation

### A1 — payment records are not durable financial records

`PaymentTransaction` exists only as a shared TypeScript schema and a bounded
Redis projection capped at 500 records per organization. It has no PostgreSQL
model, foreign keys, durable provider uniqueness, or recovery guarantee.

**Required:** add a durable `PaymentRecord` (or equivalent existing-name-safe
model) and make PostgreSQL authoritative for Blockonomics.

### A2 — billing settlement currently passes the wrong identity type

`PaymentGatewaysService.applyVerifiedResult()` passes `organizationId` into
`billing.markInvoicePaid()`, but that function treats its first argument as a
**user ID** and resolves organization context from it. The failure is caught and
left for reconciliation.

**Required:** add an internal `markInvoicePaidByVerifiedPayment(organizationId,
paymentId, ...)` path that validates the invoice and runs in the same database
transaction as ledger/payment finalization.

### A3 — current ledger model is gift-card-specific

`BillingLedgerEntry.giftCardId` is mandatory. There is no provider payment FK,
journal idempotency key, provider source, or reversal relationship.

**Required:** generalize the existing ledger model additively; do not create a
parallel Blockonomics ledger.

### A4 — ledger debit/credit semantics need correction

Current gift-card invoice settlement writes debit `accounts_receivable` and
credit `gift_card_liability`. A redemption normally reduces both the liability
and receivable (debit gift-card liability, credit accounts receivable). The
existing direction must be reviewed and corrected with accounting tests before
Blockonomics entries rely on the ledger.

### A5 — subscription state may change before payment

`updateSubscription()` creates an open invoice and immediately updates the plan
and period. Payment is not the gate for all entitlement state.

**Required:** for Blockonomics, fund an existing invoice/renewal request and
activate entitlement only from the verified settlement transaction. Broader
subscription lifecycle correction is tracked separately.

### A6 — no durable webhook inbox

Redis replay locks expire and do not retain payload hash, attempts, status, or
failure evidence for administration/reconciliation.

**Required:** add a durable `PaymentWebhookEvent` with a unique provider event
key such as `blockonomics:{crypto}:{addr}:{txid}:{status}:{value}`.

### A7 — no safe split-tender allocation model

Geo Billing can redeem a gift card before an external provider checkout
succeeds. The Invoice model cannot represent multiple contributions or a
remaining amount.

**Required:** add durable invoice payment allocations. Gift-card redemption is
one allocation; Blockonomics funds the remaining allocation. Never silently
reverse or discard a confirmed contribution.

### A8 — configuration platform does not actually encrypt values

`platformServices/config.service.ts` has an `encrypted` flag but stores `value`
as plaintext JSON in Redis. It cannot safely hold the Blockonomics API key.

**Required:** use the proven AES envelope helper in a durable Super-Admin-only
payment-provider configuration model/service. Environment values may be a
bootstrap override, not the only administration path.

### A9 — status model is too narrow

Current status is `pending|completed|failed|refunded|expired`. It cannot expose
provider progress or review/reconciliation state.

**Required:** extend additively to include `created`, `detected`, `confirming`,
`confirmed`, `cancelled`, and `under_review`; preserve existing values.

### A10 — “crypto” currently combines unsupported networks

The existing crypto request schema lists BTC, TRON, Ethereum, and BNB. Official
Blockonomics merchant receiving currently documents BTC and USDT ERC-20.

**Required:** Blockonomics capability truth must be provider-specific. Do not
infer provider support from the generic crypto enum.

## 5. Additive target data model for Stage 2

Names are provisional until Prisma validation, but responsibilities are fixed.

### 5.1 `PaymentProviderConfiguration`

- `provider` unique (`blockonomics`)
- `enabled`
- `testMode` (attests external store Test Mode)
- encrypted API key envelope
- encrypted callback secret envelope
- `matchCallback`
- supported assets (`BTC`, `USDT_ERC20`)
- quote expiry minutes
- required final provider status (minimum 2)
- configuration version, updater, timestamps
- last health check/status/error

Only Super Admin may write or reveal connection state. Secret values are never
returned.

### 5.2 `PaymentRecord`

- organization, user/requester, invoice, subscription
- provider (`blockonomics`)
- internal reference
- provider payment/address identifier
- provider transaction ID / tx hash
- status and provider status
- fiat amount in integer minor units and fiat currency
- crypto asset/network
- expected crypto amount in integer smallest units
- received crypto amount in integer smallest units
- payment address
- quote price and quote timestamp
- confirmations / required confirmations
- expires/quote-expired time
- detected/confirmed/completed timestamps
- reconciliation status and last check
- immutable creation metadata and bounded non-secret provider metadata

Unique constraints:

- `(provider, internalReference)`
- `(provider, paymentAddress, organizationId)` where practical
- `(provider, providerTransactionId)` when not null

### 5.3 `PaymentWebhookEvent`

- provider
- durable unique event key
- payload/query hash (not secret query value)
- payment ID when resolved
- provider transaction ID and status
- received/processed timestamps
- processing status, attempts, error code/message

### 5.4 `InvoicePaymentAllocation`

- invoice ID
- source kind (`gift_card`, `provider_payment`, `adjustment`)
- source ID/payment ID
- amount cents and currency
- status (`reserved`, `applied`, `reversed`, `under_review`)
- unique source allocation key

Invoice completion is computed from confirmed/applied allocations, not a browser
claim.

### 5.5 Existing `BillingLedgerEntry` extension

- make `giftCardId` nullable
- optional `paymentId`
- provider/source
- journal/idempotency key unique
- optional reversal-of entry
- preserve debit/credit account and amount fields

No second ledger table is needed.

## 6. Provider adapter contract

`BlockonomicsProvider` will implement the existing provider lifecycle through a
provider-specific adapter:

1. `configuration()` — configured/enabled/test-mode/health truth
2. `createPayment()` — durable reference, live price, new address, exact units
3. `monitorUsdtTransaction()` — records tx hash and calls `/monitor_tx`
4. `mapCallbackStatus()` — provider status to WINDELS lifecycle
5. `verifyConfirmedPayment()` — reconcile final callbacks against
   `/v2/payments` before completion
6. `listConfirmedPayments()` — reconciliation
7. `health()` — authenticated capability check without creating an address

No provider method may mutate invoices, subscriptions, gift cards, or ledger
rows directly. The central settlement coordinator owns those transitions.

## 7. End-to-end state machine

| WINDELS state | Entry condition | Financial effect |
|---|---|---|
| `created` | Durable local record exists | None |
| `pending` | Live quote + provider address returned | None |
| `detected` | Valid status 0 callback / monitored USDT tx | None |
| `confirming` | Valid status 1 callback | None |
| `confirmed` | Status 2 callback and independently reconciled exact payment | Eligible for atomic settlement |
| `completed` | Ledger, allocation, invoice, subscription, audit committed | Credit/entitlement exactly once |
| `expired` | Quote timer elapsed without confirmed payment | None; late payment goes to review |
| `failed` | Provider/API terminal failure before funds | None |
| `cancelled` | User/admin cancels before detected funds | None |
| `under_review` | Under/overpayment, wrong asset/network, late payment, duplicate tx, reconciliation mismatch | No automatic credit |

## 8. Callback validation design

1. Public `GET /api/v1/payments/blockonomics/webhook`.
2. Strictly parse one value each for secret, address, crypto, integer status,
   integer value, transaction ID, optional RBF.
3. Constant-time compare callback secret.
4. Derive a durable event key and insert with unique constraint.
5. Match by provider/address (and USDT tx hash when known), never by browser data.
6. Record status 0/1 without financial credit.
7. For status 2, query provider history and match txid, asset, address, and
   smallest-unit amount.
8. Underpayment/ambiguous/late payments become `under_review`.
9. In one database transaction: update payment; apply allocation; write ledger;
   settle invoice/subscription; write durable audit marker.
10. Return 200 after durable processing. Transient infrastructure/provider
    failures return non-200 so Blockonomics retries.

The secret alone is not sufficient proof of payment; it authenticates the
callback route while reconciliation proves transaction content.

## 9. WMPC Gift Card compatibility

The existing gift-card engine remains unchanged in provider behavior. Safe
mixed tender requires:

1. calculate invoice total and gift-card contribution;
2. record an applied gift-card allocation with its existing redemption ID;
3. create Blockonomics only for the exact remaining invoice balance;
4. keep the gift-card allocation if the crypto quote expires;
5. mark the invoice paid only when total applied allocations cover the invoice;
6. prohibit currency mismatch unless a non-synthetic locked conversion is
   recorded.

This avoids redeeming value and then losing it when the second provider fails.

## 10. Security/RBAC boundary

| Capability | Authority |
|---|---|
| Configure/enable/disable/rotate provider secrets | Super Admin only |
| View provider health/errors/reconciliation | Super Admin / designated billing admin |
| Create payment for own organization/invoice | Authenticated organization member with billing permission |
| View payment | Same organization; admin can view org history |
| Submit USDT tx hash | Same organization/payment owner; no settlement authority |
| Process provider callback | Public route with secret + provider verification; no user session |
| Reconcile payment | Super Admin/billing admin or scheduled system worker |
| Credit/mark invoice paid | Internal settlement coordinator only |
| AI explain/status/notify | Read-only permission-scoped tool |
| AI credit/debit/refund/adjust | Prohibited without a separately authorized human workflow |

## 11. Observability plan

Metrics (no address, API key, callback secret, or customer PII labels):

- `payments_provider_requests_total{provider,operation,status}`
- `payments_provider_latency_ms{provider,operation}`
- `payments_webhooks_total{provider,status,result}`
- `payments_confirmation_latency_ms{provider,asset}`
- `payments_reconciliation_total{provider,result}`
- `payments_under_review_total{provider,reason}`

Logs contain internal payment ID, provider, operation, status, latency, and error
code only. Addresses/txids may appear only in protected audit metadata in masked
or hashed form where operationally sufficient.

## 12. Stage gates

| Stage | Deliverable | Gate before next stage |
|---|---|---|
| 1 | This architecture audit | Complete |
| 2 | Prisma models/migration/provider enum/contracts | Migration validation; existing provider tests unchanged |
| 3 | Encrypted provider config + Blockonomics HTTP client | Unit tests for config, auth, timeout, errors, status mapping |
| 4 | Durable payment creation + quote/address | No fake response; amount/unit/address/expiry tests |
| 5 | Callback + USDT monitor + durable idempotency | Invalid secret/replay/mismatch/status progression tests |
| 6 | Atomic invoice/allocation/ledger/subscription/audit settlement | Conservation/idempotency/rollback tests over real Postgres |
| 7 | Currency and quote provenance | Synthetic/stale currency refusal tests |
| 8 | Existing checkout UI extension | UI build; no secret/client-side provider calls |
| 9 | Existing payment history extension | Org isolation and redaction tests |
| 10 | Super Admin configuration/dashboard | RBAC and secret non-disclosure tests |
| 11 | Scheduled/manual reconciliation | Missing/duplicate/mismatch tests; no silent balance adjustment |
| 12 | Security and AI read-only tools | Permission, replay, rate-limit, audit tests |
| 13 | Complete unit/integration/E2E suite | All repository tests/typechecks/build green |
| 14 | API/setup/runbook/validation documentation | Docs match measured behavior |
| 15 | Target-runtime validation | Real Test Mode callbacks and real API evidence recorded |

## 13. Stage 1 verdict

The existing provider router, fail-closed adapter convention, invoice,
subscription, gift-card engine, encryption, audit, EventBus, metrics, and UI can
be reused. However, the current Redis-only payment record, gift-card-specific
ledger, wrong identity argument in invoice settlement, missing split allocation,
plaintext-only config flag, and absent wallet/entitlement system prevent a safe
“just turn Blockonomics on” change.

**Stage 2 may proceed only with additive durable data models and migrations.**
Blockonomics remains disabled until later gates are completed and target-runtime
Test Mode evidence exists.
