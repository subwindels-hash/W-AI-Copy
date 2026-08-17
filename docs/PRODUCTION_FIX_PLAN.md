# WINDELS AI OS — Production Fix Plan

Work proceeds in this order. A task is marked complete only after code, negative-path tests, typechecks, and documentation are updated.

## Priority 0 — Financial and credential safety

- [x] **P0.1 Payment fail-closed remediation**
  - Missing/incomplete providers report unavailable.
  - No fabricated checkout URLs, success responses, crypto addresses, or rates.
  - Amount, currency, provider, reference, organization, and provider transaction ID are checked before settlement.
  - Webhooks use exact raw bytes, replay/idempotency keys, and reference-to-organization indexes.
  - Stripe timestamp tolerance and official PayPal webhook verification are implemented.
  - Callback URLs derive from `WINDELS_PUBLIC_API_ORIGIN`.
  - Crypto checkout/callbacks are blocked until a real chain verifier exists.
  - Remaining gate: real provider sandbox qualification before live credentials.

- [ ] **P0.2 Encrypt and rotate external credentials** — next
  - GitHub tokens.
  - Crypto API key/secret/passphrase/sub-account/wallet-key records.
  - Plaintext migration, masking, revocation, and rotation tests.

- [ ] **P0.3 Block synthetic/stale financial data from decisions**
  - Payments, billing, invoices, trading, risk, valuation, and P&L.

## Priority 1 — Core production security

- [ ] SMTP certificate verification and STARTTLS.
- [ ] MT4/MT5 configuration isolation.
- [ ] Conditional environment validation and provider health reporting.

## Priority 2 — Production infrastructure

- [ ] S3-compatible object storage.
- [ ] Error tracking with PII/secret redaction.
- [ ] Isolated Module Runner and ClamAV acceptance.

## Priority 3 — Provider rollout

- [ ] AI provider + search provider.
- [ ] Google OAuth and GitHub.
- [ ] Google Places enrichment.
- [ ] WhatsApp, Telegram, TURN/media gateway.
- [ ] Payment sandbox certification.

## Deferred specialized integrations

- [ ] Social publishing qualification.
- [ ] MT4/MT5 and crypto exchange qualification.
- [ ] Real video provider adapters.
- [ ] Cloud Android provider.
- [ ] CSPM, robotics MQTT, traditional brokers, and quantum runners.
