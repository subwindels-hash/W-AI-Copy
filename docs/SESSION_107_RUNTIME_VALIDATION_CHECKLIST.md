# Session 107 Runtime Validation Checklist — Billing & Subscriptions

> **Status:** 🟡 pending target-environment execution. Run with live
> PostgreSQL 17, Redis 8 and the configured billing webhook secret/provider.

- [ ] Admin-authenticated billing overview returns the real subscription,
      server plan catalog, invoice lines and accounts receivable; a fresh org
      has a starter subscription and no fabricated invoices.
- [ ] Non-admin requests are rejected by the billing management routes.
- [ ] Plan/cycle/seat changes persist and create an open invoice for paid
      changes; no plan change marks an invoice paid automatically.
- [ ] Mark-paid and void actions are organization-scoped and produce audit
      rows; paid invoices cannot be voided.
- [ ] Two organizations cannot read or mutate each other's subscriptions or
      invoices.
- [ ] A valid webhook secret plus a real payment event applies once; duplicate
      event delivery is idempotent and does not duplicate invoice transitions.
- [ ] Invalid webhook secret, unknown invoice and malformed payment payloads
      are rejected/recorded without fabricating payment success.
- [ ] Overdue open invoices are promoted to `past_due` by dunning and the
      subscription state follows; paid/void invoices are not changed.
- [ ] `/app/billing` renders server data, labels open/paid/void states and
      shows read-only messaging for non-admin users.
- [ ] Capture request IDs, audit-log rows, webhook idempotency evidence and
      this checklist before marking Session 107 🟢.

**Operator:** ____________________  **Environment:** ____________________

**Executed at (UTC):** ___________  **Release/commit:** ____________________
