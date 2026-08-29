# WINDELS AI Video Generation & Production Engine

An **incremental module** added to WINDELS AI OS that turns a natural-language
idea into a finished, rendered video:

```
User idea → WINDELS understands it → plans it → generates it → edits it
          → renders it → delivers it → optionally publishes it
```

It does **not** replace any existing module. It reuses the existing Redis job
queue pattern, the AI/Voice/Music subsystems, the Media Metering ledger for
billing, Kernel events for orchestration, the existing auth/RBAC middleware,
and the existing storage conventions.

## Module contents

```
apps/api/src/videoEngine/
  director.ts          # AI Video Director: concept → script → storyboard → scenes
  providerGateway.ts   # Video Model Gateway (multi-provider routing/abstraction)
  adapters/
    types.ts           # Provider adapter contract
    simulator.ts       # Built-in honest simulator (always available)
  jobQueue.ts          # Async, tenant-scoped job queue with retry/idempotency/fallback
  video.service.ts     # Project CRUD + pipeline orchestration (main service)
  renderer.ts          # FFmpeg composition/rendering (§9)
  render/ffmpeg.ts     # FFmpeg detection
  audio.ts             # Voice narration, music, SFX, captions
  quality.ts           # AI safety & quality validation (§13)
  storage.ts           # Storage integration + lifecycle (§15)
  bootstrap.ts         # Provider registration + periodic worker
apps/api/src/http/routes/
  video.ts             # Authenticated JSON API (§16)
  videoAssets.ts       # Public asset streaming for renders/audio
apps/web/src/pages/video/VideoStudioPage.tsx   # AI Video Studio dashboard (§17)
apps/web/src/lib/video.ts                       # Web API client
packages/shared/src/video.ts                    # Shared contracts/types
```

## Pipeline

The **AI Video Director** (`director.ts`) converts a request into a production
plan: script, storyboard, and scenes (camera, environment, characters,
products, voiceover, captions, transitions).

Each scene is generated as an **async job**:

```
API request → create job → Redis queue → worker → Video Model Gateway
           → provider adapter → result → asset → (render) → QA → store → notify
```

The API returns `202 Accepted` immediately with job ids; the client polls
`GET /video/jobs/:id` or `GET /video/projects/:id`.

## Video Model Gateway (§4)

```
WINDELS AI OS → AI Video API → Video Model Gateway → Provider Adapter → Provider
```

The gateway never hard-codes a single provider. It routes by capability
(text/image/video-to-video, character & product consistency, resolution, aspect
ratio, max duration), availability, quality score, cost weight, and an optional
preferred provider. **Adding a provider** means implementing
`VideoProviderAdapter` and calling `videoProviderGateway.registerAdapter()` at
bootstrap — no core changes.

The built-in `SimulatorAdapter` produces deterministic placeholder clips so the
full pipeline (routing, queuing, rendering, QA, metering) runs end-to-end with
no API keys. It is honest: assets are marked simulated and QA enforces
AI-generated disclosure.

## API (§16)

All routes mount at `/api/v1/video` and use the existing `authenticate`
middleware + org-scoped authorization.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/capabilities` | Creation types, formats, providers |
| GET | `/providers` | Available provider models |
| GET | `/dashboard` | Project/job/provider rollup |
| POST | `/projects` | Create a video project |
| GET | `/projects` | List the org's projects |
| GET | `/projects/:id` | Get a project (full production state) |
| PATCH | `/projects/:id` | Update a project |
| DELETE | `/projects/:id` | Delete a project |
| POST | `/projects/:id/plan` | Run the director (script/storyboard/scenes) |
| POST | `/projects/:id/generate` | Generate clips/voice/music (async) |
| POST | `/projects/:id/render` | Render a version (async) |
| POST | `/projects/:id/produce` | Plan + generate + render in one call |
| POST | `/projects/:id/modify` | Conversational modification (same project) |
| POST | `/projects/:id/versions` | Create a platform/format version |
| POST | `/projects/:id/marketplace/:productId` | Attach marketplace product facts |
| POST | `/projects/:id/publish` | Publish to connected platforms |
| GET | `/projects/:id/assets/:assetId` | Asset metadata |
| GET | `/jobs` | List jobs (optional `?projectId=`) |
| GET | `/jobs/:id` | Job status/progress |
| POST | `/jobs/:id/cancel` | Cancel a pending/running job |

Renders and audio stream from `/api/v1/video/assets/...` (path-traversal
guarded, unguessable ids).

## Multiple formats (§10)

One source project produces many versions via `/projects/:id/versions`:

```
ONE PROJECT → YouTube 16:9 → Instagram 1:1 → Facebook → TikTok 9:16 → WhatsApp
```

Dimensions are defined per resolution/aspect in `renderer.ts`.

## Natural voice & conversational edits (§6)

`POST /projects/:id/modify` applies edits to the **current** project rather than
creating unrelated projects: `shorten`, `lengthen`, `change_background`,
`set_tone`, `set_voice_gender`, `change_music`, `zoom_product`, `reformat`,
`add_captions`, etc. Voice commands from the existing WINDELS voice system can
call these same endpoints.

## Marketplace & truthfulness (§11, §13)

`attachMarketplaceProduct` resolves product info through existing commerce/marketplace
services and passes **name, description, images, price, brand, features, category,
vendor** through verbatim. The director and QA layer refuse to invent price,
specs, or guarantees — scenes that state a price or guarantee absent from the
product data fail the `incorrect_product_claims` QA check.

## Quality & safety (§13)

`quality.ts` runs before delivery and checks: generation failures, missing
scenes, corrupted/unsupported media, A/V sync, caption errors, brand
restrictions, content policy, copyright markers, unsafe content, incorrect
product claims, and AI-generated disclosure. A `fail` blocks delivery; a `warn`
is surfaced but does not block.

## Billing & storage (§14, §15)

Usage is recorded through the **existing** `MediaMeteringService` ledger
(voice seconds, output bytes/storage, render time) — no second billing system.
When `MEDIA_RATE_*` environment rates are unset, usage is tracked but reported
`unpriced: true` rather than guessed. Binaries live under `VIDEO_CACHE_DIR`
(default `./video-cache`) served at `/api/v1/video/assets`; intermediate files
are purged after render via `purgeIntermediates`.

## FFmpeg honesty (§9)

The renderer probes for `ffmpeg`. When absent it writes a `composition.json`
manifest and returns `requires_config` — it never returns a fake MP4. Install
FFmpeg on the server for real MP4 encoding.

## Agent integration (§19)

The Video Engine emits Kernel events (`video.project.created`, `.planned`,
`.modified`, `.qa`, `.published`, `video.job.*`) so the existing agent
orchestration can coordinate CRM, Marketplace, Marketing, Copywriting, Voice,
Publishing and Analytics agents around a production.

## Tests

```
pnpm --filter @windels/api exec vitest run src/videoEngine/video.test.ts
```

Covers provider routing, director planning, project CRUD + tenant isolation,
async generation, idempotency, cancellation, rendering/QA honesty, unsafe
content blocking, product-claim truthfulness, conversational modifications,
and marketplace product attachment.
