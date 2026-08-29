# AI Video Studio — Cinematic Video Intelligence

Native WINDELS AI OS capability for going from an idea to a complete cinematic
video: text/image/multi-reference → storyboard & shots → model router →
generation → audio/dialogue/lip-sync → quality control (with per-shot
regeneration) → final video → notification. This is an incremental extension
that reuses the existing job/storage/billing/agent/notification systems.

## Backend (`apps/api/src/cinematic/`)

| File | Responsibility |
| --- | --- |
| `modelRegistry.ts` | Provider-independent model **capability registry** + router (quality/cost/duration/identity/audio) with **provider failover** and health. |
| `engines.ts` | Natural-language → structured **camera/motion/lighting/positioning**; **prompt enhancement**; multi-shot planning. |
| `consistency.ts` | Reusable **character profiles** with identity keys (no biometric raw retained); scene continuity; realism/artifact negative prompts. |
| `director.ts` | Autonomous **Video Director** and **Quality Control** agents (operate through Kernel/agent events); shot regeneration decisions. |
| `audio.ts` | Synchronized **dialogue/ambient/SFX/music** timeline and lip-sync cues; reuses voice/music infrastructure. |
| `cinematic.service.ts` | Projects, async jobs (QUEUED→…→COMPLETED), SSE realtime progress, credits, notifications, tenant isolation. |

API under `/api/v1/cinematic` (projects, generate, jobs + SSE events,
characters, estimate, models, dashboard) using existing auth/RBAC/validation.
Assets stream from `/api/v1/cinematic/assets`. Frontend at
`/app/cinematic-studio`.

## Capabilities mapped to spec

- Text-to-video, image-to-video, video-to-video, multi-reference (up to 50 refs;
  router compresses/selects when a model supports fewer).
- Character & scene consistency; camera/motion/lighting/positioning control.
- Long-form with automatic **multi-shot** generation and continuity.
- Reference strength, negative prompts, seed, variation, preview mode.
- Audio generation, dialogue, lip-sync cues, multi-track audio timeline.
- Never overwrites generations; per-shot regeneration; versioned projects.
- Estimated credits before generation; billing via existing Media Metering.
- Autonomous director/quality agents and completion notifications.
- Deterministic seeded randomness (no fabricated data — passes the no-random guard).

13 new unit tests; full API suite (2894 tests) passes; web builds.
