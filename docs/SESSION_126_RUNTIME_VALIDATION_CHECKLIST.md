# Session 126 Runtime Validation Checklist — Real-Time SSE Channel (Events) & Inbound Webhook Receiver Completion

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 126 stays 🟡 VERIFIED (partial).

The unit suites prove event ring buffer replay, fail-closed organization scoping, timing-safe HMAC signature verification, inbox persistence, and replay dispatch against FakePrisma and FakeKv; only a live deployment proves the `evt:hist` and `whk:inbox` keyspaces, Redis sorted set trimming, and live SSE connection sockets behave as this module assumes.

---

## 1. Backwards Compatibility & Route Mounting

- [ ] `GET /api/v1/events/stream` opens a valid `text/event-stream` connection, emits keep-alive pings, and delivers broadcast events to clients in the matching organization.
- [ ] `GET /api/v1/events/health` returns `200 OK` with connected client counts and subscribed event types.
- [ ] `POST /api/v1/webhook/billing/webhook` accepts valid secret headers, returns `200 OK` with `{ ok: true, data: { idempotent: false, applied: true } }`, and logs the payload to the inbound inbox without breaking legacy callers.

---

## 2. Event Channel & Ring Buffer (`events`)

- [ ] A client connecting to `GET /api/v1/events/stream` with a `Last-Event-ID` header receives all missed events stored in `evt:hist:idx:<org>` that occurred after that ID.
- [ ] Events emitted without an explicit `organizationId` or `orgId` are not delivered to org-scoped clients unless designated as system broadcasts.
- [ ] A client authenticated without an organization (`organizationId = null`) cannot receive org-scoped events from any tenant.
- [ ] `GET /api/v1/events/history?limit=50` returns ≤ 50 recent events for the caller's organization; `?limit=1000` is rejected with `400 Bad Request`.
- [ ] `GET /api/v1/events/clients` lists only active SSE sessions belonging to the caller's organization.
- [ ] `DELETE /api/v1/events/clients/:id` terminates the target client's underlying HTTP response stream and removes it from the active connection registry.
- [ ] `POST /api/v1/events/publish` validates payload schema, stores the event in the ring buffer, and broadcasts it to connected SSE clients in the organization.

---

## 3. Inbound Webhook Receiver & Inbox (`webhook`)

- [ ] `POST /api/v1/webhook/inbound/:source` verifies HMAC signatures (`X-Hub-Signature-256`, `Stripe-Signature`, or secret headers) in constant time (`crypto.timingSafeEqual`).
- [ ] Requests with missing or invalid webhook signatures are rejected with `401 Unauthorized` without falling back to `JWT_SECRET`.
- [ ] Valid inbound webhooks are stored in `whk:inbox:idx:<org>` and `whk:inbox:i:<org>:<id>`, capped at 500 entries per organization.
- [ ] `GET /api/v1/webhook/inbound` returns paginated inbox entries for the caller's organization, sorted by newest first.
- [ ] `GET /api/v1/webhook/inbound/:id` returns full JSON payload and verification metadata for an organization inbox entry; attempting to read another organization's inbox ID returns `404 Not Found`.
- [ ] `POST /api/v1/webhook/inbound/:id/replay` re-dispatches the stored event to `EventBus`, updates the entry status to `"replayed"`, and logs the replay action.
- [ ] `DELETE /api/v1/webhook/inbound/:id` permanently removes the inbox entry from Redis (admin correction path).

---

## 4. UI & Console Verification

- [ ] `/app/events` renders real-time stream status, connected clients table, event history table, and custom event publication form without console errors.
- [ ] `/app/webhook` renders the inbound webhook inbox table, payload inspector modal, and replay action control without console errors.
- [ ] Both pages handle empty states cleanly ("No recent events recorded", "Inbox is empty") without fabricating metrics or `0` counts.

---

## 5. Tenant Isolation & Audit

- [ ] Run `make verify` and verify all tests pass, including the new unit suites (`events.test.ts` and `webhookReceiver.test.ts`).
- [ ] Verify S89 tenant isolation sweep confirms `evt:hist` and `whk:inbox` namespaces are `org_scoped` and conforming without org-segment index shifts.
- [ ] Verify `node audit/build-inventory.mjs` classifies both `events` and `webhook` as **COMPLETE** and reports **107 COMPLETE / 0 PARTIAL / 0 STUB-by-design / 1 DEMO DATA**.
