# Blockonomics Integration — Stage 6 Billing and Ledger Settlement

**Stage:** 6 of 15  
**Code status:** COMPLETE  
**Real-PostgreSQL transaction validation:** PENDING TARGET RUNTIME

## Delivered

- Added one atomic PostgreSQL settlement transaction for confirmed/reconciled
  Blockonomics payments.
- Requires `confirmed` + `matched`; browser, unconfirmed, mismatched, late, or
  review-state payments cannot settle.
- Writes one idempotent invoice allocation.
- Writes one idempotent entry in the existing billing ledger—no second ledger.
- Uses debit `crypto_cash:blockonomics` and credit `accounts_receivable`.
- Computes invoice coverage from all applied allocations, including existing
  WMPC Gift Card allocations.
- Marks invoice paid only when applied allocations exactly equal invoice total.
- Activates the existing subscription only after its invoice is fully paid.
- Completes the provider payment, stores receipt metadata, and writes audit
  evidence in the same transaction.
- Retries return idempotently without duplicate allocation, journal, invoice,
  subscription, or audit effects.
- Allocation overflow is rejected and rolled back rather than hidden.
- Confirmed payments with no invoice/entitlement target go to under-review.
- Added an internal organization-scoped invoice-settlement path and fixed the
  prior provider call that passed organization ID to a user-ID function.

## Wallet/entitlement truth

The repository has no authoritative general billing wallet. This stage does not
claim a wallet credit. It settles durable invoices and existing subscriptions.
Other product entitlements require explicit later adapters.

## Verification

- Atomic settlement/conservation/idempotency tests: 6/6 passed.
- Callback/monitoring tests: 9/9 passed.
- Existing billing tests: 31/31 passed.
- Existing payment tests: 22/22 passed.
- API typecheck passed.

The transaction is coded through `prisma.$transaction`; applying it over real
PostgreSQL remains mandatory in Stage 15 because this workspace has no running
PostgreSQL daemon.
