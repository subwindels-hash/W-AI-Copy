# WINDELS AI OS — CLAUDE.md Addendum
## Sessions 79 & 80: WMPC Gift Card Platform + Global Multi-Currency & Localization Platform

> Append this block to the existing ~15,000-line CLAUDE.md, immediately after Session 78 (UI/UX Intelligence & Design System Platform). Both sessions are **additive updates** — nothing in Billing, Wallet, Payment Gateway Framework, Marketplace, AI Marketplace, Creator Economy, Enterprise Commerce, Workflow Engine, Security Framework, Governance Kernel, Analytics, or Mobile/Desktop/Web apps is removed or modified. Session 80 depends on Session 79 (currency localization must know about the WMPC Gift Card payment method to localize it).

---

## §0. Standing Rules for These Sessions

1. **No duplicate infrastructure.** Gift cards register as a payment method *inside* the existing Payment Gateway Framework. Currency logic lives in a single `LocalizationContext` that every pricing surface reads from — do not hand-roll currency formatting in individual features.
2. **Reuse, don't rebuild.** Auth, permissions, organizations, billing, audit logging, CRM, analytics, accounting, workflow engine, security framework, and governance kernel are consumed via their existing interfaces, not re-implemented.
3. **Folder structure is shown before code.** At the start of each session below, the folder/file plan is presented first (see §1 and §2), with a one-line reason for each new file, before any implementation.
4. **Conventions log.** At the end of each session, append a dated entry to `CONVENTIONS.md` answering: *"What decisions did you make this session — naming conventions, architectural choices, library picks, patterns — that should be added to the conventions log?"* Template in §3.
5. **Completion gate.** Each session ends with a "done when" checklist (§1.9 / §2.10) before moving to the next.

---

## §1. SESSION 79 — WMPC Gift Card Payment Platform

### 1.0 Folder Structure (proposed — review before coding)

```
packages/
  gift-cards/                          # NEW package — dedicated bounded context for gift cards
    src/
      models/
        giftCard.model.ts              # NEW — card entity: type, status, balance, PIN hash, expiry
        giftCardTransaction.model.ts   # NEW — every activation/redemption/reload/transfer event
        giftCardTemplate.model.ts      # NEW — reusable design/config for promo & enterprise cards
      services/
        giftCardLifecycle.service.ts   # NEW — create/activate/reload/redeem/expire state machine
        giftCardDelivery.service.ts    # NEW — send/receive, scheduled delivery, messages
        giftCardBalance.service.ts     # NEW — balance inquiry, partial redemption, transfer
      payment-adapter/
        giftCardPaymentMethod.ts       # NEW — implements existing PaymentMethod interface so
                                        #        Payment Gateway Framework can charge against a card
                                        #        WITHOUT the framework knowing card internals
      enterprise/
        bulkIssuance.service.ts        # NEW — bulk creation for employee rewards/incentives
        budgetControls.service.ts      # NEW — department budgets, spending limits
      security/
        giftCardSecurity.service.ts    # NEW — PIN protection, encryption, anti-tampering,
                                        #        duplicate prevention, fraud checks specific to cards
      admin/
        giftCardAdmin.routes.ts        # NEW — admin dashboard API (issued/active/redeemed/etc.)
      ai/
        giftCardIntelligence.service.ts# NEW — thin wrapper that calls the EXISTING AI Workforce
                                        #        with gift-card-specific prompts/data (no new AI infra)
      routes/
        giftCard.routes.ts             # NEW — user-facing REST endpoints
      index.ts                         # NEW — package public API surface
    test/
      giftCardLifecycle.test.ts        # NEW
      giftCardPaymentMethod.test.ts    # NEW

  payments/                            # EXISTING Payment Gateway Framework — no rebuild
    src/
      registry/paymentMethodRegistry.ts# EDIT — register 'wmpc_gift_card' alongside existing methods
      # everything else in this package is untouched
```

**Why each file exists:** the gift-card package is isolated so its lifecycle/security logic never leaks into the payment framework; the single `payment-adapter/giftCardPaymentMethod.ts` file is the *only* touch point with `payments/`, satisfying "reuse existing infrastructure, do not create duplicate payment systems."

### 1.1 Step — Data Model & Card Types
- Card entity supports: Physical, Digital, Virtual, One-Time, Reloadable, Promotional, Enterprise, Corporate Reward, Employee Incentive, Educational Gift Cards.
- Fields: unique card ID, type, status (issued/active/partially-redeemed/redeemed/expired/revoked), balance, currency, PIN hash, QR/barcode payload, expiration date, owner, recipient, org (nullable).

### 1.2 Step — Gift Card Lifecycle Service
- Card Creation, Activation, Balance Inquiry, Balance Transfer, Card Reloading, Partial Redemption, Transaction History, Expiration Management.
- PIN Protection, QR Code Support, Barcode Support, Digital Wallet Storage; NFC Support flagged as future/stubbed interface only.

### 1.3 Step — Payment Integration (register with existing Payment Gateway Framework)
- Implement the framework's `PaymentMethod` interface so WMPC Gift Card can pay for: Subscriptions, AI Employee Plans, AI Agent Purchases, Marketplace Purchases, AI Skills, Templates, Voice Packs, Digital Assets, Media Generation, Cloud Resources, GPU Usage, Storage, API Usage, Workflow Executions, Educational Courses, Creator Services, Premium Features.
- Support combining a gift card with other supported payment methods on a single checkout where permitted (split-tender).

### 1.4 Step — User Features
- Purchase, Send, Receive, Redeem gift cards; Check Balance; View Usage History.
- Schedule Gift Deliveries, Save Favorite Recipients, Add Personalized Messages.

### 1.5 Step — Enterprise Features
- Bulk Gift Card Creation; Employee Rewards; Customer Loyalty Programs; Promotional Campaigns; Incentive Programs; Educational Scholarships; Sales Bonuses; Marketing Campaigns.
- Spending Limits and Department Budgets enforced through `budgetControls.service.ts`, reusing existing org/permissions model.

### 1.6 Step — Security
- Unique Card IDs, Secure PINs, Encryption, Fraud Detection, Duplicate Prevention, Real-Time Validation, Anti-Tampering, Suspicious Activity Detection, Account Verification, Transaction Monitoring.
- All events written to the **existing** Audit Logging system — no parallel audit store.

### 1.7 Step — Admin Dashboard
- Metrics: Cards Issued, Active Cards, Redeemed Cards, Outstanding Balances, Revenue, Redemption Rates, Fraud Alerts, Regional Usage, Customer Analytics, Corporate Accounts.
- Surfaced through the existing Analytics Platform's dashboard shell, not a new admin UI framework.

### 1.8 Step — AI Payment Intelligence
- Via existing AI Workforce: Spending Analysis, Gift Recommendations, Fraud Detection, Usage Forecasting, Revenue Forecasting, Customer Behavior Analysis, Loyalty Optimization, Promotion Optimization.

### 1.9 Step — Enterprise Integration Wiring
- Wire into: Wallet Platform, Subscription Platform, Marketplace, AI Marketplace, Creator Economy, Billing System, CRM, Analytics, Accounting, Business Intelligence, Workflow Engine, Security Framework, Governance Kernel.
- Confirm no duplicate authentication, permissions, organization, billing, or audit code was introduced.

### 1.10 Session 79 — Completion Gate ("done when")
- [ ] Gift card can be created, activated, reloaded, partially redeemed, and expired end-to-end.
- [ ] Gift card is selectable at checkout anywhere the existing Payment Gateway Framework is used, including split-tender.
- [ ] All ten enterprise gift card types are creatable.
- [ ] Admin dashboard reflects live issued/active/redeemed/fraud numbers.
- [ ] AI Payment Intelligence returns recommendations using existing AI Workforce infra (no new model/provider wiring).
- [ ] Zero new auth/permissions/audit systems were created — confirmed by diff review.
- [ ] `CONVENTIONS.md` updated per §3 template.

---

## §2. SESSION 80 — Global Multi-Currency & Intelligent Localization Platform

*Depends on Session 79 (WMPC Gift Card must be a registered payment method before it can be localized).*

### 2.0 Folder Structure (proposed — review before coding)

```
packages/
  localization/                        # NEW package — single source of truth for locale/currency
    src/
      context/
        LocalizationContext.ts         # NEW — the one context every pricing surface reads from
        localizationDetector.ts        # NEW — auto-detect country/region/currency/language/tz
      currency/
        currencyCatalog.ts             # NEW — list of supported ISO currencies + symbol/decimal rules
        currencyFormatter.ts           # NEW — symbol, decimal format, number/date format per locale
      exchange-rates/
        exchangeRateEngine.ts          # NEW — live/cached/historical/override/offline-fallback logic
        exchangeRateProviders/         # NEW — pluggable multi-provider adapters
          providerA.adapter.ts         # NEW
          providerB.adapter.ts         # NEW
        exchangeRateScheduler.ts       # NEW — scheduled sync + validation
      preferences/
        userCurrencyPreferences.service.ts # NEW — auto/manual/override/saved list, cross-device sync
      payment-localization/
        paymentMethodLocalizer.ts      # NEW — adapts EACH existing payment method (incl. the
                                        #        Session 79 WMPC Gift Card adapter) to the user's locale
        receiptLocalizer.ts            # NEW — localized receipts + compliance notices
      business/
        regionalPricing.service.ts     # NEW — base currency, regional/country/promo pricing
        currencyReporting.service.ts   # NEW — revenue by currency, multi-currency reports, reconciliation
      ai/
        currencyIntelligence.service.ts# NEW — thin wrapper into EXISTING AI Workforce for
                                        #        cost-effective payment method suggestions,
                                        #        exchange-rate trend/forecast, pricing optimization
      security/
        exchangeRateValidation.service.ts # NEW — rate integrity, manipulation protection
      routes/
        localization.routes.ts         # NEW — preference get/set, currency list, rate lookups
      index.ts                         # NEW — package public API surface
    test/
      exchangeRateEngine.test.ts       # NEW
      LocalizationContext.test.ts      # NEW

  payments/                            # EXISTING — no rebuild
    src/
      registry/paymentMethodRegistry.ts# EDIT — each method's adapter now consults
                                        #        LocalizationContext for currency/display, not
                                        #        re-implements its own formatting
  gift-cards/
    src/payment-adapter/giftCardPaymentMethod.ts # EDIT — reads LocalizationContext for balance
                                        #        display currency; no new gift-card currency logic
```

**Why each file exists:** `LocalizationContext.ts` is the single object every other file (including Session 79's gift card adapter) reads from, per the standing rule against per-feature currency formatting. Everything under `exchange-rates/` is isolated so provider outages or rate-source swaps never touch pricing/display code.

### 2.1 Step — Global Currency Intelligence Engine
- Detect or let the user select: Country, Region, Currency, Language, Time Zone, Number Format, Date Format, Tax Region.
- `LocalizationContext` is populated once per session/device and read everywhere pricing renders.

### 2.2 Step — Automatic Local Currency Display
- Support all internationally recognized currencies, with the following confirmed by country as a baseline: NGN, USD, GBP, CAD, EUR, JPY, CNY, INR, ZAR, GHS, KES, AED, SAR, AUD.
- Currency catalog stores symbol, decimal precision, and grouping rules per currency.

### 2.3 Step — Real-Time Exchange Rate Engine
- Live Exchange Rates, Cached Exchange Rates, Historical Rates, Enterprise Override Rates, Offline Fallback Rates.
- Scheduled Synchronization, Exchange Rate Validation, Multi-Provider Support with automatic failover.
- Resilience: system continues serving cached/fallback rates during connectivity issues.

### 2.4 Step — User Currency Preferences
- Accept automatic detection, select manually, override location-based currency, save multiple preferred currencies, switch instantly.
- Preferences sync across all devices via existing user-profile sync infrastructure (no new sync system).

### 2.5 Step — Payment Localization
- Every payment method adapts to the user's country where supported: WMPC Gift Card, Credit/Debit Cards, Bank Transfer, Digital Wallets, Mobile Money, Local Payment Networks, Cryptocurrency (where enabled), Enterprise Invoicing.
- `paymentMethodLocalizer.ts` wraps each method's existing adapter rather than forking it per currency.

### 2.6 Step — Local Payment Experience
- Auto-display: Currency Symbol, Decimal Format, Tax Rules, Regional Payment Instructions, Localized Receipts, Country-Specific Compliance Notices.

### 2.7 Step — Business & Marketplace Support
- Organizations can: Set Base Currency, Define Regional Pricing, Configure Country-Specific Prices, Configure Promotional Pricing.
- View Revenue by Currency, Generate Multi-Currency Reports, Reconcile Currency Conversions — built on the existing Analytics/Accounting integrations.

### 2.8 Step — AI Payment Intelligence (currency layer)
- Via existing AI Workforce: Recommend most cost-effective payment options, Analyze exchange-rate trends, Forecast currency fluctuations, Optimize international pricing, Detect unusual payment behavior, Monitor regional purchasing trends.

### 2.9 Step — Security & Compliance
- Secure Exchange Rate Validation, Fraud Detection, Currency Manipulation Protection, Regional Compliance, Audit Logging (existing system), Transaction Integrity, Full Encryption.

### 2.10 Step — Enterprise Integration Wiring
- Integrate with: Billing Platform, Wallet Platform, WMPC Gift Card Platform (Session 79), Subscription Platform, Marketplace, AI Marketplace, Creator Economy, CRM, Business Intelligence, Analytics, Accounting, Workflow Engine, Security Framework, Governance Kernel.
- Confirm no duplicate payment system was created; all currency logic funnels through `LocalizationContext`.

### 2.11 Session 80 — Completion Gate ("done when")
- [ ] Switching a user's preferred currency instantly re-renders prices across billing, marketplace, subscriptions, and gift cards.
- [ ] Exchange rate engine survives a simulated provider outage by falling back to cached/offline rates.
- [ ] WMPC Gift Card balance and checkout amounts display correctly localized in at least 3 currencies.
- [ ] Regional/promotional pricing configured by an org is honored in checkout totals.
- [ ] Multi-currency revenue report reconciles against Accounting's existing ledger.
- [ ] AI currency intelligence recommendations run through existing AI Workforce infra only.
- [ ] Zero duplicate payment or currency-formatting code found outside `packages/localization`.
- [ ] `CONVENTIONS.md` updated per §3 template.

---

## §3. Standing Session Close-Out Template

At the end of **every** session (including 79 and 80), answer these two questions and append the answers to `CONVENTIONS.md` under a dated heading:

```
## Session <N> — <date>

### Folder structure used
<paste the folder tree actually implemented, noting any deviation from the plan shown at session start and why>

### Decisions to log
- Naming conventions:
- Architectural choices:
- Library picks:
- Patterns established:
```

This keeps the roadmap, the codebase, and the conventions log in sync session over session.
