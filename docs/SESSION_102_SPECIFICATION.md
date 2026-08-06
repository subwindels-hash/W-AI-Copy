# SESSION 102 SPECIFICATION — AI WORKFORCE / AGENT FRAMEWORK COMPLETION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S101, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: AI Workforce Platform
```

## 1. Objective

The core Agent Framework already had working Prisma-backed agent, memory,
knowledge, skill and lifecycle services plus a Workforce Hub page. The audit
classified it as `PARTIAL` because the JSON contracts were scattered across
service-local Zod schemas and hand-copied web types, the dedicated agent suite
had only four basic tests, the mobile client treated a paginated response as
an array, and lifecycle Redis keys did not include an organization segment.

Session 102 completes the framework as an additive vertical slice:

1. shared `Ag` contracts for agents, events, memories, knowledge, skills,
   model metadata, pagination, lifecycle transitions and request validation;
2. the existing CRUD and AI model validation paths consume those shared
   contracts while retaining backwards-compatible schema exports;
3. directory filtering and pagination are covered by real service tests;
4. cross-organization reads, updates, deletes and event reads are tested;
5. the mobile agent view consumes the real paginated API and no longer shows
   placeholder task counts or no-op create actions;
6. lifecycle state and history are written under org-scoped Redis keys, with a
   one-time legacy-key migration after the agent organization is verified;
7. Session 89 audits `agent:lifecycle` and
   `agent:lifecycle:history` as `org_scoped` namespaces.

## 2. Shared contracts

`packages/shared/src/agents.ts` owns:

- `AgAgent`, `AgAgentStats`, `AgAgentEvent`, `AgAgentMemory`,
  `AgAgentKnowledge`, `AgAgentSkill`, `AgModelInfo`;
- `AgPaginated<T>` and public lowercase status/lifecycle unions;
- `AgAgentCreateSchema`, `AgAgentUpdateSchema`,
  `AgAgentListQuerySchema`, `AgAgentIdSchema`;
- `AgSkillCreateSchema`, `AgMemoryCreateSchema`,
  `AgKnowledgeCreateSchema`, `AgLifecycleTransitionSchema`.

The API retains `CreateAgentSchema`, `UpdateAgentSchema`,
`CreateSkillSchema`, `CreateMemorySchema`, `CreateKnowledgeSchema` and
`TransitionSchema` as compatibility aliases to the shared definitions.

## 3. API and isolation surface

The existing authenticated `/api/v1/agents` family remains the public surface:

| Method | Path | Purpose |
|---|---|---|
| GET | `/meta/models` | available model registry metadata with honest provider state |
| GET/POST | `/` | list/filter agents or create an organization-scoped agent |
| GET/PATCH/DELETE | `/:id` | read/update/delete an in-scope agent |
| GET | `/:id/events` | paginated agent event history after an org access check |
| GET/POST | `/:id/lifecycle` | read or transition lifecycle state |
| GET/POST | `/:id/skills` | list or create scoped skills |
| GET/PATCH/DELETE | `/:id/skills/:skillId` | skill CRUD with tool validation |
| GET/POST/DELETE | `/:agentId/memories*` | scoped memory CRUD |
| GET/POST/DELETE | `/:agentId/knowledge*` | scoped knowledge CRUD |

All user-facing reads resolve the caller's organization through
`resolveUserContext` and constrain the agent by `organizationId`. Lifecycle
state keys are now:

- `agent:lifecycle:<org>:<agentId>`
- `agent:lifecycle:history:<org>:<agentId>`

Legacy unscoped slots are migrated only after the agent organization is
resolved from Prisma, then deleted. New writes never use unscoped keys.

## 4. UI surface

- `/app/workforce` continues to render the Workforce Hub with real agent CRUD,
  memory, knowledge, activity, skill and task-assignment controls.
- `/m/agents` now consumes `agentsApi.list()` and renders real paginated agent
  records, online/working counts and assigned-task counts. Empty-state and FAB
  actions navigate to the real Workforce Hub instead of silently doing nothing.
- The typed `apps/web/src/lib/agents.ts` client uses the shared `Ag` records and
  pagination contract.

## 5. Verification gate

- `apps/api/src/agents/agents.test.ts` covers 10 tests: organization-scoped
  creation/listing, status/query/pagination filtering, update/model validation,
  cross-tenant mutations, built-in deletion protection, event access and Zod
  contracts.
- `make verify` must pass with offline Prisma generation; live Postgres/Redis
  lifecycle migration and end-to-end auth remain runtime gates.
- The inventory may mark Agent Framework `COMPLETE` only when shared contracts,
  scoped services/routes, web clients/pages, tests and isolation registration
  are all present.
