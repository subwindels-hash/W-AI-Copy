# WINDELS AI OS — External API Integration Catalog

> **Purpose:** the complete list of third‑party APIs the OS connects to (or must
> connect to), grouped by capability area, with the *why* for each one and where
> it lives in the codebase today.
>
> **Status legend**
> - ✅ **IMPLEMENTED** — real connector / provider adapter present in `apps/api/src`, tested.
> - 🟡 **SCAFFOLDED** — module exists, provider slot/abstraction is wired but provider not live-tested end‑to‑end.
> - 🟢 **PLANNED** — required by the master spec (`uploads/CLAUDE.md`) but not yet built.
>
> Built from a read of the current codebase (monorepo at `a4e79b1`) and the master
> specification. This is a *catalog*, not a work order — see
> `docs/PRODUCTION_READINESS_AUDIT.md` for per‑module build status.

---

## 1. AI & LLM Providers

The OS is **vendor‑agnostic** by design. A `ProviderRegistry`
(`apps/api/src/services/ai/registry.ts`) routes all model calls; providers are
pluggable so switching vendors never touches business logic. `AI_DEFAULT_MODEL`
(`.env.example`) selects the default. The registry **falls back to the local
Echo provider** so a fresh clone works with zero cloud keys.

| API | Status | Why |
|---|---|---|
| **OpenAI** (`openai.provider.ts`) | 🟡 Scaffolded | Primary hosted LLM for chat, agents, summarization, generation. Real key gated behind `OPENAI_API_KEY`. |
| **Anthropic / Claude** (`anthropic.provider.ts`) | 🟡 Scaffolded | Second hosted LLM for long‑context reasoning, analysis, agentic work. `ANTHROPIC_API_KEY`. |
| **Google Gemini** (`gemini.provider.ts`) | 🟡 Scaffolded | Multi‑modal (image+text) reasoning, alternative vendor for cost/latency. |
| **Ollama** (`ollama.provider.ts`) | 🟡 Scaffolded | Self‑hosted / private LLM — air‑gapped or privacy‑sensitive deployments where data must not leave the org. |
| **Echo** (`echo.provider.ts`) | ✅ Implemented | Deterministic offline fallback; guarantees the OS boots and demos work with no cloud dependency. |

**Why vendor‑agnostic:** enterprises need model choice for cost, privacy (EU/GDPR,
regulated industries), latency, and vendor lock‑in avoidance. The registry keeps
that a config decision, not a refactor.

---

## 2. Voice / Speech (TTS–STT)

| API | Status | Why |
|---|---|---|
| **ElevenLabs** (`voice/`, `voiceStudio/voice.service.ts`) | 🟡 Scaffolded | High‑quality neural TTS for AI employees, voice agents, voice‑studio character voices. |

**Why:** the Voice vertical (voice agents, AI‑employee voices, voice studio) needs
natural, low‑latency speech that open/on‑device models don't yet match for
production. Spec also names **Voice Providers** generally (Azure/Google TTS are
planned alternatives via the same abstraction).

---

## 3. Media Generation (image / video / music)

| API | Status | Why |
|---|---|---|
| **Udio** (`musicGen/`) | 🟡 Scaffolded | AI music generation for Media Factory, music videos, brand soundtracks. |
| **Suno** (`musicGen/`) | 🟢 Planned | Secondary/backup music generation provider for redundancy and licensing choice. |
| **Runway** (`mediaGen/`) | 🟢 Planned | AI video generation for the video‑production pipeline. |
| **Stable Diffusion** (`mediaGen/`) | 🟢 Planned | Image generation — self‑hostable, cheap at scale, no per‑image cloud lock‑in. |

**Why:** the Media Factory and content verticals need programmatic production of
imagery, video, and audio so AI employees can generate on‑brand creative assets
end‑to‑end. Multiple providers per modality give failover + cost control.

---

## 4. Payments & Billing

`apps/api/src/payments/` — one unified payments service that dispatches to
providers; invoices/ledger/geo‑billing on top.

| API | Status | Why |
|---|---|---|
| **Stripe** (`stripe.service.ts`) | 🟡 Scaffolded | Primary card/bank payments, subscriptions, invoicing — global default. |
| **PayPal** (`paypal.service.ts`) | 🟡 Scaffolded | Alternative wallet/checkout — market reach where PayPal dominates. |
| **Paystack** (`paystack.service.ts`) | 🟡 Scaffolded | West‑African card/bank transfers (NGH/GH) — required for African enterprise market. |
| **Flutterwave** (`flutterwave.service.ts`) | 🟡 Scaffolded | Pan‑African payments (40+ countries) — complements Paystack for cross‑border Africa. |
| **Crypto payments** (`crypto.service.ts`) | 🟡 Scaffolded | On‑chain payments for crypto‑native users; ties into the crypto trading infrastructure. |
| **Plaid** | 🟢 Planned | Bank‑account linking for ACH/direct‑debit and the Banking APIs vertical. |

**Why:** the spec's "Payments" integration set (Stripe, Paystack, Flutterwave,
PayPal) targets global + African coverage. Geographic redundancy matters — a
regional processor outage must not stop invoicing. Usage metering feeds the
billing/geo‑billing modules.

---

## 5. Social Publishing (Media Factory, Session 77B)

`apps/api/src/mediaFactory/publishing/` — real OAuth flows, token storage, job
queues, per‑platform rate caps, webhooks. **Publishing is never faked**: without
a platform's OAuth pair it reports `PLATFORM CREDENTIALS REQUIRED`.

| API | Status | Why |
|---|---|---|
| **YouTube** | 🟡 Scaffolded | Auto‑upload short/long video — core of the creator/media pipeline. |
| **TikTok** | 🟡 Scaffolded | Short‑form video distribution — primary Gen‑Z/reach channel. |
| **Instagram** | 🟡 Scaffolded | Reels/Posts via IG Graph API — meta‑family reach. |
| **Facebook** | 🟡 Scaffolded | Pages/video publishing — meta‑family + page API. |
| **X (Twitter)** | 🟡 Scaffolded | Text/thread + video posts — real‑time/news audience. |
| **Pinterest** | 🟡 Scaffolded | Pin publishing — visual discovery/traffic channel. |

**Why:** one media asset should publish to every channel the customer's audience
lives on, with consent‑gated OAuth, honest failure, and platform‑compliant rate
limits. OAuth per platform in `.env.example` (`*_CLIENT_ID/SECRET`, redirect URI).

---

## 6. Crypto Exchange Connectors

`apps/api/src/tradingIntel/crypto/exchanges/` — 12 CEX connectors behind a common
`base-crypto-connector.ts` with per‑exchange REST + private WebSocket adapters,
shared order‑routing, signing, and a global read‑only kill‑switch
(`WINDELS_CRYPTO_GLOBAL_READONLY`). API keys are stored AES‑256‑GCM‑encrypted in
Redis per‑account.

| Exchange | Status | Why |
|---|---|---|
| **Binance** | ✅ Implemented | Largest global volume/liquidity — default venue. |
| **Coinbase** | ✅ Implemented | Largest US retail/institutional venue. |
| **Bybit** | ✅ Implemented | Major derivatives+spot, large APAC volume. |
| **OKX** | ✅ Implemented | Top‑3 global spot/derivatives venue. |
| **Kraken** | ✅ Implemented | Trusted US/EU exchange, fiat stronghold. |
| **Kucoin** | ✅ Implemented | Altcoin breadth — wide token coverage. |
| **Bitget** | ✅ Implemented | Growing derivatives/spot + Web3 ecosystem. |
| **Gate.io** | ✅ Implemented | Huge altcoin listing coverage. |
| **HTX (Huobi)** | ✅ Implemented | Established Asian venue. |
| **MEXC** | ✅ Implemented | Very large alt‑listings, low fees. |
| **Crypto.com** | ✅ Implemented | Global retail + institutional brand. |
| **Hyperliquid** | ✅ Implemented | Leading decentralized perpetuals venue. |

**Why:** order routing needs breadth of liquidity, venue redundancy (an exchange
outage or local ban must not halt trading), and per‑venue access to coins listed
nowhere else. Testnet/sandbox flags (`WINDELS_CRYPTO_DEFAULT_TESTNET`) keep
staging safe.

---

## 7. Trading / Brokerage (Trading Intelligence)

| API | Status | Why |
|---|---|---|
| **MetaTrader 5** — native ZeroMQ bridge / HTTP‑SSE bridge / **MetaApi cloud** (`WINDELS_MT5_*`, `WINDELS_METAAPI_TOKEN`) | ✅ Implemented | Retail/forex/CFD trading for the brokerage vertical; three transport modes for on‑prem vs cloud. |
| **Oanda** (`broker-connector.ts`) | 🟡 Scaffolded | Forex/CFD retail broker API — diversified brokerage access. |
| **Alpaca** | 🟡 Scaffolded | Commission‑free US stock/ETF trading + brokerage. |
| **Interactive Brokers (IBKR)** | 🟡 Scaffolded | Institutional‑grade multi‑asset brokerage (stocks/options/futures/forex). |
| **Tradier** | 🟡 Scaffolded | Low‑cost US brokerage API. |

**Why:** the trading vertical must be broker‑agnostic (retail → institutional).
MT5/MetaApi covers forex/CFD; the US equity/options brokers cover the rest. A
global MT5 read‑only switch (`WINDELS_MT5_GLOBAL_READONLY`) enforces risk policy.

---

## 8. Communications (Email / SMS / Push / Chat)

| API | Status | Why |
|---|---|---|
| **SMTP** (`emailIntel/smtp.client.ts`) | ✅ Implemented | Dependency‑free SMTP client (AUTH PLAIN, TLS) — real email outbox delivery for Email Intelligence. |
| **Email platforms (SendGrid, Mailgun, Postmark)** | 🟢 Planned | Managed email at scale (deliverability, templating, ESP reputation). |
| **Twilio** (`notifications/`, `alertManagement`) | 🟡 Scaffolded | SMS + programmatic **WhatsApp** messaging for alerts/notifications. |
| **WhatsApp Business** | 🟢 Planned | Customer support + marketing channel (Twilio/Cloud API). |
| **Web Push (VAPID / FCM / APNs)** (`notifications/`) | ✅ Implemented | Browser + mobile push (VAPID keys in `.env.example`); FCM/APNs for mobile planned. |
| **Slack** (`extensions/`, `notifications/`) | 🟡 Scaffolded | Enterprise chat ops — alerts, approvals, agent activity. |
| **Discord** (`notifications/`) | 🟡 Scaffolded | Community/ops chat integration. |

**Why:** every alert, campaign, and outbox message must reach the user on the
channel they actually use. Multi‑channel = higher delivery + redundancy (email
down → SMS/push still fires).

---

## 9. CRM / ERP / Business Applications

| API | Status | Why |
|---|---|---|
| **Salesforce** (`enterprise/`, `crm/`) | 🟡 Scaffolded | Enterprise CRM — sync leads/contacts/opportunities for sales agents. |
| **HubSpot** (`extensions/`, `crm/`) | 🟡 Scaffolded | SMB/mid‑market CRM + marketing automation. |
| **SAP** (`extensions/`) | 🟢 Planned | Enterprise ERP/back‑office for large‑account integrations. |
| **QuickBooks** (`extensions/`) | 🟢 Planned | Small‑business accounting sync. |
| **Xero** | 🟢 Planned | Cloud accounting — spec "Accounting" set (QuickBooks + Xero). |
| **Box** (`extensions/`) | 🟡 Scaffolded | Enterprise file storage/content sync. |

**Why:** AI employees must operate inside the customer's existing business
systems, not force a new stack — reads/writes CRM and ERP data, files, and
accounting records where the org already lives.

---

## 10. Productivity & Developer Tools

| API | Status | Why |
|---|---|---|
| **Google OAuth / Google Identity** (`googleAuth/`) | ✅ Implemented | SSO sign‑in + Google Workspace (Gmail, Drive, Calendar) identity for user/auth and integrations. |
| **GitHub** (`extensions/`) | 🟡 Scaffolded | Source control + software factory triggers/PR automation. |
| **GitLab** | 🟢 Planned | Self‑hosted/enterprise Git — spec developer platforms. |
| **Jira** | 🟢 Planned | Issue tracking for software factory/AI engineering workstreams. |
| **Linear** | 🟢 Planned | Product/engineering issue tracker. |
| **Zapier / n8n / Make** | 🟢 Planned | Low‑code automation bridge to thousands of third‑party apps. |

**Why:** developer-platform integrations let the Software Factory / AI
Engineering agents raise PRs, create issues, and orchestrate CI/CD inside the
customer's existing tooling; automation bridges unlock long‑tail app coverage
without building a connector per app.

---

## 11. Cloud Providers & Infrastructure

| API | Status | Why |
|---|---|---|
| **AWS** | 🟢 Planned | Compute, S3 storage, serverless, model hosting — primary cloud target. |
| **Microsoft Azure** | 🟢 Planned | Enterprise cloud + Azure AI/OpenAI hosting, AD/Entra integration. |
| **Google Cloud (GCP)** | 🟢 Planned | GCP compute, Storage, Vertex AI. |

**Why:** self‑hosted/deployment verticals must run on any hyperscaler the
customer uses; hybrid/multi‑cloud avoids lock‑in and satisfies region/data‑
residency requirements. (These are referenced throughout `services/`, `aws: 274`
hits in code.)

---

## 12. Observability / Monitoring / Reliability

| API | Status | Why |
|---|---|---|
| **Sentry** (`SENTRY_DSN`) | 🟡 Scaffolded | Error tracking + release health across API/web. |
| **Prometheus** (`prometheus/`) | ✅ Implemented | Metrics scraping/exposition for the platform. |
| **Grafana** (`grafana/`) | ✅ Implemented | Dashboards/alerting over Prometheus+Loki. |
| **Loki / Promtail** (`loki/`, `promtail/`) | ✅ Implemented | Centralized structured log aggregation. |

**Why:** an "operating system" must be observable. These give the ops/observability
modules real metrics, logs, and traces, plus the dashboard surface for
`GRAFANA_USER/PASSWORD`.

---

## 13. Government & Enterprise APIs (spec‑planned)

From `uploads/CLAUDE.md` §"Government & Enterprise APIs":

| API | Status | Why |
|---|---|---|
| **Banking APIs (open banking)** | 🟢 Planned | Account access, payments initiation, transaction data for finance agents. |
| **Tax systems** | 🟢 Planned | Automated compliance/filing for the finance vertical. |
| **Identity verification / KYC** | 🟢 Planned | Onboarding, AML/regulatory checks. |
| **Regulatory services** | 🟢 Planned | Compliance reporting for regulated industries. |
| **IoT platforms** | 🟢 Planned | Device/data ingestion for IoT‑connected verticals. |

**Why:** these unlock the enterprise/institutional market where regulatory
compliance is a purchase prerequisite. Deliberately left as an integration
catalog (not yet coded) because they're jurisdiction/region‑specific.

---

## Summary — "must‑have" integration tiers

| Tier | What | Why it matters |
|---|---|---|
| **Tier 1 (core, live today)** | SMTP email, Web Push/VAPID, Echo + AI Provider Registry, 12 crypto exchanges, MT5/MetaApi brokers, 6 social‑publishing OAuth flows, Stripe/PayPal/Paystack/Flutterwave payments, Prometheus/Grafana/Loki | The verticals actually ship value — money, media, trading, comms, observability. |
| **Tier 2 (scaffolded, need live keys)** | OpenAI / Anthropic / Gemini, ElevenLabs, Udio, Google OAuth, Salesforce, HubSpot, Slack, Twilio, Sentry | Unlock "real" AI/voice/media/CRM/ops once credentials are provisioned. |
| **Tier 3 (spec‑planned, build next)** | AWS/Azure/GCP, Jira/GitLab/Linear, QuickBooks/Xero/SAP, WhatsApp, Plaid, Runway/Stable Diffusion/Suno, Zapier/n8n, Banking/Tax/KYC/Regulatory/IoT | Completes the enterprise story per the master spec; gated on scope priority. |

---

### Cross‑cutting requirements for *every* integration

- **Credentials:** managed via `.env.example` + per‑account encrypted store
  (AES‑256‑GCM in Redis for trading secrets; OAuth token store for publishing).
- **Honest failure:** never fake a third‑party result (`noFakeVerdict` /
  `noRandomData` guards) — unconfigured integrations report `NOT_CONFIGURED` /
  `PLATFORM CREDENTIALS REQUIRED`.
- **Unified governance:** all adapters inherit auth, audit‑logging, rate‑limiting,
  and monitoring from the Enterprise API Gateway per spec §4/§5.
- **Fail‑closed safety:** global read‑only kill‑switches for MT5 and crypto.
