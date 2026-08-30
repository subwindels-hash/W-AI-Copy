# PHP module parity ledger

A module is marked complete only when its API paths, persistence, validation, authentication, tenant scoping, and cPanel packaging are implemented. Original TypeScript files remain until runtime parity tests can be executed.

| Module | PHP controller/model | MySQL schema | API paths | Package | Status |
|---|---|---|---|---|---|
| Health | Yes | n/a | Yes | Yes | Ported; runtime validation pending |
| Auth / current user | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| File uploads | Yes | filesystem | Yes | Yes | Ported; runtime validation pending |
| Account | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Profile | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Workspace / tasks | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Permissions / RBAC | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Administration | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Audit | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Application / organization settings | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Enterprise organization / white label | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Enterprise model registry | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Enterprise AI monitoring | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Enterprise plugins | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Enterprise integrations | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Enterprise SSO configuration | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Enterprise governance (ADRs, standards, reviews) | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Enterprise service discovery | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Enterprise event bus | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Enterprise API governance / OpenAPI | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| API keys / usage | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| MFA (TOTP / recovery codes) | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| MFA Assurance | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Notifications / preferences | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Prompt templates / rendering / usage stats | Yes | Yes | Yes | Yes | Built-ins and MySQL usage ledger ported |
| Agents core CRUD / events / model metadata | Yes | Yes | Yes | Yes | Core ported; runtime validation pending |
| Agent lifecycle / skills | Yes | Yes | Yes | Yes | Persistence and CRUD ported; skill execution registry pending |
| Agent memory / knowledge | Yes | Yes | Yes | Yes | CRUD, filtering, token estimation and events ported |
| Message attachments | Yes | Yes + filesystem | Yes | Yes | Conversation upload, claim, history projection and secure download ported; Talk targets await Talk module |
| Conversations / messages / OpenAI adapter | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Conversation lifecycle (rename, pin, archive, purge) | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Conversation sharing / access log | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Conversation participants / read state | Yes | Yes | Yes | Yes | User and agent participants ported; runtime validation pending |
| Conversation stats / transcript / recovery / message operations | Yes | Yes | Yes | Yes | Ported; runtime validation pending |
| Conversation search / unread / deleted / digest | Yes | Yes | Yes | Yes | Ported; substring and extractive methods documented in responses |
| Canvases / blocks / connections / AI / collaboration | Yes | Yes | Yes | Yes | Ported with MySQL heartbeat state; runtime validation pending |
| Talk channels / messages / meetings / action items | Yes | Yes | Yes | Yes | Core Talk surface ported; runtime validation pending |
| Workflows / runs / approvals / analytics | Yes | Yes | Yes | Yes | Core engine includes task, action-item, Talk, condition, loop, delay, AI and approval nodes; other actions fail explicitly |
| Developer webhooks / signed delivery ledger | Yes | Yes | Yes | Yes | Synchronous dispatcher, SSRF controls and request-driven retry processing ported |
| Inbound webhooks / inbox / replay | Yes | Yes | Yes | Yes | HMAC-style shared-secret verification and MySQL inbox ported |
| Contact / AI assistant / administration center | Yes | Yes | Yes | Yes | Public, customer and staff surfaces ported |
| Billing / subscriptions / invoices / payment events | Yes | Yes | Yes | Yes | Ported with idempotent payment register and measured insights |
| Platform reviews / moderation | Yes | Yes | Yes | Yes | Public aggregates, customer review and moderation ported |
| CRM contacts / companies / deals / activities | Yes | Yes | Yes | Yes | CRUD, query filters, tenant-safe references, pipeline and measured rollup ported |
| ERP products / warehouses / inventory / suppliers / orders | Yes | Yes | Yes | Yes | Full core ERP surface, low-stock/value rollups and CRM conversion ported |
| Email Intelligence | Yes | Yes | Yes | Yes | Mailboxes, messages, SMTP, AI draft, thread-detail summary/triage and dashboard ported |
| Application Builder / software factory core | Yes | Yes | Yes | Yes | Projects, workforce tasks, provider-backed generation, build state machine, SHA-256 artifacts and approval-gated releases ported |
| Gift Cards / payment method | Yes | Yes | Yes | Yes | Tenant-scoped issuance, PIN verification, activation, reload, locked/idempotent redemption, lifecycle, fraud, invoice allocation and dashboard ported |
| Helpdesk / customer support | Yes | Yes | Yes | Yes | Tenant-scoped tickets, comments, assignment, enforced lifecycle, SLA rollup and CRM activity linkage ported |
| AI Kernel + AI provider registry (`kernel`) | Yes | Yes — 5 new tables | Yes | Yes | **Runtime validated.** All 15 endpoints ported: `/api/v1/kernel/{status,components,dispatch,events,policy/evaluate,resources/grant,model/select,diagnostics/run}` and `/api/v1/ai/{models,providers,health,usage,complete,embed,test-providers}`. Redis state (components, event stream, counters, latency samples) is now MySQL in `kernel_components` / `kernel_events` / `kernel_counters` / `kernel_latencies` / `kernel_state`. Five real provider transports (OpenAI, OpenAI-compatible, Ollama, Anthropic, Gemini) plus the labelled Echo demo assistant, which is refused outright in the production environment. Validated: fresh install 43/43 cPanel acceptance + 81/81 parity, install upgraded with `application/migrations/002_kernel_module.sql` 43/43 + 81/81, and 84/84 in development mode where the demo branches are reachable. Two intentional divergences from Node, both fixes: the `...24h` counters are a true rolling 24h window (Node's Redis `INCR` keys had no expiry and reported lifetime totals), and Ollama counts as configured only when the operator sets `VP_OLLAMA_BASE_URL` or `VP_OLLAMA_MODEL` (Node's default localhost URL made every install look configured) |
| Remaining modules | No | Partial | 501 fallback | No | Not ported |

“Runtime validation pending” is retained for every row above except **AI Kernel**,
which has now been executed against a real PHP 8.2.32 interpreter and a real
MySQL 5.7.29 server (see the parity spec `tests/php-api/kernel.spec.mjs`). The
remaining rows still await the same treatment, and no row should be read as
certified production parity until its own endpoints have been exercised.
