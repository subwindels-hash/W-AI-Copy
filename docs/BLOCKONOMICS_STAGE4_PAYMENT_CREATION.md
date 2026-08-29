# Blockonomics Integration — Stage 4 Durable Payment Creation

**Stage:** 4 of 15  
**Code status:** COMPLETE  
**Settlement/webhook status:** NOT IMPLEMENTED UNTIL STAGES 5–6  
**Provider registry UI status:** BLOCKED UNTIL STAGE 8

## Delivered

- Added durable Blockonomics payment creation in the existing payment service.
- The PostgreSQL `PaymentRecord` is written in `created` state before any
  non-idempotent address allocation call.
- Validates invoice organization, lifecycle, currency, and exact amount before
  contacting Blockonomics.
- Uses official live `/price` and `/new_address` provider calls.
- Calculates BTC (8 decimals) or USDT (6 decimals) smallest units server-side.
- Requests BTC addresses with `reset=0` and provider callback matching.
- Stores quote price/source/time, address, exact expected units, network,
  required final status, and quote expiry.
- Returns only safe payment instructions; no API key, callback secret, wallet
  account/xPub, or provider internals are exposed.
- Provider errors mark the durable local record failed/reconciliation-required
  and return no fake address or payment success.
- Added authenticated APIs through both universal checkout and
  `POST /api/v1/payments/blockonomics/create`.
- Added organization-scoped get/list service methods for later history/UI work.

## Explicit non-effects

Stage 4 does not credit a wallet, settle an invoice, activate a subscription,
write a billing journal, or accept a browser payment claim. Those transitions
remain impossible until callback verification and atomic settlement pass Stages
5–6.

## Verification

- Durable payment creation tests: 5/5 passed.
- Provider config/client tests: 8/8 passed.
- Existing payment tests: 22/22 passed.
- Shared and API typechecks passed.

Live Test Mode address/quote evidence remains a Stage 15 target-runtime gate.
