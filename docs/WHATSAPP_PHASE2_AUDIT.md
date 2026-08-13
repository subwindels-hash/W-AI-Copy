# WhatsApp Phase 2 — Pre-Implementation Audit

**Date:** 2026-08-13
**Branch:** `arena/019ffbd6-win`
**Baseline:** Phase 1 commits `83fa8b1` (implementation) + `7069383` (stop report)
**Rule applied:** EXTEND BEFORE REPLACING · REUSE BEFORE DUPLICATING · VERIFY BEFORE MODIFYING

Phase 2 is "Message Bridge & AI Orchestration". This document is the mandatory
Step-1 audit: what already exists, what is genuinely missing, and — critically —
which existing WINDELS services **cannot** be reused because they are simulators
rather than real implementations.

---

## 1. What Phase 1 already delivered (verified present, DO NOT rebuild)

`apps/api/src/channels/whatsapp/` — 22 files, 5 438 LOC of module code plus test
harnesses. Verified intact at audit time.

| Concern | File | Status |
|---|---|---|
| Meta Graph client, HMAC verification | `whatsappClient.ts` | COMPLETE |
| Envelope parsing / idempotency hashing | `whatsappPayload.ts` | COMPLETE |
| Channel CRUD, encrypted credentials | `whatsappChannel.service.ts` | COMPLETE |
| Contact identity + secure link/unlink | `whatsappIdentity.service.ts` | COMPLETE |
| Outbound send + delivery status ranking | `whatsappMessage.service.ts` | COMPLETE |
| Redis queue + DLQ + worker | `whatsappQueue.ts`, `whatsappWorker.ts` | COMPLETE |
| Webhook routes (GET verify / POST ingest) | `whatsappWebhook.routes.ts` | COMPLETE |
| Admin/authenticated routes | `whatsapp.routes.ts` | COMPLETE |
| Keyword domain classifier + agent select | `whatsappAgentRouter.ts` | COMPLETE |
| Kernel (God-Node) bridge | `whatsappKernel.ts` | COMPLETE |
| Multi-dimension rate limiting | `whatsappRateLimit.ts` | COMPLETE |
| Inbound pipeline | `whatsappPipeline.ts` | **PARTIAL — this is Phase 2's target** |

Database: `WhatsAppChannel`, `WhatsAppContact`, `WhatsAppConversation`,
`WhatsAppMessage`, `WhatsAppWebhookEvent` + 8 enums, migration
`20260813020000_whatsapp_channel` applied and ledgered.

---

## 2. Gap list derived from reading `whatsappPipeline.ts` line by line

| # | Gap | Evidence | Phase 2 requirement |
|---|---|---|---|
| G1 | **Media accepted but never processed.** `describeNonText()` substitutes literal strings — `"[the user sent an image]"`, `"[the user sent a voice note]"` — and feeds *that* to the model. | `whatsappPipeline.ts:73-84`, used at `:277` | Req 4 |
| G2 | No media bytes are ever downloaded. `WhatsAppClient.getMediaUrl()` exists but has no caller. | `whatsappClient.ts:258` | Req 4 |
| G3 | No command layer. Every message goes straight to `aiRegistry.complete()` with `maxTokens ≤ 1024`. | `:374-389` | Req 6 |
| G4 | No job/workflow creation and no long-running ACK path. The worker always answers inline. | whole `process()` | Req 7 |
| G5 | Human handoff is a dead end: `responseMode==="human"` sets `status="ESCALATED"` and returns silently. No ticket, no agent notified, no context handed over. | `:317-322` | Req 12 |
| G6 | No step-up auth. `evaluateKernelPolicy` is called once with `approved: true` hardcoded and `risk` derived only from link state. | `:337-341` | Req 9 |
| G7 | No session concept — no timeout, no session id, no per-session context window. Context = last 10 `Message` rows. | `CONTEXT_TURNS = 10` | Req 8 |
| G8 | No persistence of tool calls, workflow ids, or execution status. | schema | Req 3, 13 |
| G9 | No `/status`, `/test`, or `/messages` endpoints. | `whatsapp.routes.ts` | Req 15 |

**Deliberate Phase 1 behaviours that Phase 2 must PRESERVE, not "fix":**

- `buildContext()` injects **no** cross-conversation memory and **no** KB retrieval,
  and adds an explicit "never reveal private data" system line for unlinked senders.
  This is the privacy boundary required by Req 2. Any memory work must keep it.
- `DEFAULT_WHATSAPP_SETTINGS.memoryWriteEnabled = false` — messages are not
  auto-promoted to permanent memory.
- Unresolved-channel webhooks ACK 200 *before* HMAC, deliberately: with no
  per-channel secret there is no key to verify with, and a non-2xx lets Meta
  disable a live tenant's subscription.
- Fail-closed honesty: `AI_PROVIDER_CONFIGURATION_REQUIRED` propagates and the
  message is recorded `FAILED`. No fabricated reply is ever sent.

---

## 3. Reuse survey — what Phase 2 will build on

Verified real (Prisma- or Redis-backed, no RNG):

| Capability | Reuse target | Notes |
|---|---|---|
| Workflow engine | `services/workflow.service.ts` → `createWorkflow`, `runWorkflow`, `getRun`, `cancelRun` | Prisma `Workflow` / `WorkflowRun`, real node graph execution |
| Attachment storage | `attachments/attachments.service.ts` → `uploadAttachment` | disk + `MessageAttachment` + sha256 checksum + org scoping |
| Human handoff | `helpdesk/helpdesk.service.ts` → `HelpdeskService.createTicket`, `createComment` | real ticket store, CRM activity write-through |
| Audit logging | `audit/audit.service.ts` → `auditService.log` | Prisma `AuditLog` + Redis stream, never throws |
| RBAC | `permissions/permissions.module.ts` → `hasPermission(userId, Permission, orgId)` | wraps `services/permissions.service.ts`, Prisma-backed |
| Orchestration | `kernel/kernel.service.ts` → `dispatch`, `evaluatePolicy` | God-Node, already bridged by `whatsappKernel.ts` |
| Reasoning + metering | `services/ai/registry.ts` → `aiRegistry.complete(req, opts)` | usage tags flow to `AiRequest` → billing |
| In-app notification | `notifications/notifications.service.ts` → `createAndSend` | Prisma `Notification` + per-channel delivery queue |
| Conversation system | Prisma `Conversation` / `Message` | already bridged in Phase 1 |

---

## 4. ⚠ CRITICAL FINDING — three "services" are simulators, not implementations

This is the most consequential result of the audit and it changes the Phase 2 design.

| Service | File | What it actually does |
|---|---|---|
| Speech recognition (STT) | `services/speechRecognition.service.ts` | `processTranscriptionJob()` calls `generateSentences(wordCount)` and **fabricates a transcript from a seeded RNG**. The audio is never read. `submitTranscriptionJob` even comments `// Simulate processing`. |
| Image recognition | `services/imageRecognition.service.ts` | `// Generate simulated results based on analysis types`; labels/quality/confidence all from `_rng.next()`. |
| OCR / document intelligence | `services/ocrDocumentIntelligence.service.ts` | `// Generate simulated results`; page counts, text and confidence all RNG. |

**Consequence:** wiring WhatsApp voice notes into `speechRecognition.service.ts`
would make the AI confidently answer a question the user never asked — a
fabricated transcript is strictly worse than no transcription. The same applies
to images and documents.

Per the standing rule *"no mock/demo implementation"* and *"REPLACEMENT
PROPOSED → stop and document before replacing"*, Phase 2 therefore:

- **Does not call** these three simulators, and does not delete or rewrite them
  either (they are out of scope and used elsewhere; removing them is a separate,
  approval-gated decision — recorded here as a proposed future replacement).
- **Builds real extraction** for the WhatsApp path only:
  - **Documents** — real parsing in-process: `pdf-parse` (PDF), `mammoth` (DOCX),
    `exceljs` (XLSX), native UTF-8 for TXT/CSV/MD/JSON. Verified working offline
    in this sandbox against a generated PDF (`"WINDELS PHASE2 PDF OK"` round-tripped).
  - **Audio** — real STT via the configured provider's transcription endpoint
    (OpenAI-compatible `/audio/transcriptions`, Whisper). No key configured ⇒
    honest `WHATSAPP_STT_CONFIGURATION_REQUIRED`, never a fake transcript.
  - **Images** — real vision through `aiRegistry` with
    `requiredCapabilities: ["vision"]`. `ChatMessage` currently carries
    `content: string` only, so it is **extended** with an optional
    `imageUrls?: string[]` that the OpenAI/Anthropic/Gemini providers map to
    their native multimodal content blocks. Extension, not a parallel brain.

---

## 5. Dependency decision

`apps/api` has **no** document/media parsing libraries today (verified against
`package.json`). Phase 2 adds three, all pure-JS, all install cleanly and were
smoke-tested offline in this sandbox:

| Package | Version | Purpose | Verified |
|---|---|---|---|
| `pdf-parse` | 2.4.5 | PDF text extraction (`PDFParse#getText`) | text round-tripped from a generated PDF |
| `mammoth` | 1.12.1 | DOCX → raw text (`extractRawText`) | export present |
| `exceljs` | 4.4.0 | XLSX → sheet text (`Workbook#xlsx.load`) | export present |

No native/binary dependencies, so CI and container builds are unaffected.

---

## 6. Schema delta proposed (extend only)

Existing five models are kept unchanged except for new back-relations. Three new
models, matching the entity names the requirement names:

- `WhatsAppMedia` — one row per inbound/outbound media object: `mediaId`, mime,
  sha256, size, `storageAttachmentId` (FK to the existing `MessageAttachment`),
  `extractionStatus`, `extractedText`, `transcript`, `analysis`, error fields.
- `WhatsAppJob` — long-running work: `kind`, `status`, `workflowId`/`workflowRunId`,
  `requestText`, `resultText`, `resultMediaId`, attempts, timestamps, `ackMessageId`.
- `WhatsAppSession` — `sessionKey`, `expiresAt`, `turnCount`, `pendingAction`
  (step-up confirmation), `context` JSON.

All three are org-scoped with FKs, indexes, status + audit fields, and an
idempotency anchor. `WhatsAppDeliveryEvent` is **not** added: delivery status is
already fully modelled by `WhatsAppMessage.status` + `sentAt/deliveredAt/readAt`
plus `WhatsAppWebhookEvent`, so a fourth table would duplicate it.

---

## 7. Out-of-scope / documented blockers

- Real end-to-end traffic against Meta requires production credentials
  (`WHATSAPP_*`) that are not present in this sandbox. Code paths are real; the
  external round-trip is documented as an operator step.
- No Redis server in the sandbox (`MockRedis` only) and no Docker — session TTL
  behaviour is covered by the fake-Redis harness.
- The three simulator services above are a proposed replacement, deliberately
  **not** executed in this phase.
