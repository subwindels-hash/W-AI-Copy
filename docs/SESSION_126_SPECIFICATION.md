# Session 126 — Real-Time SSE Channel (Events) & Inbound Webhook Receiver Completion

**Modules:** `events` (STUB → COMPLETE) · `webhook` (STUB → COMPLETE)
**Mounts:** `/api/v1/events` · `/api/v1/webhook`
**Status before:** 2 STUB-by-design (`events` routes = 2, svc = 45 LOC; `webhook` routes = 1, svc = 0 LOC)
**Status after:** COMPLETE (`events` routes = 6, shared contract = 185 LOC, tests = unit suite + e2e; `webhook` routes = 6, shared contract = 210 LOC, tests = unit suite + e2e)
**Date:** 2026-08-06 · **Branch:** `arena/019fd78f-win`

---

## 1. What already existed, and is untouched

The original endpoints in `events` and `webhook` keep their exact existing paths, query parameters, request headers, status codes, and response shapes:

| Endpoint | Access | Status |
| --- | --- | --- |
| `GET /api/v1/events/stream` | any authenticated member | 200 SSE stream |
| `GET /api/v1/events/health` | any authenticated member | 200 OK (`{ ok: true, data: { connectedClients, ... } }`) |
| `POST /api/v1/webhook/billing/webhook` | webhook secret header | 200 OK (`{ ok: true, data: { idempotent: false, applied: true }, meta: ... }`) |

**Nothing was removed or rewritten away.** Existing SSE connections continue to receive broadcasts from `EventBus`, and billing webhooks continue to satisfy existing caller contracts.

---

## 2. What was wrong (defects found and resolved)

| Module | Defect before Session 126 | Consequence before Session 126 | Resolution in Session 126 |
| --- | --- | --- | --- |
| `events` | **No event history buffer or `Last-Event-ID` replay.** | Clients reconnecting after brief network interruptions lost all events emitted during the disconnect. `Last-Event-ID` header was read but ignored. | Implemented an org-scoped ring buffer (`evt:hist:idx:<org>` + `evt:hist:i:<org>:<id>`, capped at 200 events). On connect with `Last-Event-ID` or `?since=`, missed events are replayed automatically. |
| `events` | **Fail-open organization scoping edge cases.** | Events without explicit `organizationId`/`orgId` or clients without an organization could leak cross-tenant events. | Enforced strict fail-closed org matching: org-scoped events are delivered only to clients with a matching non-null `organizationId`. |
| `events` | **No stream management or observability endpoints.** | No way for organization admins to query recent event history, inspect connected stream sessions, test-publish custom events, or disconnect stale clients. | Added 4 additive endpoints: `GET /events/history`, `GET /events/clients`, `POST /events/publish`, and `DELETE /events/clients/:id`. |
| `events` | **No shared contract or console UI.** | No typed schemas in `@windels/shared`, and no console dashboard to monitor SSE streams. | Created `packages/shared/src/events.ts` and `/app/events` console page. |
| `webhook` | **Timing-unsafe secret verification & fallback to `JWT_SECRET`.** | `checkWebhookSecret` used string equality (`===`) and fell back to `JWT_SECRET` when `WEBHOOK_SECRET` was unset, creating timing vulnerabilities and secret confusion. | Replaced with timing-safe HMAC/secret verification (`crypto.timingSafeEqual`) without fallback to `JWT_SECRET`. |
| `webhook` | **Discarded inbound payloads and no EventBus dispatch.** | `/billing/webhook` acknowledged receipts but never logged payloads to any inbox or emitted events to the system `EventBus`. | Every inbound webhook is recorded in an org-scoped inbox (`whk:inbox:idx:<org>` + `whk:inbox:i:<org>:<id>`) and emitted via `EventBus` (`webhook.inbound_received`). |
| `webhook` | **No general inbound webhook receiver or inbox management.** | Only billing was supported; no endpoints existed to receive from GitHub, Stripe, ETL, or custom providers, or to inspect/replay/delete inbox records. | Added 5 additive endpoints: `POST /webhook/inbound/:source`, `GET /webhook/inbound`, `GET /webhook/inbound/:id`, `POST /webhook/inbound/:id/replay`, `DELETE /webhook/inbound/:id`. |
| `webhook` | **No shared contract or console UI.** | Inbound webhook schemas and inbox models were undocumented in types and UI. | Created `packages/shared/src/webhook.ts` and `/app/webhook` console page. |

---

## 3. What Session 126 adds

### 3.1 Shared Contracts — `packages/shared/src/events.ts` & `packages/shared/src/webhook.ts`

- **`packages/shared/src/events.ts`**:
  - `SSEEventPayload`: Typed structure for broadcast events (`id`, `event`, `data`, `timestamp`, `organizationId`).
  - `SSEClientInfo`: Metadata for connected stream sessions (`id`, `userId`, `organizationId`, `lastEventId`, `subscribedAt`).
  - `EventHistoryQuerySchema`: Zod schema validating query parameters (`limit` 1..200, `since`, `eventType`).
  - `PublishEventSchema`: Zod schema for publishing events to the organization stream.
  - `EventsHealthResponse`: Extended health probe payload.
- **`packages/shared/src/webhook.ts`**:
  - `InboundWebhookSource`: `"billing" | "github" | "stripe" | "etl" | "custom"`.
  - `InboundWebhookStatus`: `"received" | "processed" | "failed" | "replayed"`.
  - `InboundWebhookEntry`: Shape of an inbox record (`id`, `source`, `event`, `payload`, `signatureVerified`, `status`, `receivedAt`, `organizationId`).
  - `InboundWebhookQuerySchema`: Zod schema for listing inbox entries (`source`, `status`, `limit` 1..100).
  - `ReplayWebhookResponse`: Result of re-dispatching an inbound webhook to `EventBus`.

---

### 3.2 Services & Route Extensions

#### `events` (`apps/api/src/services/eventHistory.service.ts` & `apps/api/src/http/routes/events.ts`)
- **Event History Ring Buffer**: Every event emitted to `EventBus` that targets an organization is persisted to `evt:hist:idx:<org>` (sorted set by timestamp/id) and `evt:hist:i:<org>:<id>` (hash), capped at 200 records per organization.
- **Replay**: When a client connects to `GET /stream` with `Last-Event-ID` or `?since=`, `replayHistory` streams stored events newer than the marker.
- **New Endpoints**:
  - `GET /api/v1/events/history`: Returns recent event history for the caller's organization.
  - `GET /api/v1/events/clients`: Returns active SSE connection metadata for the caller's organization.
  - `POST /api/v1/events/publish`: Validates and publishes a custom event to the organization's SSE stream and ring buffer.
  - `DELETE /api/v1/events/clients/:id`: Disconnects a specific active SSE client session for the caller's organization.

#### `webhook` (`apps/api/src/services/webhookReceiver.service.ts` & `apps/api/src/http/routes/webhook.ts`)
- **Inbound Webhook Inbox**: Incoming webhook payloads are stored in `whk:inbox:idx:<org>` (sorted set) and `whk:inbox:i:<org>:<id>` (hash), capped at 500 records per organization.
- **Timing-Safe Verification**: Verifies HMAC signatures (`X-Hub-Signature-256`, `Stripe-Signature`, `X-Windels-Webhook-Secret`) in constant time without fallback to `JWT_SECRET`.
- **New Endpoints**:
  - `POST /api/v1/webhook/inbound/:source`: Receives and verifies webhooks from `"github"`, `"stripe"`, `"etl"`, or `"custom"`, storing them in the inbox and emitting `webhook.inbound_received` to `EventBus`.
  - `GET /api/v1/webhook/inbound`: Lists inbox entries for the caller's organization.
  - `GET /api/v1/webhook/inbound/:id`: Retrieves full payload details for a specific inbox entry.
  - `POST /api/v1/webhook/inbound/:id/replay`: Re-emits an inbox entry to `EventBus` and marks its status as `"replayed"`.
  - `DELETE /api/v1/webhook/inbound/:id`: Admin correction path to delete an inbox entry.

---

### 3.3 Tenant Isolation Namespaces (`TI_NAMESPACE_CATALOG`)

In accordance with the Session 89 / Session 118–120 namespace gotcha rules, two new two-segment prefixes are catalogued as `org_scoped`:

- `{ prefix: "evt:hist", scope: "org_scoped" }`: Key shape `evt:hist:idx:<org>` / `evt:hist:i:<org>:<id>`.
- `{ prefix: "whk:inbox", scope: "org_scoped" }`: Key shape `whk:inbox:idx:<org>` / `whk:inbox:i:<org>:<id>`.

Bare short prefixes (`evt`, `whk`) are deliberately never added to prevent shifting the org segment index.

---

## 4. UI — Typed Web Clients & Console Pages

- **Web clients**:
  - `apps/web/src/lib/events.ts`: Expanded with `getEventHistory`, `getSSEClients`, `publishEvent`, `disconnectSSEClient`, and SSE helper hook.
  - `apps/web/src/lib/webhook.ts`: Created with `listInboundWebhooks`, `getInboundWebhook`, `replayInboundWebhook`, `deleteInboundWebhook`.
- **Console pages**:
  - `/app/events` (`apps/web/src/pages/EventsPage.tsx`): Real-time SSE stream status, live event monitor, organization event history table, active clients table, and custom event publisher.
  - `/app/webhook` (`apps/web/src/pages/WebhookInboxPage.tsx`): Inbound webhook inbox table, payload inspector modal, replay action button, endpoint integration documentation, and delete control.
- **Navigation**: Registered in `apps/web/src/router.tsx` and added to `apps/web/src/components/Sidebar.tsx` under Developer / Platform tools.

---

## 5. Verification & Audit

- **Unit tests**:
  - `apps/api/src/events/events.test.ts`: Covers SSE stream history replay, fail-closed org scoping, ring buffer pruning, client listing, disconnect revocation, and custom event publishing.
  - `apps/api/src/webhook/webhookReceiver.test.ts`: Covers timing-safe signature verification, billing webhook inbox logging, inbound multi-source receiver, inbox pagination, replay dispatch, and delete correction path.
- **End-to-End tests**:
  - `tests/e2e/events-webhook.spec.ts`: Validates full HTTP lifecycle for `/api/v1/events/*` and `/api/v1/webhook/*` endpoints.
- **Inventory totals**:
  - Both `events` and `webhook` advance from **STUB** to **COMPLETE** (`routeCount >= 5`, shared contract, web client, unit tests, no synthetic data).
  - The repository module inventory becomes **107 COMPLETE / 0 PARTIAL / 0 STUB-by-design / 1 DEMO DATA** across 108 modules.
