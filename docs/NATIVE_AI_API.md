# WINDELS Native AI API & External Agent Platform

## Additive architecture

The native provider surface is mounted at:

```text
https://api.windels.ai/v1
```

The existing `/api/rest/v1` gateway remains active and unchanged. Both surfaces reuse the same API keys, tenant identity, granular scopes, rate limiter, usage ledger, billing subscriptions, audit system, provider registry, agents, workflows, files, webhooks and security controls.

```text
External application / autonomous agent
  ↓ WND API key
/v1 API + existing API-key middleware
  ↓ tenant, scope, IP, quota, billing and abuse gates
WINDELS native model router
  ↓ health-verified internal model selected by policy
Existing ProviderRegistry / agents / attachments / webhooks
  ↓
Standard WINDELS response + usage + audit + billing records
```

Internal provider names are not returned to public callers. They remain available to authorized organization usage/audit reporting.

## Availability truth

`GET /v1/models` is generated from live provider health checks. It does not expose:

- `windels-echo` or demo responses;
- the unconfigured `windels-assistant` UI descriptor;
- deterministic `fallback-hash-128` embeddings;
- simulator image/audio/video queues;
- configured-but-unhealthy provider models.

Aliases appear only when backed by tested runtime capabilities **and** the operator has explicitly set `WINDELS_NATIVE_API_ENABLED=true` after target-environment acceptance:

| Public alias | Backing requirement |
|---|---|
| `windels-native` | At least one healthy real chat model |
| `windels-embedding` | Healthy real model implementing embeddings |
| `windels-image-1` | Healthy OpenAI provider plus image configuration |
| `windels-speech-1` | Healthy OpenAI provider plus speech/transcription configuration |

Capabilities such as vision, streaming, structured output and tools are published only when the router can select a healthy model with the required internal capability.

## First-party Native AI Studio

Signed-in WINDELS members also have a deliberately narrow control surface at
`/api/v1/native-ai` and `/app/native-ai`. It is **not** an alternate public API
or an API-key bypass:

- uses the ordinary member JWT and requires an organization context for usage
  and model-invocation routes;
- calls the same health-gated native router as `/v1`;
- offers non-streaming chat and real embeddings only;
- applies the same `native-ai` product billing/quota gate and records the same
  durable usage ledger, tagged `channel: "studio"`;
- reports `unavailable` when publication is disabled or no real accepted model
  is healthy; it never exposes Echo/demo or hash fallback output;
- keeps streaming, files, image/audio endpoints and external-agent protocol on
  the API-key-authenticated `/v1` surface.

The Studio’s stable output intentionally omits the selected internal provider
and backing model. It is a member workspace, not a provider diagnostic surface.

## Compatibility posture

The API follows familiar OpenAI request/response shapes for the implemented and tested subset. It does **not** claim complete OpenAI API compatibility.

Implemented:

- bearer API-key authentication;
- model list;
- non-streaming chat completions;
- SSE chat streaming ending in `data: [DONE]`;
- unified non-streaming responses;
- real embeddings;
- non-streaming external function/tool calls;
- inline base64 vision inputs for approved MIME types;
- files;
- health-gated image generation;
- health-gated speech generation and transcription;
- persistent tenant-scoped WINDELS agent runs.

Explicitly outside the current tested compatibility subset:

- streaming tool-call emulation;
- streaming `/responses` events;
- arbitrary remote image URLs;
- arbitrary OpenAI beta fields not represented in the strict request contracts.

Unsupported combinations return a structured error instead of being silently ignored.

## API keys

New secrets use the format `WND_<base64url>`. Legacy case-insensitive `wnd_` keys remain valid for backward compatibility.

Keys are:

- generated with `crypto.randomBytes`;
- SHA-256 hashed at rest;
- returned in plaintext exactly once;
- tenant-assigned;
- revocable and atomically rotatable;
- expirable;
- bound to development/test/production environments;
- optionally restricted by IP CIDR;
- authorized by granular scopes;
- tracked for last use, request count, tokens, cost and errors.

Rotation atomically revokes the previous hash and creates a replacement. The replacement plaintext is returned once and never persisted.

## Granular scopes

```text
models:read
ai:read
ai:execute
tools:execute
agents:read
agents:execute
workflows:read
workflows:execute
knowledge:read
knowledge:search
memory:read
memory:write
files:read
files:write
images:generate
audio:generate
audio:transcribe
```

When a key contains granular scopes, they are authoritative. Legacy `READ`, `WRITE` and `ADMIN` scopes remain supported for existing `/api/rest/v1` clients.

## Core endpoints

```text
GET  /v1/openapi.json
GET  /v1/models
POST /v1/chat/completions
POST /v1/responses
POST /v1/embeddings
POST /v1/files
POST /v1/images
POST /v1/audio/speech
POST /v1/audio/transcriptions

GET  /v1/agents
GET  /v1/agents/{agent_id}
POST /v1/agents/{agent_id}/execute
POST /v1/agents/{agent_id}/messages
GET  /v1/agents/{agent_id}/runs/{run_id}
POST /v1/agents/{agent_id}/runs/{run_id}/cancel
```

Unknown `/v1` routes use the native error envelope rather than the existing internal API envelope.

## Chat example

```bash
curl https://api.windels.ai/v1/chat/completions \
  -H 'Authorization: Bearer WND_your_key' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "windels-native",
    "messages": [
      {"role":"system","content":"You are an autonomous business assistant."},
      {"role":"user","content":"Analyze this business problem."}
    ]
  }'
```

The public response identifies `windels-native`, not the selected internal vendor.

## Streaming

Set `stream: true` on `/v1/chat/completions`. The API:

1. selects a real model with the `stream` capability;
2. opens `text/event-stream` with proxy buffering disabled;
3. forwards standardized `chat.completion.chunk` objects;
4. records final token/cost usage;
5. emits `data: [DONE]`;
6. aborts the provider request on client disconnect;
7. records interrupted calls with HTTP-style status `499` and `CLIENT_DISCONNECTED`.

Nginx and development proxy configurations route `/v1` directly to the API and disable buffering where appropriate.

## External tool loop

For a non-streaming request, clients may submit OpenAI-style function definitions. WINDELS routes to a real JSON-capable model and constrains the model to one of two validated objects:

```json
{"type":"tool_call","name":"check_inventory","arguments":{"product_id":"p1"}}
```

or:

```json
{"type":"message","content":"No tool is needed."}
```

Function names must match the request and arguments are checked against required fields and basic JSON-schema primitive types. The response uses structured `tool_calls`. The external application executes its own tool and sends the result back as a `tool` message. `tools:execute` is mandatory for granular-scope keys.

This creates a real external agentic loop without granting uploaded external functions access to the WINDELS process.

## External WINDELS agents

Agent reads and runs always include `organizationId` filters. Runs are persisted in `ExternalAgentRun` and messages in `ExternalAgentMessage`.

A run records:

- organization, API key and requesting user;
- agent;
- idempotency key;
- public model alias and internal provider for metering;
- input/messages and output/tool calls;
- tokens/cost;
- status, errors and timestamps;
- cancellation state.

Concurrent cancellation aborts the active provider request. Restarts do not fabricate completion: an interrupted run remains represented by its persisted status. Agent lifecycle events use the existing HMAC-signed webhook delivery system:

```text
agent.run.started
agent.run.requires_action
agent.run.completed
agent.run.failed
agent.run.cancelled
```

## Embeddings and knowledge

`POST /v1/embeddings` chooses only a health-verified provider that implements real embeddings. The internal hash fallback remains available for existing local product resilience but is explicitly blocked from the public API.

Knowledge, search, memory, files, agents and workflows continue to use their existing tenant-isolated stores and permission checks. No global cross-tenant search layer was added.

## Files and multimodal APIs

`POST /v1/files` reuses the existing attachment service, MIME allowlist, size checks, checksum addressing, organization storage prefix and uploader ownership. The complete upload must also receive a clean ClamAV verdict; missing scanner capacity fails closed.

Image and audio endpoints call real provider APIs only after their model alias appears in the health-gated catalog. The existing simulator media queue and fabricated speech-recognition service are never used by `/v1`.

Transcription reuses the real provider adapter originally shared with channel media extraction. Provider-not-configured, timeout, authorization and empty-audio conditions return errors rather than invented transcripts.

## Usage, billing and quotas

The existing `ApiUsageRecord` ledger now records:

```text
organizationId, userId, apiKeyId, requestId
method, path, endpoint, environment
model, provider
input/output tokens, tool calls
agent runs, workflow executions
images, audio seconds, storage bytes
duration, estimated cost, actual cost when available
status and error code
```

`actualCostMicros` remains null when the upstream provider supplies only token counts and WINDELS applies a pricing estimate. It is never relabeled as actual cost.

The existing API product subscription is reused. Native calls increment `ApiSubscription.usedThisMonth`; configured product quotas and inactive billing status fail closed. No second billing service was created.

The Developer Platform supports filtering by date, key, application, model, endpoint, environment and status.

## Error format

```json
{
  "error": {
    "message": "API key missing required scope: ai:execute",
    "type": "permission_error",
    "code": "insufficient_scope",
    "param": null
  },
  "request_id": "..."
}
```

Authentication, validation, permissions, quotas, provider errors and unknown routes all use this native envelope. Existing `/api/rest/v1` responses retain their previous envelope.

## OpenAPI and SDK examples

OpenAPI 3.1 is served from `/v1/openapi.json` and the authenticated Developer Platform. The portal includes tested HTTP examples for JavaScript/TypeScript, Python OpenAI client configuration, cURL, PHP and Go.

These are integration examples, not claims that separate generated SDK packages have completed independent production certification.

## Production configuration

At least one real AI provider must be configured and pass health checks:

```text
OPENAI_API_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY
OLLAMA_BASE_URL + OLLAMA_MODEL
OPENAI_COMPAT_BASE_URL + OPENAI_COMPAT_API_KEY
```

Optional policy:

```text
WINDELS_PUBLIC_API_ORIGIN=https://api.windels.ai
WINDELS_NATIVE_API_ENABLED=true  # only after acceptance tests pass
WINDELS_NATIVE_CHAT_MODEL
WINDELS_NATIVE_EMBEDDING_MODEL
WINDELS_IMAGE_MODEL
WINDELS_SPEECH_MODEL
```

TLS termination must route `/v1` to the API. Provider credentials remain server-side and are never returned to external clients.

## Validation status

Automated validation covers:

- one-time key creation, hashing, rotation, revocation and backward-compatible verification;
- empty model catalog when no real provider exists;
- public aliases without provider leakage;
- capability-aware chat/vision/streaming selection;
- structured external tool calls;
- public hash-embedding rejection;
- tenant-isolated durable agent runs, failures, idempotency and cancellation;
- native auth/scope errors and OpenAPI;
- usage field persistence and resource totals;
- existing public API regression suites.

A deployment without real provider credentials cannot complete the “real external response” acceptance test. It must remain visibly unavailable rather than passing with demo AI. Production acceptance therefore requires running the lifecycle tests against a configured, billing-enabled provider and target PostgreSQL/Redis deployment.
