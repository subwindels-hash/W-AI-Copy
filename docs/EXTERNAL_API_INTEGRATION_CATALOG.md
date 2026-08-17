# WINDELS AI OS — External API Integration Catalog

This catalog answers two separate questions:

1. **What must be connected for the platform or a feature to work?**
2. **What does the current repository actually implement today?**

Not every API below is required for one deployment. Core WINDELS can boot with
PostgreSQL and Redis only. Operators should choose providers according to the
features they intend to enable. In production, an unconfigured feature should
remain disabled and report `not_configured`; it must never invent a successful
remote operation.

## Status legend

| Status | Meaning |
|---|---|
| **Core** | Required for the server, although it may be infrastructure rather than a third-party API |
| **Choose one** | At least one provider in this group is needed for the capability |
| **Implemented** | A real outbound adapter exists in the current code |
| **Feature optional** | Needed only when that module is enabled |
| **Inbound contract** | Another service calls WINDELS; no vendor SDK is required |
| **Blocked** | The current adapter is unsafe, incomplete, or declaration-only; do not enable for production yet |
| **Planned** | Named by the architecture, but no live adapter exists |

---

## Recommended integration order

### Phase 0 — server foundation

1. PostgreSQL 17
2. Redis 8
3. DNS and HTTPS
4. SMTP relay
5. One production AI provider
6. Off-host backups and production object storage before horizontal scaling

### Phase 1 — useful AI workspace

1. OpenAI **or** Anthropic/Gemini/Ollama/OpenAI-compatible inference
2. Brave Search **or** Tavily/SerpAPI
3. Google OAuth, if social sign-in is required
4. GitHub, for the AI Engineering workforce
5. Google Places, for Lead Discovery

### Phase 2 — customer channels

1. WhatsApp Cloud API
2. Telegram Bot API
3. TURN/STUN and a WebRTC media gateway for calls/camera streaming
4. Selected social publishing platforms

### Phase 3 — monetization

1. Select one primary payment provider for the target market
2. Add a secondary provider for redundancy/geographic coverage
3. Repair the payment fail-closed issues listed below before accepting money

### Phase 4 — specialized modules

Trading, video generation, Cloud Android, Module Runner, robotics, CSPM,
quantum, and other specialized providers should be integrated only after the
core platform has passed its target-environment security and isolation tests.

---

# 1. Core platform services

These are not all vendor APIs, but they are mandatory external service
boundaries in a real server deployment.

| Service | Need | Why | Configuration | Current status |
|---|---|---|---|---|
| PostgreSQL 17 | **Core** | Durable users, organizations, authentication state, billing, audit records, attachments metadata, and module records | `DATABASE_URL` | Implemented with Prisma. Production Compose creates a non-superuser `windels_app` role. |
| Redis 8 | **Core** | Cache, rate limiting, pub/sub, OAuth state, queues, connector state, SSE history, and many module ledgers | `REDIS_URL` | Implemented. Use authentication, persistence, backups, and memory limits. |
| DNS + ACME/Let's Encrypt | **Core** | Public HTTPS, OAuth callbacks, payment callbacks, and inbound webhooks all require a trusted public origin | `DOMAIN`, `ACME_EMAIL` | Implemented through Traefik in the single-server stack. |
| SMTP relay | Recommended core | Password resets, support mail, Email Intelligence outbox, and alert email | `WINDELS_SMTP_HOST`, `WINDELS_SMTP_PORT`, `WINDELS_SMTP_USER`, `WINDELS_SMTP_PASS`, `WINDELS_SMTP_SECURE`, `WINDELS_MAIL_FROM` | Real SMTP client exists. **Hardening needed:** TLS currently disables certificate verification in the custom client. |
| Web Push service | Feature optional | Browser/PWA push notifications | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Implemented through the Web Push protocol; generate a unique VAPID pair. |
| Generic alert/on-call webhook | Recommended core | Sends critical operational alerts to an incident platform | `WINDELS_ALERT_WEBHOOK_URL`, `WINDELS_ALERT_WEBHOOK_SECRET`, `WINDELS_ALERT_EMAIL` | Real signed webhook and SMTP path exists. It can target a custom PagerDuty/Opsgenie relay. |
| Object storage (S3/MinIO/R2) | Recommended before scale | Uploaded files and generated media must survive API replacement and multi-node operation | No production adapter/config contract yet | **Planned.** Current single-server deployment stores files on a Docker volume. |
| Error tracking (for example Sentry) | Recommended before public launch | Exception aggregation, release correlation, and alerting | `SENTRY_DSN` appears in deployment config | **Planned.** No Sentry SDK/transport is wired in application code. |

---

# 2. AI model and media APIs

## 2.1 Chat, agents, workflows, and embeddings

At least one real model provider is needed for production AI. With
`AI_REQUIRE_REAL_MODEL=true`, WINDELS fails closed when none is configured.

| Provider | Need | Why | Configuration | Current status |
|---|---|---|---|---|
| OpenAI API | **Choose one; recommended first** | Chat/agent inference and embeddings; also the only currently wired provider for native image generation, speech generation, and audio transcription | `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, `AI_DEFAULT_MODEL`, `WINDELS_IMAGE_MODEL`, `WINDELS_SPEECH_MODEL` | Implemented. Gives the broadest capability coverage in the current code. |
| Anthropic API | Choose one | Claude chat/agent inference and failover | `ANTHROPIC_API_KEY` | Implemented for model listing, health, and chat inference. |
| Google Gemini API | Choose one | Gemini chat/agent inference and failover | `GEMINI_API_KEY` | Implemented for model listing, health, and chat inference. |
| Ollama API | Choose one/self-hosted option | Private local inference without sending prompts to a cloud model vendor | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Implemented. The API container must be able to reach the Ollama host; do not use browser-side `localhost`. |
| OpenAI-compatible API | Choose one/gateway option | vLLM, LocalAI, Groq, Together, OpenRouter, or another OpenAI-compatible endpoint | `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_MODEL` | Implemented through the OpenAI adapter. Validate streaming, model listing, usage fields, and timeout behavior per vendor. |

### Native AI `/v1` warning

Keep `WINDELS_NATIVE_API_ENABLED=false` until real-provider inference,
streaming, tenant isolation, quotas, metering, and billing tests pass in the
target environment. The public aliases must not be enabled merely because an API
key exists.

## 2.2 Web search for AI tools

Only one search provider is required. Current selection order is Brave, then
SerpAPI, then Tavily.

| Provider | Why | Configuration | Current status |
|---|---|---|---|
| Brave Search API | Search grounding for agents and research workflows | `BRAVE_SEARCH_API_KEY` | Implemented; preferred first provider in code. |
| SerpAPI | Google-style organic result retrieval | `SERPAPI_KEY` | Implemented. |
| Tavily Search API | AI-oriented search results and snippets | `TAVILY_API_KEY` | Implemented. |

## 2.3 Image, speech, and transcription

| Provider | Why | Configuration | Current status |
|---|---|---|---|
| OpenAI Images | Powers the native `windels-image-1` alias | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `WINDELS_IMAGE_MODEL` | Implemented through `/images/generations`. |
| OpenAI Speech | Powers native text-to-speech | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `WINDELS_SPEECH_MODEL` | Implemented through `/audio/speech`. |
| OpenAI-compatible transcription | WhatsApp voice notes and native speech-to-text | `OPENAI_API_KEY` or `OPENAI_COMPAT_BASE_URL` + `OPENAI_COMPAT_API_KEY`; `WHATSAPP_STT_MODEL` | Implemented. |
| ElevenLabs | Downloadable server-generated TTS and multilingual voices | `ELEVENLABS_API_KEY` | Implemented. |
| PlayHT | Alternative downloadable server-side TTS | `PLAYHT_API_KEY`, `PLAYHT_USER_ID` | Implemented. |
| Browser SpeechSynthesis | Zero-cost client-side speech | No server key | Implemented, but available voices depend on the user's browser/OS. |

## 2.4 Video generation/transformation

| Provider/service | Why | Configuration | Current status |
|---|---|---|---|
| Local FFmpeg | Compositing, rendering, media transforms, and previews | Install `ffmpeg` in the runtime/worker image | Partially implemented. It is a local binary, not an API. The current production API image does not include it. |
| Runway | Intended real text/image-to-video provider | `RUNWAY_API_KEY` is referenced only in a comment | **Planned. No adapter is registered.** Do not buy access expecting current code to use it. |
| WINDELS Cloud Video AI | Intended video transformation provider | `WINDELS_CLOUD_VIDEO_KEY` | **Blocked.** The configured adapter throws “transport not implemented.” |
| Pika/Sora/Veo-class providers | Additional video generation/failover | No current contract | **Planned.** Provider interfaces exist, but only simulator adapters are active. |

The simulator video providers produce placeholders and must never be represented
as real generated footage.

---

# 3. Identity, directory, and engineering APIs

| Provider | Need | Why | Configuration | Current status |
|---|---|---|---|---|
| Google OAuth 2.0 / OpenID Connect | Feature optional | Google sign-in, account linking, and user provisioning | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, public web origin | Implemented with state, nonce, token exchange, and Google JWKS signature verification. |
| GitHub REST API | Feature optional; recommended for AI Engineering | Repository discovery, files, branches, commits, pull requests, reviews, issues, milestones, releases, Actions, and checks | Fine-grained GitHub token supplied through the AI Engineering connection UI | Implemented. **Hardening needed:** the current token is stored in Redis as plaintext inside the connection document; encrypt it before production use. |
| Microsoft Entra ID / generic OIDC | Enterprise feature | Enterprise SSO | No live provider contract | **Planned.** Data models/catalog entries do not equal a working login adapter. |
| Okta/SAML | Enterprise feature | Enterprise SSO and federation | No live provider contract | **Planned.** |
| SCIM | Enterprise feature | Automated user/group provisioning | No live provider contract | **Planned.** |

---

# 4. Lead discovery and business data

| Provider | Why | Configuration | Current status |
|---|---|---|---|
| Google Places Text Search API | Discovers real businesses for Lead Discovery and deduplicates them by Place ID | `GOOGLE_PLACES_API_KEY` | Implemented against the Maps Places text-search endpoint. Current search stores name, category, address, and Place ID; it does not call Place Details for phone/website enrichment. |
| CRM/email/calendar enrichment providers | Contact enrichment, mailbox sync, and calendars | No provider contract | **Planned.** CRM records work internally; broad external enrichment/sync does not. |

---

# 5. Communications and collaboration APIs

## 5.1 Messaging channels

| Provider | Why | Configuration | Current status |
|---|---|---|---|
| Meta WhatsApp Cloud API | Inbound/outbound text, media, interactive messages, delivery/read status, identity linking, and AI channel access | `WHATSAPP_ENABLED`, API version, phone-number ID, WABA ID, access token, verify token, app ID, app secret, public webhook URL | Implemented with raw-body HMAC verification and real Graph API calls. Requires a Meta app, approved business assets, permanent/system-user token, and HTTPS webhook. |
| Telegram Bot API | Bot identity, inbound webhooks, text/media delivery, typing state, and file retrieval | Bot token and webhook secret configured per channel; public webhook base URL | Implemented. Credentials are primarily stored per channel rather than global environment variables. |
| SMTP/IMAP mailbox provider | Email Intelligence send/receive | SMTP variables exist; no general IMAP connector variables | Outbound SMTP is implemented. **Inbound mailbox synchronization is not fully integrated**; select an IMAP/Gmail/Microsoft Graph strategy before claiming full email sync. |

## 5.2 Calls, camera, and real-time media

| Service | Why | Configuration | Current status |
|---|---|---|---|
| STUN | WebRTC NAT discovery | `WEBRTC_STUN_URL` | Configured; public Google STUN is the default. |
| TURN (for example coturn/Twilio/Nimbus) | Reliable relay for users behind restrictive NAT/firewalls | `WEBRTC_TURN_URL`, `WEBRTC_TURN_USERNAME`, `WEBRTC_TURN_CREDENTIAL` | ICE credentials are handed to clients. Required for reliable production calling. |
| External WebRTC/RTSP media gateway | Converts/relays live camera feeds and WebRTC sessions | No complete provider contract | **Planned/required for live camera video.** Current camera module registers feed metadata and returns handoff tokens but does not decode RTSP or run a gateway. |
| Meeting provider | Real hosted meetings/recordings | No live Zoom/Teams/Meet provider | **Planned.** Current meeting URLs are platform records, not an integrated conferencing backend. |

---

# 6. Social publishing APIs

Each selected platform requires its own OAuth application, approved scopes, a
public callback, and a connected destination account. You only need the
platforms WINDELS will publish to.

| Platform | Why | Configuration | Current status |
|---|---|---|---|
| YouTube Data API v3 | Resumable video upload and channel publishing | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `PUBLISH_REDIRECT_URI` | Implemented. Requires `youtube.upload` scope and quota planning. |
| TikTok Content Posting API v2 | Video upload, status polling, and publishing | `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`, redirect URI | Implemented. Public posting requires TikTok app review/approval. |
| Instagram Graph/Instagram API | Reels/video publishing to professional accounts | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`, optional `INSTAGRAM_IG_USER_ID` | Implemented. Requires a professional account and approved publishing scopes. |
| Facebook Graph API | Facebook Page video publishing | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, optional `FACEBOOK_PAGE_ID` | Implemented. Requires Page access and approved page scopes. |
| X API v2 + media upload API | Posts and chunked media uploads | `X_CLIENT_ID`, `X_CLIENT_SECRET` | Implemented with OAuth 2/PKCE. Requires an X developer tier that permits posting/media operations. |
| Pinterest API v5 | Media registration/upload and video pin creation | `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`, optional `PINTEREST_BOARD_ID` | Implemented. Requires board and pin-write permissions. |

Common settings: `PUBLISH_REDIRECT_URI`, `PUBLIC_API_URL`, `PUBLIC_WEB_URL`,
`PUBLISH_WEBHOOK_BASE_URL`, `PUBLISH_MAX_MEDIA_MB`, and
`PUBLISH_WORKER_INTERVAL_MS`.

---

# 7. Payment APIs

Use at least one provider that supports the target countries/currencies. For a
Nigeria-first launch, Paystack or Flutterwave is the natural primary provider;
Stripe or PayPal can provide broader international coverage.

| Provider | Why | Configuration | Current adapter status |
|---|---|---|---|
| Paystack | Nigerian/African cards and bank payment methods | `PAYSTACK_SECRET_KEY`; webhook uses the same secret | Fail-closed initialize/verify and exact-raw-body HMAC verification are implemented. Requires real sandbox qualification before live credentials. |
| Flutterwave | African/global cards, bank transfer, and mobile money | `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_SECRET_HASH` | Fail-closed initialize/verify and webhook hash verification are implemented. Requires real sandbox qualification. |
| Stripe | Global cards, wallets, and selected local methods | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Fail-closed Checkout/verify and timestamp-bounded exact-body signatures are implemented. Requires real Stripe test-mode qualification. |
| PayPal | International PayPal checkout | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENVIRONMENT` | Fail-closed create/capture plus PayPal's official webhook-verification endpoint are implemented. Requires sandbox qualification. |
| Blockonomics | BTC address generation/callbacks | `BLOCKONOMICS_API_KEY`, `BLOCKONOMICS_CALLBACK_SECRET` | **Blocked.** Crypto checkout is now disabled rather than generating fallback addresses or fixed prices. |
| TRON, Ethereum, and BNB-chain RPC/indexer APIs | Verify TRC-20/ERC-20/BEP-20 deposits and confirmation counts | No complete RPC/indexer config contract | **Not implemented.** Current code refuses these checkouts. |

## Payment safety state

The code now refuses missing/incomplete provider configuration, upstream errors,
reference/amount/currency mismatches, unverified settlements, duplicate webhook
events, and cross-tenant reference lookups. Callback URLs derive from
`WINDELS_PUBLIC_API_ORIGIN`; crypto checkout remains blocked.

Before live credentials, the remaining work is operational qualification:

1. Run each chosen provider's sandbox and negative-path suite against its real API.
2. Add scheduled reconciliation and refund/chargeback workflows.
3. Verify invoice settlement recovery after a database or billing-module outage.
4. Complete legal, tax, refund, dispute, and accounting review.
5. Implement a real BTC/chain verifier before re-enabling any crypto payment.

---

# 8. Commerce API

| Provider | Why | Configuration | Current status |
|---|---|---|---|
| WMPC Commerce API | Product search/details, cart, checkout, payment status, orders, tracking, and gift-card application for the AI Commerce tools | `WMPC_API_BASE_URL`, `WMPC_API_KEY`, `WMPC_WEBHOOK_SECRET`, `WMPC_TIMEOUT_MS` | HTTP adapter and webhook contract are implemented, but **WMPC itself has no live endpoint in this repository**. This is blocked until the external WMPC service exists and passes contract tests. |

---

# 9. Market data and trading APIs

Trading integrations are optional and high risk. Keep global read-only switches
enabled until demo/testnet qualification is complete. WINDELS is not a broker or
custodian; users connect their own external accounts.

## 9.1 Reference market/FX data

| Provider | Why | Configuration | Current status |
|---|---|---|---|
| CoinGecko public API | Crypto quotes, market charts, and instrument list | No key in current adapter | Implemented and rate limited. Not appropriate as the sole execution-grade price source. |
| Frankfurter API | ECB-style fiat FX reference rates | No key | Implemented. |
| Open Exchange Rate API (`open.er-api.com`) | Fiat FX fallback | No key | Implemented. |
| Equities/forex/options/futures data vendor | Real non-crypto quotes and candles | No live adapter | **Planned.** Alpha Vantage, Twelve Data, Polygon, IEX, OANDA, and others are named only as stubs. Synthetic data can appear when real data is unavailable and is labelled synthetic. |

Do not use synthetic or stale reference data for order execution, payment
conversion, accounting, or valuation.

## 9.2 MT4/MT5

Choose one transport:

| Integration | Why | Configuration | Current status |
|---|---|---|---|
| WINDELS Python MT5/MT4 bridge over ZeroMQ | Lowest-latency local terminal connection | `WINDELS_MT5_BRIDGE_ZMQ`, bridge token/terminal settings; MT4 equivalents | Connector exists. Requires an external terminal/bridge host and real demo-account validation. |
| WINDELS Python bridge over HTTP/SSE | Easier cross-host terminal connection | `WINDELS_MT5_BRIDGE_HTTP`, `WINDELS_MT5_BRIDGE_TOKEN`; MT4 equivalents | Connector exists. Use private networking/mTLS or a secured tunnel. |
| MetaApi Cloud | Hosted MT4/MT5 connection without managing a terminal | `WINDELS_METAAPI_TOKEN`, `WINDELS_METAAPI_REGION`; optional MT4 token | Connector exists. |

**Current MT4 blocker:** parts of `mt4-connector.ts` select and build transports
from the MT5 bridge variables instead of the MT4 variables. Correct that before
qualifying a separate MT4 bridge.

## 9.3 Crypto exchanges

Real REST/WS connector classes are bundled for:

1. Binance
2. Bybit
3. OKX
4. Coinbase Advanced
5. Kraken
6. KuCoin
7. Bitget
8. Gate.io
9. MEXC
10. HTX (Huobi)
11. Crypto.com Exchange
12. Hyperliquid

Why: balances, symbols, market data, positions, orders, fills, and controlled
trade execution against the user's own exchange account. API key/secret values
are entered per broker account rather than through global environment variables.
Use read-only testnet keys first, IP restrictions, no withdrawal permission, and
`WINDELS_CRYPTO_GLOBAL_READONLY=true` during qualification.

**Current credential blocker:** `BrokerIntegrationService.loadCredentials()`
restores login and password but not encrypted passphrase/sub-account/wallet-key
fields. Exchanges that require those extra credentials cannot be considered
production-ready until the credential model and encrypted storage path are
completed.

## 9.4 Planned traditional broker APIs

cTrader, FIX, Interactive Brokers, Alpaca, TradeStation, OANDA, and IG appear in
the connector catalog but have no bundled live connector. They are **planned**,
not APIs to procure now.

---

# 10. Platform execution and infrastructure APIs

| Service | Why | Configuration | Current status |
|---|---|---|---|
| Isolated Module Runner | Scans/tests/installs/enables/rolls back signed `.wmod` packages outside the API process | `MODULE_RUNNER_URL`, `MODULE_RUNNER_HMAC_SECRET`, optional `MODULE_RUNNER_ARTIFACT_BASE_URL` | Signed HTTP control-plane adapter is implemented. A separate sandboxed runner service must be built/deployed. |
| ClamAV daemon | Malware scanning for module packages and project intake | `CLAMD_HOST` | Integration contract exists. Required before activating uploaded modules in production. |
| Cloud Android provider | Provisions/controls cloud Android devices for human and AI sessions | `CLOUD_ANDROID_ENABLED`, `CLOUD_ANDROID_PROVIDER_URL`, `CLOUD_ANDROID_PROVIDER_HMAC_SECRET`, provider metadata/timeouts | Vendor-neutral signed HTTP adapter is implemented. A real Android virtualization provider still has to implement the provider contract and pass device/isolation tests. |
| Kubernetes API | Cluster discovery/management views when deployed in Kubernetes | In-cluster service account/environment | Partial/internal platform integration. Use least-privilege service accounts; do not grant cluster-admin to the API. |
| Generic inbound webhook API | Lets external systems submit signed events to WINDELS | `WEBHOOK_SECRET` and generated endpoint secrets | Implemented inbound receiver; this is a WINDELS API, not a third-party dependency. |
| Generic developer webhooks | Sends WINDELS events to customer endpoints | Per-webhook URL and secret | Implemented outbound delivery system. |

---

# 11. Security, robotics, and quantum connectors

These modules currently favor inbound reporting or declaration-only status. Do
not mistake an environment variable for a working vendor integration.

| Integration | Why | Configuration | Current status |
|---|---|---|---|
| CSPM/scanner findings ingest | AWS/Azure/GCP security scanners report findings to WINDELS | External scanner posts to WINDELS; `WINDELS_CYBER_CSPM_URL` only declares a scanner URL | **Inbound HTTP findings is implemented. Outbound CSPM scanning is not.** |
| Robotics HTTP telemetry ingest | Robots/gateways report measured telemetry | Authenticated calls to WINDELS robotics endpoints | Implemented inbound contract. |
| MQTT/AMQP broker | Fleet telemetry and command dispatch | `WINDELS_ROBOTICS_MQTT_URL` | **Blocked/declaration-only.** No MQTT session is opened and commands remain `local_state_only`. |
| IBM Quantum | QPU/hybrid jobs | `WINDELS_IBM_QUANTUM_TOKEN` | **Declaration-only. No QPU session/job runner.** |
| AWS Braket | QPU/hybrid jobs | `WINDELS_AWS_BRAKET_REGION` and AWS credentials | **Declaration-only.** |
| Azure Quantum | QPU/hybrid jobs | `WINDELS_AZURE_QUANTUM_RESOURCE` and Azure identity | **Declaration-only.** |
| Google quantum/Cirq project | Quantum workloads | `WINDELS_GOOGLE_QUANTUM_PROJECT` | **Declaration-only.** |
| D-Wave Leap | Quantum annealing | `WINDELS_DWAVE_TOKEN` | **Declaration-only.** |

Do not purchase quantum access based on this build: submitted jobs remain queued
and no objective value is generated.

---

# 12. APIs/services that are still missing for full enterprise operation

These are capability gaps, not working integrations:

1. Production object storage and CDN adapter
2. Error-tracking SDK/transport
3. Generic enterprise OIDC/SAML and SCIM
4. Inbound IMAP/Gmail/Microsoft Graph mailbox synchronization
5. Calendar provider integration
6. WebRTC/RTSP media gateway and conferencing provider
7. Real video generation/transformation adapters
8. Execution-grade equities/forex/options/futures market data
9. Traditional broker connectors
10. Real CSPM cloud scanners
11. MQTT/AMQP robotics client and command acknowledgement
12. Quantum vendor job runners
13. TRON/Ethereum/BNB payment verification/indexing
14. Fully isolated Module Runner deployment
15. Managed secrets/KMS adapter and credential rotation workflow

---

# 13. Minimum provider set by launch profile

## Internal company deployment

- PostgreSQL + Redis + HTTPS
- SMTP
- One AI provider
- One web-search provider
- Google OAuth or existing password login
- GitHub, if the AI Engineering module is used
- TURN, if calls/camera features are used

## Nigeria-first commercial SaaS

- Everything above
- Paystack **or** Flutterwave after payment hardening
- WhatsApp Cloud API
- Google Places for lead discovery
- Stripe/PayPal only when international billing is required

## AI media/publishing product

- OpenAI image/speech or selected voice provider
- FFmpeg workers
- A real video generation provider adapter (must first be implemented)
- OAuth apps for each selected social network
- Production object storage/CDN

## Trading product

- Broker/exchange demo/testnet API only at first
- Execution-grade market data appropriate to the asset class
- Read-only global switch during qualification
- Independent legal/compliance review, audit retention, risk limits, and human
  approval tests before any live order capability

---

# 14. Integration acceptance checklist

Every enabled external API should pass all of the following:

- [ ] Sandbox/test account verified before live credentials
- [ ] Health endpoint or real connectivity probe
- [ ] Least-privilege scopes; no unnecessary withdrawal/admin permission
- [ ] Secrets encrypted at rest and excluded from logs/responses
- [ ] HTTPS certificate verification and outbound hostname allowlist
- [ ] Request timeout, bounded retries, backoff, and rate-limit handling
- [ ] Idempotency for mutations and webhook replay protection
- [ ] Constant-time signature verification using the exact raw webhook body
- [ ] Tenant/organization ownership checked before every remote action
- [ ] Amount/currency/reference validation for money movement
- [ ] Honest `not_configured`, degraded, and upstream-failure states
- [ ] Metering/cost attribution and quota enforcement
- [ ] Data-processing agreement, retention, deletion, and regional compliance
- [ ] Negative-path tests: bad credentials, expired token, 429, 5xx, timeout,
      duplicate webhook, wrong tenant, wrong amount, and provider outage
- [ ] Kill switch and rollback/revocation procedure
- [ ] Production callback URLs registered against the real deployment domain
