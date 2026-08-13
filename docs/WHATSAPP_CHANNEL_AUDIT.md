# WhatsApp Channel — Pre-Implementation Audit (Phase 1, Step 1)

Performed before any code was written, per the Phase 1 requirement. Every claim
below was verified by reading the code, not inferred from documentation.

## Existing systems found, and the decision for each

| Capability | Existing implementation | Decision |
|---|---|---|
| AI reasoning / completion | `src/services/ai/registry.ts` → `aiRegistry.complete()` / `guardedStream()`; providers: OpenAI, Anthropic, Gemini, Ollama, echo | **REUSE.** No new AI path. |
| God-Node Orchestrator | `src/kernel/kernel.service.ts` → `KernelService`. `coreIntegration.service.ts:23` registers it as the `god-node` link and probes it via `KernelService.dispatch(...)` | **REUSE** via `dispatch()` for event emission. |
| Conversation system | Prisma `Conversation` + `Message` models; `src/conversations/*` | **REUSE.** WhatsApp conversations link to a real `Conversation` row. |
| Agents / AI Workforce | Prisma `Agent` model (org-scoped, `systemPrompt`, `capabilities`, `modelId`); `src/agents/agents.service.ts` | **REUSE** for routing/selection. |
| Authentication / IAM | `src/http/middleware/auth.ts` (`authenticate`, `requireRole`, `requireAdmin`); JWT | **REUSE.** No new auth. |
| Org scoping | `src/http/middleware/orgScope.ts` (JWT `organizationId` + active Membership, Redis-cached) | **REUSE.** |
| Tenant isolation | 36 org-scoped tables with PostgreSQL RLS (`20260813010000_rls_tenant_isolation`), ENABLE + FORCE + policy | **EXTEND.** New WhatsApp tables must join this set. |
| Encryption at rest | `src/security/encryption.ts` — AES-256-GCM `encryptJson`/`decryptJson`/`isEncryptedBlob`/`maskSecret` | **REUSE** for the access token / app secret. |
| Inbound webhooks | `src/webhook/webhookReceiver.service.ts` (generic inbound log, HMAC verify, replay) and `src/mediaFactory/publishing/webhooks.ts` (per-platform HMAC callbacks) | **REUSE the pattern**; WhatsApp needs its own Meta-specific signature scheme (`X-Hub-Signature-256`, sha256 HMAC over the raw body). |
| Raw body for HMAC | `server.ts:198` — `express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })` already stashes exact bytes | **REUSE.** Critical: signature verification requires the unparsed bytes, and this already exists. |
| Rate limiting | `src/security/rateLimit.ts`, token-bucket, Redis Lua + memory fallback. Already has `webhookIngest` (60 burst / 2 per sec) | **REUSE.** |
| Job queue | `src/mediaGen/mediaGen.service.ts` — a real Redis-backed queue: `pending → running → completed/failed/cancelled`, ZSET index + LIST work queue + per-tenant concurrency and quota, advanced by `runWorkerTick()` | **REUSE THE PATTERN.** This is the authoritative in-repo queue idiom; the audit's "no queue service" note meant no *generic* one. |
| Usage metering | `src/usage/usage.service.ts`; `aiRegistry` already records tokens/cost per call with `channel` and `feature` tags | **REUSE** — pass `channel: "chat"`, `feature: "whatsapp"`. |
| Observability | `src/observability/{logger,metrics,tracer}.ts` | **REUSE.** |
| Notifications | `src/notifications/` | Available; not required for Phase 1. |
| Frontend design system | `apps/web/src/components/ui/*` (`Card`, `Button`, `Badge`, `Tabs`, `Input`), `@/lib/toast`, `@/store/auth` | **REUSE.** |
| Settings page | `apps/web/src/pages/settings/SettingsPage.tsx` — a `Tabs` layout | **EXTEND** with a Channels → WhatsApp surface. |

## Things deliberately NOT built

- No second AI brain — `aiRegistry` only.
- No second memory system — no WhatsApp-specific permanent memory (§9).
- No second auth system — existing JWT/IAM/RBAC only.
- No second conversation store — WhatsApp threads bind to `Conversation`.
- No second billing/usage system — existing metering tags.
- No new webhook framework — Meta-specific verification added alongside existing receivers.
- No separate database.

## Key constraint discovered: `aiRegistry` fails closed

`registry.ts:255` throws `AI_PROVIDER_CONFIGURATION_REQUIRED` when no real
provider is configured, rather than inventing a reply. This matches Phase 1 §19
exactly, so the WhatsApp pipeline propagates that failure instead of fabricating
a response. A message whose AI step fails is recorded `FAILED` with the error
code — it is never answered with placeholder text.

## Integration path (verified, not assumed)

```
WhatsApp Cloud API
  → POST /api/v1/channels/whatsapp/webhook   (public, HMAC-verified via req.rawBody)
  → signature check + idempotency (WhatsAppWebhookEvent.payloadHash)
  → enqueue (Redis, mediaGen-style)          ← webhook ACKs immediately
  → worker tick
      → resolve channel (phoneNumberId) → contact → WhatsAppConversation
      → bind to existing Conversation + persist Message (role USER)
      → KernelService.dispatch("whatsapp.message.received")   ← God-Node
      → agent selection over org Agents
      → aiRegistry.complete({ channel: "chat", feature: "whatsapp" })  ← usage metered
      → persist Message (role ASSISTANT)
      → WhatsAppMessageService.sendText → Graph API
  → delivery status webhook updates WhatsAppMessage.status
```
