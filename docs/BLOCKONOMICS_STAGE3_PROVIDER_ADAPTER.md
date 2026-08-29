# Blockonomics Integration — Stage 3 Provider Configuration and HTTP Adapter

**Stage:** 3 of 15  
**Code status:** COMPLETE  
**Payment creation status:** BLOCKED UNTIL STAGE 4  
**Production validation:** PENDING

## Delivered

- Added durable encrypted Blockonomics provider configuration.
- Database configuration takes precedence over environment bootstrap values.
- API key and callback secret use the existing AES-256-GCM envelope/keyring.
- Super Admin disable state retains credentials without enabling payments.
- Added provider capability truth for BTC and USDT ERC-20 only.
- Added official HTTPS client for:
  - `POST /api/new_address`
  - `GET /api/price`
  - `POST /api/monitor_tx`
  - `GET /api/v2/payments`
- Fixed the provider origin to `https://www.blockonomics.co`.
- Added bounded timeouts, response validation, typed upstream errors, health
  checks, and provider metrics without secret logging.
- Added optional environment bootstrap variables.
- Added Blockonomics to the existing provider registry as configured/disabled/
  blocked truth; checkout remains inactive until Stage 4.

## Security behavior

- Secrets are never returned by the public configuration report.
- Enabling is refused unless API key and callback secret are both present.
- No mock/fallback address, price, payment, or success response exists.
- Provider/network failures return upstream errors.
- Test Mode is an attestation of the external store setting, not a fake local
  implementation or alternate base URL.

## Verification

- Blockonomics adapter/configuration tests: 8/8 passed.
- Stage 2 foundation tests: 6/6 passed.
- Existing payment tests: 22/22 passed after the additive provider entry.
- Shared and API typechecks passed.

No live credential was available, so official Test Mode connectivity remains a
Stage 15 target-runtime gate.

## Stage 4 entry gate

Stage 4 may create durable payment records and request live quotes/addresses.
It must write the local record before any non-idempotent provider address call,
return only safe payment instructions, and leave invoices/subscriptions
untouched.
