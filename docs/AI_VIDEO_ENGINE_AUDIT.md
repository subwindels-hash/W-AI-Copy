# AI Video Engine — Architecture Audit & Reuse Map

This module follows the WINDELS rule **Audit → Design → Implement → Test →
Validate → Fix → Re-test → Certify** and is an **incremental addition**.

## Existing systems reused (not duplicated)

| Concern | Existing WINDELS system reused | Video engine touchpoint |
| --- | --- | --- |
| Job queue pattern | Redis-backed queue (`mediaGen`, `musicVideo`) | `videoEngine/jobQueue.ts` uses the same keys/worker pattern |
| Multi-provider AI | AI registry / Model Factory / mediaGen capability catalogue | `providerGateway.ts` + adapter contract |
| Rendering | Music Video FFmpeg renderer (`musicVideo.service.ts`) | `renderer.ts` + `render/ffmpeg.ts` |
| Voice narration | Voice Foundry / voice services | `audio.ts` routes through voice foundry when configured |
| Music | Music Generator (`musicGen`) | `audio.ts` placeholder/reuse hook |
| Billing/usage | Media Metering ledger (`mediaFactory/metering.service.ts`) | `storage.recordStorageUsage`, voice seconds, output bytes |
| Storage | Media cache dir + public prefix convention | `storage.ts` under `VIDEO_CACHE_DIR` |
| Auth / RBAC | `http/middleware/auth.ts` | all `/video` JSON routes use `authenticate` + org scope |
| Validation | `http/middleware/validate.ts` + Zod | every route validates body/params/query |
| Orchestration/events | Kernel event bus (`kernel.service.ts`) | `video.project.*` / `video.job.*` events |
| Marketplace/CRM products | AI Commerce discovery / Marketplace | `attachMarketplaceProduct` |
| Publishing | Media Factory publishing service | `publish()` delegates to existing publisher |
| Observability | `config/logger.ts` (pino) | structured logging throughout |

## What is new (only)

- Video project/scene/script/storyboard domain model (`packages/shared/src/video.ts`)
- Video provider gateway + adapter contract + simulator adapter
- Video job queue (idempotency, retry/backoff, fallback, cancel)
- AI Video Director planning logic
- FFmpeg composition renderer for the video timeline
- QA/safety validation
- `/api/v1/video` routes + asset streaming
- AI Video Studio web page

## Non-goals / honesty notes

- No new auth, billing, wallet, storage, or agent-communication system was created.
- The simulator adapter produces deterministic placeholders; it is never
  represented as real footage (QA enforces AI disclosure). Real providers are
  added by implementing `VideoProviderAdapter`.
- Without FFmpeg the renderer returns `requires_config` rather than a fake MP4.
