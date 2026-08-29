# Session 197 — Native AI Studio runtime validation checklist

**Module:** `nativeAi` (first-party Native AI Studio)
**Target environment:** PostgreSQL 17 + Redis 8 + generated Prisma client + at
least one accepted real AI provider.
**Sandbox status:** not executable here; this checklist is intentionally open.

## 1. Build and focused tests

```bash
corepack pnpm --filter @windels/shared build
cd apps/api
corepack pnpm exec vitest run \
  src/nativeAi/nativeAi.test.ts \
  src/nativeAi/nativeQuota.test.ts \
  src/nativeAi/console.service.test.ts
cd ../web
corepack pnpm exec tsc --noEmit -p tsconfig.json
corepack pnpm build
```

Expected: all focused API tests pass, web typecheck passes, and the production
web bundle includes `NativeAiPage`.

## 2. Disabled / unavailable safety

1. Set `WINDELS_NATIVE_API_ENABLED=false` and restart the API.
2. Sign in to an organization member account.
3. `GET /api/v1/native-ai/status` must return HTTP 200 with:
   - `availability: "unavailable"`;
   - `unavailableReason: "native_api_disabled"`;
   - `models: []`.
4. `POST /api/v1/native-ai/chat` must fail with a real-provider-unavailable
   error. It must never answer with Echo/demo content.
5. Visit `/app/native-ai`; verify its amber no-provider banner and disabled
   completion button.

## 3. Accepted real-provider path

1. Configure a real provider and complete provider acceptance.
2. Set `WINDELS_NATIVE_API_ENABLED=true`; restart and wait for provider health.
3. `GET /api/v1/native-ai/status` and `/models` must list only aliases backed
   by healthy real providers.
4. `POST /api/v1/native-ai/chat` with a member JWT and
   `{"model":"windels-native","messages":[{"role":"user","content":"Reply with native-studio-ok"}],"stream":false}`
   must return a real response with `provenance: "real_provider"`.
5. Inspect the response and browser UI: no internal provider name or backing
   model id may appear.
6. Call `POST /api/v1/native-ai/embeddings`; confirm a real vector is returned
   and that no `fallback-hash-128` value can be returned.
7. Verify `/app/native-ai` refreshes the organization’s recorded request and
   token totals after the request.

## 4. Tenant, billing, and quota boundaries

1. Create two organizations with member sessions A and B.
2. Make Native AI calls as A. `GET /api/v1/native-ai/usage` as B must not show
   A’s requests, token totals, or product quota.
3. Give A a `native-ai` product subscription with quota 1 and usage 1.
   `POST /api/v1/native-ai/chat` as A must return 429; B must remain eligible
   when B’s quota is unused.
4. Set A’s billing subscription to `past_due`; the Studio chat/embedding calls
   must return 402. Reads (`status`, `models`, `openapi`) remain usable so an
   operator can diagnose the state.
5. Use a JWT with `organizationId: null`; `usage`, `chat`, and `embeddings`
   must return 403 and create no usage row.
6. Confirm a successful Studio call creates exactly one `ApiUsageRecord` with:
   - the calling organization and user;
   - `apiKeyId: null`;
   - `productSlug: "native-ai"`;
   - `channel: "studio"`;
   - actual token/cost values.
7. Confirm the same active Native AI `ApiSubscription.usedThisMonth` counter is
   incremented once, and a ledger-storage failure cannot alter the completion
   HTTP response.

## 5. Public API separation

1. Call `/v1/chat/completions` without an API key: expect the native 401 API-key
   error shape.
2. Call it with a valid WND key: verify existing `/v1` behavior remains intact.
3. Confirm `/api/v1/native-ai/chat` accepts the member JWT but does **not**
   accept an API key as a substitute.
4. Confirm the Studio supports only `stream:false`; SSE remains on the API-key
   `/v1/chat/completions` route.

## 6. Inventory

```bash
node audit/build-inventory.mjs
```

Expected: **144 COMPLETE / 0 PARTIAL / 0 STUB**, including `nativeAi` with its
Studio routes, shared contract, web client, page, and tests.
