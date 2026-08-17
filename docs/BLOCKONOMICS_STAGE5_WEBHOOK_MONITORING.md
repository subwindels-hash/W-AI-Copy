# Blockonomics Integration — Stage 5 Webhook and Monitoring

**Stage:** 5 of 15  
**Code status:** COMPLETE  
**Financial settlement status:** BLOCKED UNTIL STAGE 6

## Delivered

- Added the official public HTTP GET callback route under the existing payment
  API.
- Added strict query validation for secret, address, asset, status, smallest-unit
  value, transaction ID, and optional RBF flag.
- Added constant-time callback-secret verification.
- Added a durable PostgreSQL webhook inbox with unique event keys, payload hash,
  attempts, processing result, and failure evidence.
- Added exact provider status progression:
  - 0 → detected
  - 1 → confirming
  - 2 → independently reconciled confirmed/under-review
- Added independent final verification against Blockonomics `/v2/payments`.
- Added exact smallest-unit amount/asset/address/transaction matching.
- Added duplicate transaction, underpayment, overpayment, provider mismatch,
  ambiguous address, unknown payment, and late-payment review states.
- Added authenticated USDT transaction-hash monitoring through official
  `/monitor_tx`.
- Browser-submitted tx hashes can never mark a payment completed.
- Added organization/requester/asset/transaction uniqueness checks.
- Added organization-scoped payment-status API.
- Added webhook and provider metrics without secret/address labels.

## Explicit settlement boundary

A valid final callback can move a payment only to `confirmed`. It does not write
the billing ledger, mark an invoice paid, activate a subscription, or grant an
entitlement. Stage 6 owns that atomic transition.

## Verification

- Stage 5 callback/monitoring tests: 9/9 passed.
- Stage 4 creation tests: 5/5 passed.
- Stage 3 provider tests: 8/8 passed.
- Existing payment tests: 22/22 passed.
- API typecheck passed.

Real callbacks from Blockonomics Test Mode remain a Stage 15 target-runtime gate.
