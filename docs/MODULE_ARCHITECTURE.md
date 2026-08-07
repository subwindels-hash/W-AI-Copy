# WINDELS AI OS — MASTER MODULE ARCHITECTURE

**Version:** 4.0 (Consolidated)  
**Status:** AUTHORITATIVE — Single source of truth for module boundaries  
**Last Updated:** 2026-08-07  
**Supersedes:** All previous module documentation  

---

## EXECUTIVE SUMMARY

This document defines the **corrected module architecture** for WINDELS AI OS after a comprehensive consistency audit. It resolves:
- 🔴 Mixed-up responsibilities across 6 module pairs
- 🔵 Duplicate features in 5 areas
- 🟡 Ambiguous boundaries in 10 areas
- 🟣 5 missing capabilities now defined

**Key Principles:**
1. **Single Ownership** — Every capability belongs to exactly one module
2. **Clear Boundaries** — Modules communicate via APIs, not shared database joins
3. **No Duplication** — Shared patterns (notes, dashboards) extracted to libraries
4. **AI OS vs AI Employee** — OS orchestrates; agents execute

---

## MODULE ARCHITECTURE MATRIX

### FORMAT: MODULE → PURPOSE → WHAT BELONGS → WHAT DOESN'T → DEPS → INTEGRATIONS → AGENTS → DB/SERVICES → STATUS

---

## CORE PLATFORM LAYER

### AUTH MODULE
**PURPOSE:** Identity authentication, JWT issuance, session management

**WHAT BELONGS INSIDE:**
- User registration (email/password)
- Login/logout flows
- JWT token issuance (access + refresh)
- Password hashing (bcrypt)
- Email verification (when SMTP configured)
- Password reset flow
- `/auth/me` self-service endpoint
- Profile management (basic)

**WHAT DOES NOT BELONG:**
- ❌ MFA/TOTP logic (belongs to `mfa` module)
- ❌ OAuth flows (belongs to `auth` OAuth submodule or separate `sso`)
- ❌ Organization/create workspace (belongs to `enterpriseFoundation`)
- ❌ Role/Permission checks (belongs to `permissions` service)

**DEPENDENCIES:**
- `permissions` (for role assignment on registration)
- `enterpriseFoundation` (for org/workspace creation)

**INTEGRATIONS:**
- Google OAuth (optional, via `auth` OAuth submodule)
- SMTP (optional, for email verification)

**AI AGENTS:** None (infrastructure service)

**DATABASE/SERVICES:**
- PostgreSQL: `User`, `UserProfile` tables
- Redis: Session tokens, rate limit counters
- Services: `auth.service.ts`, `passwords.ts`

**STATUS:** 🟢 COMPLETE — Core auth flows working

---

### MFA MODULE (S116)
**PURPOSE:** Multi-factor authentication, TOTP, assurance policies

**WHAT BELONGS INSIDE:**
- TOTP enrollment/enable
- TOTP verification/challenge
- Recovery codes (generate, use)
- MFA policies (org-level enforcement)
- Assurance summary/gaps reporting
- Coverage reporting
- Enrollment lifecycle (abandon path)
- Locks/throttle management
- Exemptions management
- MFA event audit log

**WHAT DOES NOT BELONG:**
- ❌ Password authentication (belongs to `auth`)
- ❌ OAuth flows (belongs to `auth`)
- ❌ General security incidents (belongs to `security`)

**DEPENDENCIES:**
- `auth` (for user identity)
- `security` (for incident reporting)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: MFA enrollments, recovery codes, policies, events
- Redis: TOTP secrets (encrypted), throttle counters, session challenges
- Services: `mfa.service.ts`, `mfaAssurance.service.ts`

**STATUS:** 🟢 COMPLETE — TOTP working, policies enforced

---

### KERNEL MODULE (S39)
**PURPOSE:** AI provider registry, event bus dispatch, prompt guard

**WHAT BELONGS INSIDE:**
- AI provider registry (OpenAI, Ollama, Echo fallback)
- Provider credential management
- Model selection/resolution
- Prompt injection scanning (`scanPrompt`)
- Event bus dispatch to subscribers
- AI request logging (token usage, cost)
- Failover logic between providers
- `AI_REQUIRE_REAL_MODEL` enforcement

**WHAT DOES NOT BELONG:**
- ❌ Agent lifecycle (belongs to `agents`)
- ❌ Agent communication (belongs to `agentComm`)
- ❌ Provider market/registry UI (belongs to `aiEcosystem`)
- ❌ Trust/explainability scoring (belongs to `aiEcosystem`)

**DEPENDENCIES:**
- None ( foundational service)

**INTEGRATIONS:**
- OpenAI API (optional)
- Anthropic API (optional)
- Ollama (optional, local)

**AI AGENTS:** None (provides AI to agents)

**DATABASE/SERVICES:**
- Redis: Event bus (Pub/Sub), request tracking
- Services: `services/ai/registry.ts`, `kernel.service.ts`

**STATUS:** 🟢 COMPLETE — Provider registry working

---

### SECURITY MODULE
**PURPOSE:** Security posture, incidents, encryption, PII redaction, rate limiting

**WHAT BELONGS INSIDE:**
- Security scorecard
- Self-test diagnostics
- Prompt guard scan endpoint
- Password strength checker
- Breaker management (rate limit breakers)
- Rate limit status
- Security events log
- Encryption key status/rotation
- Incident reporting (create, update, list)
- Access reviews (run, latest)
- PII redaction service
- AES-256-GCM encryption utilities
- CSRF protection

**WHAT DOES NOT BELONG:**
- ❌ MFA enrollment (belongs to `mfa`)
- ❌ General audit logs (would belong to centralized `audit` service)
- ❌ Infrastructure alerts (belongs to `infrastructure`)
- ❌ OpEx safety alerts (belongs to `opex`)

**DEPENDENCIES:**
- `mfa` (for MFA-related security events)
- `audit` (🟣 PLANNED: centralized audit logging)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Incidents, access review results
- Redis: Rate limit windows, breaker state
- Services: `security/*`, `services/permissions.service.ts`

**STATUS:** 🟢 COMPLETE — Core security services working

---

### PERMISSIONS MODULE (🟣 NEW — EXTRACT)
**PURPOSE:** Centralized RBAC, permission checks, role management

**WHAT BELONGS INSIDE:**
- Permission definitions
- Role-permission mappings
- `hasPermission(user, permission)` check
- Role assignment (user-level, org-level)
- Permission inheritance rules
- Admin console for role management

**WHAT DOES NOT BELONG:**
- ❌ Authentication (belongs to `auth`)
- ❌ Org scoping (belongs to `tenantIsolation`)
- ❌ API key scoping (belongs to `apikey`)

**DEPENDENCIES:**
- `auth` (for user identity)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Roles, permissions, role_memberships
- Services: `services/permissions.service.ts` (existing, formalize as module)

**STATUS:** 🟡 PARTIAL — Permission checks exist, formalize as module

---

### AUDIT MODULE (🟣 NEW — CREATE)
**PURPOSE:** Centralized audit logging across all modules

**WHAT BELONGS INSIDE:**
- Audit event ingestion (from all modules)
- Audit event query/filter
- Audit retention policies
- Export audit trails
- Compliance reporting

**WHAT DOES NOT BELONG:**
- ❌ Security incidents (belongs to `security`)
- ❌ MFA events (belongs to `mfa` — but mirrored to audit)

**DEPENDENCIES:** None (foundational)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: `AuditLog` table (existing, formalize)
- Services: `audit.service.ts` (🟣 NEW)

**STATUS:** 🟣 MISSING — Create centralized audit service

---

### NOTIFICATIONS MODULE (🟣 NEW — CREATE)
**PURPOSE:** Multi-channel notification delivery (email, push, in-app, SMS)

**WHAT BELONGS INSIDE:**
- Notification preferences per user
- Channel adapters (email, push, in-app, SMS)
- Notification templates
- Delivery tracking
- Notification center UI API

**WHAT DOES NOT BELONG:**
- ❌ Chat messages (belongs to `conversations`)
- ❌ Voice messages (belongs to `talk`)
- ❌ Billing invoices (belongs to `billing` — but can trigger notifications)

**DEPENDENCIES:**
- `mobile` (for push notifications)
- `auth` (for user preferences)

**INTEGRATIONS:**
- Email SMTP
- Push notification services (FCM, APNS)
- SMS providers (Twilio, etc.)

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: `Notification`, `NotificationPreference` tables
- Redis: Delivery queues
- Services: `notifications.service.ts` (🟣 NEW)

**STATUS:** 🟣 MISSING — Create unified notification service

---

## INFRASTRUCTURE & PLATFORM LAYER

### PLATFORM MODULE
**PURPOSE:** Platform administration UI, regions, CDN, DR coordination

**WHAT BELONGS INSIDE:**
- Platform metrics overview
- Log access (admin)
- Trace access (admin)
- AI observability dashboard
- Region management
- DR status
- Failover control
- CDN configuration
- CDN purge
- Signed URL generation
- Platform overview (health)

**WHAT DOES NOT BELONG:**
- ❌ Infrastructure monitoring (belongs to `infrastructure`)
- ❌ Engineering metrics (belongs to `engineering`)
- ❌ Release pipeline (belongs to `releases`)

**DEPENDENCIES:**
- `infrastructure` (for infra data)
- `releases` (for release status)

**INTEGRATIONS:**
- AWS/GCP/Azure (cloud provider APIs)

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Platform config
- Redis: Real-time platform state
- Services: `platform/cluster.service.ts`, `services/regions.service.ts`, `services/cdn.service.ts`

**STATUS:** 🟢 COMPLETE — Platform admin working

---

### INFRASTRUCTURE MODULE
**PURPOSE:** Infrastructure monitoring, cluster health, node/pod status

**WHAT BELONGS INSIDE:**
- Infrastructure overview
- Cluster status
- Health probes
- Node list/status
- Workload list
- Pod list
- Metrics time series
- Infrastructure alerts
- IaC stack management
- IaC drift detection
- Release deployment (infrastructure releases)
- Environment management (staging/prod)
- Canary deployment (infrastructure)
- Region management (infrastructure level)

**WHAT DOES NOT BELONG:**
- ❌ Platform admin UI (belongs to `platform`)
- ❌ Engineering team metrics (belongs to `engineering`)
- ❌ Application-level monitoring (belongs to `usage`/`engineering`)

**DEPENDENCIES:**
- `platform` (for platform-level coordination)

**INTEGRATIONS:**
- Kubernetes API
- Cloud provider APIs

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: IaC stacks, release records
- Redis: Real-time metrics cache
- Services: `platform/cluster.service.ts`, `platform/infraMetrics.service.ts`, `platform/iac.service.ts`, `platform/release.service.ts`, `platform/region.service.ts`, `platform/optimization.service.ts`

**STATUS:** 🟢 COMPLETE — Infrastructure monitoring working

---

### ENGINEERING MODULE (S26)
**PURPOSE:** Engineering team observability, deployments, tech debt, productivity

**WHAT BELONGS INSIDE:**
- Service metrics (per-service)
- Metrics time series
- Deployment tracking
- Deployment analytics (DORA)
- Tech debt tracking
- Tech debt summary
- Pipeline recording
- Pipeline analytics
- Developer productivity metrics
- Productivity summary
- Engineering dashboard

**WHAT DOES NOT BELONG:**
- ❌ Infrastructure monitoring (belongs to `infrastructure`)
- ❌ Platform admin (belongs to `platform`)
- ❌ QA test runs (belongs to `qa`)

**DEPENDENCIES:**
- `infrastructure` (for infra metrics)
- `qa` (for test metrics)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Engineering metrics, deployments, tech debt
- Services: `engineering/metrics.service.ts`, `engineering/deployments.service.ts`, `engineering/techDebt.service.ts`, `engineering/pipeline.service.ts`, `engineering/productivity.service.ts`

**STATUS:** 🟢 COMPLETE — Engineering metrics working

---

### RELEASES MODULE
**PURPOSE:** Release pipeline, environment management, canary deployments

**WHAT BELONGS INSIDE:**
- Release CRUD
- Release metrics
- DORA metrics
- Environment management
- Canary deployment
- Staging lifecycle
- Production promotion
- Rollback tracking

**WHAT DOES NOT BELONG:**
- ❌ Infrastructure canary (belongs to `infrastructure`)
- ❌ Model canary (belongs to `hybridExec` or `training`)

**DEPENDENCIES:**
- `infrastructure` (for infra releases)
- `hybridExec` (for model releases)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Releases, rollback records
- Redis: Canary metrics (simulated)
- Services: `release/pipeline.service.ts`, `release/approval.service.ts`, `release/staging.service.ts`, `release/production.service.ts`, `release/improvement.service.ts`

**STATUS:** 🟢 COMPLETE — Release pipeline working

---

### DISASTER_RECOVERY MODULE (S53)
**PURPOSE:** BCP, DR drills, failover testing, emergency procedures

**WHAT BELONGS INSIDE:**
- DR status dashboard
- DR events log
- DR drills management
- Failover execution
- Drill execution/result
- Emergency procedures
- BCP documentation

**WHAT DOES NOT BELONG:**
- ❌ Platform failover (belongs to `platform`)
- ❌ Infrastructure failover (belongs to `infrastructure`)

**DEPENDENCIES:**
- `platform` (for platform failover)
- `infrastructure` (for infra failover)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: DR events, drill records
- Services: `disasterRecovery/disasterRecovery.service.ts`

**STATUS:** 🟢 COMPLETE — DR management working

---

### UPDATES MODULE (S54)
**PURPOSE:** OTA updates, package management, update channels

**WHAT BELONGS INSIDE:**
- Package list
- Update check
- Package validation
- Package approval
- Package deployment
- Package rollback
- Update channels

**WHAT DOES NOT BELONG:**
- ❌ Release pipeline (belongs to `releases`)
- ❌ SDK packages (belongs to `sdk`)

**DEPENDENCIES:**
- `releases` (for deployment coordination)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Package records
- Services: `updates/updates.service.ts`

**STATUS:** 🟢 COMPLETE — Updates management working

---

### LICENSING MODULE (S51)
**PURPOSE:** License asset management, grants, usage tracking

**WHAT BELONGS INSIDE:**
- License assets
- Grants management
- Usage recording
- Dashboard rollup

**WHAT DOES NOT BELONG:**
- ❌ Billing/subscriptions (belongs to `billing`)
- ❌ Feature flags (belongs to `platformServices`)

**DEPENDENCIES:**
- `billing` (for license-based billing)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Licenses, grants, usage
- Services: `licensing/licensing.service.ts`

**STATUS:** 🟢 COMPLETE — Licensing working

---

## AI PLATFORM LAYER (Unified)

### AI_PLATFORM MODULE (🟡 MERGED: kernel + aiEcosystem provider abstractions)
**PURPOSE:** Unified AI provider management, model registry, routing, personalities

**WHAT BELONGS INSIDE:**
- Provider management (CRUD, status, health)
- Model registry (models, versions)
- Routing policies
- Provider health monitoring
- Benchmark management
- Personality/persona management
- Voice persona mapping
- Avatar management
- Trust/explainability reports
- Trust scores
- Trust compliance

**WHAT DOES NOT BELONG:**
- ❌ Agent lifecycle (belongs to `agents`)
- ❌ Agent communication (belongs to `agentComm`)
- ❌ AI request logging (belongs to `kernel`)
- ❌ GPU capacity/econ (belongs to `aiEconomy`)

**DEPENDENCIES:**
- `kernel` (for provider registry, request routing)
- `agents` (for agent model selection)

**INTEGRATIONS:**
- OpenAI
- Anthropic
- Azure AI
- Google AI

**AI AGENTS:** None (manages AI for agents)

**DATABASE/SERVICES:**
- PostgreSQL: Providers, models, routing_policies, personalities, trust_reports
- Redis: Provider health cache
- Services: `aiEcosystem/providerAbstraction.service.ts`, `aiEcosystem/personalityStudio.service.ts`, `aiEcosystem/trustExplainability.service.ts`

**STATUS:** 🟡 NEEDS MERGE — Extract provider abstraction from aiEcosystem, integrate with kernel

---

### AGENTS MODULE (S7-8)
**PURPOSE:** AI agent framework, lifecycle, skills, registration

**WHAT BELONGS INSIDE:**
- Agent CRUD
- Agent lifecycle management
- Agent skills (CRUD, assign)
- Agent events log
- Agent metadata/models
- Agent heartbeat

**WHAT DOES NOT BELONG:**
- ❌ Agent-to-agent communication (belongs to `agentComm`)
- ❌ Agent memory (belongs to `agentMemory`)
- ❌ Agent execution runtime (belongs to `kernel` AI runtime)
- ❌ Professional workforce agents (belongs to `expertsPlatform`)

**DEPENDENCIES:**
- `kernel` (for AI execution)
- `agentMemory` (🟡 NEW: for memory)
- `agentComm` (for communication)

**INTEGRATIONS:** None

**AI AGENTS:** This module manages AI agents; doesn't contain agents itself

**DATABASE/SERVICES:**
- PostgreSQL: `Agent`, `AgentEvent`, `AgentSkill` tables
- Redis: Agent state, lifecycle
- Services: `agents/agents.service.ts`, `services/agentLifecycle.service.ts`, `services/agentSkills.service.ts`

**STATUS:** 🟢 COMPLETE — Agent framework working

---

### AGENT_COMM MODULE
**PURPOSE:** Agent-to-agent communication, teams, handoffs, reasoning, feedback

**WHAT BELONGS INSIDE:**
- Agent identities (CRUD, lifecycle, capabilities, credentials)
- Agent messaging (inbox, outbox, history)
- Agent teams (CRUD, members)
- Handoffs (initiate, respond, complete)
- Reasoning chains (CRUD, evidence, steps, conclude, critique)
- Feedback (give, receive, metrics)
- Communication policies
- Escalations (evaluate, decide, acknowledge)
- Communication stats

**WHAT DOES NOT BELONG:**
- ❌ Agent memory storage (belongs to `agentMemory`)
- ❌ Agent knowledge storage (belongs to `agentMemory` or `identityKnowledge`)
- ❌ Agent execution (belongs to `kernel` + `agents`)

**DEPENDENCIES:**
- `agents` (for agent identity)
- `agentMemory` (🟡 NEW: for memory/knowledge access)

**INTEGRATIONS:** None

**AI AGENTS:** None (facilitates agent communication)

**DATABASE/SERVICES:**
- PostgreSQL: Agent identities, messages, teams, handoffs, reasoning, feedback, policies, escalations
- Redis: Real-time comm channels
- Services: `enterprise/agentComm/*`, `services/agentMemory.service.ts`, `services/agentKnowledge.service.ts`

**STATUS:** 🟢 COMPLETE — Agent communication working

---

### AGENT_MEMORY MODULE (🟡 EXTRACT from agentComm + dataMarketplace)
**PURPOSE:** Centralized agent memory and knowledge management

**WHAT BELONGS INSIDE:**
- Agent memory CRUD
- Agent knowledge CRUD
- Memory consolidation
- Memory sharing
- Knowledge graph relations
- Memory fabric sync
- Context retrieval

**WHAT DOES NOT BELONG:**
- ❌ Communication messages (belongs to `agentComm`)
- ❌ Identity knowledge (belongs to `identityKnowledge`)
- ❌ World model entities (belongs to `cognitive`)

**DEPENDENCIES:**
- `agents` (for agent identity)
- `cognitive` (for world model integration)

**INTEGRATIONS:** None

**AI AGENTS:** None (provides memory to agents)

**DATABASE/SERVICES:**
- PostgreSQL: `AgentMemory`, `AgentKnowledge` tables
- Redis: Memory cache, vector indices
- Services: `services/agentMemory.service.ts`, `services/agentKnowledge.service.ts` (formalize as module)

**STATUS:** 🟡 NEEDS EXTRACTION — Currently split across agentComm and dataMarketplace

---

### AI_ECONOMY MODULE (S71)
**PURPOSE:** GPU capacity ledger, usage tracking, allocations, offers, economics

**WHAT BELONGS INSIDE:**
- Usage tracking (CRUD)
- Allocations (CRUD)
- Offers (CRUD)
- Dashboard rollup
- Usage analytics

**WHAT DOES NOT BELONG:**
- ❌ AI provider management (belongs to `aiPlatform`)
- ❌ Agent execution (belongs to `kernel`)
- ❌ Billing/invoicing (belongs to `billing`)

**DEPENDENCIES:**
- `billing` (for economic settlement)
- `kernel` (for usage data)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Usage, allocations, offers
- Redis: Real-time usage counters
- Services: `aiEconomy/aiEconomy.service.ts`

**STATUS:** 🟢 COMPLETE — AI economy ledger working

---

### EXPERTS_PLATFORM MODULE (S77a)
**PURPOSE:** Professional workforce AI agents, expert courses, packages

**WHAT BELONGS INSIDE:**
- Expert agents (registry, query)
- Expert courses
- Expert packages
- Dashboard rollup

**WHAT DOES NOT BELONG:**
- ❌ Core agent framework (belongs to `agents`)
- ❌ Agent communication (belongs to `agentComm`)
- ❌ General AI providers (belongs to `aiPlatform`)

**DEPENDENCIES:**
- `agents` (for agent execution)
- `aiPlatform` (for model selection)

**INTEGRATIONS:**
- OpenAI
- Anthropic

**AI AGENTS:** Expert agents (gov, doctor, engineer, lawyer, etc.)

**DATABASE/SERVICES:**
- PostgreSQL: Expert agent definitions, courses, packages
- Services: `expertsPlatform/expertsPlatform.service.ts`

**STATUS:** 🟢 COMPLETE — Expert platform working

---

### AI_ENGINEERING MODULE (S124)
**PURPOSE:** AI software engineering workforce, GitHub integration, repository intelligence

**WHAT BELONGS INSIDE:**
- Engineering roles
- Repository management (CRUD, team, scan, intel)
- Engineering tasks (CRUD, run, PR)
- Engineering memory (CRUD)
- Command center (engineering-specific)
- GitHub connections (CRUD)
- GitHub repo operations (branches, commits, PRs, issues, milestones, releases, workflows)
- GitHub checks

**WHAT DOES NOT BELONG:**
- ❌ General agent framework (belongs to `agents`)
- ❌ General command center (belongs to `command`)
- ❌ General knowledge management (belongs to `identityKnowledge`)

**DEPENDENCIES:**
- `agents` (for AI engineer agents)
- `command` (for cross-module command center)
- `identityKnowledge` (for engineering knowledge)

**INTEGRATIONS:**
- GitHub API

**AI AGENTS:** 18 specialized AI engineers + orchestrator

**DATABASE/SERVICES:**
- PostgreSQL: Repos, tasks, memory, connections, GitHub data
- Services: `aiEngineering/workforce.service.ts`, `aiEngineering/github.service.ts`, `aiEngineering/repoIntel.service.ts`, `aiEngineering/memory.service.ts`, `aiEngineering/commandCenter.service.ts`

**STATUS:** 🟢 COMPLETE — AI engineering workforce working

---

## VOICE & MEDIA LAYER (Unified Content Creation)

### VOICE MODULE (🟡 MERGED: voiceStudio + voiceFoundry)
**PURPOSE:** Voice synthesis, voice creation, voice deployment

**WHAT BELONGS INSIDE:**

**Voice Studio (Synthesis):**
- Built-in voice registry
- Custom voice management
- Voice cloning (with consent gate)
- Voice settings/presets
- Synthesis jobs
- Audio file serving
- Notes

**Voice Foundry (Creation):**
- Voice generation/design
- Voice evolution
- Voice deployment
- Deployment management
- Voice packs
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Voice consent/ownership (belongs to `voiceOwnership`)
- ❌ Wake-word detection (belongs to `wakeIntel`)
- ❌ Music generation (belongs to `musicGen`)
- ❌ Video generation (belongs to `mediaFactory`)

**DEPENDENCIES:**
- `voiceOwnership` (for consent checks before cloning/deployment)
- `wakeIntel` (for wake-word voice bindings)

**INTEGRATIONS:**
- ElevenLabs (optional)
- Play.ht (optional)
- Browser SpeechSynthesis (default)

**AI AGENTS:** Voice design agents

**DATABASE/SERVICES:**
- PostgreSQL: Voices, presets, deployments, packs
- Redis: Synthesis job queue
- File storage: Audio cache
- Services: `voiceStudio/voiceStudio.service.ts`, `voiceStudio/voice.service.ts`, `voiceFoundry/voiceFoundry.service.ts`

**STATUS:** 🟡 NEEDS MERGE — Combine voiceStudio + voiceFoundry under unified voice module

---

### VOICE_OWNERSHIP MODULE (S44)
**PURPOSE:** Voice consent, identity verification, voice audit

**WHAT BELONGS INSIDE:**
- Voice owner registry
- Voice onboarding (consent)
- Voice consent records (per voice)
- Voice identity verification
- Consent audit log
- Policy management
- Consent check API
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Voice synthesis (belongs to `voice`)
- ❌ Voice creation (belongs to `voice`)
- ❌ General security incidents (belongs to `security`)

**DEPENDENCIES:**
- `voice` (for voice references)
- `security` (for incident reporting)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Voice owners, consent records, policies, audit
- Services: `voiceOwnership/voiceOwnership.service.ts`

**STATUS:** 🟢 COMPLETE — Voice consent working

---

### WAKE_INTEL MODULE
**PURPOSE:** Wake-word detection, clap patterns, MFA policies, emergency triggers

**WHAT BELONGS INSIDE:**
- Wake-word config
- Wake-word activation (CRUD)
- Clap patterns (CRUD, detect, detections)
- MFA policies (for wake/auth)
- Device management (CRUD)
- Context recommendations
- Emergency config/contacts/trigger/events
- Workforce bindings
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Voice synthesis (belongs to `voice`)
- ❌ Voice consent (belongs to `voiceOwnership`)
- ❌ General MFA enrollment (belongs to `mfa`)

**DEPENDENCIES:**
- `mfa` (for MFA policy enforcement)
- `voice` (for voice context)
- `voiceOwnership` (for voice consent)

**INTEGRATIONS:** None

**AI AGENTS:** Wake-word detection agents

**DATABASE/SERVICES:**
- PostgreSQL: Configs, activations, patterns, devices, contacts, bindings
- Redis: Real-time detection state
- Services: `wakeIntel/wakeIntelligence.service.ts`

**STATUS:** 🟢 COMPLETE — Wake-word intelligence working

---

### MEDIA_GEN MODULE (S42)
**PURPOSE:** Image/text-to-image generation

**WHAT BELONGS INSIDE:**
- Capabilities list
- Generation jobs (CRUD, cancel)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Video rendering (belongs to `mediaFactory`)
- ❌ Voice synthesis (belongs to `voice`)
- ❌ Music generation (belongs to `musicGen`)

**DEPENDENCIES:**
- `mediaFactory` (for unified media job tracking)

**INTEGRATIONS:**
- AI image generation providers

**AI AGENTS:** Image generation agents

**DATABASE/SERVICES:**
- PostgreSQL: Generation jobs, capabilities
- Redis: Job queue
- Services: `mediaGen/mediaGen.service.ts`

**STATUS:** 🟢 COMPLETE — Media generation working

---

### MEDIA_FACTORY MODULE (S77b)
**PURPOSE:** Video rendering, character/course management, publishing coordination

**WHAT BELONGS INSIDE:**

**Video Pipeline:**
- Pipeline status
- Render jobs (CRUD, status, detections, findings)
- Render job acknowledge

**Characters & Courses:**
- Character library (CRUD)
- Course library (CRUD)

**Metering:**
- Usage estimation (render, publish)
- Usage summary
- Usage records

**Publishing (kept in mediaFactory for now, see note):**
- Platform connections (OAuth start, callback, disconnect)
- Platform status
- Publish jobs (CRUD, retry, cancel)
- Publish audit
- Upload management (CRUD)
- Webhook registration

**Notes**

**WHAT DOES NOT BELONG:**
- ❌ Image generation (belongs to `mediaGen`)
- ❌ Voice synthesis (belongs to `voice`)
- ❌ Music/video generation (belongs to `musicVideo`)
- ❌ Website building (belongs to `websiteBuilder`)

**NOTE:** Publishing adapters should eventually move to a separate `publishing` module, but kept here for now due to tight coupling with render jobs.

**DEPENDENCIES:**
- `mediaGen` (for image assets)
- `voice` (for voiceovers)
- `billing` (for usage-based billing)

**INTEGRATIONS:**
- FFmpeg (video rendering)
- YouTube API
- TikTok API
- Instagram API
- Facebook API
- X/Twitter API
- Pinterest API

**AI AGENTS:** Content generation agents

**DATABASE/SERVICES:**
- PostgreSQL: Characters, courses, pipeline jobs, publish jobs, uploads, webhooks
- Redis: Job queue, metering counters, tenant quotas
- File storage: Rendered videos, uploads
- Services: `mediaFactory/mediaFactory.service.ts`, `mediaFactory/pipeline.service.ts`, `mediaFactory/publishing.service.ts`, `mediaFactory/metering.service.ts`

**STATUS:** 🟢 COMPLETE — Media factory working

---

### MUSIC_GEN MODULE
**PURPOSE:** Music track generation, rendering, management

**WHAT BELONGS INSIDE:**
- Music capabilities
- Track management (CRUD, render, favorite, tags, play, regenerate)
- Audio file serving
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Voice synthesis (belongs to `voice`)
- ❌ Video generation (belongs to `musicVideo`)
- ❌ Image generation (belongs to `mediaGen`)

**DEPENDENCIES:**
- `musicVideo` (for music video creation from tracks)

**INTEGRATIONS:**
- AWS (audio storage)
- FFmpeg (audio processing)

**AI AGENTS:** Music generation agents

**DATABASE/SERVICES:**
- PostgreSQL: Tracks, tags, favorites
- File storage: Audio files
- Services: `musicGen/musicGen.service.ts`, `musicGen/musicEngine.ts`

**STATUS:** 🟢 COMPLETE — Music generation working

---

### MUSIC_VIDEO MODULE
**PURPOSE:** Music video generation from audio tracks

**WHAT BELONGS INSIDE:**
- Video job management (CRUD, run, cancel)
- Audio upload (by kind)
- Video agents (heartbeat, run)
- Video file serving
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Music track generation (belongs to `musicGen`)
- ❌ General video rendering (belongs to `mediaFactory`)

**DEPENDENCIES:**
- `musicGen` (for source tracks)
- `mediaFactory` (for FFmpeg pipeline)

**INTEGRATIONS:**
- AWS (storage)
- FFmpeg (video rendering)

**AI AGENTS:** Video generation agents

**DATABASE/SERVICES:**
- PostgreSQL: Video jobs, uploads
- File storage: Video files
- Services: `musicVideo/musicVideo.service.ts`

**STATUS:** 🟢 COMPLETE — Music video working

---

### WEBSITE_BUILDER MODULE (S93)
**PURPOSE:** Website creation, page management, block editing, publishing

**WHAT BELONGS INSIDE:**
- AI copy generation
- Site management (CRUD, publish, archive)
- Site detail
- Page management (CRUD, publish, preview)
- Block management (CRUD, reorder)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Video content (belongs to `mediaFactory`)
- ❌ Social posts (belongs to `socialPlatform`)
- ❌ E-commerce storefront (would belong to `commerce` if created)

**DEPENDENCIES:**
- `mediaFactory` (for media assets in sites)

**INTEGRATIONS:** None (static site generation)

**AI AGENTS:** Copywriting agents

**DATABASE/SERVICES:**
- PostgreSQL: Sites, pages, blocks, publish snapshots
- Services: `websiteBuilder/websiteBuilder.service.ts`, `websiteBuilder/renderer.ts`

**STATUS:** 🟢 COMPLETE — Website builder working

---

### SOCIAL_PLATFORM MODULE (S94)
**PURPOSE:** Social feed, posts, comments, reactions

**WHAT BELONGS INSIDE:**
- Feed (computed engagement)
- Hashtag management
- Post management (CRUD, publish, archive)
- Comment management (CRUD)
- Reaction management
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Messaging/chat (belongs to `conversations`)
- ❌ Voice channels (belongs to `talk`)
- ❌ Website content (belongs to `websiteBuilder`)

**DEPENDENCIES:** None

**INTEGRATIONS:** None

**AI AGENTS:** Content moderation agents

**DATABASE/SERVICES:**
- PostgreSQL: Feed, posts, comments, reactions, hashtags
- Services: `socialPlatform/socialPlatform.service.ts`

**STATUS:** 🟢 COMPLETE — Social platform working

---

## BUSINESS APPLICATIONS LAYER

### CRM MODULE (S90)
**PURPOSE:** Customer relationship management — contacts, companies, deals, activities

**WHAT BELONGS INSIDE:**
- Pipeline stages
- Contacts (CRUD)
- Companies (CRUD)
- Deals (CRUD)
- Activities (CRUD, link to contacts/companies/deals)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Lead management (belongs to `leadDiscovery` — but consider merging)
- ❌ Support tickets (belongs to `helpdesk`)
- ❌ Email management (belongs to `emailIntel`)
- ❌ Sales orders (belongs to `erp`)

**DEPENDENCIES:**
- `leadDiscovery` (for lead-to-contact conversion)
- `helpdesk` (for contact-linked tickets)
- `erp` (for deal-to-order conversion)

**INTEGRATIONS:** None

**AI AGENTS:** CRM assistant agents

**DATABASE/SERVICES:**
- PostgreSQL: Contacts, companies, deals, activities, pipeline_stages
- Services: `crm/crm.service.ts`

**STATUS:** 🟢 COMPLETE — CRM working

---

### LEAD_DISCOVERY MODULE (S85/115)
**PURPOSE:** Lead management, pipeline, search, collections

**WHAT BELONGS INSIDE:**
- Lead search (external providers)
- Lead management (CRUD, status, owner, notes)
- Pipeline view
- Collections (CRUD, leads)
- Duplicate management (find, resolve)
- Coverage reporting
- Search history
- CSV export
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Contact management (belongs to `crm` — leads convert to contacts)
- ❌ Deal management (belongs to `crm`)
- ❌ Email sending (belongs to `emailIntel`)

**DEPENDENCIES:**
- `crm` (for lead-to-contact conversion)
- `emailIntel` (for lead outreach)

**INTEGRATIONS:**
- Google (lead search)

**AI AGENTS:** Lead scoring agents

**DATABASE/SERVICES:**
- PostgreSQL: Leads, collections, duplicates, search_history
- Redis: Search cache
- Services: `leadDiscovery/leadDiscovery.service.ts`, `leadDiscovery/leadPipeline.service.ts`

**STATUS:** 🟢 COMPLETE — Lead discovery working

---

### HELP_DESK MODULE (S95)
**PURPOSE:** Customer support ticket management

**WHAT BELONGS INSIDE:**
- Ticket management (CRUD, assign, transition, delete)
- Ticket comments (CRUD)
- SLA tracking (deterministic)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Contact management (belongs to `crm`)
- ❌ Email management (belongs to `emailIntel`)
- ❌ Knowledge base (would belong here or separate)

**DEPENDENCIES:**
- `crm` (for contact/customer context)
- `emailIntel` (for ticket email notifications)

**INTEGRATIONS:** None

**AI AGENTS:** Ticket triage agents

**DATABASE/SERVICES:**
- PostgreSQL: Tickets, comments, SLA records
- Services: `helpdesk/helpdesk.service.ts`

**STATUS:** 🟢 COMPLETE — Helpdesk working

---

### EMAIL_INTEL MODULE (S91)
**PURPOSE:** Email intelligence — mailboxes, threads, messages, AI drafting

**WHAT BELONGS INSIDE:**
- AI drafting (draft, summarize, triage)
- Mailbox management (CRUD, test)
- Thread management (read)
- Message management (CRUD, send)
- SMTP client
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Contact management (belongs to `crm`)
- ❌ Ticket notifications (belongs to `helpdesk` — but uses email)
- ❌ Marketing email campaigns (would belong to `marketing`)

**DEPENDENCIES:**
- `crm` (for contact context)
- `helpdesk` (for ticket email notifications)

**INTEGRATIONS:**
- SMTP servers
- Email providers (Gmail, Outlook, etc.)

**AI AGENTS:** Email drafting, summarization agents

**DATABASE/SERVICES:**
- PostgreSQL: Mailboxes, threads, messages, outbox
- Services: `emailIntel/emailIntel.service.ts`, `emailIntel/smtp.client.ts`

**STATUS:** 🟢 COMPLETE — Email intelligence working

---

### ERP MODULE (S92)
**PURPOSE:** Enterprise resource planning — products, inventory, suppliers, orders

**WHAT BELONGS INSIDE:**
- Products (CRUD)
- Warehouses (CRUD)
- Inventory (view, movements)
- Suppliers (CRUD)
- Purchase orders (CRUD, receive)
- Sales orders (CRUD, fulfill)
- Sales orders from CRM deals
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Contact/company management (belongs to `crm`)
- ❌ Deal management (belongs to `crm`)
- ❌ Billing/invoicing (belongs to `billing`)

**DEPENDENCIES:**
- `crm` (for deal-to-sales-order conversion)
- `billing` (for invoice generation)

**INTEGRATIONS:** None

**AI AGENTS:** Inventory optimization agents

**DATABASE/SERVICES:**
- PostgreSQL: Products, warehouses, inventory, suppliers, purchase_orders, sales_orders
- Services: `erp/erp.service.ts`

**STATUS:** 🟢 COMPLETE — ERP working

---

### BILLING MODULE (S107/20)
**PURPOSE:** Subscription management, invoicing, payment webhooks, dunning

**WHAT BELONGS INSIDE:**
- Subscription management (CRUD, insights)
- Invoice management (mark-paid, void)
- Payment webhook handling (idempotent)
- Dunning automation
- Plan definitions
- Usage-based billing
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Payment gateway integration (belongs to `payments`)
- ❌ Gift cards (belongs to `giftCards`)
- ❌ FX rates (belongs to `globalCurrency`)
- ❌ Budgets/chargebacks (belongs to `enterpriseFinOps`)
- ❌ Geographic billing rules (belongs to `geoBilling` — but consider merging)

**DEPENDENCIES:**
- `payments` (for payment processing)
- `giftCards` (for gift card redemption)
- `globalCurrency` (for multi-currency support)
- `enterpriseFinOps` (for cost allocation)
- `geoBilling` (for regional pricing)

**INTEGRATIONS:**
- Stripe
- PayPal
- Flutterwave
- Paystack

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Subscriptions, invoices, invoice_lines, plans
- Redis: Webhook dedup, dunning state
- Services: `billing/services/billing.service.ts`, `billing/exchangeRates.ts`

**STATUS:** 🟢 COMPLETE — Billing working

---

### PAYMENTS MODULE (S128)
**PURPOSE:** Payment gateway integration — Stripe, PayPal, Flutterwave, Paystack, Crypto

**WHAT BELONGS INSIDE:**
- Payment gateway management
- Checkout flows (per gateway)
- Crypto checkout (BTC, TRC-20, ERC-20, BNB)
- Payment confirmation
- Invoice settlement (call billing.markInvoicePaid)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Subscription management (belongs to `billing`)
- ❌ Invoice management (belongs to `billing`)
- ❌ Gift cards (belongs to `giftCards`)

**DEPENDENCIES:**
- `billing` (for invoice settlement)
- `giftCards` (for gift card payments)

**INTEGRATIONS:**
- Stripe API
- PayPal API
- Flutterwave API
- Paystack API
- Blockonomics (crypto)
- Bitcoin network
- Tron network
- Ethereum network
- BNB Chain

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Payment records, gateway configs
- Redis: Payment confirmation state
- Services: `payments/payments.service.ts`, `payments/stripe.service.ts`, `payments/paypal.service.ts`, `payments/flutterwave.service.ts`, `payments/paystack.service.ts`, `payments/crypto.service.ts`

**STATUS:** 🟢 COMPLETE — Payments working

---

### GIFT_CARDS MODULE (S79)
**PURPOSE:** WMPC gift card management — issuance, activation, redemption, loyalty

**WHAT BELONGS INSIDE:**
- Gift card CRUD (issue, activate, reload, redeem, expire, freeze)
- Transaction log
- Fraud detection
- Loyalty programs
- Agent management
- Payment method info
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Subscription billing (belongs to `billing`)
- ❌ Payment gateway processing (belongs to `payments`)
- ❌ General fraud detection (would be shared)

**DEPENDENCIES:**
- `billing` (for balance settlement)
- `payments` (for redemption payment methods)

**INTEGRATIONS:**
- AWS (gift card security)

**AI AGENTS:** Fraud detection agents

**DATABASE/SERVICES:**
- PostgreSQL: Gift cards, transactions, fraud flags, loyalty
- Redis: Card state, Lua locks for race protection
- Services: `giftCards/giftCards.service.ts`

**STATUS:** 🟢 COMPLETE — Gift cards working

---

### GLOBAL_CURRENCY MODULE (S80)
**PURPOSE:** FX rates, currency conversion

**WHAT BELONGS INSIDE:**
- Exchange rates (live from frankfurter/er-api)
- Currency conversion
- Rate history
- Provider status
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Billing/subscriptions (belongs to `billing` — but uses rates)
- ❌ Gift cards (belongs to `giftCards` — but uses rates)

**DEPENDENCIES:**
- `billing` (for multi-currency invoicing)
- `giftCards` (for multi-currency redemption)

**INTEGRATIONS:**
- frankfurter.app (ECB rates)
- open.er-api.com

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Rate history (optional)
- Redis: Cached rates (1h TTL)
- Services: `globalCurrency/globalCurrency.service.ts`, `globalCurrency/refreshRates.ts`

**STATUS:** 🟢 COMPLETE — Global currency working

---

### ENTERPRISE_FINOPS MODULE (S100)
**PURPOSE:** Enterprise financial operations — budgets, cost centers, chargebacks

**WHAT BELONGS INSIDE:**
- Cost centers (CRUD)
- Budgets (CRUD)
- Cost tracking (CRUD)
- Allocations (CRUD)
- Chargebacks (computed)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Subscription billing (belongs to `billing`)
- ❌ Invoice management (belongs to `billing`)
- ❌ FX rates (belongs to `globalCurrency`)

**DEPENDENCIES:**
- `billing` (for actual costs)
- `aiEconomy` (for GPU costs)
- `platformServices` (for feature usage costs)

**INTEGRATIONS:**
- AWS Cost Explorer
- GCP Billing
- Azure Cost Management

**AI AGENTS:** Cost optimization agents

**DATABASE/SERVICES:**
- PostgreSQL: Cost centers, budgets, costs, allocations, chargebacks
- Services: `enterpriseFinOps/enterpriseFinOps.service.ts`

**STATUS:** 🟢 COMPLETE — Enterprise FinOps working

---

### GEO_BILLING MODULE
**PURPOSE:** Geographic billing rules, regional pricing, tax handling

**WHAT BELONGS INSIDE:**
- Geographic regions
- Regional pricing rules
- Tax rules by region
- Currency preferences by region
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Core billing (belongs to `billing`)
- ❌ FX rates (belongs to `globalCurrency`)

**DEPENDENCIES:**
- `billing` (for applying regional rules)
- `globalCurrency` (for rate conversion)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Regions, pricing_rules, tax_rules
- Services: `geoBilling/geoBilling.service.ts`

**STATUS:** 🟢 COMPLETE — Geo billing working

---

### COMMERCE MODULE (🟣 NEW — CONSIDER)
**PURPOSE:** Unified commerce — orders, cart, checkout, product catalog

**WHAT WOULD BELONG INSIDE:**
- Product catalog (from ERP, denormalized)
- Cart management
- Checkout flows
- Order management
- Order history
- Customer orders

**WHAT DOES NOT BELONG:**
- ❌ ERP inventory (belongs to `erp` — source of truth)
- ❌ CRM contacts (belongs to `crm` — customer info)
- ❌ Billing/subscriptions (belongs to `billing`)

**DEPENDENCIES:**
- `erp` (for product/inventory)
- `crm` (for customer)
- `billing` (for payment)
- `payments` (for checkout)

**INTEGRATIONS:** None

**AI AGENTS:** Shopping assistant agents

**DATABASE/SERVICES:**
- PostgreSQL: Carts, orders, order_items
- Services: `commerce/commerce.service.ts` (🟣 NEW)

**STATUS:** 🟣 MISSING — Not yet created; ERP handles B2B orders

---

## COLLABORATION LAYER

### CONVERSATIONS MODULE (S2-4)
**PURPOSE:** AI chat conversations, messaging

**WHAT BELONGS INSIDE:**
- Conversation CRUD
- Message CRUD (send, read, search)
- Conversation participants
- Read state tracking
- Message edit/redact (audit trail)
- Digest extraction
- Soft delete/recovery
- Statistics (measured)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Voice channels (belongs to `talk`)
- ❌ System notifications (belongs to `notifications` — 🟣 PLANNED)
- ❌ Workflow execution (belongs to `composer`)

**DEPENDENCIES:**
- `kernel` (for AI responses)
- `agents` (for agent conversations)

**INTEGRATIONS:** None

**AI AGENTS:** Chat agents

**DATABASE/SERVICES:**
- PostgreSQL: Conversations, messages, participants, read_states
- Services: `conversations/conversationOps.service.ts`, `conversations/conversations.service.ts`, `services/message.service.ts`

**STATUS:** 🟢 COMPLETE — Conversations working

---

### TALK MODULE (S5-6)
**PURPOSE:** Voice channels, meetings, transcripts, action items

**WHAT BELONGS INSIDE:**
- Channel management (CRUD, members)
- Channel messages (send, read, reactions)
- Meeting management (CRUD, join, end, status lifecycle)
- Meeting transcripts
- Meeting translations
- Meeting speakers
- Meeting agenda
- Meeting action items (CRUD, status, aiGenerated flag)
- Meeting decisions
- Meeting risks
- Meeting summary
- Meeting followups
- Meeting writethrough
- Available agents
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Text chat (belongs to `conversations`)
- ❌ Voice synthesis (belongs to `voice`)
- ❌ Meeting recording storage (would be external)

**DEPENDENCIES:**
- `conversations` (for cross-channel messaging)
- `voice` (for voice features)
- `agents` (for meeting bots)

**INTEGRATIONS:**
- Whisper (transcription, optional)

**AI AGENTS:** Meeting notetaker, summarizer agents

**DATABASE/SERVICES:**
- PostgreSQL: TalkChannel, TalkMessage, Meeting, action_items, decisions, risks
- Redis: Presence, real-time channels
- Services: `services/talk.service.ts`, `services/meeting.service.ts`

**STATUS:** 🟢 COMPLETE — Talk working

---

### CANVAS_COLLAB MODULE
**PURPOSE:** Collaborative canvas, presence, cursors

**WHAT BELONGS INSIDE:**
- Canvas CRUD
- Canvas blocks (CRUD, connections, generate)
- Presence tracking (join/leave)
- Cursor positions
- Notes
- Dashboard rollup

**WHAT DOES NOT BELONG:**
- ❌ General collaboration (belongs to `collaboration` umbrella)
- ❌ Meeting canvas (belongs to `talk` — but can link)

**DEPENDENCIES:**
- `collaboration` (for shared collaboration primitives)

**INTEGRATIONS:** None

**AI AGENTS:** Canvas assistant agents

**DATABASE/SERVICES:**
- PostgreSQL: Canvas, blocks, connections
- Redis: Presence, cursors (TTL)
- Services: `services/canvas.service.ts`, `collaboration/canvasCollab.service.ts`

**STATUS:** 🟢 COMPLETE — Canvas collaboration working

---

### COMPOSER MODULE (S49)
**PURPOSE:** Workflow engine — workflow definition, deployment, execution

**WHAT BELONGS INSIDE:**
- Workflow CRUD
- Workflow validation
- Workflow deployment
- Workflow execution (run, outcome)
- Run list/history
- Workflow library
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Extension triggers (belongs to `extensions` — but can call workflows)
- ❌ Public API workflow triggers (belongs to `publicApi`)
- ❌ Agent tasks (belongs to `agents`)

**DEPENDENCIES:**
- `extensions` (for workflow extensions/triggers)
- `publicApi` (for external workflow triggers)

**INTEGRATIONS:** None

**AI AGENTS:** Workflow orchestration agents

**DATABASE/SERVICES:**
- PostgreSQL: Workflow, WorkflowRun
- Redis: Execution state, queues
- Services: `composer/composer.service.ts`, `services/workflow.service.ts`, `services/workflow.engine.test.ts`

**STATUS:** 🟢 COMPLETE — Workflow engine working

---

### EXTENSIONS MODULE
**PURPOSE:** Plugin/extension system — registry, installation, enable/disable

**WHAT BELONGS INSIDE:**
- Extension registry (CRUD, install, uninstall, enable, disable, review, version)
- Business extensions
- Industry extensions
- Skills extensions (invoke)
- Agent extensions
- Workflow extensions
- Dashboard extensions
- UI component extensions
- Notes

**WHAT DOES NOT BELONG:**
- ❌ External app marketplace (belongs to `marketplace`)
- ❌ Workflow execution (belongs to `composer` — extensions can trigger)

**DEPENDENCIES:**
- `composer` (for workflow extensions)
- `agents` (for agent extensions)
- `marketplace` (for external extensions)

**INTEGRATIONS:**
- OpenAI
- Anthropic
- Stripe (for paid extensions)
- SendGrid (for extension notifications)
- AWS/GCP/Azure (for cloud extensions)

**AI AGENTS:** Extension AI assistants

**DATABASE/SERVICES:**
- PostgreSQL: Extensions, extension_versions, extension_installs
- Services: `extensions/registry.service.ts`, `extensions/business.service.ts`, `extensions/industry.service.ts`, `extensions/skills.service.ts`, `extensions/agents.service.ts`, `extensions/workflowExt.service.ts`, `extensions/dashboardExt.service.ts`, `extensions/uiComponents.service.ts`

**STATUS:** 🟢 COMPLETE — Extensions working

---

### MARKETPLACE MODULE
**PURPOSE:** External app marketplace — skills, digital twins, simulations, apps

**WHAT BELONGS INSIDE:**
- Skills (CRUD, install, uninstall, assign)
- Digital twins (CRUD, entities, telemetry)
- Simulations (CRUD, run)
- Apps (CRUD, approve, versions, install)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Internal extensions (belongs to `extensions`)
- ❌ Skills execution (belongs to `extensions` or the skill's host module)

**DEPENDENCIES:**
- `extensions` (for skill integration)
- `agentComm` (for digital twin agents)

**INTEGRATIONS:**
- Google (app auth)

**AI AGENTS:** Marketplace recommendation agents

**DATABASE/SERVICES:**
- PostgreSQL: Skills, skill_installations, skill_assignments, twins, twin_entities, twin_telemetry, scenarios, simulation_runs, apps, app_versions, app_installs
- Services: `marketplace/skills.service.ts`, `marketplace/digitalTwins.service.ts`, `marketplace/simulation.service.ts`, `marketplace/appStore.service.ts`

**STATUS:** 🟢 COMPLETE — Marketplace working

---

## DATA & INTELLIGENCE LAYER

### ENTERPRISE_SEARCH MODULE (S98)
**PURPOSE:** Unified search across all modules

**WHAT BELONGS INSIDE:**
- Unified query (search across modules)
- Search history (CRUD)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Module-specific search (each module owns its search)
- ❌ Knowledge graph queries (belongs to `identityKnowledge` or `cognitive`)

**DEPENDENCIES:**
- All modules (for indexed data)

**INTEGRATIONS:**
- Whisper (audio search, optional)

**AI AGENTS:** Search ranking agents

**DATABASE/SERVICES:**
- PostgreSQL: Search history, indexed entities
- Redis: Search cache
- Services: `enterpriseSearch/enterpriseSearch.service.ts`

**STATUS:** 🟢 COMPLETE — Enterprise search working

---

### COGNITIVE MODULE (S69)
**PURPOSE:** World model — entities, observations, hypotheses

**WHAT BELONGS INSIDE:**
- World model entities (CRUD)
- Observations (CRUD)
- Hypotheses (CRUD, resolve)
- Coverage rollup (deterministic)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Agent knowledge (belongs to `agentMemory`)
- ❌ Identity knowledge (belongs to `identityKnowledge`)
- ❌ Business entities (belongs to their respective modules)

**DEPENDENCIES:**
- `agentMemory` (for agent observations)
- `identityKnowledge` (for identity entities)

**INTEGRATIONS:** None

**AI AGENTS:** World model agents

**DATABASE/SERVICES:**
- PostgreSQL: Entities, observations, hypotheses
- Redis: Coverage cache
- Services: `cognitive/cognitive.service.ts`, `cognitive/worldModel.service.ts`

**STATUS:** 🟢 COMPLETE — Cognitive world model working

---

### IDENTITY_KNOWLEDGE MODULE (S125)
**PURPOSE:** Super-admin biography/identity knowledge management

**WHAT BELONGS INSIDE:**
- Knowledge records (CRUD, approve, publish, archive, versions, grants)
- Relations (knowledge graph)
- Sync to memory fabric
- Ask engine (AI-powered, with sources)
- Knowledge agents (run)
- Dashboard
- Graph view
- Activity log
- Document uploads
- Import/export
- Notes

**WHAT DOES NOT BELONG:**
- ❌ General agent memory (belongs to `agentMemory`)
- ❌ World model entities (belongs to `cognitive`)
- ❌ User profiles (belongs to `auth`)

**DEPENDENCIES:**
- `agentMemory` (for memory fabric sync)
- `cognitive` (for entity relations)
- `enterpriseSearch` (for search indexing)

**INTEGRATIONS:** None

**AI AGENTS:** 8 knowledge agents

**DATABASE/SERVICES:**
- PostgreSQL: Knowledge records, versions, grants, relations, documents
- Redis: Memory fabric sync, ask cache
- Services: `identityKnowledge/identityKnowledge.service.ts`, `attachments/attachments.service.ts`

**STATUS:** 🟢 COMPLETE — Identity knowledge working

---

### BUSINESS_INTELLIGENCE MODULE (S97)
**PURPOSE:** BI — KPIs, reports, sources, CSV export

**WHAT BELONGS INSIDE:**
- Data sources (CRUD)
- KPI definitions (CRUD, value)
- Reports (CRUD, evaluate, export.csv)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Module-specific analytics (each module owns its analytics)
- ❌ Usage tracking (belongs to `usage`)
- ❌ Trading analytics (belongs to `tradingIntel`)

**DEPENDENCIES:**
- All modules (for KPI data sources)

**INTEGRATIONS:** None

**AI AGENTS:** Report generation agents

**DATABASE/SERVICES:**
- PostgreSQL: Sources, kpis, reports, report_executions
- Services: `businessIntelligence/businessIntelligence.service.ts`

**STATUS:** 🟢 COMPLETE — BI working

---

### USAGE MODULE (S55/123)
**PURPOSE:** Usage intelligence — events, metrics, analytics

**WHAT BELONGS INSIDE:**
- Event tracking (CRUD)
- Event query (with filters)
- Dashboard rollup (real metrics, not hardcoded)
- Notes

**WHAT DOES NOT BELONG:**
- ❌ AI usage (belongs to `kernel` + `aiEconomy`)
- ❌ Billing usage (belongs to `billing`)
- ❌ Engineering metrics (belongs to `engineering`)

**DEPENDENCIES:**
- `kernel` (for AI request events)
- `aiEconomy` (for GPU usage)
- `billing` (for billable usage)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Usage events, event_types
- Services: `usage/usage.service.ts`

**STATUS:** 🟢 COMPLETE — Usage intelligence working

---

### DATA_MARKETPLACE MODULE (S61)
**PURPOSE:** Data assets, schema governance, knowledge graph, memory fabric, sync

**WHAT BELONGS INSIDE:**
- Data assets (CRUD, access, install, review)
- Schema governance
- Knowledge graph (entities, relations, traverse, stats)
- Memory fabric (CRUD, stats, context)
- Sync jobs (CRUD, toggle, run, runs)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Agent memory (belongs to `agentMemory`)
- ❌ Identity knowledge (belongs to `identityKnowledge`)
- ❌ World model (belongs to `cognitive`)

**DEPENDENCIES:**
- `agentMemory` (for memory fabric)
- `identityKnowledge` (for knowledge graph)
- `cognitive` (for entity integration)

**INTEGRATIONS:** None

**AI AGENTS:** Data integration agents

**DATABASE/SERVICES:**
- PostgreSQL: Data assets, schema rules, kg_entities, kg_relations, memory_records, sync_jobs, sync_runs
- Services: `dataMarketplace/dataMarketplace.service.ts`, `enterprise/dataArchitecture/schemaGovernance.service.ts`, `enterprise/knowledgeGraph/knowledgeGraph.service.ts`, `enterprise/memory/memory.service.ts`, `enterprise/sync/sync.service.ts`

**STATUS:** 🟢 COMPLETE — Data marketplace working

---

## ENTERPRISE SERVICES LAYER

### ENTERPRISE_MODULE
**PURPOSE:** Enterprise services — model registry, AI monitoring, plugins, SSO, governance, discovery, event bus, API governance

**WHAT BELONGS INSIDE:**

**Model Registry:**
- Model CRUD
- Model default setting

**AI Monitoring:**
- AI monitoring dashboard

**Plugins:**
- Plugin CRUD (toggle, config, delete)

**Integrations:**
- Integration CRUD (patch, delete)

**SSO:**
- SSO config (CRUD, disable, lookup)

**Organization:**
- Organization config (read, patch)

**Governance:**
- ADRs (CRUD, comment, decide)
- Standards (CRUD)
- Reviews (CRUD, comment, decide)

**Discovery:**
- Services (CRUD, heartbeat, query, resolve)
- Dependencies (CRUD, validate)

**Event Bus:**
- Event schemas (CRUD)
- Event publish
- Event recent
- DLQ (view, replay, discard)

**API Governance:**
- Endpoints (view)
- Versions (view)
- OpenAPI spec (view, download)

**WHAT DOES NOT BELONG:**
- ❌ Agent management (belongs to `agents`)
- ❌ Workflow execution (belongs to `composer`)
- ❌ Security incidents (belongs to `security`)
- ❌ Billing (belongs to `billing`)

**DEPENDENCIES:**
- `agents` (for agent plugins)
- `composer` (for workflow plugins)
- `security` (for security events)
- `billing` (for paid plugins)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: ModelRegistry, Plugin, Integration, SSO_config, ADR, Standard, Review, Service, ServiceDependency, EventSchema, DLQ_entry
- Redis: Service heartbeat, event bus
- Services: `services/modelRegistry.service.ts`, `services/aiMonitoring.service.ts`, `services/plugin.service.ts`, `services/integration.service.ts`, `services/sso.service.ts`, `services/organization.service.ts`, `enterprise/governance/governance.service.ts`, `enterprise/discovery/discovery.service.ts`, `enterprise/events/eventBus.service.ts`, `enterprise/apiGovernance/apiGovernance.service.ts`

**STATUS:** 🟢 COMPLETE — Enterprise services working

---

### ENTERPRISE_FOUNDATION MODULE
**PURPOSE:** Enterprise foundation — data fabric, identity, finops, resilience, quality, ops center

**WHAT BELONGS INSIDE:**

**Data Fabric:**
- Connectors (CRUD, status)
- Products (CRUD)
- Lineage (CRUD)

**Identity:**
- Principals (CRUD)
- IdPs (CRUD)
- Service accounts (CRUD)
- Accounts (CRUD)

**FinOps:**
- Anomalies (CRUD, ack)
- Optimizations (CRUD, apply)

**Resilience:**
- Incidents (CRUD, status)
- Playbooks (CRUD, run)

**Quality:**
- BCP (CRUD, drill)
- Scorecards (CRUD)
- Eval runs (CRUD)

**Ops Center:**
- Global status
- KPIs

**Notes**

**WHAT DOES NOT BELONG:**
- ❌ General enterprise services (belongs to `enterprise`)
- ❌ Billing (belongs to `billing`)
- ❌ AI-specific monitoring (belongs to `enterprise` AI monitoring)

**DEPENDENCIES:**
- `enterprise` (for enterprise services)
- `billing` (for finops costs)
- `infrastructure` (for resilience)

**INTEGRATIONS:**
- AWS
- GCP
- Azure
- Google

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Connectors, products, lineage, principals, idps, service_accounts, accounts, anomalies, optimizations, incidents, playbooks, bcp, scorecards, eval_runs
- Services: `enterpriseFoundation/dataFabric.service.ts`, `enterpriseFoundation/identity.service.ts`, `enterpriseFoundation/finops.service.ts`, `enterpriseFoundation/resilience.service.ts`, `enterpriseFoundation/quality.service.ts`, `enterpriseFoundation/opsCenter.service.ts`

**STATUS:** 🟢 COMPLETE — Enterprise foundation working

---

### TENANT_ISOLATION MODULE (S89)
**PURPOSE:** Tenant isolation policies, compliance, export checks

**WHAT BELONGS INSIDE:**
- Isolation policy (CRUD)
- Compliance runs (CRUD, view)
- Export checks
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Organization management (belongs to `enterpriseFoundation`)
- ❌ User roles (belongs to `auth` + `permissions`)

**DEPENDENCIES:**
- `enterpriseFoundation` (for org/identity)
- `permissions` (for role scoping)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Isolation policies, compliance runs
- Redis: Namespace audit cache
- Services: `tenantIsolation/tenantIsolation.service.ts`

**STATUS:** 🟢 COMPLETE — Tenant isolation working

---

## DOMAIN INTELLIGENCE LAYER (Vertical AI)

### TRADING_INTEL MODULE (S81)
**PURPOSE:** Trading intelligence — analysis, indicators, agents, journal, market data

**WHAT BELONGS INSIDE:**
- Agent registry (16 agents)
- Agent execution (run, heartbeat)
- Indicators (calculation)
- Instruments (list)
- Risk analysis
- Positions
- Sentiment
- Simulation
- Economic calendar
- Insights
- Trade proposal
- Market analysis (analyze endpoint)
- Market data providers
- Journal (CRUD, close)
- Analytics (performance)
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Broker/execution (belongs to `brokerIntegration` — READ ONLY)
- ❌ Options/bonds desk (belongs to `derivatives`)
- ❌ Crypto-specific (belongs to `cryptoIntelligence`)

**DEPENDENCIES:**
- `brokerIntegration` (for account/position data — read only)
- `derivatives` (for options/bonds analysis)
- `cryptoIntelligence` (for crypto data)

**INTEGRATIONS:**
- AlphaVantage
- TwelveData
- Polygon.io
- CoinGecko

**AI AGENTS:** 16 trading advisory agents

**DATABASE/SERVICES:**
- PostgreSQL: Agent configs, journal entries, positions
- Redis: Market data cache, agent state
- Services: `tradingIntel/tradingIntel.service.ts`, `tradingIntel/analysis.ts`, `tradingIntel/marketData.ts`, `tradingIntel/agents.ts`, `tradingIntel/journal.ts`, `tradingIntel/indicators.ts`, `tradingIntel/risk.ts`, `tradingIntel/derivatives.ts`

**STATUS:** 🟢 COMPLETE — Trading intelligence working

---

### DERIVATIVES MODULE (S81/113)
**PURPOSE:** Options & fixed income — Greeks, implied vol, payoff, bond analytics

**WHAT BELONGS INSIDE:**
- Option Greeks calculation
- Implied volatility (Newton solver)
- Option payoff (multi-leg)
- Bond analytics (duration, convexity, YTM)
- Options book (CRUD)
- Bond book (CRUD)
- Portfolio exposure (delta notional)
- Scenario grids (full-reprice)
- Payoff curves
- Delta hedge
- Bond ladder (yield shifts)
- Notes

**WHAT DOES NOT BELONG:**
- ❌ General trading analysis (belongs to `tradingIntel`)
- ❌ Broker execution (belongs to `brokerIntegration`)

**DEPENDENCIES:**
- `tradingIntel` (for market data, analysis)

**INTEGRATIONS:** None (calculation engine)

**AI AGENTS:** Options analysis agents

**DATABASE/SERVICES:**
- PostgreSQL: Options book, bond book, portfolios
- Services: `derivatives/derivativesDesk.service.ts`, `tradingIntel/derivatives.ts`

**STATUS:** 🟢 COMPLETE — Derivatives working

---

### BROKER_INTEGRATION MODULE
**PURPOSE:** Broker/exchange connectivity — READ ONLY, no execution

**WHAT BELONGS INSIDE:**
- Broker connectors (list)
- Broker accounts (CRUD, verify)
- Account positions (read)
- Account orders (read)
- Trade proposals (submit for review — NOT execution)
- Execution review (approve/reject — governance only)
- Strategies (CRUD, toggle, backtest)
- Risk metrics
- Risk kill-switch
- Portfolio view
- Command center
- Agent heartbeat/run
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Trade execution (NOT IMPLEMENTED — by design)
- ❌ Trading analysis (belongs to `tradingIntel`)
- ❌ Options/bonds (belongs to `derivatives`)

**DEPENDENCIES:**
- `tradingIntel` (for analysis input)
- `derivatives` (for derivative data)

**INTEGRATIONS:**
- Broker APIs (read-only)

**AI AGENTS:** Strategy agents

**DATABASE/SERVICES:**
- PostgreSQL: Broker accounts, strategies, executions (pending review)
- Services: `tradingIntel/brokerIntegration.service.ts`

**STATUS:** 🟢 COMPLETE — Broker integration working

---

### CRYPTO_INTELLIGENCE MODULE (S35)
**PURPOSE:** Crypto-specific intelligence — chains, DeFi, wallets, portfolio

**WHAT BELONGS INSIDE:**
- Chain info
- Market data
- DeFi protocols
- DeFi yields
- Wallet tracking
- Portfolio view
- Security alerts
- Strategies
- Trades (CRUD, approve/reject)
- Exchanges
- Notes

**WHAT DOES NOT BELONG:**
- ❌ General trading (belongs to `tradingIntel`)
- ❌ Broker integration (belongs to `brokerIntegration`)

**DEPENDENCIES:**
- `tradingIntel` (for general analysis)
- `brokerIntegration` (for exchange connectivity)

**INTEGRATIONS:**
- Polygon.io

**AI AGENTS:** Crypto analysis agents

**DATABASE/SERVICES:**
- PostgreSQL: Chains, markets, protocols, yields, wallets, portfolio, alerts, strategies, trades
- Services: `cryptoIntelligence/cryptoIntelligence.service.ts`

**STATUS:** 🟢 COMPLETE — Crypto intelligence working

---

### HEALTH_ECOSYSTEM MODULE (S75)
**PURPOSE:** Health data — metrics, fitness, medications, devices, vaccinations

**WHAT BELONGS INSIDE:**
- Health metrics (CRUD)
- Fitness sessions (CRUD)
- Medications (CRUD)
- Emergency alerts (CRUD, acknowledge)
- Insights
- Profile (CRUD)
- Wearables (CRUD)
- Medical devices (CRUD)
- Vaccinations (CRUD)
- Screenings (CRUD)
- Modules list
- Disclaimer
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Biomedical research (belongs to `biomedical`)
- ❌ Telemedicine sessions (belongs to `biomedical`)

**DEPENDENCIES:** None

**INTEGRATIONS:** None

**AI AGENTS:** Health insight agents

**DATABASE/SERVICES:**
- PostgreSQL: Metrics, fitness_sessions, medications, alerts, profile, wearables, devices, vaccinations, screenings
- Services: `healthEcosystem/healthEcosystem.service.ts`

**STATUS:** 🟢 COMPLETE — Health ecosystem working

---

### BIOMEDICAL_MODULE (S65)
**PURPOSE:** Biomedical research — studies, findings, pharmacy alerts, telemedicine

**WHAT BELONGS INSIDE:**
- Studies (CRUD, findings)
- Pharmacy alerts
- Telemedicine sessions (CRUD, end)
- Ops metrics
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Personal health data (belongs to `healthEcosystem`)
- ❌ Clinical records (record-only, no synthesis)

**DEPENDENCIES:**
- `healthEcosystem` (for patient context — if linked)

**INTEGRATIONS:** None

**AI AGENTS:** Research agents

**DATABASE/SERVICES:**
- PostgreSQL: Studies, findings, alerts, sessions, metrics
- Services: `biomedical/biomedical.service.ts`

**STATUS:** 🟢 COMPLETE — Biomedical working

---

### LEGAL_MODULE (S66)
**PURPOSE:** Legal research — matters, research, updates

**WHAT BELONGS INSIDE:**
- Matters (CRUD, status)
- Research (query, with disclosure)
- Updates (acknowledge)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Compliance (belongs to `constitution`)
- ❌ Contracts (would belong here or separate)

**DEPENDENCIES:** None

**INTEGRATIONS:** None

**AI AGENTS:** Legal research agents

**DATABASE/SERVICES:**
- PostgreSQL: Matters, research_queries, updates
- Services: `legal/legal.service.ts`

**STATUS:** 🟢 COMPLETE — Legal working

---

### SCIENTIFIC_MODULE (S68)
**PURPOSE:** Scientific research — papers, findings

**WHAT BELONGS INSIDE:**
- Papers (list)
- Notes
- Dashboard rollup

**WHAT DOES NOT BELONG:**
- ❌ Biomedical research (belongs to `biomedical`)
- ❌ Legal research (belongs to `legal`)

**DEPENDENCIES:** None

**INTEGRATIONS:**
- AWS

**AI AGENTS:** Research agents

**DATABASE/SERVICES:**
- PostgreSQL: Papers
- Services: `scientific/scientific.service.ts`

**STATUS:** 🟢 COMPLETE — Scientific working

---

### EDUCATION_MODULE (S67)
**PURPOSE:** Education — lecturer AI, learning paths, assessments

**WHAT BELONGS INSIDE:**
- Tutor (start session)
- Learning paths (CRUD)
- Assessments (CRUD)
- Lecturer AI (start, answer, ask, get, list, topic mastery)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ General AI tutoring (could be in `expertsPlatform`)

**DEPENDENCIES:**
- `kernel` (for AI)
- `expertsPlatform` (for expert tutors)

**INTEGRATIONS:**
- OpenAI

**AI AGENTS:** Lecturer AI agent

**DATABASE/SERVICES:**
- PostgreSQL: Paths, assessments, lecturer_sessions, mastery
- Redis: Session state, mastery cache (30-day TTL)
- Services: `education/education.service.ts`, `education/lecturer.service.ts`

**STATUS:** 🟢 COMPLETE — Education working

---

### CYBER_MODULE (S82)
**PURPOSE:** Cyber academy — training, labs

**WHAT BELONGS INSIDE:**
- Labs (create)
- Notes
- Dashboard rollup

**WHAT DOES NOT BELONG:**
- ❌ Security incidents (belongs to `security`)
- ❌ Infrastructure security (belongs to `infrastructure`)

**DEPENDENCIES:** None

**INTEGRATIONS:**
- AWS
- GCP
- Azure

**AI AGENTS:** Training agents

**DATABASE/SERVICES:**
- PostgreSQL: Labs, activities
- Services: `cyber/cyber.service.ts`

**STATUS:** 🟢 COMPLETE — Cyber academy working

---

### QUANTUM_MODULE (S63)
**PURPOSE:** Quantum computing — inventory, connectors, jobs

**WHAT BELONGS INSIDE:**
- Inventory
- Connectors
- Jobs (CRUD)
- Notes
- Dashboard rollup

**WHAT DOES NOT BELONG:**
- ❌ General computing (belongs to `selfHosted`)

**DEPENDENCIES:**
- `selfHosted` (for compute resources)

**INTEGRATIONS:**
- AWS
- Azure
- Google

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Inventory, connectors, jobs
- Services: `quantum/quantum.service.ts`

**STATUS:** 🟢 COMPLETE — Quantum working

---

### ROBOTICS_MODULE (S57)
**PURPOSE:** Robotics — robots, commands, predictive scanning

**WHAT BELONGS INSIDE:**
- Robots (CRUD, command)
- Predictive scan
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Spatial computing (belongs to `spatial`)

**DEPENDENCIES:**
- `spatial` (for spatial context)

**INTEGRATIONS:**
- GCP

**AI AGENTS:** Robotics control agents

**DATABASE/SERVICES:**
- PostgreSQL: Robots, commands, scans
- Services: `robotics/robotics.service.ts`

**STATUS:** 🟢 COMPLETE — Robotics working

---

### SPATIAL_MODULE (S58)
**PURPOSE:** Spatial computing — sessions, maps, waypoints, holographic dashboards

**WHAT BELONGS INSIDE:**
- Sessions (CRUD, end)
- Maps
- Waypoints
- Holo dashboards
- Remote expert sessions
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Robotics (belongs to `robotics`)
- ❌ Camera feeds (belongs to camera module in collaboration)

**DEPENDENCIES:**
- `robotics` (for robot spatial data)

**INTEGRATIONS:** None

**AI AGENTS:** Spatial assistants

**DATABASE/SERVICES:**
- PostgreSQL: Sessions, maps, waypoints, holo_dashboards
- Redis: Device fingerprints, twin sets
- Services: `spatial/spatial.service.ts`

**STATUS:** 🟢 COMPLETE — Spatial working

---

### SUSTAINABILITY_MODULE (S64)
**PURPOSE:** ESG — environmental, social, governance records

**WHAT BELONGS INSIDE:**
- Records (CRUD)
- Activity (record)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Corporate governance (belongs to `constitution`)
- ❌ Financial sustainability (belongs to `enterpriseFinOps`)

**DEPENDENCIES:** None

**INTEGRATIONS:** None

**AI AGENTS:** ESG analysis agents

**DATABASE/SERVICES:**
- PostgreSQL: Records, activity
- Redis: Append-only index
- Services: `sustainability/sustainability.service.ts`

**STATUS:** 🟢 COMPLETE — Sustainability working

---

### OPEX_MODULE (S73/118)
**PURPOSE:** Operational excellence — safety, trust, reliability, assessments

**WHAT BELONGS INSIDE:**
- Safety alerts (CRUD, status)
- Safety register (findings, acknowledge, resolve, reopen, history)
- Reliability metrics (real, not hardcoded)
- Assessments (per dimension, method required)
- Trust metrics
- Policy (CRUD)
- Assurance summary/configuration/gaps/provenance
- Events
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Security incidents (belongs to `security`)
- ❌ Infrastructure alerts (belongs to `infrastructure`)

**DEPENDENCIES:**
- `security` (for security-related safety)
- `infrastructure` (for infra reliability)

**INTEGRATIONS:**
- OpenAI
- Anthropic

**AI AGENTS:** Safety analysis agents

**DATABASE/SERVICES:**
- PostgreSQL: Safety findings, assessments, policy, reliability
- Redis: Finding history, reliability cache
- Services: `opex/opex.service.ts`, `opex/opexAssurance.service.ts`

**STATUS:** 🟢 COMPLETE — OpEx working

---

### CONSTITUTION_MODULE (S48)
**PURPOSE:** Governance — policies, violations, compliance check

**WHAT BELONGS INSIDE:**
- Policies (list, active)
- Violations (list)
- Policy CRUD
- Publish
- Check (evaluate)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Legal matters (belongs to `legal`)
- ❌ OpEx safety (belongs to `opex`)

**DEPENDENCIES:**
- `opex` (for safety policy integration)

**INTEGRATIONS:** None

**AI AGENTS:** Compliance agents

**DATABASE/SERVICES:**
- PostgreSQL: Policies, violations
- Services: `constitution/constitution.service.ts`

**STATUS:** 🟢 COMPLETE — Constitution working

---

### AUTONOMOUS_MODULE (S72)
**PURPOSE:** Autonomous organization — human decision register

**WHAT BELONGS INSIDE:**
- Decisions (CRUD, resolve, delete)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ General workflow automation (belongs to `composer`)
- ❌ Agent decisions (belongs to `agents`)

**DEPENDENCIES:**
- `composer` (for workflow automation)

**INTEGRATIONS:** None

**AI AGENTS:** Autonomous decision agents

**DATABASE/SERVICES:**
- PostgreSQL: Decisions
- Services: `autonomous/autonomous.service.ts`

**STATUS:** 🟢 COMPLETE — Autonomous org working

---

### INDUSTRY_MODULE (S74)
**PURPOSE:** Industry packs — adoption tracking

**WHAT BELONGS INSIDE:**
- Adoptions (CRUD)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Industry-specific modules (each industry has its own module)

**DEPENDENCIES:** None

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Adoptions
- Redis: Dashboard cache
- Services: `industry/industry.service.ts`

**STATUS:** 🟢 COMPLETE — Industry packs working

---

## OPERATIONS & GOVERNANCE LAYER

### COMMAND_MODULE (S70/111)
**PURPOSE:** Global command center — incidents, regions, briefings, initiatives, directives

**WHAT BELONGS INSIDE:**
- Operations (list)
- Incidents (CRUD, updates, acknowledge, resolve)
- Regions (CRUD, status)
- Briefings (CRUD)
- Initiatives (CRUD)
- Directives (CRUD, status)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Engineering command center (belongs to `aiEngineering` — separate scope)
- ❌ Infrastructure incidents (belongs to `infrastructure`)
- ❌ Security incidents (belongs to `security`)

**DEPENDENCIES:**
- `infrastructure` (for infra incidents)
- `security` (for security incidents)
- `aiEngineering` (for engineering incidents)

**INTEGRATIONS:**
- Azure

**AI AGENTS:** Command coordination agents

**DATABASE/SERVICES:**
- PostgreSQL: Incidents, regions, briefings, initiatives, directives, updates
- Redis: Real-time incident state
- Services: `command/command.service.ts`, `command/operations.service.ts`

**STATUS:** 🟢 COMPLETE — Command center working

---

### PROGRAM_MODULE (S25)
**PURPOSE:** Program management — roadmaps, sprints, backlog, requirements, arch reviews, risks, exec reports

**WHAT BELONGS INSIDE:**
- Roadmaps (CRUD, initiatives)
- Sprints (list, burndown)
- Backlog (stories, assign, status)
- Requirements (list, intel)
- Arch reviews (CRUD, run, hotspots)
- Risks (CRUD, mitigations, status, matrix)
- Exec reports (latest, generate)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Engineering metrics (belongs to `engineering`)
- ❌ QA test management (belongs to `qa`)

**DEPENDENCIES:**
- `engineering` (for metrics)
- `qa` (for test status)

**INTEGRATIONS:** None

**AI AGENTS:** Program management agents

**DATABASE/SERVICES:**
- PostgreSQL: Roadmaps, initiatives, sprints, stories, requirements, arch_reviews, risks, mitigations, exec_reports
- Services: `program/roadmap.service.ts`, `program/sprint.service.ts`, `program/requirements.service.ts`, `program/archReview.service.ts`, `program/risk.service.ts`, `program/execReport.service.ts`

**STATUS:** 🟢 COMPLETE — Program management working

---

### QA_MODULE
**PURPOSE:** QA — test suites, cases, runs

**WHAT BELONGS INSIDE:**
- Test suites (CRUD)
- Test cases (CRUD)
- Test runs (CRUD, view)
- Dashboard
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Engineering productivity (belongs to `engineering`)
- ❌ Security testing (would be separate)

**DEPENDENCIES:**
- `engineering` (for test metrics)

**INTEGRATIONS:** None

**AI AGENTS:** Test generation agents

**DATABASE/SERVICES:**
- PostgreSQL: Suites, cases, runs
- Services: `qa/testRunner.service.ts`

**STATUS:** 🟢 COMPLETE — QA working

---

### BENCHMARKS_MODULE (S50)
**PURPOSE:** Benchmark center — runs, scheduling

**WHAT BELONGS INSIDE:**
- Benchmark runs (CRUD, schedule)
- Notes
- Dashboard rollup

**WHAT DOES NOT BELONG:**
- ❌ Performance testing (could be in QA)

**DEPENDENCIES:** None

**INTEGRATIONS:** None

**AI AGENTS:** Benchmark agents

**DATABASE/SERVICES:**
- PostgreSQL: Runs, schedules, notes
- Services: `benchmarks/benchmarks.service.ts`

**STATUS:** 🟢 COMPLETE — Benchmarks working

---

### ARCHITECTURE_MODULE (S37)
**PURPOSE:** Architecture — status, ESI signals, notes

**WHAT BELONGS INSIDE:**
- Status
- Modules list
- ESI (signals)
- Notes (CRUD)
- Dashboard rollup

**WHAT DOES NOT BELONG:**
- ❌ Program management (belongs to `program`)

**DEPENDENCIES:** None

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Notes
- Services: `architecture/architecture.service.ts`

**STATUS:** 🟢 COMPLETE — Architecture working

---

### COR_EINTEGRATION_MODULE (S45)
**PURPOSE:** Core integration — checkpoints, notes

**WHAT BELONGS INSIDE:**
- Checkpoint
- Notes (CRUD)
- Dashboard rollup

**WHAT DOES NOT BELONG:**
- ❌ Integration management (belongs to `enterprise`)

**DEPENDENCIES:**
- `enterprise` (for integration registry)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Notes
- Services: `coreIntegration/coreIntegration.service.ts`

**STATUS:** 🟢 COMPLETE — Core integration working

---

### SDK_MODULE (S59)
**PURPOSE:** SDK packages — CLI, templates, emulators, profiler

**WHAT BELONGS INSIDE:**
- CLI info
- Templates
- Emulators (create)
- Profiler (run)
- Notes
- Dashboard rollup

**WHAT DOES NOT BELONG:**
- ❌ Developer portal (belongs to `devportal`)

**DEPENDENCIES:**
- `devportal` (for SDK distribution)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Notes
- Services: `sdk/sdk.service.ts`

**STATUS:** 🟢 COMPLETE — SDK working

---

### PROMPT_TEMPLATES_MODULE (S119)
**PURPOSE:** Prompt templates library

**WHAT BELONGS INSIDE:**
- Templates (CRUD, use, duplicate)
- Stats (usage ledger)
- Notes
- Dashboard rollup

**WHAT DOES NOT BELONG:**
- ❌ AI model management (belongs to `aiPlatform`)
- ❌ Agent skills (belongs to `agents`)

**DEPENDENCIES:**
- `aiPlatform` (for template rendering context)

**INTEGRATIONS:** None

**AI AGENTS:** Template suggestion agents

**DATABASE/SERVICES:**
- PostgreSQL: PromptTemplate
- Redis: Usage ledger (pt:*)
- Services: `promptTemplates/promptTemplates.service.ts`, `promptTemplates/promptTemplatesUsage.service.ts`

**STATUS:** 🟢 COMPLETE — Prompt templates working

---

### API_KEYS_MODULE (S104)
**PURPOSE:** API key management — secure one-time secrets, scoped lifecycle

**WHAT BELONGS INSIDE:**
- API keys (CRUD, hash-at-rest)
- Key usage (ledger)
- Bearer verification
- Expiry/revocation
- Tenant isolation
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Authentication (belongs to `auth`)
- ❌ Public API gateway (belongs to `publicApi`)

**DEPENDENCIES:**
- `auth` (for user ownership)
- `publicApi` (for public API keys)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: ApiKey
- Redis: Usage ledger, revocation list
- Services: `publicApi/publicApi.service.ts`, `publicApi/publicApiUsage.service.ts`

**STATUS:** 🟢 COMPLETE — API keys working

---

### PUBLIC_API_MODULE
**PURPOSE:** Public API gateway — external workflow triggers, talk access

**WHAT BELONGS INSIDE:**
- API root
- Workflow triggers (run — pinned to API key org)
- Usage stats
- Agent list
- Talk channels (list, messages)
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ API key management (belongs to `apikey`)
- ❌ Internal workflow execution (belongs to `composer`)

**DEPENDENCIES:**
- `apikey` (for key validation)
- `composer` (for workflow execution)
- `talk` (for channel access)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: ApiKey, WorkflowRun
- Redis: Call ledger (pub:*), rate limits
- Services: `publicApi/publicApi.service.ts`, `publicApi/publicApiUsage.service.ts`, `services/workflow.service.ts`, `services/webhook.service.ts`

**STATUS:** 🟢 COMPLETE — Public API working

---

### WEBHOOK_MODULE
**PURPOSE:** Inbound webhook receiver — event ingestion

**WHAT BELONGS INSIDE:**
- Webhook inbox (log)
- Event dispatch (to EventBus)
- Replay
- Delete correction
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ Outbound webhooks (belongs to `enterprise` event bus)
- ❌ Billing webhooks (belongs to `billing`)

**DEPENDENCIES:**
- `enterprise` (for event bus dispatch)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Webhook events, inbox
- Redis: Inbox queue (whk:inbox)
- Services: `webhook/webhookReceiver.service.ts`

**STATUS:** 🟢 COMPLETE — Webhook receiver working

---

### MOBILE_MODULE (S21/117)
**PURPOSE:** Mobile app — device management, push, offline sync, biometrics, PIN

**WHAT BELONGS INSIDE:**
- Device config
- Device registration (CRUD)
- Push subscription (CRUD, test)
- Biometric registration/verify (challenge + verify)
- PIN set/verify
- Notifications (read, read-all)
- Offline actions (queue, replay, resolve, discard)
- Device trust
- PIN lock
- Push health
- Policy (CRUD)
- Assurance
- Events
- Dashboard rollup
- Notes

**WHAT DOES NOT BELONG:**
- ❌ User authentication (belongs to `auth`)
- ❌ MFA (belongs to `mfa`)

**DEPENDENCIES:**
- `auth` (for user identity)
- `mfa` (for biometric/PIN policies)

**INTEGRATIONS:**
- Google (push, optional)

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: MobileDevice, PushSubscription, BiometricCredential, OfflineAction, Notification
- Redis: Queue, PIN throttle, push health
- Services: `mobile/mobileSync.service.ts`, `services/mobileAuth.service.ts`, `services/push.service.ts`

**STATUS:** 🟢 COMPLETE — Mobile working

---

### EVENTS_MODULE (S126)
**PURPOSE:** Real-time SSE channel — event streaming, custom events, client management

**WHAT BELONGS INSIDE:**
- SSE stream (org-scoped, ring buffer)
- Stream health
- History (with Last-Event-ID replay)
- Clients (list, revoke)
- Custom event publish
- Notes
- Dashboard rollup

**WHAT DOES NOT BELONG:**
- ❌ Event bus schemas (belongs to `enterprise`)
- ❌ Inbound webhooks (belongs to `webhook`)

**DEPENDENCIES:**
- `enterprise` (for event bus)
- `webhook` (for inbound→SSE bridge)

**INTEGRATIONS:** None

**AI AGENTS:** None

**DATABASE/SERVICES:**
- PostgreSQL: Stream clients, events
- Redis: Ring buffer (evt:hist), client state
- Services: `events/events.service.ts`, `services/eventBus.ts`

**STATUS:** 🟢 COMPLETE — Events working

---

## 🚫 REMOVED / DEPRECATED MODULES

### platformServices.billing (REMOVE)
**Reason:** Duplicate of `billing` module  
**Action:** Remove `/api/v1/platform-services/billing*` endpoints, redirect to `billing` module

### advertising (MERGE into marketing or clarify)
**Reason:** Campaign concepts duplicated with `marketing`  
**Action:** Either merge or clearly document boundary: advertising = paid, marketing = organic

### aws/gcp/azure scattered references (CONSOLIDATE)
**Reason:** Cloud provider integrations scattered across modules  
**Action:** Create `cloudProviders` service abstraction

---

## 📊 MODULE COUNT BY LAYER

| Layer | Module Count | Status |
|-------|-------------|--------|
| Core Platform | 7 | 🟢 6 complete, 🟡 1 partial (permissions) |
| Infrastructure & Platform | 9 | 🟢 All complete |
| AI Platform | 9 | 🟢 8 complete, 🟡 1 needs merge (aiPlatform) |
| Voice & Media | 8 | 🟢 7 complete, 🟡 1 needs merge (voice) |
| Business Applications | 12 | 🟢 11 complete, 🟣 1 missing (commerce) |
| Collaboration | 6 | 🟢 All complete |
| Data & Intelligence | 7 | 🟢 All complete |
| Enterprise Services | 3 | 🟢 All complete |
| Domain Intelligence | 18 | 🟢 All complete |
| Operations & Governance | 11 | 🟢 All complete |
| **TOTAL** | **90+** | **~85% complete, ~10% needs merge, ~5% missing** |

---

## 🔄 DATA FLOW BETWEEN MODULES

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Web/Mobile)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY (Express)                       │
│  - Auth middleware                                              │
│  - Org scoping middleware                                       │
│  - Rate limiting                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│  CORE PLATFORM │    │  AI PLATFORM     │    │ INFRASTRUCTURE│
│  - auth       │    │  - aiPlatform    │    │  - platform   │
│  - mfa        │    │  - agents        │    │  - infra      │
│  - kernel     │    │  - agentComm     │    │  - releases   │
│  - security   │    │  - agentMemory   │    │  - DR         │
│  - permissions│    │  - aiEconomy     │    │  - updates    │
│  - audit      │    │  - experts       │    │  - licensing  │
│  - notifications│  │  - aiEngineering │    │               │
└──────────────┘    └──────────────────┘    └──────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│  VOICE & MEDIA│    │  BUSINESS APP    │    │ COLLABORATION│
│  - voice      │    │  - crm           │    │  - convos    │
│  - wakeIntel  │    │  - leadDiscovery │    │  - talk      │
│  - mediaGen   │    │  - helpdesk      │    │  - canvas    │
│  - mediaFactory│   │  - emailIntel    │    │  - composer  │
│  - musicGen   │    │  - erp           │    │  - extensions│
│  - musicVideo │    │  - billing       │    │  - marketplace│
│  - website    │    │  - payments      │    │               │
│  - social     │    │  - giftCards     │    │               │
│               │    │  - globalCurrency│    │               │
│               │    │  - enterpriseFinOps│   │               │
│               │    │  - geoBilling    │    │               │
└──────────────┘    └──────────────────┘    └──────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│  DATA & INTEL │    │  ENTERPRISE      │    │ DOMAIN AI    │
│  - search     │    │  - enterprise    │    │  - trading   │
│  - cognitive  │    │  - enterpriseFound│   │  - derivatives│
│  - identity   │    │  - tenantIso     │    │  - crypto    │
│  - bi         │    │                  │    │  - health    │
│  - usage      │    │                  │    │  - biomedical│
│  - dataMarket │    │                  │    │  - legal     │
│               │    │                  │    │  - scientific│
│               │    │                  │    │  - education │
│               │    │                  │    │  - cyber     │
│               │    │                  │    │  - quantum   │
│               │    │                  │    │  - robotics  │
│               │    │                  │    │  - spatial   │
│               │    │                  │    │  - sustain   │
│               │    │                  │    │  - opex      │
│               │    │                  │    │  - constitution│
│               │    │                  │    │  - autonomous│
│               │    │                  │    │  - industry  │
└──────────────┘    └──────────────────┘    └──────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PERSISTENCE LAYER                             │
│  - PostgreSQL 17 (Prisma)                                       │
│  - Redis 8 (Cache, Pub/Sub, Queues)                             │
│  - File Storage (videos, audio, documents)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✅ COMPLIANCE CHECKLIST

- [x] Every capability has single module ownership
- [x] No database cross-module joins without API boundaries
- [x] AI OS (orchestration) separated from AI Employees (execution)
- [x] Frontend/backend boundaries defined per module
- [x] Security/RBAC ownership clarified (security + permissions modules)
- [x] Billing ownership consolidated (billing module)
- [x] Memory ownership clarified (agentMemory module)
- [x] Voice/wake-word ownership clarified (voice + wakeIntel + voiceOwnership)
- [x] Workflow engine ownership clarified (composer module)
- [x] CRM vs Helpdesk vs Lead Discovery boundaries defined
- [x] Revenue Guardian (OpEx) vs Billing boundaries defined
- [x] Marketplace vs Extensions boundaries defined
- [x] Command Center vs AI Engineering Command Center boundaries defined
- [x] Cybersecurity (security) vs Infrastructure Monitoring (infrastructure) boundaries defined
- [x] Developer/API platform boundaries defined (devportal, publicApi, apikey)
- [x] Multi-tenant boundaries defined (tenantIsolation)
- [x] Notifications ownership defined (🟣 notifications module — planned)
- [x] Analytics/BI boundaries defined (businessIntelligence + usage)
- [x] Data flow between modules documented

---

**END OF MASTER MODULE ARCHITECTURE DOCUMENT**
