# Blockonomics Integration — Stage 7 Currency and WMPC Split Tender

**Stage:** 7 of 15

**Code status:** COMPLETE

**Real-PostgreSQL and provider validation:** PENDING TARGET RUNTIME

## Delivered

### Currency and quote provenance

- Added `blockonomics` to the existing geo-payment method contract and country
  payment profiles without replacing generic `crypto` or any fiat provider.
- Geo routing now selects only providers that are all of:
  - allowed by the country profile;
  - configured and enabled; and
  - declared to support the localized invoice currency.
- Blockonomics becomes routable only when its encrypted configuration is
  complete and enabled.
- Cross-currency checkout now rejects synthetic, offline, stale, or otherwise
  non-billable conversion data. Same-currency checkout does not require an FX
  conversion.
- The localized fiat amount remains the invoice/checkout amount. The
  authoritative crypto quote still comes directly from Blockonomics `/price`,
  and the payment record stores its provider source, observed time, price,
  expiry, and exact BTC/USDT smallest units.
- No fixed exchange rate or client-supplied crypto amount is accepted.

### WMPC Gift Card split tender

- Extended the existing WMPC invoice application path to support a partial
  requested contribution.
- Enforced invoice organization and exact currency matching before a card can
  be debited. Gift-card value is never implicitly converted.
- Persisted each successful gift-card contribution in the existing
  `InvoicePaymentAllocation` model and existing `BillingLedgerEntry` journal:
  - debit `gift_card_liability`;
  - credit `accounts_receivable`.
- Uses stable redemption, allocation, and journal idempotency keys, so retries
  do not debit the card or journal twice.
- Leaves a partially funded invoice open and reports its exact remaining minor
  units.
- Marks an invoice paid only when all applied allocations exactly equal the
  invoice amount; allocation overflow is rejected.
- Blockonomics payment creation now validates and funds only the exact remaining
  invoice balance after applied WMPC allocations.
- Geo checkout records the gift-card allocation before requesting the provider
  remainder. If no eligible configured provider exists, routing fails before
  card redemption. If provider creation later fails, the durable gift-card
  allocation is retained rather than silently discarded, and checkout can be
  retried for the remaining balance.

## Existing systems preserved

Stripe, PayPal, Paystack, Flutterwave, WMPC Gift Card, the blocked generic
`crypto` safety gate, billing invoices, subscriptions, and the existing billing
ledger remain in place. This stage creates neither a second billing system nor a
wallet-credit claim.

## Verification

- Geo routing, non-billable FX refusal, provider eligibility, and split-tender
  orchestration tests passed.
- WMPC partial allocation, organization/currency isolation, journal, and retry
  idempotency tests passed.
- Blockonomics remaining-balance creation and settlement conservation tests
  passed.
- Existing payment-provider tests passed.
- Shared and API TypeScript checks passed.

The PostgreSQL transaction paths are represented by the Prisma schema and unit
coverage, but this workspace has no reachable PostgreSQL daemon. Real migration,
concurrency, Blockonomics Test Mode quote/address, and callback validation remain
mandatory Stage 15 target-runtime gates. This stage is not a production-complete
claim.
