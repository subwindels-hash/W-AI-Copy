# Blockonomics Integration — Stage 8 Checkout UI

**Stage:** 8 of 15

**Code status:** COMPLETE

**Real browser/provider validation:** PENDING TARGET RUNTIME

## Delivered

- Extended the existing Payment Gateways page; no parallel checkout application
  or client-side provider adapter was created.
- Added a Blockonomics settlement-asset selector for BTC and USDT on Ethereum
  ERC-20. Assets disabled by encrypted server configuration are disabled in the
  selector and are still enforced by the backend.
- Added open-invoice selection using the existing billing API. Invoice rows now
  expose applied and remaining minor units, allowing checkout to lock the exact
  balance after a WMPC Gift Card contribution.
- Added backend-originated payment instructions showing:
  - exact crypto amount reconstructed from persisted smallest units;
  - provider payment address;
  - BTC or USDT ERC-20 network warning;
  - current backend status;
  - observed and required confirmations;
  - quote countdown;
  - Test Mode indicator when reported by provider configuration.
- Added locally generated QR codes:
  - BTC uses a BIP-21 URI containing the exact backend amount;
  - USDT uses the address only because there is no universal safe ERC-20 payment
    URI, while the exact amount and Ethereum-only warning remain visible.
- Added five-second polling and manual refresh through the authenticated WINDELS
  backend status endpoint. The browser never calls Blockonomics directly.
- Added USDT transaction-hash submission through the authenticated backend
  monitor endpoint with Ethereum hash shape validation. The UI explicitly says
  that submission starts monitoring and cannot complete or credit payment.
- Kept quote-timer expiry separate from payment state. Browser time cannot mark
  a payment expired, confirmed, completed, or settled.
- Removed checkout language that could imply TRON or BNB support from
  Blockonomics. The pre-existing generic `crypto` provider remains visibly
  fail-closed.
- Added typed web API functions for backend status and USDT monitoring; no
  secret, callback token, API key, or provider credential is exposed.

## Backend billing support for the UI

The existing billing overview now reports `allocatedCents` and
`remainingCents` per invoice and computes accounts receivable from the remaining
balance. Currency-mismatched allocations are not counted, and allocation
overflow fails visibly instead of being hidden.

## Browser trust boundary

The checkout page can display provider instructions, request monitoring, and
poll backend state. It cannot write confirmations, reconcile a transaction,
settle an invoice, activate a subscription, or credit a wallet. Only the
Stage 5–6 backend callback/reconciliation and atomic settlement path can produce
`completed`.

## Verification

- Blockonomics checkout presentation/helper tests: 5/5 passed.
- Relevant billing/payment/Blockonomics regression tests: 56/56 passed.
- Shared, API, and web TypeScript checks passed.
- Web production build passed (`tsc -b && vite build`).
- Patch whitespace validation passed.

The build reported the repository's existing large-chunk optimization warning;
it did not fail. Real browser interaction against a deployed API, real QR wallet
scanning, real Blockonomics Test Mode status progression, and PostgreSQL-backed
invoice selection remain Stage 15 target-runtime gates. This is not a
production-complete claim.
