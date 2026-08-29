# WINDELS AI Commerce Foundation — Stage 1 Report

**Status:** COMPLETE and validated
**Scope:** WINDELS side only. WMPC was not modified, and no WMPC code exists in this repository.
**Branch:** `arena/019ffbd6-win`

---

## 1. What already existed (audit result)

The §1 audit swept ~150 modules under `apps/api/src/`. Full verdict map:
`docs/AI_COMMERCE_STAGE1_AUDIT.md`.

Two findings shaped the entire design:

1. **There was no existing WMPC integration.** `grep -rin wmpc` matched only
   payment-method *strings* in `geoBilling.service.ts`. The WMPC bridge was
   genuinely MISSING, not partial.
2. **Every other subsystem the specification names already exists and works.**
   AI Workforce, agents, God-Node kernel, tool registry, workflow engine,
   Command Center, voice, vision, helpdesk, CRM, auth, RBAC/ABAC, tenant
   isolation, API gateway, event bus, notifications, analytics/BI/usage, audit,
   admin, security, secrets, webhook receiver and feature flags were all graded
   **REUSE**. None was rebuilt.

The only conflict was the legacy `apps/api/src/commerce/` module (a hollow B2C
catalog/cart/order service). Per the non-destructive rule it was graded
**REPLACEMENT PROPOSED**, left completely untouched, and AI Commerce was NOT
routed through it. That decision is documented in the audit for a future
consolidation task.

---

## 2. What was reused rather than rebuilt

| Requirement | Reused existing system | New code? |
|---|---|---|
| Tool hosting (§4) | `services/tools/toolRegistry.ts` | registration only |
| Agent runtime (§24-§25) | `services/agentRuntime.service.ts`, `Agent` Prisma model | persona + capability list only |
| God-Node (§26) | `kernel/kernel.service.ts` | one `dispatch` call |
| AuthN / RBAC / ABAC (§22-§23) | `permissions/permissions.module.ts`, existing IAM | zero new permissions |
| Tenant isolation (§23) | `tenantIsolation/`, org scoping | none |
| Audit (§22) | `audit/audit.service.ts` | 9 action values added to the existing union |
| Feature flags (§29-§30) | `platformServices/featureFlags.service.ts` | 9 flag seeds |
| Events (§18) | `services/eventBus.ts` | 10 event names added |
| Analytics (§28) | `events/events.service.ts` | thin typed helper |
| Notifications | `notifications/notifications.service.ts` | 7 category values |
| Vision (§12) | `services/ai/*.provider.ts` (`requiredCapabilities:["vision"]`) | grading logic only |
| Voice / STT / TTS (§13) | `voice/voice.module.ts`, existing Voice Command Center | intent bridge only |
| AI inference (§3) | `services/ai/registry.ts` with usage metering | none |
| HTTP conventions (§5) | `http/routes/*` pattern, `authenticate`, `validate` | one router |

**No second orchestrator, agent platform, voice platform, vision platform,
admin dashboard, analytics platform, auth system or networking layer was
created.**

---

## 3. What was built (the WMPC bridge, and nothing else)

23 new files under `apps/api/src/aiCommerce/`, plus shared types and one router.

### Types and errors
- `packages/shared/src/aiCommerce.ts` (622 lines) — all §7 types (Product, Cart,
  CartItem, CheckoutSession, PaymentMethod, PaymentStatus, Order, OrderItem,
  TrackingInformation, GiftCardValidation, CommerceCustomerContext,
  CommerceError), the 21 intents, the 13 error codes, the 10 event types with a
  Zod envelope schema, and the route schemas.
- `commerceErrors.ts` — the §21 error set with HTTP status mapping both ways.

### Connector (§5, §6, §36) — the frozen boundary
- `wmpc/wmpcConnector.types.ts` — the 16-operation interface. Every method takes
  `(ctx: CommerceCustomerContext, …, opts: WmpcCallOptions)`; `idempotencyKey` is
  required on all mutations (§20).
- `wmpc/httpWmpcAdapter.ts` — the real adapter, complete and ready. It speaks the
  contract in §6 and needs only credentials.
- `wmpc/mockWmpcAdapter.ts` + `mockWmpc.fixtures.ts` — the §32 dev/test adapter.
- `wmpc/connectorFactory.ts` — three-way selection:
  credentials → HTTP · `WINDELS_ALLOW_MOCK_WMPC` **and non-production** → mock ·
  otherwise → an `UnavailableWmpcAdapter` that returns `WMPC_UNAVAILABLE`.
  **Setting the mock flag in production is logged as an error and refused.**

### Intelligence
- `commerceIntent.service.ts` (§3) — rules-first NL→intent, LLM fallback only
  when the rules are unsure. Produces exactly the specified shape.
- `commerceDiscovery.service.ts` (§9-§11) — filter extraction, relevance-only
  ranking, comparison table construction.
- `commerceImageShopping.service.ts` (§12) — vision observation + honest match
  grading.
- `commerceVoice.service.ts` (§13) — voice bridge with mandatory spoken
  confirmation for spend.
- `commerceSession.service.ts` (§8) — AI orchestration context, **ids only**.

### Execution and safety
- `tools/commerceTools.ts` — the 17 tools (§4), each with a guard prologue.
- `commerceGuard.service.ts` (§22-§23) — seven ordered checks: identity →
  tenant → session → resource ownership → capability flag → permission →
  transaction authorization.
- `events/wmpcEventConsumer.service.ts` (§18-§20) — signature, timestamp,
  schema, event-id dedupe, idempotency, audit.
- `events/wmpcEventHandlers.ts` — the 10 handlers.
- `commerceAnalytics.service.ts` (§28) — 11 events, with a forbidden-key filter.
- `commerceFlags.ts` (§29-§30) — 9 flags, provisioned **disabled**.
- `commerceAgent.service.ts` (§24-§27) — agent spec, system prompt, kernel
  registration.
- `bootstrap.ts` + `http/routes/aiCommerce.ts` — wiring and HTTP surface.

---

## 4. WMPC API contract created (what Stage 2 must implement)

The `HttpWmpcAdapter` calls exactly these, all relative to `WMPC_API_BASE_URL`:

| Operation | Method + path |
|---|---|
| Product search | `GET /products/search` |
| Product detail | `GET /products/{id}` |
| Get cart | `GET /cart` |
| Add cart item | `POST /cart/items` |
| Update cart item | `PATCH /cart/items/{itemId}` |
| Remove cart item | `DELETE /cart/items/{itemId}` |
| Clear cart | `DELETE /cart` |
| Create checkout | `POST /checkout/sessions` |
| Get checkout | `GET /checkout/{id}` |
| Payment methods | `GET /payment-methods` |
| Payment status | `GET /payments/{id}` |
| List orders | `GET /orders` |
| Get order | `GET /orders/{id}` |
| Order tracking | `GET /orders/{id}/tracking` |
| Validate gift card | `POST /gift-cards/validate` |
| Apply gift card | `POST /gift-cards/apply` |

**Headers WINDELS sends:** `Authorization: Bearer <WMPC_API_KEY>`,
`X-Correlation-Id`, `X-Idempotency-Key` (mutations only),
`X-Customer-Id` / `X-Organization-Id` for customer scoping.

**Webhook WMPC must call:** `POST /api/v1/ai-commerce/webhooks/wmpc` with
`X-WMPC-Signature: sha256=<hex>` and `X-WMPC-Timestamp: <unix seconds>`, where
the HMAC-SHA256 is computed over `` `${timestamp}.${rawBody}` `` using
`WMPC_WEBHOOK_SECRET`. Payload must match `wmpcEventEnvelopeSchema`.

**Environment variables:** `WMPC_API_BASE_URL`, `WMPC_API_KEY`,
`WMPC_WEBHOOK_SECRET`, `WMPC_TIMEOUT_MS` (default 15000),
`WINDELS_ALLOW_MOCK_WMPC` (dev/test only).

---

## 5. Mock implementation (§32)

`MockWmpcAdapter` sits behind the identical interface and is **structurally
impossible to confuse with production**:

- `isProduction === false`; `name === "wmpc-mock-adapter"`.
- Every fixture id is prefixed `WMPC-MOCK-`; every vendor name ends in `(mock)`.
- Its health detail says "development and test only, not a real marketplace".
- The factory **refuses** it when `NODE_ENV === "production"`, logging an error
  and falling back to `UnavailableWmpcAdapter`.
- Boot logs a loud warning whenever it is active.
- Fixtures deliberately omit some specs, warranties and return policies so the
  §9 "mark unavailable" path is genuinely exercised rather than assumed.

Money arithmetic exists **only inside the mock**, standing in for the
marketplace. No WINDELS code path computes a price, tax, shipping, fee, discount
or total.

---

## 6. Tests

| Suite | Tests | Result |
|---|---|---|
| `wmpcConnector.contract.test.ts` (§33) | 36 | **pass** |
| `aiCommerce.e2e.test.ts` (§34) | 24 | **pass** |
| `commerceTruthfulness.test.ts` | 33 | **pass** |
| **AI Commerce total** | **93** | **93 pass / 0 fail** |
| Full API regression | 2856 | **2805 pass / 51 skip / 0 fail** |

The contract suite is written against the **interface**, not the mock, so the
Stage 2 HTTP adapter can be added to its `adapters` array and run unchanged.

The seven named §34 scenarios all pass:

1. "find me a phone under 200k" → search ✓
2. "compare these two" → comparison ✓
3. "add the second one to my cart" → add to cart ✓
4. "checkout" → checkout session ✓
5. "where is my order" → order tracking ✓
6. `payment.completed` event → WINDELS reacts ✓
7. unauthorized cross-user access → **DENIED** ✓

### Defects the tests found and fixed
- Writing the contract suite exposed that five of my initial assertions used
  error codes outside the §21 set of 13. The **adapter** was correct; the tests
  were corrected to the specification.
- The event-dedupe path relied on `SET NX` semantics that `MockRedis` does not
  implement, so replays were not detected without a real Redis. Fixed with a
  read-then-NX so dedupe holds on both.
- `commerceDiscovery.service.ts` used `f.vendor` where the type declares
  `vendorId`. Fixed.

---

## 7. Runtime validation (not just "it compiles")

Live boot on port 4055 with the mock adapter:

- **2200 routes** discovered (was 2177 — the new router mounted).
- `[aiCommerce] registered 17 commerce tools` — all 17 in the shared registry.
- `[aiCommerce] registered 10 WMPC event handlers`.
- `[aiCommerce] MOCK WMPC ADAPTER ACTIVE — … not real.` warning surfaced.
- `[aiCommerce] bootstrap complete {connector: "mock", productionData: false}`.

Live HTTP probes:

| Probe | Result |
|---|---|
| `POST /ai-commerce/search` unauthenticated | **401** |
| Webhook with no signature | **401** `missing_signature` |
| Webhook correctly signed | **200** `{received: true, duplicate: false}` |
| Same event replayed | **200** `{duplicate: true}` — not reprocessed |

The full chain ran end to end in the log: signature verified → envelope
validated → dedupe → audit → handler → analytics → EventBus dispatch.

Other gates: `apps/api` tsc **0 errors** · `apps/web` tsc **0 errors** ·
`turbo build` **4/4** · migration validator **73/73 models, 44/44 RLS**.

---

## 8. How the hard constraints are enforced

| Constraint | Enforcement (structural, not just prompt text) |
|---|---|
| No duplicate commerce infrastructure | **Zero new database tables. Zero migrations.** No catalog, cart, checkout, payment, ledger, wallet, order or settlement model was added. |
| WMPC authoritative for money | No WINDELS code path performs money arithmetic. Totals are passed through verbatim; tests assert the checkout total equals the marketplace figure. |
| Never invent a fact | `describeProductFacts` maps every absent field to "Not published by the marketplace"; comparison cells stay `undefined` and are listed in `unavailableSpecs`. 7 tests cover this. |
| Never overstate an image match | `exact_match` requires brand AND model legible in the photo AND present in WMPC's own fields; low vision confidence force-downgrades. 7 tests. |
| Voice never silently spends | 6 intents require spoken confirmation; anything not clearly affirmative counts as declined; low STT confidence forces a re-ask. 5 tests. |
| No payment credentials | Nothing in the connector accepts or returns them; contract and E2E tests scan serialized payloads for credential-shaped keys. |
| AI reasoning cannot bypass authorization | The guard runs in the tool prologue **before** the connector is fetched. A test asserts the connector method is never called on denial. |
| No cross-user access | Guard resource-ownership check + adapter customer scoping + session owner matching. 6 tests, including same-user-different-org. |
| Session is not a second cart | Stores ids only; a test asserts the serialized session contains no money fields and no `items`. |
| Mock never confusable with production | Refused in production by the factory; labelled in ids, vendor names, health detail and boot logs. 4 tests. |
| Fail-closed | Missing credentials yield `WMPC_UNAVAILABLE`, never fabricated results. Missing webhook secret rejects every event. |

---

## 9. Remaining issues and known limitations

1. **No live WMPC account.** The HTTP adapter is complete but has never spoken
   to a real WMPC server. Stage 2 must exercise it against the real API. This is
   a credential blocker, not missing code.
2. **Feature-flag and kernel registration are skipped in this sandbox** because
   there is no Redis server (`MockRedis` only). Both degrade gracefully and log
   the skip; they will run normally where Redis exists.
3. **Pre-existing sandbox schema drift** (`AuditLog.organizationId` missing,
   `ModelRegistry`/`Plugin`/`RolePermission` tables absent) makes audit writes
   fail at runtime here. This predates this work and affects all modules
   equally; the audit call itself is correct and non-fatal by design.
4. **RLS remains unverifiable in this sandbox** — the `windels` role is a
   SUPERUSER, which bypasses RLS unconditionally. AI Commerce adds no tables, so
   it adds no new RLS surface.
5. **The legacy `apps/api/src/commerce/` module still exists** and still serves
   `/api/v1/commerce`. It is untouched and unused by AI Commerce. Consolidating
   or removing it needs its own approved task.
6. **Order/checkout linkage to a WINDELS user in webhooks** depends on WMPC
   including `organizationId` and `windelsUserId` in event payloads. Without
   them the handler logs and skips notification rather than guessing a
   recipient — a deliberate privacy choice that Stage 2's account-linking design
   should resolve.

---

## 10. Exact Stage 2 requirements

Stage 1's architecture must not change. Stage 2 **only swaps the adapter**.

1. **Build the WMPC Integration Gateway/API** exposing the 16 endpoints in §4
   above with the documented request/response shapes.
2. **Implement the webhook publisher** on the WMPC side: HMAC-SHA256 over
   `` `${timestamp}.${rawBody}` ``, the `X-WMPC-Signature` / `X-WMPC-Timestamp`
   headers, stable event ids, and at-least-once delivery with retry.
3. **Honour `X-Idempotency-Key`** on every mutation so a retried add-to-cart,
   checkout or gift-card apply cannot double-execute.
4. **Define account linking** — how a WINDELS user maps to a WMPC customer id,
   and include `organizationId` / `windelsUserId` in event payloads.
5. **Issue credentials** and set `WMPC_API_BASE_URL`, `WMPC_API_KEY`,
   `WMPC_WEBHOOK_SECRET`. The factory then selects the HTTP adapter
   automatically with no code change.
6. **Add the HTTP adapter to the contract suite's `adapters` array** and run the
   existing 36 contract tests against the live API.
7. **Enable the feature flags** in the admin dashboard — they ship disabled.

Final chain, unchanged from §35:

```
USER → WINDELS AI OS → God-Node / AI Workforce → AI Commerce Agent
     → Commerce Tools (17) → Permission Guard → WMPC Connector
     → [ MOCK now / REAL WMPC in Stage 2 ]
```
