# WINDELS AI OS — Unfinished Modules Inventory

**Date:** 2026-08-07

> The automated `audit/module-inventory.json` reports **109 modules COMPLETE / 0
> PARTIAL / 0 STUB** — but "COMPLETE" there means *code + tests exist*. It does
> **not** mean the module does real production work. The modules below are the
> honest "unfinished" set: they either **simulate/placeholder their data**, are
> **missing a real external integration / pipeline**, have **spec-required
> features not built**, or are **not runtime-verified** in a target environment.

---

## 1. Modules still running on SIMULATED / placeholder data
(Code and tests exist, but they generate fake data until a real external provider
is connected. Source: `docs/SIMULATED_MODULES_INVENTORY.md`.)

| # | Module | Files | Why unfinished / what's missing |
|---|---|---|---|
| 1 | **Enterprise Robotics Fleet Monitoring** (S57) | `robotics/robotics.service.ts` | `Math.random()` battery/coords/task queues. Needs real MQTT/AMQP/WebSocket telemetry from IoT nodes. |
| 2 | **Market Data — non‑crypto tickers** (S81) | `tradingIntel/marketData.ts` | Stocks/Forex/ETFs/Bonds use a `SyntheticProvider` random walker (`synthetic:true`). Needs Polygon/TwelveData/Tradier/Alpaca live feeds. |
| 3 | **Spatial Computing** (S58) | `spatial/spatial.service.ts` | Simulated VR headset devices/coords. Needs WebXR/Unity/Unreal telemetry endpoints. |
| 4 | **Quantum Coherence** (S63) | `quantum/quantum.service.ts` | Simulated qubits/fidelity/coherence. Needs AWS Braket / IBM Quantum / Google Quantum AI. |
| 5 | **Biomedical Diagnostics** (S65) | `biomedical/biomedical.service.ts` | Simulated MRI/CT queues + DICOM metadata. Needs live PACS/DICOM servers. |
| 6 | **Healthcare Patient Vitals** (S75) | `healthEcosystem/healthEcosystem.service.ts` | Random vitals (BP/HR ranges). Needs HL7 / FHIR / BLE wearable feeds. |
| 7 | **Legal Research** (S66) | `legal/legal.service.ts` | Static JSON case/contract templates. Needs CourtListener/LexisNexis/Westlaw + vector embeddings. |
| 8 | **Education** (S67) | `education/education.service.ts` | Simulated students/classes/curriculums. Needs Canvas/Moodle/Blackboard LMS APIs. |
| 9 | **Scientific Labs** (S68) | `scientific/scientific.service.ts` | Simulated lab nodes/experiments. Needs ELN/LIMS systems. |
| 10 | **Premium Voice Cloning** (S44) | `voiceStudio/cloning.ts` | Trainer is a stub returning beep files. Needs ElevenLabs Clone API or local Coqui/XTTS. |

---

## 2. Modules that are PARTIAL or INCOMPLETE in real functionality
(Source: `docs/PRODUCTION_READINESS_AUDIT.md` §4.2 — several may now have routes
scaffolded but still lack the real engine.)

| # | Module | Gap |
|---|---|---|
| 1 | **Autonomous Media / Video Rendering** | Routes/pipeline scaffolding exist; no real **ffmpeg render pipeline** — cannot actually render video. |
| 2 | ~~Lecturer / Education adaptive loop~~ | **RESOLVED 2026-08-07** — the Lecturer AI adaptive loop (`education/lecturer.service.ts`) is implemented and tested. It now powers the **Cyber & Cloud Academy** (`docs/CYBER_CLOUD_ACADEMY.md`), the **University module** (`docs/UNIVERSITY_EDUCATION.md`), and the **Universal University & Higher Education Engine** (`docs/UNIVERSITY_EDUCATION_ENGINE.md`). |
| 3 | **Workforce Expert agents** (gov / doctor / engineer / lawyer / teacher / scientific / cyber) | Agents registered but most return **template/echo responses**; domain tool‑schemas, curated knowledge, and safety boundaries outstanding. |
| 4 | **WMPC / Gift‑card → billing ledger** | Routes exist; full double‑entry ledger + double‑redemption / replay protection not transactionally integrated into billing. |
| 5 | **Service‑tokens / rotation / revocation** | JWT access + refresh exist; per‑service service‑tokens not fully implemented. |
| 6 | **Access reviews / dormant accounts / incident runbooks** | Spec‑required; **not built** in code. |
| 7 | **On‑chain crypto data** | Not implemented (Glassnode/Nansen/etc.); crypto agent surfaces this explicitly. |
| 8 | **Options‑chain data** | Not implemented (Polygon/Tradier/IEX/etc.). |
| 9 | **Live social/news sentiment feeds** | Not implemented; sentiment agent falls back to price/volume proxy. |
| 10 | **FX for crypto/NGN cross rates** | frankfurter covers fiat majors only; crypto FX via CoinGecko only. |

---

## 3. Frontend/UX work still pending
(Backend API is done; the web UI task remains.)

| # | Item |
|---|---|
| 1 | **MFA enrollment UX** — web login doesn't render the TOTP challenge screen yet. |
| 2 | **Google OAuth button** — "Sign in with Google" button not on the web login page. |
| 3 | **Voice UI playback hook‑up** — Voice Studio should use `speechSynthesis` when `clientSide:true` and show a "VOICE MODEL NOT CONFIGURED" callout. |

---

## 4. Configuration-required (wired but inert until credentials are supplied)
These activate the moment real keys/OAuth are provided — not code gaps, but **not
live** without them:

| Item | Env / dependency needed |
|---|---|
| Social Publishing (YouTube / TikTok / Instagram / Facebook / X / Pinterest) | OAuth app credentials + `PUBLISH_REDIRECT_URI` (reports `PLATFORM CREDENTIALS REQUIRED`) |
| OpenAI / Anthropic / Gemini / Ollama inference | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL` |
| ElevenLabs / Play.ht TTS | `ELEVENLABS_API_KEY`, `PLAYHT_API_KEY`, `PLAYHT_USER_ID` |
| Google OAuth | `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` |
| Production encryption | real 64‑hex `WINDELS_ENCRYPTION_KEY` |

---

## 5. Not yet runtime-verified (deployment pending)
Per `PROGRESS.md`, essentially **every module is marked 🟡 VERIFIED (partial)** —
the code and tests pass in‑sandbox, but the **runtime checklist in a target
environment** (real Postgres, Redis, Prisma `migrate deploy`, live services) is
still pending. Also flagged:

- **E2E suite stabilization** — ~15% of pre‑existing Playwright specs
  (aiEcosystem/collaboration) fail due to bootstrap‑seeding issues needing fixture repair.
- **Prisma migrations** — `prisma migrate deploy` must run against a fresh production DB.

---

## 6. Newly added (2026-08-07) — implemented, not runtime-verified

| Module | Files | Status |
|---|---|---|
| **Cyber & Cloud Academy** (Lecturer AI teaching tracks) | `education/cyberCloudAcademy.*`, `routes/cyberCloudAcademy.ts`, `shared/cyberCloudAcademy.ts` | ✅ Implemented, 6 tests; 🟡 runtime pending |
| **University module** (10 faculties / degree plans) | `education/university.*`, `routes/university.ts`, `shared/university.ts` | ✅ Implemented, 7 tests; 🟡 runtime pending |
| **Universal University & Higher Education Engine** (16 domains / 100+ fields, global directory, advisor, planner, research) | `education/universityEngine.*`, `routes/universityEngine.ts`, `shared/universityEngine*.ts`, `shared/universityDirectory.ts` | ✅ Implemented, 10 tests; 🟡 runtime pending |

These are **fully coded and tested** but, like every other module, still need the
target-environment runtime checklist (Postgres, Redis, AI provider key) to be
considered production-live.

---

## Quick reference — the genuinely unfinished names

**Simulated:** Robotics, Non‑Crypto Market Data, Spatial, Quantum, Biomedical,
Health Vitals, Legal, Education (LMS data), Scientific Labs, Voice Cloning.

**Partial/real‑engine missing:** Autonomous Video Render, Workforce Expert agents,
WMPC Gift‑card billing, Service‑tokens, Access reviews/runbooks, On‑chain crypto
data, Options‑chain data, Live sentiment feeds.

**Frontend pending:** MFA UX, Google OAuth button, Voice playback UI.

**Resolved (built + tested, runtime pending):** Lecturer AI adaptive loop, Cyber &
Cloud Academy, University module, Universal University & Higher Education Engine.
