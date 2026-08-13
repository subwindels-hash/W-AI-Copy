# AI Video Transformation Studio (Switch X)

Native WINDELS AI OS capability for **subject-preserving video transformation**:
upload a video, extract an exact frame, generate a reference environment, matte
the subject, and composite them into a new video with a node-based workflow.

This is an incremental addition inside the existing Media / Video Intelligence
environment. It reuses WINDELS authentication, Redis job infrastructure, the
Media Metering ledger for credits/billing, storage conventions, the Kernel event
bus, and SSE realtime progress. No second auth/billing/storage system is created.

## Architecture

```
Video Input → Exact Frame → Image Generator → Reference
          ↘ Video Matte → Alpha/RGBA ↘
                                  Switch X → Quality AI → Final Video
```

Backend (`apps/api/src/videoTransform/`):

| File | Responsibility |
| --- | --- |
| `ffmpegOps.ts` | REAL ffprobe/ffmpeg operations: probe metadata, exact-frame extraction, animated alpha/RGBA matte, subject-over-background compositing. |
| `providers.ts` | `ImageGenerationProvider` / `VideoGenerationProvider` / `VideoMatteProvider` abstraction, model router (quality/cost/identity), provider health/failover. |
| `nodes.ts` | Full typed node catalogue (§21), port-type validation, DAG topological execution, cycle detection. |
| `transform.service.ts` | Upload/analysis, async jobs (QUEUED→…→COMPLETED), SSE progress, Switch X pipeline, autonomous quality retry, workflow CRUD/execution, billing, activity feed. |
| `storage.ts` | Asset storage under `video-transform-cache`, lifecycle/intermediate purge, metering. |

API (`/api/v1/video-transform`): sources upload, jobs, estimate, SSE events,
workflows (nodes/connections/run), providers, dashboard, activity. Assets stream
from `/api/v1/video-transform/assets`.

Frontend (`apps/web/src/pages/videoTransform/`): a native dark node canvas with
pan/zoom, drag, typed-port connections (invalid connections rejected),
multi-select, delete, auto-layout, minimap; a professional video preview with
frame stepping/capture/fullscreen/download; Switch X controls; real-time
progress; and original/generated/side-by-side/slider comparison.

## Node types

Inputs (video/image/audio/text), video (preview, exact frame, matte, trim, crop,
resize, fps, merge, composite, transform, **Switch X**), image (generator,
editor, upscaler, reference, preview), AI (prompt, video generator, video-to-video,
image-to-video, background/subject replacement, relighting, style transfer),
and utilities (switch, condition, router, combine, cache, delay, output). Every
executing node maps to a real backend operation.

## Async lifecycle

`QUEUED → ANALYZING → EXTRACTING_FRAME → GENERATING_REFERENCE → GENERATING_MATTE
→ TRANSFORMING_VIDEO → QUALITY_CHECK → ENCODING → COMPLETED` (or `FAILED`/`CANCELLED`).
Progress streams over SSE at `/jobs/:id/events` and Kernel webhook events
`video.generation.started|progress|completed|failed` and
`video.quality_check.completed`. The HTTP API returns `202 Accepted` immediately.

## Honest execution

- ffprobe must be installed for metadata/frame extraction; ffmpeg for matte/composite. When absent, Switch X falls back to a configured video-to-video provider and returns a clear `FFMPEG_REQUIRED`/provider error rather than a fake MP4.
- The built-in simulator providers make the pipeline exercisable without API keys; real providers register through the same adapter interfaces.
- Quality control auto-retries once when below threshold; failures expose retry/change-model/reduce-resolution actions.

## Credits/billing

Pre-execution `/estimate` returns credits + runtime. Post-execution credits are
recorded through the existing `MediaMeteringService` ledger (`ai_tokens`). No
separate billing system.
