# WINDELS AI OS — VOICE & MEDIA MODULE DEEP-DIVE

**Version:** 4.0  
**Date:** 2026-08-07  
**Status:** AUTHORITATIVE  

---

## MODULE: VOICE (🟡 MERGED: voiceStudio S40 + voiceFoundry S41)

### PURPOSE
Unified voice module — voice synthesis, voice creation, voice deployment, voice packs.

### WHAT BELONGS INSIDE

**Voice Studio (Synthesis):**
- Built-in voice registry (40+ voices including Nigerian languages)
- Custom voice management
- Voice cloning (with consent gate via `voiceOwnership`)
- Voice settings/presets
- Synthesis jobs (TTS)
- Audio file serving

**Voice Foundry (Creation):**
- Voice generation/design (13 categories)
- Voice evolution (warmth, confidence, energy, pitch, speed)
- Voice deployment (17 deploy targets)
- Voice packs (3 seeded packs)
- Deployments management

**Combined Dashboard:**
- Built-in voices count
- Custom voices count
- Synthesis jobs (24h)
- Generated voices count
- Voice packs count
- Active deployments
- Deployment targets

### WHAT DOES NOT BELONG
- ❌ Voice consent/ownership → belongs to `voiceOwnership`
- ❌ Wake-word detection → belongs to `wakeIntel`
- ❌ Music generation → belongs to `musicGen`
- ❌ Video generation → belongs to `mediaFactory`/`musicVideo`
- ❌ Image generation → belongs to `mediaGen`

### DEPENDENCIES
- `voiceOwnership` (for consent checks before cloning/deployment)
- `wakeIntel` (for wake-word voice bindings)
- `mediaFactory` (for video voiceovers)

### INTEGRATIONS
- ElevenLabs (optional, `ELEVENLABS_API_KEY`)
- Play.ht (optional, `PLAYHT_API_KEY` + `PLAYHT_USER_ID`)
- Browser SpeechSynthesis (default, zero-config)

### AI AGENTS
Voice design agents, voice evolution agents

### DATABASE/SERVICES
- **PostgreSQL:** Voices, presets, deployments, packs (future)
- **Redis:** 
  - Built-in voices: `vs:builtin`, `vs:builtin:{index}`
  - Custom voices: `vs:custom`, `vs:custom:{id}`
  - Presets: `vs:presets`, `vs:presets:{id}`
  - Jobs: `vs:jobs`, `vs:jobs:{id}`, `vs:jobs24`
  - Foundry voices: `vf:voices`, `vf:voice:{id}`
  - Deployments: `vf:deps`, `vf:dep:{id}`
  - Packs: `vf:packs`, `vf:pack:{id}`
- **File Storage:** `apps/api/audio-cache/` for rendered audio
- **Services:**
  - `voice/voice.module.ts` (unified)
  - `voiceStudio/voiceStudio.service.ts` (legacy)
  - `voiceStudio/voice.service.ts` (legacy)
  - `voiceFoundry/voiceFoundry.service.ts` (legacy)
- **Routes:** `apps/api/src/http/routes/voice.ts` (unified), `voiceStudio.ts` (legacy), `voiceFoundry.ts` (legacy)
- **Shared:** `packages/shared/src/voice.ts` (unified types)
- **Frontend:** `apps/web/src/lib/voice.ts`

### STATUS
🟡 **MERGED** — Unified voice module created, legacy routes still available

---

## MODULE: VOICE_OWNERSHIP (S44)

### PURPOSE
Voice consent, identity verification, voice audit, consent policies.

### WHAT BELONGS INSIDE
- Voice owner registry
- Voice onboarding (consent recording)
- Voice consent records (per voice, per owner)
- Voice identity verification
- Consent audit log
- Policy management
- Consent check API
- Notes

### WHAT DOES NOT BELONG
- ❌ Voice synthesis → belongs to `voice`
- ❌ Voice creation → belongs to `voice`
- ❌ General security incidents → belongs to `security`

### DEPENDENCIES
- `voice` (for voice references)
- `security` (for incident reporting)

### INTEGRATIONS
None

### AI AGENTS
None

### DATABASE/SERVICES
- **PostgreSQL:** Voice owners, consent records, policies, audit
- **Services:** `voiceOwnership/voiceOwnership.service.ts`
- **Routes:** `apps/api/src/http/routes/voiceOwnership.ts`
- **Shared:** `packages/shared/src/voiceOwnership.ts` (56 LOC)

### STATUS
🟢 **COMPLETE** — Voice consent working, consent records, audit, policies

---

## MODULE: WAKE_INTEL

### PURPOSE
Wake-word detection, clap patterns, MFA policies for wake/auth, emergency triggers, workforce bindings.

### WHAT BELONGS INSIDE
- Wake-word config (activate, list activations)
- Clap patterns (CRUD, detect, detections)
- MFA policies (for wake-word auth)
- Device management (CRUD)
- Context recommendations
- Emergency config/contacts/trigger/events
- Workforce bindings (CRUD)
- Notes

### WHAT DOES NOT BELONG
- ❌ Voice synthesis → belongs to `voice`
- ❌ Voice consent → belongs to `voiceOwnership`
- ❌ General MFA enrollment → belongs to `mfa`
- ❌ General security → belongs to `security`

### DEPENDENCIES
- `mfa` (for MFA policy enforcement)
- `voice` (for voice context)
- `voiceOwnership` (for voice consent)

### INTEGRATIONS
None

### AI AGENTS
Wake-word detection agents

### DATABASE/SERVICES
- **PostgreSQL:** Configs, activations, patterns, devices, contacts, bindings
- **Redis:** Real-time detection state
- **Services:** `wakeIntel/wakeIntelligence.service.ts`
- **Routes:** `apps/api/src/http/routes/wakeIntel.ts`
- **Shared:** `packages/shared/src/wakeIntel.ts` (199 LOC)
- **Frontend:** `apps/web/src/lib/wakeIntel.ts`

### STATUS
🟢 **COMPLETE** — Wake-word intelligence working, clap detection, MFA policies, emergency

---

## MODULE: MEDIA_GEN (S42)

### PURPOSE
Image/text-to-image generation, generation jobs.

### WHAT BELONGS INSIDE
- Capabilities list
- Generation jobs (CRUD, cancel)
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Video rendering → belongs to `mediaFactory`
- ❌ Voice synthesis → belongs to `voice`
- ❌ Music generation → belongs to `musicGen`
- ❌ Website building → belongs to `websiteBuilder`

### DEPENDENCIES
- `mediaFactory` (for unified media job tracking)

### INTEGRATIONS
- AI image generation providers (future)

### AI AGENTS
Image generation agents

### DATABASE/SERVICES
- **PostgreSQL:** Generation jobs, capabilities
- **Redis:** Job queue
- **Services:** `mediaGen/mediaGen.service.ts`
- **Routes:** `apps/api/src/http/routes/mediaGen.ts`
- **Shared:** `packages/shared/src/mediaGen.ts` (44 LOC)
- **Frontend:** `apps/web/src/lib/mediaGen.ts`

### STATUS
🟢 **COMPLETE** — Media generation working, image generation jobs

---

## MODULE: MEDIA_FACTORY (S77b)

### PURPOSE
Video rendering, character/course management, publishing coordination, usage metering.

### WHAT BELONGS INSIDE

**Video Pipeline:**
- Pipeline status
- Render jobs (CRUD, status, detections, findings, acknowledge)

**Characters & Courses:**
- Character library (CRUD, seeded: Professor Nova, Ada, etc.)
- Course library (CRUD, seeded templates)

**Metering:**
- Usage estimation (render, publish)
- Usage summary
- Usage records

**Publishing:**
- Platform connections (OAuth start, callback, disconnect)
- Platform status (6 platforms: YT, TikTok, IG, FB, X, Pinterest)
- Publish jobs (CRUD, retry, cancel)
- Publish audit
- Upload management (CRUD)
- Webhook registration

**Safety:**
- Child-safety gate (reject unsafe prompts)
- Safety reason codes

**Notes**

### WHAT DOES NOT BELONG
- ❌ Image generation → belongs to `mediaGen`
- ❌ Voice synthesis → belongs to `voice`
- ❌ Music/video generation → belongs to `musicVideo`
- ❌ Website building → belongs to `websiteBuilder`
- ❌ Social posts → belongs to `socialPlatform`

### DEPENDENCIES
- `mediaGen` (for image assets)
- `voice` (for voiceovers)
- `billing` (for usage-based billing)

### INTEGRATIONS
- FFmpeg (video rendering, required)
- YouTube API
- TikTok API
- Instagram API
- Facebook API
- X/Twitter API
- Pinterest API

### AI AGENTS
Content generation agents, character animation agents (future)

### DATABASE/SERVICES
- **PostgreSQL:** Characters, courses, pipeline jobs, publish jobs, uploads, webhooks
- **Redis:** 
  - Job queue: `mg:tenant:{org}:jobs`, `mg:job:{id}`, `mg:tenant:{org}:pending`
  - Metering: `media:usage:{org}`, `media:job:{id}`
  - Tenant quotas: 200/hour default, concurrency cap 4
- **File Storage:** `apps/api/renders/` for rendered videos
- **Services:**
  - `mediaFactory/mediaFactory.service.ts`
  - `mediaFactory/pipeline.service.ts`
  - `mediaFactory/publishing.service.ts`
  - `mediaFactory/metering.service.ts`
- **Routes:** `apps/api/src/http/routes/mediaFactory.ts` (35 endpoints)
- **Shared:** `packages/shared/src/mediaFactory.ts` (246 LOC)
- **Frontend:** `apps/web/src/lib/mediaFactory.ts`, `apps/web/src/pages/media/`

### STATUS
🟢 **COMPLETE** — Full media factory working, video rendering, characters, courses, publishing

---

## MODULE: MUSIC_GEN

### PURPOSE
Music track generation, rendering, management, favorites, tags.

### WHAT BELONGS INSIDE
- Music capabilities
- Track management (CRUD, render, favorite, tags, play, regenerate)
- Audio file serving
- Notes

### WHAT DOES NOT BELONG
- ❌ Voice synthesis → belongs to `voice`
- ❌ Video generation → belongs to `musicVideo`
- ❌ Image generation → belongs to `mediaGen`
- ❌ Video rendering → belongs to `mediaFactory`

### DEPENDENCIES
- `musicVideo` (for music video creation from tracks)

### INTEGRATIONS
- AWS (audio storage)
- FFmpeg (audio processing)

### AI AGENTS
Music generation agents

### DATABASE/SERVICES
- **PostgreSQL:** Tracks, tags, favorites
- **File Storage:** Audio files
- **Services:** `musicGen/musicGen.service.ts`, `musicGen/musicEngine.ts`
- **Routes:** `apps/api/src/http/routes/musicGen.ts`
- **Shared:** `packages/shared/src/musicGen.ts` (97 LOC)
- **Frontend:** `apps/web/src/lib/musicGen.ts`

### STATUS
🟢 **COMPLETE** — Music generation working, track management, rendering

---

## MODULE: MUSIC_VIDEO

### PURPOSE
Music video generation from audio tracks, storyboard, audio analysis.

### WHAT BELONGS INSIDE
- Video job management (CRUD, run, cancel)
- Audio upload (by kind)
- Video agents (heartbeat, run)
- Video file serving
- Notes

### WHAT DOES NOT BELONG
- ❌ Music track generation → belongs to `musicGen`
- ❌ General video rendering → belongs to `mediaFactory`
- ❌ Audio analysis → here, but shared with musicGen

### DEPENDENCIES
- `musicGen` (for source tracks)
- `mediaFactory` (for FFmpeg pipeline)

### INTEGRATIONS
- AWS (storage)
- FFmpeg (video rendering)

### AI AGENTS
Video generation agents

### DATABASE/SERVICES
- **PostgreSQL:** Video jobs, uploads
- **File Storage:** Video files
- **Services:** `musicVideo/musicVideo.service.ts`, `musicVideo/storyboard.ts`, `musicVideo/audioAnalysis.ts`
- **Routes:** `apps/api/src/http/routes/musicVideo.ts`
- **Shared:** `packages/shared/src/musicVideo.ts` (293 LOC)
- **Frontend:** `apps/web/src/lib/musicVideo.ts`

### STATUS
🟢 **COMPLETE** — Music video working, job management, rendering

---

## MODULE: WEBSITE_BUILDER (S93)

### PURPOSE
Website creation, page management, block editing, AI copy, publishing.

### WHAT BELONGS INSIDE
- AI copy generation
- Site management (CRUD, publish, archive, detail)
- Page management (CRUD, publish, preview)
- Block management (CRUD, reorder)
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Video content → belongs to `mediaFactory`
- ❌ Social posts → belongs to `socialPlatform`
- ❌ E-commerce storefront → would belong to `commerce` (🟣 NOT YET CREATED)
- ❌ Blog → would be separate or part of website builder

### DEPENDENCIES
- `mediaFactory` (for media assets in sites)

### INTEGRATIONS
None (static site generation)

### AI AGENTS
Copywriting agents

### DATABASE/SERVICES
- **PostgreSQL:** Sites, pages, blocks, publish snapshots
- **Services:** `websiteBuilder/websiteBuilder.service.ts`, `websiteBuilder/renderer.ts`
- **Routes:** `apps/api/src/http/routes/websiteBuilder.ts`
- **Shared:** `packages/shared/src/websiteBuilder.ts` (202 LOC)
- **Frontend:** `apps/web/src/lib/websiteBuilder.ts`, `apps/web/src/pages/website-builder/`

### STATUS
🟢 **COMPLETE** — Full website builder working, sites, pages, blocks, publishing

---

## MODULE: SOCIAL_PLATFORM (S94)

### PURPOSE
Social feed, posts, comments, reactions, hashtag extraction, engagement computation.

### WHAT BELONGS INSIDE
- Feed (computed engagement)
- Hashtag management
- Post management (CRUD, publish, archive)
- Comment management (CRUD, delete)
- Reaction management (add, list)
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Messaging/chat → belongs to `conversations`
- ❌ Voice channels → belongs to `talk`
- ❌ Website content → belongs to `websiteBuilder`
- ❌ Marketing campaigns → belongs to `marketing`

### DEPENDENCIES
None

### INTEGRATIONS
None

### AI AGENTS
Content moderation agents, hashtag suggestion agents

### DATABASE/SERVICES
- **PostgreSQL:** Feed, posts, comments, reactions, hashtags
- **Services:** `socialPlatform/socialPlatform.service.ts`
- **Routes:** `apps/api/src/http/routes/socialPlatform.ts`
- **Shared:** `packages/shared/src/socialPlatform.ts` (120 LOC)
- **Frontend:** `apps/web/src/lib/socialPlatform.ts`, `apps/web/src/pages/social-platform/`

### STATUS
🟢 **COMPLETE** — Full social platform working, feed, posts, comments, reactions

---

## SUMMARY: VOICE & MEDIA LAYER

| Module | Status | Purpose | Key Integrations |
|--------|--------|---------|-----------------|
| `voice` (🟡 MERGED) | 🟡 MERGED | Voice synthesis, creation, deployment | ElevenLabs, Play.ht, Browser |
| `voiceOwnership` (S44) | 🟢 COMPLETE | Voice consent, identity, audit | — |
| `wakeIntel` | 🟢 COMPLETE | Wake-word, clap, MFA, emergency | — |
| `mediaGen` (S42) | 🟢 COMPLETE | Image generation | AI image providers |
| `mediaFactory` (S77b) | 🟢 COMPLETE | Video rendering, characters, courses, publishing | FFmpeg, YouTube, TikTok, etc. |
| `musicGen` | 🟢 COMPLETE | Music track generation | AWS, FFmpeg |
| `musicVideo` | 🟢 COMPLETE | Music video generation | AWS, FFmpeg |
| `websiteBuilder` (S93) | 🟢 COMPLETE | Website creation, pages, blocks | — |
| `socialPlatform` (S94) | 🟢 COMPLETE | Social feed, posts, comments, reactions | — |

---

**END OF VOICE & MEDIA MODULE DOCUMENTATION**
