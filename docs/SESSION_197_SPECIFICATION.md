# Session 197 — Native AI Studio completion (last inventory STUB)

**Date:** 2026-08-16
**Module:** `nativeAi`
**Status:** 🟡 VERIFIED (partial) — code, unit tests, web build, and inventory
pass in the sandbox; target-environment runtime validation remains required.

## Starting state

The generated inventory had one remaining non-complete module:

- `nativeAi`: **STUB** — 508 LOC and a legacy page/client alias, but **zero
  routes**. Its page only said it was superseded by `nativeAiApi`.

`nativeAiApi` remains the API-key-authenticated public `/v1` compatibility
surface. Simply relabelling the legacy alias as complete would have created no
first-party capability, so this session added a deliberately narrow,
member-authenticated studio rather than copying or weakening `/v1`.

## Implemented

### First-party Native AI Studio

`/api/v1/native-ai` now has six authenticated HTTP endpoints:

| Route | Purpose |
|---|---|
| `GET /status` | Health-gated alias availability, public-API state, and explicit no-demo posture. |
| `GET /models` | Current public aliases only — never internal provider/model names. |
| `GET /openapi` | The existing `/v1` OpenAPI document for external integration reference. |
| `GET /usage` | Organization-scoped Native AI ledger totals and subscription quota state. |
| `POST /chat` | Non-streaming, real-provider-only completion via the existing native router. |
| `POST /embeddings` | Real embeddings via the existing native router; hash fallback stays blocked. |

The endpoints use the standard session `authenticate` middleware. State-bearing
routes require a user and organization context; a null organization cannot
consume another tenant's product quota or read another tenant's ledger.

### One router, two appropriately scoped entry points

The Studio delegates to `nativeAi.service.ts`, exactly as the public `/v1`
surface does. It neither seeds models nor creates a second provider registry:

- `WINDELS_NATIVE_API_ENABLED` must be explicitly true before aliases can be
  published.
- No healthy accepted real provider → `availability: "unavailable"`, with an
  explicit reason.
- Echo/demo completions and hash-fallback embeddings are never exposed.
- Studio calls are intentionally non-streaming; SSE remains only on API-key
  authenticated `/v1/chat/completions`.
- The Studio never returns internal provider or backing-model names.

### Billing, quota, and usage

`nativeAiQuota.ts` now has a shared, organization-scoped quota lookup used by
both external API-key calls and Studio calls. This closes the bypass that would
otherwise let a browser session use Native AI while its API product quota was
exhausted.

Successful Studio chat/embedding calls append to the existing durable
`ApiUsageRecord` ledger with `productSlug: "native-ai"` and increment the same
active Native AI subscription counter used by `/v1`. Ledger writes are
best-effort and cannot change a completed real-model response into a failure.

### Shared contract and UI

- Added `packages/shared/src/nativeAi.ts` with strict Studio request schemas,
  status, usage, completion, and embedding contracts.
- Replaced the legacy-stub page at `/app/native-ai` with **Native AI Studio**:
  availability/no-provider truth banner, quota and ledger cards, real
  non-streaming test completion, and currently published aliases.
- Added a dedicated `lib/nativeAi.ts` Studio client while retaining re-exports
  from `nativeAiApi.ts` for existing public-client consumers.
- Renamed the sidebar entry from **Native AI (Legacy)** to **Native AI Studio**.

## Tests

`apps/api/src/nativeAi/console.service.test.ts` adds four tests covering:

1. disabled native API → an honest unavailable status and no model aliases;
2. no leakage of internal provider/backing-model identity from Studio output;
3. real embedding adapter results are passed through, never fabricated;
4. usage and quota reads are scoped to the caller's organization.

`nativeQuota.test.ts` now adds three Studio/quota tests:

1. session-authenticated Studio calls obey the same exhausted Native AI quota;
2. a user without organization context is refused;
3. quota lookup is tenant-scoped.

The focused Native AI suite passes **16 tests in 3 files**. The web TypeScript
check and production build pass.

## Inventory result

`node audit/build-inventory.mjs` now reports:

```text
144 COMPLETE / 0 PARTIAL / 0 STUB
```

`nativeAi` has six HTTP endpoints (the scanner reports 7 Express route
registrations), a shared contract, a dedicated client/page, and five associated
test files. No module is represented as finished solely by an alias.
