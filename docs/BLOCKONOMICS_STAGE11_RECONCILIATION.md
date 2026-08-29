# Blockonomics Integration — Stage 11 Reconciliation

**Stage:** 11 of 15

**Code status:** COMPLETE

**Real provider/PostgreSQL validation:** PENDING TARGET RUNTIME

## Delivered

### Authenticated provider comparison

- Added reconciliation against the official authenticated Blockonomics
  `GET /v2/payments` endpoint for configured BTC and USDT assets.
- Supports official `1W`, `2W`, `1M`, `3M`, `6M`, and `1Y` timeframes and the
  provider's maximum 200 rows per asset/run.
- Compares provider history with existing durable `PaymentRecord` rows using:
  - provider transaction ID when already known;
  - asset;
  - provider payment address; and
  - exact persisted smallest-unit amount.
- Shared-address USDT records are never guessed. Multiple local or provider
  candidates become `ambiguous_provider_match` and require review.
- A submitted but still unconfirmed USDT hash is not misclassified as missing;
  `/v2/payments` is treated as confirmed history.

### Safe discrepancy handling

Detects and records:

- final provider transactions missing from provider history;
- provider payments with no local record;
- duplicated provider transaction rows;
- ambiguous shared-address matches;
- amount, address, and asset mismatches;
- payments observed after quote expiry; and
- atomic settlement failures.

Discrepancies update only reconciliation/review state and durable audit evidence.
No run silently changes a balance, fabricates a provider response, refunds a
payment, or removes an invoice allocation. A previously completed payment is
never silently reversed when later provider history is missing; it is flagged
for review while its financial status remains completed.

An exact, timely, authenticated provider match may move an eligible pending
record to `confirmed`, then invokes the same Stage 6 atomic settlement function.
It does not implement an alternate settlement or ledger path.

### Manual and scheduled operation

- Added Super Admin-only
  `POST /api/v1/admin/payments/blockonomics/reconcile`.
- Added a periodic worker controlled by:
  - `BLOCKONOMICS_RECONCILIATION_ENABLED` (default `true`); and
  - `BLOCKONOMICS_RECONCILIATION_INTERVAL_MINUTES` (default `15`, range
    5–1440).
- Scheduled runs occur only while Blockonomics is configured and enabled.
- A five-minute distributed Redis lock prevents overlapping runs across API
  replicas.
- Graceful shutdown clears the local scheduler timer.

### Audit and Super Admin review

- Run completion/failure and every local discrepancy are recorded in the
  existing audit log; no second reconciliation ledger was created.
- The Super Admin dashboard can run a selected timeframe manually, inspect the
  result and transaction IDs, and review recent manual/scheduled run summaries.
- The dashboard offers no action that force-confirms, credits, refunds, or
  overwrites a discrepancy.

## Verification

- Scheduler/manual wiring, exact match/settlement, underpayment, confirmed
  history missing, unconfirmed-USDT handling, duplicate/orphan detection,
  shared-address ambiguity, and distributed-lock tests: 8/8 passed.
- Super Admin dashboard and health tests: 4/4 passed.
- Existing callback and atomic settlement regressions passed.
- Shared, API, and web TypeScript checks passed.
- Web production build passed.
- Patch whitespace validation passed.

Provider history is bounded by the official 200-row response, so operators must
choose a timeframe appropriate to transaction volume and run reconciliation on
schedule. Real `/v2/payments` data, multi-replica lock behavior, RLS, audit JSON,
and recovery settlement on PostgreSQL remain Stage 15 target-runtime gates.
This stage is not a production-complete claim.
