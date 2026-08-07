# WINDELS AI OS — BUSINESS MODULE DEEP-DIVE

**Version:** 4.0  
**Date:** 2026-08-07  
**Status:** AUTHORITATIVE  

---

## MODULE: CRM (S90)

### PURPOSE
Customer relationship management — contacts, companies, deals, activities.

### WHAT BELONGS INSIDE
- Pipeline stages (definition, management)
- Contacts (CRUD, search, filter)
- Companies (CRUD, search, filter)
- Deals (CRUD, pipeline view, stage transitions)
- Activities (CRUD, link to contacts/companies/deals)
- Dashboard rollup (deterministic)
- Notes

### WHAT DOES NOT BELONG
- ❌ Lead management → belongs to `leadDiscovery` (but leads convert to contacts)
- ❌ Support tickets → belongs to `helpdesk`
- ❌ Email management → belongs to `emailIntel`
- ❌ Sales orders → belongs to `erp` (deal-to-order conversion)
- ❌ Marketing campaigns → belongs to `marketing`/`advertising`

### DEPENDENCIES
- `leadDiscovery` (for lead-to-contact conversion)
- `helpdesk` (for contact-linked tickets)
- `erp` (for deal-to-sales-order conversion)

### INTEGRATIONS
None

### AI AGENTS
CRM assistant agents (contact insights, deal scoring, activity suggestions)

### DATABASE/SERVICES
- **PostgreSQL:** `Contact`, `Company`, `Deal`, `Activity`, `PipelineStage`
- **Services:** `crm/crm.service.ts`
- **Routes:** `apps/api/src/http/routes/crm.ts`
- **Shared:** `packages/shared/src/crm.ts` (237 LOC)
- **Frontend:** `apps/web/src/lib/crm.ts`, `apps/web/src/pages/crm/`

### STATUS
🟢 **COMPLETE** — Full CRM working, contacts/companies/deals/activities all functional

---

## MODULE: LEAD_DISCOVERY (S85/115)

### PURPOSE
Lead management, pipeline, external search, collections, duplicate handling.

### WHAT BELONGS INSIDE
- Lead search (external providers like Google)
- Lead management (CRUD, status, owner, notes)
- Pipeline view (by stage, owner, status)
- Collections (CRUD, add/remove leads)
- Duplicate management (find duplicates, resolve)
- Coverage reporting (field completeness)
- Search history
- CSV export (with formula injection protection)
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Contact management → belongs to `crm` (leads convert to contacts)
- ❌ Deal management → belongs to `crm`
- ❌ Email sending → belongs to `emailIntel`
- ❌ Lead scoring AI → would be in AI layer

### DEPENDENCIES
- `crm` (for lead-to-contact conversion)
- `emailIntel` (for lead outreach)

### INTEGRATIONS
- Google (lead search, optional)

### AI AGENTS
Lead scoring agents, lead qualification agents

### DATABASE/SERVICES
- **PostgreSQL:** `Lead`, `LeadCollection`, `LeadDuplicate`, `SearchHistory`
- **Redis:** Search cache, deduplication indexes
- **Services:** `leadDiscovery/leadDiscovery.service.ts`, `leadDiscovery/leadPipeline.service.ts`
- **Routes:** `apps/api/src/http/routes/leadDiscovery.ts`, `apps/api/src/http/routes/leadPipeline.ts`
- **Shared:** `packages/shared/src/leadDiscovery.ts` (452 LOC)

### STATUS
🟢 **COMPLETE** — Full lead pipeline working, search, collections, duplicates, export

---

## MODULE: HELPDESK (S95)

### PURPOSE
Customer support ticket management, SLA tracking, comments.

### WHAT BELONGS INSIDE
- Ticket management (CRUD, assign, transition, delete)
- Ticket comments (CRUD)
- SLA tracking (deterministic, honest)
- Ticket assignment
- Ticket lifecycle transitions
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Contact management → belongs to `crm`
- ❌ Email management → belongs to `emailIntel` (but uses email for notifications)
- ❌ Knowledge base → would be separate or part of helpdesk
- ❌ Live chat → belongs to `conversations`/`talk`

### DEPENDENCIES
- `crm` (for contact/customer context)
- `emailIntel` (for ticket email notifications)

### INTEGRATIONS
None

### AI AGENTS
Ticket triage agents, response suggestion agents

### DATABASE/SERVICES
- **PostgreSQL:** `Ticket`, `TicketComment`, `TicketSla`
- **Services:** `helpdesk/helpdesk.service.ts`
- **Routes:** `apps/api/src/http/routes/helpdesk.ts`
- **Shared:** `packages/shared/src/helpdesk.ts` (130 LOC)
- **Frontend:** `apps/web/src/lib/helpdesk.ts`

### STATUS
🟢 **COMPLETE** — Full helpdesk working, tickets, comments, SLA tracking

---

## MODULE: EMAIL_INTEL (S91)

### PURPOSE
Email intelligence — mailboxes, threads, messages, AI drafting, summarization, triage.

### WHAT BELONGS INSIDE
- AI drafting (draft, summarize, triage)
- Mailbox management (CRUD, test connection)
- Thread management (read, list)
- Message management (CRUD, send)
- SMTP client
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Contact management → belongs to `crm`
- ❌ Ticket notifications → belongs to `helpdesk` (but uses email)
- ❌ Marketing email campaigns → would belong to `marketing`
- ❌ Email storage → delegated to external mail servers

### DEPENDENCIES
- `crm` (for contact context)
- `helpdesk` (for ticket email notifications)

### INTEGRATIONS
- SMTP servers (configurable)
- Email providers (Gmail, Outlook, etc.) — via IMAP/SMTP

### AI AGENTS
Email drafting agents, summarization agents, triage classification agents

### DATABASE/SERVICES
- **PostgreSQL:** `Mailbox`, `EmailThread`, `EmailMessage`, `EmailOutbox`
- **Services:** `emailIntel/emailIntel.service.ts`, `emailIntel/smtp.client.ts`
- **Routes:** `apps/api/src/http/routes/emailIntel.ts`
- **Shared:** `packages/shared/src/emailIntel.ts` (201 LOC)
- **Frontend:** `apps/web/src/lib/emailIntel.ts`

### STATUS
🟢 **COMPLETE** — Full email intelligence working, mailboxes, threads, messages, AI drafting

---

## MODULE: ERP (S92)

### PURPOSE
Enterprise resource planning — products, inventory, suppliers, purchase/sales orders.

### WHAT BELONGS INSIDE
- Products (CRUD)
- Warehouses (CRUD)
- Inventory (view, movements)
- Suppliers (CRUD)
- Purchase orders (CRUD, receive)
- Sales orders (CRUD, fulfill)
- Sales orders from CRM deals (conversion)
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Contact/company management → belongs to `crm`
- ❌ Deal management → belongs to `crm`
- ❌ Billing/invoicing → belongs to `billing`
- ❌ Customer orders (B2C) → would be in `commerce` module (🟣 NOT YET CREATED)

### DEPENDENCIES
- `crm` (for deal-to-sales-order conversion)
- `billing` (for invoice generation)

### INTEGRATIONS
None

### AI AGENTS
Inventory optimization agents, demand forecasting agents

### DATABASE/SERVICES
- **PostgreSQL:** `Product`, `Warehouse`, `Inventory`, `Supplier`, `PurchaseOrder`, `SalesOrder`
- **Services:** `erp/erp.service.ts`
- **Routes:** `apps/api/src/http/routes/erp.ts`
- **Shared:** `packages/shared/src/erp.ts` (240 LOC)
- **Frontend:** `apps/web/src/lib/erp.ts`

### STATUS
🟢 **COMPLETE** — Full ERP working, products, inventory, suppliers, orders

---

## MODULE: MARKETING

### PURPOSE
AI marketing intelligence — campaigns, copy, personas, A/B tests, recommendations.

### WHAT BELONGS INSIDE
- Marketing agents (heartbeat, run)
- Campaigns (CRUD, status, metrics)
- Copy generation (AI-assisted)
- Personas (CRUD)
- A/B tests (CRUD, variants, metrics, winner selection)
- Recommendations (generate, list)
- Platforms (list)
- Dashboard

### WHAT DOES NOT BELONG
- ❌ Paid advertising campaigns → would be in `advertising` (🟡 CLARIFY BOUNDARY)
- ❌ Social media posts → belongs to `socialPlatform`
- ❌ Website content → belongs to `websiteBuilder`
- ❌ Email campaigns → belongs to `emailIntel`

### DEPENDENCIES
- `crm` (for customer data)
- `advertising` (🟡 CLARIFY: merge or separate?)

### INTEGRATIONS
- OpenAI (copy generation)
- Anthropic (copy generation)
- Google (analytics, ads)

### AI AGENTS
Copywriting agents, persona agents, campaign optimization agents

### DATABASE/SERVICES
- **PostgreSQL:** `MarketingCampaign`, `MarketingPersona`, `AbTest`, `MarketingPlatform`
- **Services:** `marketing/marketing.service.ts`
- **Routes:** `apps/api/src/http/routes/marketing.ts`
- **Shared:** `packages/shared/src/marketing.ts` (212 LOC)
- **Frontend:** `apps/web/src/lib/marketing.ts`

### STATUS
🟢 **COMPLETE** — Marketing working, campaigns, copy, personas, A/B tests

### BOUNDARY NOTE
🟡 **MARKETING vs ADVERTISING:** Need to clarify:
- Option A: Merge into single `Marketing & Advertising` module
- Option B: Keep separate — marketing = organic/content, advertising = paid/media buying

---

## MODULE: BILLING (S107/20)

### PURPOSE
Subscription management, invoicing, payment webhooks, dunning, usage-based billing.

### WHAT BELONGS INSIDE
- Subscription management (CRUD, insights, update)
- Invoice management (mark-paid, void)
- Payment webhook handling (idempotent, HMAC verified)
- Dunning automation (past_due → void)
- Plan definitions (starter, pro, team, enterprise)
- Usage-based billing
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Payment gateway integration → belongs to `payments`
- ❌ Invoice generation → in billing, but payments trigger settlement
- ❌ Gift cards → belongs to `giftCards`
- ❌ FX rates → belongs to `globalCurrency`
- ❌ Budgets/chargebacks → belongs to `enterpriseFinOps`
- ❌ Geographic billing rules → belongs to `geoBilling`

### DEPENDENCIES
- `payments` (for payment processing, invoice settlement)
- `giftCards` (for gift card redemption)
- `globalCurrency` (for multi-currency support)
- `enterpriseFinOps` (for cost allocation)
- `geoBilling` (for regional pricing)

### INTEGRATIONS
- Stripe
- PayPal
- Flutterwave
- Paystack

### AI AGENTS
None (infrastructure service)

### DATABASE/SERVICES
- **PostgreSQL:** `BillingSubscription`, `Invoice`, `InvoiceLine`, `Plan`
- **Redis:** Webhook dedup (`billing:webhook:seen:{eventId}`), dunning state
- **Services:** `services/billing.service.ts`, `billing/exchangeRates.ts`
- **Routes:** `apps/api/src/http/routes/billing.ts`
- **Shared:** `packages/shared/src/billing.ts` (93 LOC)
- **Frontend:** `apps/web/src/lib/billing.ts`

### STATUS
🟢 **COMPLETE** — Full billing working, subscriptions, invoices, webhooks, dunning

---

## MODULE: PAYMENTS (S128)

### PURPOSE
Payment gateway integration — Stripe, PayPal, Flutterwave, Paystack, Crypto (BTC, TRC-20, ERC-20, BNB).

### WHAT BELONGS INSIDE
- Payment gateway management
- Checkout flows (per gateway)
- Crypto checkout (BTC, TRC-20, ERC-20, BNB Chain)
- Payment confirmation (HMAC verification)
- Invoice settlement (call `billing.markInvoicePaid`)
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Subscription management → belongs to `billing`
- ❌ Invoice management → belongs to `billing`
- ❌ Gift cards → belongs to `giftCards`
- ❌ Refund processing → belongs to `billing` (triggered by payments)

### DEPENDENCIES
- `billing` (for invoice settlement)
- `giftCards` (for gift card payments)

### INTEGRATIONS
- Stripe API
- PayPal API
- Flutterwave API
- Paystack API
- Blockonomics (crypto)
- Bitcoin network
- Tron network
- Ethereum network
- BNB Chain

### AI AGENTS
None

### DATABASE/SERVICES
- **PostgreSQL:** `Payment`, `PaymentGatewayConfig`, `CryptoAddress`
- **Redis:** Payment confirmation state, webhook verification
- **Services:** 
  - `payments/payments.service.ts`
  - `payments/stripe.service.ts`
  - `payments/paypal.service.ts`
  - `payments/flutterwave.service.ts`
  - `payments/paystack.service.ts`
  - `payments/crypto.service.ts`
- **Routes:** `apps/api/src/http/routes/payments.ts`
- **Shared:** `packages/shared/src/payments.ts` (76 LOC)
- **Frontend:** `apps/web/src/lib/payments.ts`

### STATUS
🟢 **COMPLETE** — Full payments working, all gateways integrated, crypto support

---

## MODULE: GIFT_CARDS (S79)

### PURPOSE
WMPC gift card management — issuance, activation, redemption, reload, loyalty, fraud detection.

### WHAT BELONGS INSIDE
- Gift card CRUD (issue, activate, reload, redeem, expire, freeze)
- Transaction log
- Fraud detection (velocity checks, heuristics)
- Loyalty programs
- Agent management
- Payment method info
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Subscription billing → belongs to `billing`
- ❌ Payment gateway processing → belongs to `payments`
- ❌ General fraud detection → shared service (future)

### DEPENDENCIES
- `billing` (for balance settlement)
- `payments` (for redemption payment methods)

### INTEGRATIONS
- AWS (gift card security)

### AI AGENTS
Fraud detection agents

### DATABASE/SERVICES
- **PostgreSQL:** `GiftCard`, `GcTransaction`, `GcFraudFlag`, `LoyaltyProgram`
- **Redis:** Card state, Lua locks for race protection (`gc:{cardId}:lock`)
- **Services:** `giftCards/giftCards.service.ts`
- **Routes:** `apps/api/src/http/routes/giftCards.ts`
- **Shared:** `packages/shared/src/wmpcGiftCards.ts`

### STATUS
🟢 **COMPLETE** — Full gift cards working, issuance, activation, redemption, fraud protection

---

## MODULE: GLOBAL_CURRENCY (S80)

### PURPOSE
FX rates, currency conversion, multi-currency support.

### WHAT BELONGS INSIDE
- Exchange rates (live from frankfurter.app, er-api.com)
- Currency conversion
- Rate history
- Provider status
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Billing/subscriptions → belongs to `billing` (but uses rates)
- ❌ Gift cards → belongs to `giftCards` (but uses rates)

### DEPENDENCIES
- `billing` (for multi-currency invoicing)
- `giftCards` (for multi-currency redemption)

### INTEGRATIONS
- frankfurter.app (ECB rates)
- open.er-api.com

### AI AGENTS
None

### DATABASE/SERVICES
- **PostgreSQL:** `FxRate` (history, optional)
- **Redis:** Cached rates (`gcu:rates`), 1h TTL
- **Services:** `globalCurrency/globalCurrency.service.ts`, `globalCurrency/refreshRates.ts`
- **Routes:** `apps/api/src/http/routes/globalCurrency.ts`
- **Shared:** `packages/shared/src/globalCurrency.ts`

### STATUS
🟢 **COMPLETE** — Full global currency working, live rates, conversion

---

## MODULE: ENTERPRISE_FINOPS (S100)

### PURPOSE
Enterprise financial operations — budgets, cost centers, cost tracking, allocations, chargebacks.

### WHAT BELONGS INSIDE
- Cost centers (CRUD)
- Budgets (CRUD)
- Cost tracking (CRUD)
- Allocations (CRUD)
- Chargebacks (computed)
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Subscription billing → belongs to `billing`
- ❌ Invoice management → belongs to `billing`
- ❌ FX rates → belongs to `globalCurrency`
- ❌ GPU costs → would pull from `aiEconomy`

### DEPENDENCIES
- `billing` (for actual costs)
- `aiEconomy` (for GPU costs)
- `platformServices` (for feature usage costs)

### INTEGRATIONS
- AWS Cost Explorer
- GCP Billing
- Azure Cost Management

### AI AGENTS
Cost optimization agents

### DATABASE/SERVICES
- **PostgreSQL:** `CostCenter`, `Budget`, `Cost`, `Allocation`, `Chargeback`
- **Services:** `enterpriseFinOps/enterpriseFinOps.service.ts`
- **Routes:** `apps/api/src/http/routes/enterpriseFinOps.ts`
- **Shared:** `packages/shared/src/enterpriseFinOps.ts` (196 LOC)
- **Frontend:** `apps/web/src/lib/enterpriseFinOps.ts`

### STATUS
🟢 **COMPLETE** — Full enterprise FinOps working, budgets, costs, chargebacks

---

## MODULE: GEO_BILLING

### PURPOSE
Geographic billing rules, regional pricing, tax handling.

### WHAT BELONGS INSIDE
- Geographic regions
- Regional pricing rules
- Tax rules by region
- Currency preferences by region
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Core billing → belongs to `billing`
- ❌ FX rates → belongs to `globalCurrency`

### DEPENDENCIES
- `billing` (for applying regional rules)
- `globalCurrency` (for rate conversion)

### INTEGRATIONS
None

### AI AGENTS
None

### DATABASE/SERVICES
- **PostgreSQL:** `GeoRegion`, `PricingRule`, `TaxRule`
- **Services:** `geoBilling/geoBilling.service.ts`
- **Routes:** `apps/api/src/http/routes/geoBilling.ts`
- **Shared:** `packages/shared/src/geoBilling.ts` (156 LOC)
- **Frontend:** `apps/web/src/lib/geoBilling.ts`

### STATUS
🟢 **COMPLETE** — Geo billing working, regional pricing, tax rules

---

## SUMMARY: BUSINESS LAYER

| Module | Status | Purpose | Key Integrations |
|--------|--------|---------|-----------------|
| `crm` (S90) | 🟢 COMPLETE | Contacts, companies, deals, activities | — |
| `leadDiscovery` (S85/115) | 🟢 COMPLETE | Leads, pipeline, search, collections | Google |
| `helpdesk` (S95) | 🟢 COMPLETE | Tickets, comments, SLA | — |
| `emailIntel` (S91) | 🟢 COMPLETE | Mailboxes, AI drafting, SMTP | SMTP |
| `erp` (S92) | 🟢 COMPLETE | Products, inventory, orders | — |
| `marketing` | 🟢 COMPLETE | Campaigns, copy, A/B tests | OpenAI, Anthropic, Google |
| `billing` (S107/20) | 🟢 COMPLETE | Subscriptions, invoices, webhooks | Stripe, PayPal, etc. |
| `payments` (S128) | 🟢 COMPLETE | Payment gateways, crypto | Stripe, PayPal, Flutterwave, Paystack, Crypto |
| `giftCards` (S79) | 🟢 COMPLETE | Gift cards, loyalty, fraud | AWS |
| `globalCurrency` (S80) | 🟢 COMPLETE | FX rates, conversion | frankfurter, er-api |
| `enterpriseFinOps` (S100) | 🟢 COMPLETE | Budgets, costs, chargebacks | AWS, GCP, Azure |
| `geoBilling` | 🟢 COMPLETE | Regional pricing, tax | — |

---

**END OF BUSINESS MODULE DOCUMENTATION**
