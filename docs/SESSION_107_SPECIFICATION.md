# SESSION 107 SPECIFICATION — BILLING & SUBSCRIPTIONS COMPLETION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S106, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Finance Platform
```

## 1. Objective

The Billing & Subscriptions service already implemented real Prisma
subscription/invoice transitions, idempotent payment webhooks, dunning and
predictive analytics. The audit still classified it as `PARTIAL` because the
request/response contracts were service-local, the main client omitted invoice
lines/accounts receivable and payment actions, the UI only exposed billing
inside Settings, and database-backed lifecycle paths lacked tests.

Session 107 completes the module without adding a fake payment provider:

1. shared `Billing*` contracts and Zod schemas;
2. typed subscription, invoice, accounts-receivable and insights client;
3. dedicated `/app/billing` page with plan, seats, invoice and status controls;
4. real admin mark-paid/void actions with audit logs;
5. real provider webhook idempotency and dunning paths preserved;
6. FakePrisma/FakeKv integration tests for org scope, invoices, webhooks,
   dunning, audit rows and payment transitions;
7. honest empty state: starter subscription and zero invoices, not fabricated
   payment history or revenue.

## 2. Billing model

The server plan catalog remains the source of truth. Prices are integer cents:
Starter, Pro, Team and Enterprise, with monthly/annual cycles and seat
overage. Changing a paid plan creates a real open invoice; it does not mark
payment success. A payment provider or audited administrator action must move
an invoice to `paid`. A paid invoice cannot be voided.

Subscription states remain `active | past_due | cancelled | trialing` and
invoice states include `draft | open | paid | past_due | void |
uncollectible`. `recordPaymentEvent` uses a 30-day Redis event-id idempotency
key and updates the invoice only once per provider event.

## 3. Shared contracts and API

`packages/shared/src/billing.ts` owns plan/cycle/status enums, plan,
subscription, invoice/invoice-line, overview, predictive-insight and update /
payment / invoice action schemas. The barrel exports collision-safe aliases
for legacy platform-service billing names; API/web imports use the direct
billing subpath.

Authenticated admin routes under `/api/v1/billing`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | subscription, plan catalog, invoice ledger and receivables |
| PATCH | `/` | change plan/cycle/seats/email; creates an open invoice when applicable |
| GET | `/insights` | real usage/revenue-backed predictive analytics |
| POST | `/invoices/:id/mark-paid` | audited administrator payment confirmation |
| POST | `/invoices/:id/void` | audited void of an unpaid invoice |

`POST /webhook` remains the unauthenticated provider callback protected by
`x-windels-webhook-secret` and the shared payment-event schema.

## 4. UI

`/app/billing` is a dedicated billing console with:

- current plan/status, renewal rate and accounts receivable cards;
- server-provided plan catalog and subscription settings;
- invoice ledger with real status, paid and void actions;
- explicit statement that payment is not fabricated by plan changes;
- admin-only management and honest non-admin/read-only messaging.

Settings and Analytics continue using the same typed billing client.

## 5. Verification gate

- `apps/api/src/billing/billing.integration.test.ts` covers 11 database-backed
  paths; existing `billing.test.ts` retains plan/schema coverage.
- `make verify` must pass with offline Prisma generation; live Postgres,
  webhook secret, migration and payment-provider runtime validation remain
  gates.
- Inventory may mark Billing COMPLETE only when shared contracts, service,
  routes, typed client, dedicated UI and integration tests exist.
