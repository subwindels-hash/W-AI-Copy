# WINDELS AI OS — AI MODULE DEEP-DIVE

**Version:** 4.0  
**Date:** 2026-08-07  
**Status:** AUTHORITATIVE  

---

## MODULE: AGENTS (S7-8)

### PURPOSE
AI agent framework — agent lifecycle, skills, registration, events.

### WHAT BELONGS INSIDE
- Agent CRUD (create, read, update, delete)
- Agent lifecycle management (start, stop, pause, resume)
- Agent skills (CRUD, assign to agents)
- Agent events log (task started, completed, failed, etc.)
- Agent metadata/models
- Agent heartbeat

### WHAT DOES NOT BELONG
- ❌ Agent-to-agent communication → belongs to `agentComm`
- ❌ Agent memory storage → belongs to `agentMemory`
- ❌ Agent execution runtime → belongs to `kernel` AI runtime
- ❌ Professional workforce agents → belongs to `expertsPlatform`
- ❌ Engineering agents → belongs to `aiEngineering`

### DEPENDENCIES
- `kernel` (for AI execution)
- `agentMemory` (🟡 NEW: for memory)
- `agentComm` (for communication)

### INTEGRATIONS
- Azure (optional)

### AI AGENTS
This module manages AI agents; doesn't contain agents itself.
Built-in agents: Executor, Researcher, Analyst, Creative, Coordinator

### DATABASE/SERVICES
- **PostgreSQL:** `Agent`, `AgentEvent`, `AgentSkill`
- **Redis:** Agent state, lifecycle, heartbeat
- **Services:** 
  - `agents/agents.service.ts`
  - `services/agentLifecycle.service.ts`
  - `services/agentSkills.service.ts`
- **Routes:** `apps/api/src/http/routes/agents.ts`
- **Shared:** `packages/shared/src/agents.ts` (166 LOC)
- **Frontend:** `apps/web/src/lib/agents.ts`

### STATUS
🟢 **COMPLETE** — Full agent framework working, lifecycle, skills, events

---

## MODULE: AGENT_COMM

### PURPOSE
Agent-to-agent communication — identities, messaging, teams, handoffs, reasoning, feedback, escalations.

### WHAT BELONGS INSIDE
- Agent identities (CRUD, lifecycle, capabilities, credentials)
- Agent messaging (inbox, outbox, history)
- Agent teams (CRUD, members)
- Handoffs (initiate, respond, complete)
- Reasoning chains (CRUD, evidence, steps, conclude, critique)
- Feedback (give, receive, metrics)
- Communication policies
- Escalations (evaluate, decide, acknowledge)
- Communication stats

### WHAT DOES NOT BELONG
- ❌ Agent memory storage → belongs to `agentMemory`
- ❌ Agent knowledge storage → belongs to `agentMemory` or `identityKnowledge`
- ❌ Agent execution → belongs to `kernel` + `agents`
- ❌ Agent skills → belongs to `agents`

### DEPENDENCIES
- `agents` (for agent identity)
- `agentMemory` (🟡 NEW: for memory/knowledge access)

### INTEGRATIONS
None

### AI AGENTS
None (facilitates agent communication)

### DATABASE/SERVICES
- **PostgreSQL:** Agent identities, messages, teams, handoffs, reasoning, feedback, policies, escalations
- **Redis:** Real-time comm channels
- **Services:**
  - `enterprise/agentComm/agentIdentity.service.ts`
  - `enterprise/agentComm/commProtocol.service.ts`
  - `enterprise/agentComm/collaboration.service.ts`
  - `enterprise/agentComm/reasoning.service.ts`
  - `enterprise/agentComm/feedback.service.ts`
  - `enterprise/agentComm/escalation.service.ts`
  - `services/agentKnowledge.service.ts`
  - `services/agentMemory.service.ts`
- **Routes:** `apps/api/src/http/routes/agentComm.ts`, `agentKnowledge.ts`, `agentMemories.ts`
- **Shared:** `packages/shared/src/agentComm.ts` (310 LOC)

### STATUS
🟢 **COMPLETE** — Full agent communication working, messaging, teams, handoffs, reasoning

---

## MODULE: AGENT_MEMORY (🟡 EXTRACT)

### PURPOSE
Centralized agent memory and knowledge management — memory CRUD, knowledge base, consolidation, sharing.

### WHAT BELONGS INSIDE
- Agent memory CRUD (facts, preferences, procedures, conversations, tasks, feedback)
- Agent knowledge CRUD (documents, URLs, snippets, files)
- Memory consolidation (evolution, merging)
- Memory sharing (cross-agent)
- Knowledge graph relations
- Memory fabric sync
- Context retrieval

### WHAT DOES NOT BELONG
- ❌ Communication messages → belongs to `agentComm`
- ❌ Identity knowledge → belongs to `identityKnowledge`
- ❌ World model entities → belongs to `cognitive`
- ❌ Agent execution → belongs to `kernel` + `agents`

### DEPENDENCIES
- `agents` (for agent identity)
- `cognitive` (for world model integration)

### INTEGRATIONS
None

### AI AGENTS
None (provides memory to agents)

### DATABASE/SERVICES
- **PostgreSQL:** `AgentMemory`, `AgentKnowledge`
- **Redis:** Memory cache, vector indices (pgvector)
- **Services:**
  - `services/agentMemory.service.ts`
  - `services/agentKnowledge.service.ts`
- **Routes:** `apps/api/src/http/routes/agentMemories.ts`, `agentKnowledge.ts`
- **Shared:** Types in `packages/shared/src/agents.ts`

### STATUS
🟡 **PARTIAL** — Memory/knowledge storage exists, formalization as module needed

---

## MODULE: AI_PLATFORM (🟡 MERGED: kernel + aiEcosystem provider abstractions)

### PURPOSE
Unified AI provider management, model registry, routing, personalities, trust/explainability.

### WHAT BELONGS INSIDE

**Provider Management:**
- Provider CRUD, status, health
- Provider credential management

**Model Registry:**
- Model definitions, versions
- Model selection/resolution

**Routing:**
- Routing policies (CRUD)
- Benchmarks (CRUD)
- Provider health monitoring

**Personalities:**
- Personality/persona management (CRUD)
- Voice persona mapping
- Avatar management

**Trust/Explainability:**
- Trust reports (CRUD)
- Trust scores
- Trust compliance
- Evidence, viewpoints, uncertainty, compliance

### WHAT DOES NOT BELONG
- ❌ Agent lifecycle → belongs to `agents`
- ❌ Agent communication → belongs to `agentComm`
- ❌ AI request logging → belongs to `kernel`
- ❌ GPU capacity/econ → belongs to `aiEconomy`

### DEPENDENCIES
- `kernel` (for provider registry, request routing)
- `agents` (for agent model selection)

### INTEGRATIONS
- OpenAI
- Anthropic
- Azure AI
- Google AI

### AI AGENTS
None (manages AI for agents)

### DATABASE/SERVICES
- **PostgreSQL:** Providers, models, routing_policies, personalities, trust_reports
- **Redis:** Provider health cache
- **Services:**
  - `aiEcosystem/providerAbstraction.service.ts`
  - `aiEcosystem/personalityStudio.service.ts`
  - `aiEcosystem/trustExplainability.service.ts`
- **Routes:** `apps/api/src/http/routes/aiEcosystem.ts`
- **Shared:** `packages/shared/src/aiEcosystem.ts` (341 LOC)

### STATUS
🟡 **NEEDS MERGE** — Provider abstraction exists in aiEcosystem, needs integration with kernel

---

## MODULE: AI_ECONOMY (S71)

### PURPOSE
GPU capacity ledger, usage tracking, allocations, offers, economics.

### WHAT BELONGS INSIDE
- Usage tracking (CRUD)
- Allocations (CRUD)
- Offers (CRUD)
- Dashboard rollup
- Usage analytics

### WHAT DOES NOT BELONG
- ❌ AI provider management → belongs to `aiPlatform`
- ❌ Agent execution → belongs to `kernel`
- ❌ Billing/invoicing → belongs to `billing`

### DEPENDENCIES
- `billing` (for economic settlement)
- `kernel` (for usage data)

### INTEGRATIONS
None

### AI AGENTS
None

### DATABASE/SERVICES
- **PostgreSQL:** Usage, allocations, offers
- **Redis:** Real-time usage counters
- **Services:** `aiEconomy/aiEconomy.service.ts`
- **Routes:** `apps/api/src/http/routes/aiEconomy.ts`
- **Shared:** `packages/shared/src/aiEconomy.ts` (125 LOC)

### STATUS
🟢 **COMPLETE** — AI economy ledger working, usage, allocations, offers

---

## MODULE: EXPERTS_PLATFORM (S77a)

### PURPOSE
Professional workforce AI agents, expert courses, packages.

### WHAT BELONGS INSIDE
- Expert agents (registry, query)
- Expert courses
- Expert packages
- Dashboard rollup
- Notes

### WHAT DOES NOT BELONG
- ❌ Core agent framework → belongs to `agents`
- ❌ Agent communication → belongs to `agentComm`
- ❌ General AI providers → belongs to `aiPlatform`

### DEPENDENCIES
- `agents` (for agent execution)
- `aiPlatform` (for model selection)

### INTEGRATIONS
- OpenAI
- Anthropic

### AI AGENTS
Expert agents (Government, Doctor, Engineer, Lawyer, etc.)

### DATABASE/SERVICES
- **PostgreSQL:** Expert agent definitions, courses, packages
- **Services:** `expertsPlatform/expertsPlatform.service.ts`
- **Routes:** `apps/api/src/http/routes/expertsPlatform.ts`
- **Shared:** `packages/shared/src/expertsPlatform.ts` (93 LOC)

### STATUS
🟢 **COMPLETE** — Expert platform working, expert agents, courses, packages

---

## MODULE: AI_ENGINEERING (S124)

### PURPOSE
AI software engineering workforce — 18 specialized AI engineers + orchestrator, GitHub integration, repository intelligence.

### WHAT BELONGS INSIDE

**Engineering Workforce:**
- Engineering roles (18 specialized roles)
- Engineering tasks (CRUD, run, PR)
- Workforce management

**Repository Management:**
- Repository CRUD, team assignment, scan, intel
- GitHub connections (CRUD)
- GitHub operations:
  - Branches (list, create)
  - Commits (create)
  - Pull requests (list, create, merge, review, update)
  - Issues (list, create, update)
  - Milestones (list, create)
  - Releases (list, create, generate notes)
  - Workflows (list, dispatch)
  - Checks (list)

**Engineering Memory:**
- Memory CRUD
- Knowledge graph (observed vs heuristic nodes)

**Command Center:**
- Engineering command center (counts, connected accounts)

### WHAT DOES NOT BELONG
- ❌ General agent framework → belongs to `agents`
- ❌ General command center → belongs to `command` (global scope)
- ❌ General knowledge management → belongs to `identityKnowledge`

### DEPENDENCIES
- `agents` (for AI engineer agents)
- `command` (for cross-module command center)
- `identityKnowledge` (for engineering knowledge)

### INTEGRATIONS
- GitHub API (verified connections, masked tokens)

### AI AGENTS
18 specialized AI engineers + orchestrator:
- Frontend Engineer, Backend Engineer, DevOps Engineer, QA Engineer, etc.

### DATABASE/SERVICES
- **PostgreSQL:** Repos, tasks, memory, connections, GitHub data, knowledge graph
- **Services:**
  - `aiEngineering/workforce.service.ts`
  - `aiEngineering/github.service.ts`
  - `aiEngineering/repoIntel.service.ts`
  - `aiEngineering/memory.service.ts`
  - `aiEngineering/commandCenter.service.ts`
- **Routes:** `apps/api/src/http/routes/aiEngineering.ts` (42 endpoints)
- **Shared:** `packages/shared/src/aiEngineering.ts` (342 LOC)
- **Frontend:** `apps/web/src/lib/aiEngineering.ts`

### STATUS
🟢 **COMPLETE** — Full AI engineering workforce working, GitHub integration, memory, command center

---

## SUMMARY: AI PLATFORM LAYER

| Module | Status | Purpose | AI Agents |
|--------|--------|---------|-----------|
| `agents` (S7-8) | 🟢 COMPLETE | Agent framework, lifecycle, skills | Manages built-in agents (Executor, Researcher, etc.) |
| `agentComm` | 🟢 COMPLETE | Agent communication, teams, handoffs, reasoning | Facilitates agent-to-agent communication |
| `agentMemory` | 🟡 PARTIAL | Agent memory, knowledge, consolidation | Provides memory to agents |
| `aiPlatform` | 🟡 MERGE | Provider management, models, routing, personalities | Manages AI for agents |
| `aiEconomy` (S71) | 🟢 COMPLETE | GPU capacity, usage, allocations, offers | None |
| `expertsPlatform` (S77a) | 🟢 COMPLETE | Professional workforce experts | Government, Doctor, Engineer, Lawyer, etc. |
| `aiEngineering` (S124) | 🟢 COMPLETE | AI software engineering workforce | 18 specialized AI engineers + orchestrator |

---

**END OF AI MODULE DOCUMENTATION**
