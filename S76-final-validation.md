# S76 Final Integration Validation Checklist

Per master-spec Session 76 (Final Enterprise Integration & Validation), every bullet below
must pass before the MVP is considered production-ready. Run this list against a clean
install following `DEPLOYMENT.md`.

**Status as of v0.89.0:** all 12 bullets verified. Re-run this after every deploy.

---

## 1. Single Unified Marketplace
> There shall be ONE marketplace across data/knowledge, models, voice, agents, skills,
> workflows, plugins, extensions, and industry packs — no per-module parallel marketplaces.

**Verification:**
- `/api/v1/data-marketplace/dashboard/rollup` aggregates asset counts across 10 kinds.
- `/api/v1/marketplace/dashboard/rollup` (S34) covers skills/digital twins/simulations/apps in one registry.
- `/api/v1/extensions/dashboard/rollup` (S28) unifies business/industry/skills/agents/workflows/dashboards/UI extensions.
- Model registry is S46 (`/ml-ops/models`) — voice library is S40/S41 — all routed through one data/knowledge plane via S61 and S69.3 unified network.
- Code inspection confirms no duplicate "marketplace" services; each surface is a view over the shared registry pattern.

**Status:** ✅ Pass

## 2. Single Model Registry
> One Model Registry (S46) feeds S33 routing, S39 kernel model selection, S43 hybrid exec, S60 fine-tuning, and S62/S65/S69/S75 downstream consumers.

**Verification:**
- `GET /ml-ops/models` returns all 12 seeded models.
- S33 provider abstraction references S46 registry; no second model table exists.
- S39 Kernel `model.select` pulls from S46.

**Status:** ✅ Pass

## 3. Single Trust Center
> Trust Center lives in S56/S73. Other modules must NOT introduce parallel trust signals.

**Verification:**
- `/fabric/dashboard/rollup` (S56) exposes trust levels.
- `/opex/dashboard/rollup` (S73) extends (not forks) Trust Center with safety benchmarks, regulations, governance gates L1–L5.
- No other module exposes a "trust score" field that disagrees.

**Status:** ✅ Pass

## 4. Single Voice Library + Consent Gate
> One voice library (S40 built-in + S41 foundry) governed by S44 ownership/consent. Cloning requires explicit consent; foundry synthetic voices carry audit.

**Verification:**
- `POST /voice-studio/voices/clone` without `consentGranted: true` returns 400 CONSENT_REQUIRED (verified in playwright tests).
- S41 foundry synthetic voices are tagged `ownership: windels` with audit trail; S44 onboard registers them.
- S62 digital humans reuse S40/S41 voices; no parallel voice synthesis.
- S75 health voice outputs route through S40 → S44 consent.

**Status:** ✅ Pass

## 5. Single Consent / Privacy Framework
> S44 voice ownership/consent is the canonical consent framework; S75 Fifth Standing Rule enforces health-label consent; S13 encryption handles data at rest.

**Verification:**
- `GET /voice-ownership/dashboard/rollup` returns policies and audit counts.
- S75 insights are labeled with evidence tier; no unlabeled health output leaves the API.
- AES-256-GCM envelope encryption applies to all integration credentials and SSO secrets.

**Status:** ✅ Pass

## 6. Kernel-Routed Architecture (S39)
> Every AI capability routes through KernelService (S39) for policy, resource grants, model selection, event logging.

**Verification:**
- S39 `/kernel/dispatch` accepts typed events and returns decisions.
- S40 TTS emits `voice.tts` kernel event; S42 media-gen routes compute allocation through S39; S81 trading emits `trading.simulation` / `trading.recommendation` to kernel; S36 wake-intel emits activation events.
- Kernel components report health; self-heal loop returns degraded components to online.

**Status:** ✅ Pass

## 7. DOC / GCC / Mission Control Layering
> S56 Mission Control (live KPIs), S70 Global Command Center (executive rollup with incidents/briefings), and S74 Digital Operations Center (regional workload/telemetry) form a layered view — none duplicates the others.

**Verification:**
- `/fabric/dashboard/rollup` → live KPIs, AIO bus recent events, trust level.
- `/command/dashboard/rollup` → regions, incidents, briefings, initiatives, global KPIs.
- `/industry/dashboard/rollup` → DOC with 9 regions × workloads.
- Code inspection confirms each pulls from its own seed, no copy-paste duplication.

**Status:** ✅ Pass

## 8. Four-Layer Platform Architecture Documented
> Platform One (AI Core), Two (Enterprise Business), Three (AI Studio), Four (Developer & Marketplace) per S74.5; documented in ARCHITECTURE.md.

**Verification:**
- `ARCHITECTURE.md` lists four layers and module registry (38–75+82).
- `/industry/dashboard/rollup` returns `layerMapping` reflecting the four-layer model.

**Status:** ✅ Pass

## 9. Voice-Cloning Consent Gate Enforced
> UI and API enforce consent before any clone operation; violations counted on voice studio dashboard.

**Verification:**
- Playwright: POST clone without consent → 400 CONSENT_REQUIRED.
- Dashboard rollup returns `consentViolations` count (0 in normal operation).
- UI "Try clone" demo demonstrates the block.

**Status:** ✅ Pass

## 10. Health Evidence Tier Labeling (Fifth Standing Rule)
> Every S75 health/wellness insight is labeled one of: `wellness_estimate | clinically_validated | medical_decision_support`. Wellness estimates carry "informational — not medical advice" disclaimer. UI renders crimson evidence-tier banner.

**Verification:**
- `/health-ecosystem/dashboard/rollup` returns insights array; each has exactly one of the three labels.
- Smoke script: `curl .../health-ecosystem/dashboard/rollup | jq '.data.insights | map(.label) | unique'` returns exactly the three labels (seed includes all three).
- UI banner renders via `HealthEcosystemTab` in PlatformPage.tsx.

**Status:** ✅ Pass

## 11. AIO Bus Wiring Confirmed
> All major modules publish to the S56 AIO bus (or S18 EventBus) and subscribers can cross-listen.

**Verification:**
- S57 robotics publishes `twin.telemetry`; S32 collaboration publishes meeting events; S20 agent-comm uses S18 event bus; S56 bus-recent endpoint shows events.
- `/fabric/bus/recent` returns last 200 events.
- S19 Sync service listens on `*` and projects events into KG+Memory (verified end-to-end in Session 19 tests).

**Status:** ✅ Pass

## 12. End-to-End Smoke Passes from a Cold Start
> Following DEPLOYMENT.md on a fresh machine yields: all 16 dashboards 200, super-admin can log in, web UI loads without console errors.

**Verification:**
- Fresh-PG + fresh-Redis boot sequence verified multiple times during development.
- Lazy bootstrap on first dashboard call ensures orgs auto-seed even if setTimeout misses.
- Playwright suite (40+ tests) passes against the running stack.

**Status:** ✅ Pass

---

## Automated Gate

The S76 service (`/api/v1/validation/report`) runs a programmatic 22-item checklist covering
the above plus extras (payment-gateway registration, no-parallel-payments, child-safety
reviewer, etc.). To confirm 22/22 pass:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@windels.ai","password":"W1ndels!Admin#2026"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")

curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/v1/validation/report | \
  python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('passed:',d['checks']['passed'],'/',d['checks']['total']);print('duplicates:',d['duplicateSystems']);print('consent gate:',d['consentGateEnforced']);print('governance gate:',d['governanceGateEnforced'])"
```

Expect `passed: 22 / 22`, `duplicates: 0`, both gates `true`.

---

## Sign-off

When all boxes above are ✅, the MVP is cleared for production deployment per Session 76.
Re-run after every change that touches authentication, governance, or cross-module wiring.
