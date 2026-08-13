# AI Commerce — Stage 1 Audit (§1)

Inspection of the existing WINDELS AI OS before writing any AI Commerce code.
Verdict per subsystem: **REUSE / COMPLETE / REPAIR / BUILD / CONSOLIDATE**.

## 1. Implementation map

| Subsystem | Where it lives | State | Verdict |
|---|---|---|---|
| AI Workforce / AI Employees | `agents/agents.service.ts` (+ `aiEcosystem`, `autonomous`) | working; agents are DB rows with events | **REUSE** |
| AI Agent architecture | `agents/agents.service.ts`, `services/agentSkills.service.ts` | working | **REUSE** |
| God-Node Orchestrator | `kernel/kernel.service.ts` (`dispatch`, `evaluatePolicy`, `selectModel`, `grantResources`) | working | **REUSE** |
| Agent Communication | `http/routes/agentComm.ts`, `services/eventBus.ts` | working | **REUSE** |
| Workflow Engine | `services/workflow.service.ts` (`runWorkflow`, `createWorkflow`) | working | **REUSE** |
| Command Center | `command/`, `http/routes/command.ts` | working | **REUSE** |
| Tool system | `services/tools/toolRegistry.ts` (+ `builtin/`) | real registry: JSON-schema params, `ToolContext`, `adminOnly`, `hasSideEffects`, timeouts, OpenAI/Anthropic conversion | **REUSE — this is the §4 host** |
| Voice (STT/TTS/wake word) | `voice/voice.module.ts`, `voiceFoundry`, `wakeIntel`; real STT added in WhatsApp Phase 2 (`channels/whatsapp/whatsappMediaExtract.ts:transcribeAudio`) | TTS real; STT real via provider endpoint | **REUSE** |
| Vision / image processing | `services/ai/*.provider.ts` vision plumbing (`ChatImage`, `requiredCapabilities:["vision"]`) added in WhatsApp Phase 2 | working | **REUSE** |
| Customer Care / Helpdesk | `helpdesk/helpdesk.service.ts` (`createTicket`) | working | **REUSE** |
| CRM | `crm/` | working | REUSE (not needed Stage 1) |
| Authentication | `http/middleware/auth.ts` | working | **REUSE** |
| RBAC / ABAC | `permissions/permissions.module.ts` (`hasPermission`), `security/` | working | **REUSE** |
| Tenant isolation | `http/middleware/orgScope.ts`, RLS policies, `tenantIsolation/` | working | **REUSE** |
| API Gateway | `http/server.ts` (`/api/v1`, `validate`, `rateLimit`) | working | **REUSE** |
| Event system | `services/eventBus.ts` (in-process) + `events/events.service.ts` (persisted SSE) | working | **REUSE** |
| Notifications | `notifications/notifications.service.ts` (`createAndSend`) | working | **REUSE** |
| Analytics / BI | `businessIntelligence/`, `usage/usage.service.ts`, `events/events.service.ts` | working | **REUSE** |
| Audit logs | `audit/audit.service.ts` (typed `AuditAction` union) | working | **REUSE — extend the union** |
| Admin controls | `http/routes/admin.ts`, `adminApiControl.ts` | working | **REUSE** |
| Security infra | `security/{encryption,rateLimit}.ts` | working | **REUSE** |
| Secrets management | `config/env.ts` + encryption-at-rest pattern from WhatsApp channel | working | **REUSE** |
| Webhook security | `webhook/webhookReceiver.service.ts` — real `timingSafeEqual`, HMAC, inbox, replay | working | **REUSE — this is the §19 host** |
| Feature flags | `platformServices/featureFlags.service.ts` (`evaluate(key, ctx)`, targeting, rollout) | working | **REUSE — this is the §29 host** |
| Gift cards | `giftCards/giftCards.service.ts` — WMPC-branded, `issue/redeem/applyToInvoice` | working, **local** WINDELS gift cards | **REUSE, do not confuse with WMPC gift cards** |
| Payments | `payments/` — Stripe, Paystack, Flutterwave, PayPal, crypto | working WINDELS billing rails | **REUSE for WINDELS billing; NOT for WMPC commerce payment** |
| Existing WMPC integration | none | `wmpc` appears only as a `geoBilling` payment-method *string* | **BUILD (connector) — nothing to consolidate** |

## 2. The one real conflict: `commerce/commerce.service.ts`

A B2C commerce module already exists (`apps/api/src/commerce/commerce.service.ts`,
routed at `/api/v1/commerce`). It stores a **cart and orders in Redis**, keyed
`commerce:cart:{org}:{user}` / `commerce:order:i:{org}:{id}`.

Two facts decide how to treat it:

1. **Its catalog is empty by construction.** `getProducts()` builds
   `const products = [] `, caches it, and returns `{products: [], total: 0}`.
   `getProduct()` only ever returns a cache hit or `null`. Nothing writes to
   those caches, so the catalog is permanently empty.
2. **It prices carts with a placeholder.** `PLACEHOLDER_UNIT_PRICE = 100` is
   used whenever a product is not in the (always empty) catalog, so every
   subtotal it computes is fictional.

This is exactly the "second cart / second order system" §2 forbids AI Commerce
from creating — and it already exists.

**Decision: LEAVE IT IN PLACE, DO NOT ROUTE AI COMMERCE THROUGH IT.**

Per the standing non-destructive rule, a working (if hollow) module with live
routes is not deleted or rewritten during this stage. AI Commerce treats WMPC
as authoritative and never reads or writes `commerce:*` Redis keys. The two
coexist; a **REPLACEMENT PROPOSED** note is filed below for the user to decide
in Stage 2.

> **Replacement proposal (needs user approval, not actioned):** once WMPC is
> live, `/api/v1/commerce` should either be retired or reimplemented as a thin
> pass-through to the WMPC connector, so the platform has exactly one
> authoritative cart. Doing that now would break existing routes and exceeds
> Stage 1 scope.

## 3. What Stage 1 must BUILD

Nothing above covers the WMPC bridge, so these are genuinely missing:

- Commerce intent engine (§3) — natural language → structured intent.
- Commerce tools (§4) — 17 tools registered in the **existing** `ToolRegistry`.
- WMPC Commerce Connector (§5) + interface (§6) + typed contracts (§7).
- Commerce session context (§8) — orchestration state only, never authoritative.
- Discovery / recommendation / comparison reasoning (§9–§11).
- Image + voice commerce adapters (§12–§13) over existing vision/voice.
- Cart / checkout / payment / order orchestration (§14–§17) — all delegating.
- WMPC event consumer (§18) + webhook security (§19) over the existing receiver.
- Idempotency (§20) and standardized commerce errors (§21).
- AI permission guard (§23) — ownership + capability checks before any action.
- Mock WMPC adapter (§32) behind the same interface as the future real one.

## 4. Standing constraints honoured

- No second product catalog, cart, checkout, payment engine, ledger, wallet,
  order system or settlement system inside WINDELS.
- No second agent platform, orchestrator, voice platform, vision platform,
  analytics platform, admin dashboard, auth system or networking layer.
- WMPC is not modified, and no WMPC-side code is written in Stage 1.
