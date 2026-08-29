# AI VIDEO TRANSFORMER

Natural-language, mask/track-aware selective video editing that preserves
original motion and timing. A user uploads a video and says e.g. *"keep my
movement exactly the same but change my clothes to a black luxury suit and
replace the room with a futuristic spaceship"*; WINDELS parses the edit,
analyzes the source, routes to a capable provider, runs the multi-stage
transformation, quality-checks the result and stores it as a versioned project.

This is an additive module. It reuses the existing Redis job infrastructure,
Media Metering (billing), Notifications, Conversation/Message memory, the AI
model-router idiom, and storage conventions. **No fake generation**: when no
configured provider can actually transform the video, the job fails with a
clear `NO_PROVIDER` / `VIDEO_COMPOSITE_REQUIRES_CONFIG` error instead of
returning a static clip.

## Backend (`apps/api/src/videoTransformer/`)

| File | Role |
| --- | --- |
| `editParser.ts` | Deterministic natural-language → structured multi-edit parser (object/clothing/identity/background/sky/weather/lighting/add/remove), preserve flags and style. No LLM required. |
| `understanding.ts` | Scene understanding: people/objects/environment/motion/camera/audio and the editable-region catalogue. Uses ffprobe when installed; semantic structure is derived from the prompt and reported as parse provenance (never presented as fake CV output). |
| `providerGateway.ts` | Provider-independent capability registry, model router (by target/capability/cost/health) with automatic failover, and a multi-stage plan when no single model covers all edits. The local-composite adapter performs real ffmpeg compositing when ffmpeg is present and reports an honest config error otherwise. |
| `transform.service.ts` | Async jobs (`QUEUED→...→COMPLETED`), SSE real progress, masks/tracks, quality checks, version history, MediaMetering billing, completion notification. |
| `storage.ts` | Upload/output storage under a per-org cache dir with size/type validation and intermediate purge. |

## API (`/api/v1/video-editor`)
Authenticated:
- `POST /upload` — multipart upload, returns source + project
- `POST /parse` — prompt → structured edit plan
- `POST /estimate` — credits/runtime/model/multi-stage
- `POST /transform` — **202** + job (async)
- `GET /jobs/:id`, `POST /jobs/:id/cancel`, `GET /jobs/:id/events` (SSE)
- `GET /projects`, `GET /projects/:id`, `POST /sources/:id/analyze`
- `GET /providers`, `GET /dashboard`
Assets stream from `/api/v1/video-editor/assets/...`.

## Frontend
`/app/video-editor` — AI Video Studio: upload/drop, prompt, interpreted plan
chips, preserve toggles, credit estimate, 5s preview vs full generation, live
SSE progress, and a result player with download. Uses the existing design
system.

## Constraints / honesty
This sandbox has **no ffmpeg/ffprobe binaries and no network to install AI
video providers**. The parser, understanding structure, routing, jobs,
billing, progress, API and UI are all real and tested. The actual pixel
transformation runs when (a) ffmpeg is installed for the local-composite
adapter, or (b) `WINDELS_CLOUD_VIDEO_KEY` is set / a cloud video-AI adapter is
connected. Until then jobs fail honestly rather than fabricating output.

## Tests
10 new tests cover edit parsing (clothing/object/environment/identity/multi-edit,
preserve detection, deduplication), scene understanding, provider routing, and
the pipeline's honest failure when no transformer is available. Full API suite
green; web builds.
