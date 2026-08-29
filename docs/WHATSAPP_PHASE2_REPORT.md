# WhatsApp Phase 2 — Message Bridge & AI Orchestration

**Status:** delivered, runtime-validated, awaiting approval before Phase 3.
**Branch:** `arena/019ffbd6-win`
**Builds on:** Phase 1 (`83fa8b1`, `7069383`) — extended, never rebuilt.

Phase 1 gave WhatsApp a verified webhook, a durable queue, credential storage
and a single-turn AI reply. Phase 2 turns that into a real bridge into the AI
OS: media the system can actually read, commands routed through the existing
Workflow Engine, background jobs that keep the webhook fast, sessions,
step-up confirmation for high-risk actions, and human escalation.

No new AI brain, memory store, user system, auth stack, billing path or
orchestrator was introduced. Every capability below routes into a service that
already existed.

---

## 1. The pipeline, end to end

```
WhatsApp user
  → Meta Cloud API
  → POST /api/v1/channels/whatsapp/webhook   (envelope check → HMAC → dedupe → enqueue → 200)
  → Redis queue                              (webhook returns before any AI work)
  → whatsappWorker tick
      ├─ inbound drain
      ├─ WhatsAppJobService.runTick()        (background jobs)
      └─ expireStaleSessions()               (throttled to 5 min)
  → whatsappPipeline
      ├─ identity resolution   (WhatsAppContact → linkedWindelsUserId → Membership)
      ├─ session load          (WhatsAppSession, sliding expiry, pendingAction)
      ├─ media ingest          (real extraction — §3)
      ├─ command parse         (§4)
      │     ├─ inline  → execute now, reply
      │     └─ async   → WhatsAppJob + ACK, worker finishes later
      ├─ context build         (this conversation only)
      ├─ aiRegistry.complete   (usage-tagged; vision parts when images present)
      └─ send + persist
  → auto-escalation if the answer signals it could not help
```

The webhook never performs AI work, media download, or extraction. It
validates, records, enqueues and returns.

## 2. Identity & authorization

- Phone → `WhatsAppContact` → `linkedWindelsUserId` → org `Membership`.
- **A phone-number match alone is never authorization.** Linking requires the
  Phase 1 secure code flow (sha256, Redis, 600 s TTL).
- Unlinked senders get a general assistant with an explicit privacy line and
  **no** access to org data, commands, or job execution.
- Command execution additionally consults `permissionsModule.hasPermission`.
  `ALL_PERMISSIONS` only defines 17 entries, so commands map onto
  `WORKFLOW_RUN`, `WORKFLOW_WRITE`, `AGENT_READ`, `BILLING_READ`; anything
  outside that set falls back to the linked-account check rather than
  inventing a permission string.

## 3. Media — real extraction only

| Type | Path | Backend |
|---|---|---|
| Documents (PDF) | `extractDocumentText` | `pdf-parse@2.4.5` |
| DOCX | `extractDocumentText` | `mammoth@1.12.1` |
| XLSX / CSV | `extractDocumentText` | `exceljs@4.4.0` / native |
| TXT | `extractDocumentText` | native UTF-8 |
| Audio / voice | `transcribeAudio` | the configured provider's real `/audio/transcriptions` |
| Images | vision parts on the AI request | real vision-capable model via `aiRegistry` |

**Deliberately not used:** `services/speechRecognition.service.ts`,
`services/imageRecognition.service.ts`,
`services/ocrDocumentIntelligence.service.ts`. All three are seeded-RNG
simulators — `processTranscriptionJob()` builds its "transcript" from
`generateSentences(wordCount)` and never opens the audio. Feeding a fabricated
transcript into the AI OS would make WINDELS answer a question the user never
asked. They are left in place untouched (other modules may reference them) and
documented in `docs/WHATSAPP_PHASE2_AUDIT.md`.

When a capability is unconfigured the user is told so explicitly
(`*_CONFIGURATION_REQUIRED`). Nothing is invented.

**Vision contract:** images travel as base64 (`ChatImage {mimeType,
dataBase64}`), not URLs — Meta media links are short-lived *and* bearer-authed,
so a URL would be useless to the provider. An image turn is sent with
`model: ""` + `requiredCapabilities: ["vision"]` so the router picks a
vision-capable model; pinning the agent's text model would silently drop the
picture.

## 4. Commands, jobs and long-running work

`parseCommand` recognises task / workflow / report / advertisement / social
post / music track / music video creation, file analysis, and sales /
campaign / agent / pending-task queries.

- **Inline** (e.g. `create task …`) — a single insert; answered in the turn.
- **Async** (report, ad, music, workflow) — `WhatsAppJobService.createAndAck`
  writes a `WhatsAppJob`, sends "⏳ Working on it — I'll message you…", stores
  `ackMessageId`, and returns. The worker executes it later and delivers the
  result over WhatsApp. `MAX_JOB_ATTEMPTS=3`, `MAX_JOBS_PER_TICK=5`,
  `RUNNING_TIMEOUT_MS=10 min` reclaims jobs orphaned by a crash. A failed ACK
  never cancels the queued work.

Execution goes through `workflow.service`, `task.service`, `mediaGen`,
`advertising`, `musicGen`, `musicVideo` — the existing engines. The gateway
decides nothing on its own.

**High-risk handling.** Financial movement, trading execution, account/security
changes, sensitive PII and org-admin actions require an explicit step-up
confirmation. An intent that *looks* high-risk but matches no known command is
downgraded to a help stub and answered with
"⚠️ … *Nothing has been executed.*" plus an audit record
(`channel.command_denied`, `reason: "unmatched_high_risk_intent"`), so the model
can never improvise its way into a dangerous action.

## 5. Sessions & memory

`WhatsAppSession` carries `sessionKey`, `expiresAt`, `turnCount`,
`linkedUserId` and a `pendingAction`/`pendingExpiresAt` pair for step-up flows.
Expiry is swept by the existing worker tick — no second scheduler.

Conversation history is read from the existing conversation system and scoped
to **this** conversation; there is no cross-conversation memory bleed. Messages
are not auto-promoted to permanent memory: `memoryWriteEnabled` defaults off.

## 6. Human handoff (§12)

Escalation reuses the Customer Support Center (`HelpdeskService.createTicket`).
It fires on explicit user request, on policy block, on high-risk denial, and
automatically when `humanEscalationEnabled` is on and `looksUnresolved(answer)`
matches the AI's own admission of failure. The ticket id/number, escalation
time and reason are stored on `WhatsAppConversation.metadata`, so the human
agent opens the ticket with full context. Owners/admins are notified through
`notificationsService.createAndSend`.

## 7. Database

Three new models, one new column, applied by
`20260813120000_whatsapp_phase2_bridge` (idempotent, ledgered):

- `WhatsAppMedia` — unique `(conversationId, mediaId)`; `mediaKind`,
  `extractionStatus`, `extractedText`, `transcript`, `analysis`, `checksum`,
  `errorCode`, `errorMessage`, `processedAt`.
- `WhatsAppJob` — `kind`, `WhatsAppJobStatus`, `workflowId`/`workflowRunId`,
  `ackMessageId`, `attempts`, `requestText`, `resultText`, `params`; indexed on
  `(organizationId,status)`, `(conversationId,createdAt)`, `(status,createdAt)`.
- `WhatsAppSession` — unique `sessionKey`; `pendingAction`,
  `pendingExpiresAt`, `expiresAt`, `turnCount`, `linkedUserId`.
- `WhatsAppConversation.metadata Json @default("{}")`.

All three carry `organizationId`, FKs, audit timestamps and the house RLS
policy (ENABLE + FORCE + `tenant_isolation_*`). `WhatsAppDeliveryEvent` was
considered and **not** added — Phase 1 already records delivery state on
`WhatsAppMessage`, and a second table would duplicate it.

## 8. API surface (§15 complete)

Public: `GET|POST /api/v1/channels/whatsapp/webhook`.
Authenticated (mutations `requireAdmin`):

`GET /` · **`GET /status`** · **`GET /messages`** · **`GET /jobs`** ·
**`POST /test`** · `GET|POST /channels` · `PATCH /channels/:id` ·
`PATCH /channels/:id/settings` · `POST /channels/:id/reconnect|disconnect` ·
`POST /send` · `GET /conversations` · `POST /link/start|confirm` ·
`DELETE /link/:contactId`

`GET /messages` is cursor-paginated and **withholds message bodies from
non-admins** (masked phone numbers too) — WhatsApp content is personal data.
`POST /test` hits the real Graph API via the existing
`WhatsAppClient.checkConnection` and optionally sends a real message.

## 9. Frontend (§16)

`WhatsAppOperationsPanel.tsx` is mounted inside the existing Phase 1 panel
(Settings → Channels → WhatsApp), using the existing design system
(`Card`, `Tabs`, `Badge`, `Button`, `Input`, `Select`, `Skeleton`):

- live pipeline health — queue, dead letter, pending/running jobs, sessions;
- **Conversations** — searchable, linked/unverified and escalated badges;
- **Message log** — direction/status filters, error codes, admin-gated bodies;
- **Jobs** — status filter, attempts, workflow run id, result/error;
- **Test** — admin-only real connectivity check.

Empty states say "none yet". No sample traffic is ever rendered.

## 10. Billing & usage (§10)

Every AI call passes usage tags as the second argument to
`aiRegistry.complete(req, { channel: "chat", feature: "whatsapp",
organizationId, userId, agentId, conversationId })`, landing in `prisma.aiRequest`
and surfacing through `UsageService.dashboard()`. Media processing, job
execution and workflow runs bill through the services that own them. There is
no separate WhatsApp billing path.

## 11. Validation performed

| Check | Result |
|---|---|
| API typecheck | **0 errors** |
| Web typecheck | **0 errors** |
| `turbo build` (4 tasks) | **all successful** |
| Full API test suite | **2712 passed / 51 skipped / 0 failed** (Phase 1 baseline: 2647) |
| WhatsApp module | **235 passed** across 10 files |
| Migration validator | 73/73 models · 44/44 RLS enabled · 44/44 FORCE · 44/44 policies · all migrations idempotent |
| Anti-mock grep | no `Math.random`, no TODO/FIXME, no mock/stub/placeholder in module source |
| Live boot | **2177 routes**, whatsapp worker started |

Runtime probes against the booted server:

| Probe | Expected | Actual |
|---|---|---|
| `GET /webhook` wrong verify token | 403 | **403** |
| `POST /webhook` unsigned | 200 (ACK, never 5xx) | **200** |
| `POST /webhook` malformed envelope | 400 | **400** |
| `GET /status` unauthenticated | 401 | **401** |
| `GET /messages` unauthenticated | 401 | **401** |
| `GET /jobs` unauthenticated | 401 | **401** |
| `POST /test` unauthenticated | 401 | **401** |

Two defects were found and fixed by the new tests rather than worked around:

1. `looksUnresolved(null)` threw on a failed generation — it would have opened
   a support ticket for every provider hiccup. Now guarded.
2. Two parser gaps: money movement phrased without a digit ("wire the entire
   treasury balance") and a too-narrow destructive-delete object list. Both
   would have let a high-risk intent through as an ordinary message.

A shared test-harness limitation was also fixed at the source: `FakePrisma`
resolved relations under `include` but not `select`, so any service using
`select: { contact: { select: … } }` saw `undefined`. Nested `select` relations
now resolve, and the WhatsApp models' relation targets are mapped. The full
suite confirms no regression.

## 12. External blockers — what is required in production

Nothing here is a code gap; each needs a credential or a public host.

| Blocker | Needed for | Set |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | any real send/receive | `.env.example` |
| Publicly reachable HTTPS `WHATSAPP_WEBHOOK_URL` | Meta callback registration | `.env.example` |
| `OPENAI_API_KEY` *or* `OPENAI_COMPAT_BASE_URL` + `OPENAI_COMPAT_API_KEY` | voice-note transcription | added this phase |
| A vision-capable provider key | image understanding | existing provider keys |
| A real Redis instance | durable queue (sandbox falls back to MockRedis) | `REDIS_URL` |
| A `NOSUPERUSER` `DATABASE_URL` role | RLS enforcement — Postgres exempts superusers unconditionally | pre-existing platform issue, flagged at boot |

**The §17 end-to-end test against a live WhatsApp Business account cannot be
run from this sandbox** — it needs real Meta credentials and a public HTTPS
callback, neither of which exists here. Everything up to the network boundary
is tested; `POST /test` exists to perform that final verification in the target
environment in one call.

---

## Certification

Backend, database, API, auth, permissions, security, orchestration, billing
integration, frontend, tests and runtime validation were each exercised and
pass. The module contains no mock messages, fake webhook responses, simulated
delivery, hardcoded users, fake AI responses or demo conversations.

**Not claimed:** live delivery through a real WhatsApp Business account, and
RLS enforcement on this sandbox's superuser connection. Both are credential /
environment blockers documented above, not implementation gaps.

Stopping here for approval before any further WhatsApp phase.
