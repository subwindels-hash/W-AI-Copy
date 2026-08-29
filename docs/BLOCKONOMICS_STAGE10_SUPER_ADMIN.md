# Blockonomics Integration — Stage 10 Super Admin Controls

**Stage:** 10 of 15

**Code status:** COMPLETE

**Real provider/PostgreSQL validation:** PENDING TARGET RUNTIME

## Delivered

### Super Admin API

Added a control plane under:

- `GET /api/v1/admin/payments/blockonomics/config`
- `PUT /api/v1/admin/payments/blockonomics/config`
- `PATCH /api/v1/admin/payments/blockonomics/enabled`
- `POST /api/v1/admin/payments/blockonomics/health`
- `GET /api/v1/admin/payments/blockonomics/dashboard`

Every route uses the existing `authenticate` plus `requireSuperAdmin` middleware.
An organization admin receives `403`; having billing access does not grant
provider-secret authority.

### Encrypted configuration controls

- API key and callback secret are write-only and continue to use the existing
  AES envelope/keyring storage.
- Public configuration returns only configured booleans, source, version,
  settings, health posture, and sanitized error state.
- Secret rotation inputs are optional; blank UI fields retain the encrypted
  value already stored.
- New callback secrets must be at least 32 characters.
- Super Admin can configure Test Mode, callback match host, BTC/USDT availability,
  quote timer, and enable/disable the provider.
- The required final provider status remains fixed at `2` and cannot be weakened
  in the UI.
- The first control-plane mutation of environment-bootstrap credentials adopts
  them into encrypted PostgreSQL storage. Once a DB row exists, missing DB
  secrets never fall back to environment variables.
- Configuration and enable/disable mutations create global audit records that
  contain rotation booleans and non-secret settings, never credentials.

### Health and operational dashboard

- Health check uses the official authenticated, read-only Blockonomics payment
  listing endpoint. It does not allocate an address, create a fake payment, or
  treat a public price response as credential health.
- Health posture, latency, sanitized error, timestamp, and actor audit are
  persisted. Environment-bootstrap credentials are encrypted if health is the
  first operation.
- Dashboard reports exact database counts grouped by:
  - payment status;
  - reconciliation status;
  - BTC/USDT asset; and
  - webhook processing status.
- It also shows recent durable payments and sanitized callback failures.
- Dashboard responses omit API keys, callback secrets, raw callback payloads,
  payment addresses, customer email, and arbitrary payment metadata.

### Existing Super Admin UI

- Added `/platform/blockonomics` inside the existing Super Admin shell.
- Added encrypted write-only credential forms, Test Mode and asset controls,
  provider enable/disable, health probe, status cards, payment/reconciliation
  breakdowns, recent durable records, and callback-error triage.
- No dashboard action can mark a payment paid, change confirmations, adjust an
  invoice, credit a wallet, or bypass reconciliation.

## Verification

- Provider config/client and encrypted environment-adoption tests: 9/9 passed.
- Super Admin RBAC/schema/dashboard/health/redaction tests: 4/4 passed.
- Relevant payment, callback, settlement, and history regressions: 46/46 passed.
- Checkout presentation tests: 5/5 passed.
- Shared, API, and web TypeScript checks passed.
- Web production build passed.
- Patch whitespace validation passed.

Real Super Admin sessions, real provider credentials, real Blockonomics health,
RLS-backed platform aggregation, and encrypted config persistence on PostgreSQL
remain mandatory Stage 15 target-runtime gates. This stage is not a
production-complete claim.
