# Blockonomics Integration — Stage 2 Payment Foundation

**Stage:** 2 of 15 — database/provider integration  
**Code status:** COMPLETE  
**Runtime migration status:** PENDING TARGET POSTGRESQL VALIDATION  
**Production status:** NOT ENABLED

## Delivered

- Added `blockonomics` to the existing provider contract without removing
  Stripe, PayPal, Paystack, Flutterwave, or the generic blocked `crypto` entry.
- Extended the existing payment lifecycle additively with created, detected,
  confirming, confirmed, cancelled, and under-review states.
- Added provider-specific Blockonomics contracts for BTC and USDT only.
- Added a durable global provider-configuration model with encrypted-secret
  envelope fields.
- Added an organization-scoped durable payment register.
- Added a durable idempotent payment webhook inbox.
- Added invoice payment allocations for mixed tender/WMPC compatibility.
- Generalized the existing `BillingLedgerEntry`; no second ledger was created.
- Corrected gift-card redemption journal direction and added a unique journal
  key while preserving the existing gift-card service.
- Added foreign keys, unique constraints, indexes, and RLS policies.

## New durable models

- `PaymentProviderConfiguration`
- `PaymentRecord`
- `PaymentWebhookEvent`
- `InvoicePaymentAllocation`

## Existing model extended

`BillingLedgerEntry` now supports either gift-card or provider-payment sources
through nullable `giftCardId`, optional `paymentId`, `sourceKind`, unique
`journalKey`, reversal metadata, and the original debit/credit fields.

## Verification

- Prisma real-client schema generation completed successfully in no-engine build
  mode, which validates model/relation syntax.
- Shared/API TypeScript compilation passed.
- Stage 2 foundation tests: 6/6 passed.
- Existing payment tests: 21/21 passed.
- Existing gift-card tests: 15/15 passed.
- Migration source contains durable uniqueness and RLS assertions.

A PostgreSQL daemon is not available in this workspace, so applying the migration
and running `scripts/validate-migrations.mjs` remains a target-runtime gate. This
is explicitly not a production-complete claim.

## Stage 3 entry gate

Stage 3 may implement only encrypted Blockonomics provider configuration and the
real HTTP client. Payment creation, webhook settlement, and UI remain disabled
until their own later stages pass.
