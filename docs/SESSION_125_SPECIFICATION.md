# Session 125 — Super Admin Biography, Identity Memory & AI Knowledge System

**Module:** `identityKnowledge` (new core capability) · **Mount:** `/api/v1/identity-knowledge` · **Status:** COMPLETE (routes = 22, shared contract = 239 LOC, tests = 22 unit + 5 e2e)
**Date:** 2026-08-06 · **Branch:** `arena/019fd6f3-win`

---

## 1. Existing infrastructure reused (no duplicate systems)

| Requirement | Reused from | How |
| --- | --- | --- |
| Super Admin authority | `requireSuperAdmin` middleware (Role.SUPER_ADMIN) | every mutating route; re-checked in the service (`superAdminOnly`) so a mis-wired route cannot bypass it |
| Enterprise Memory Fabric | `memoryEvolution.service.ts` (`me:*`, content-deduplicated `add`) | every publish + manual sync writes a `knowledge` memory (scope `org:<oid>`, confidence 1 for verified) — re-syncs never duplicate |
| God-Node Orchestrator | `kernel.service.ts` `KernelService.dispatch` | every create/update/approve/publish/archive/delete/sync/agent-run dispatches `identity-knowledge.*` events |
| IAM / RBAC / ABAC | `req.user.role` + `hasPermission` (ORG_ADMIN) + record grants | private records: Super Admin, explicit grant, or ORG_ADMIN; organization: members; public: any authenticated |
| Audit & Compliance | Prisma `AuditLog` model | every mutation writes `identityKnowledge.<action>` rows (audit failures logged, never break the write) |
| Enterprise Search | `ES_ENTITY_TYPES` + `scanType` switch | new `knowledge` entity type; the search service indexes published records the caller may see (private never indexed) |
| Document uploads | attachments module (`uploadAttachment`, multipart, 25 MB, sha256) | `POST /documents` uploads through it, then records document metadata as a governed record |
| AI Workforce | module's own knowledge agents, kernel-dispatched | 8 specialized roles with deterministic, labelled runs |
| Governance kernel | classifications + approval workflow + version history | draft → pending_approval → approved → published \| archived; publish is the only path to `verified` |

## 2. What was built

### 2.1 Records (the governed knowledge base)

One unified record entity with `kind` (37: `biography_personal` … `biography_official`, `founder_profile`, `leadership_profile`, `speaking_profile`, `media_bio`, `brand_story`, `mission`, `vision`, `values`, `career_history`, `experience`, `education`, `certification`, `award`, `achievement`, `publication`, `research`, `interview`, `press_release`, `announcement`, `contact`, `website`, `social`, `faq`, `statement`, `vision_future`, `organization_profile`, `company_profile`, `product`, `service`, `project`, `industry`, `document`), `classification` (`private | organization | public`), `verified` (set **only** by a Super Admin publish), `status` lifecycle, `category`, `tags`, `documents[]`, `relations[]` (knowledge-graph edges), `grants[]` and a version counter.

**Storage:** `ik:rec:<org>:<id>` + `ik:recidx:<org>` (org in segment 2 — catalogued in the Session 89 sweep as `ik`, org-scoped). `ik:ver:<org>:<recId>:<n>` append-only version history (every mutation; chronological read). `ik:grant:<org>:<recId>` viewer grants. `ik:act:<org>` activity ledger.

### 2.2 Super Admin Biography Manager (API + console)

- CRUD: `POST/GET/PATCH/DELETE /records`, `GET /records/:id`, `GET /records/:id/versions`.
- Lifecycle: `POST /records/:id/approve`, `/publish` (sets `verified` + `publishedAt` + syncs), `/archive`.
- Permission controls: `POST/DELETE /records/:id/grants/:userId` (private-record viewers).
- Knowledge graph: `POST /records/:id/relations`, `GET /graph` (authorized nodes + edges).
- Documents: `POST /documents` (multipart → attachments infra → governed record).
- Bulk: `POST /import`, `GET /export` (JSON).
- `POST /sync` (Continuous Memory Synchronization: all published records into the Memory Fabric, kernel-dispatched).
- `GET /dashboard`, `GET /activity`.

### 2.3 AI response engine — `POST /ask`

Answers only from records the caller may see with status `approved` or `published`. **Approval gates AI usage; publish = verified = highest confidence.** Sections are labelled: **Verified Facts** (Super Admin approved + published) · **Super Admin Approved Information** (approved, not yet published) · **Organization Information** (authorized members) · **AI-Generated Summary** (explicitly labelled) · **Unknown Information**. Every response returns `sources[]` (recordId, title, kind, classification, verified, usedIn) for full traceability; the answer is audit-logged. When nothing matches: *"I do not have sufficient approved knowledge to answer that question."* — never a fabrication. Restricted (private) records are included only for Super Admin/granted viewers, and only in their answer.

### 2.4 Knowledge agents (AI Workforce)

8 roles: `biography_agent`, `organization_knowledge_agent`, `company_profile_agent`, `knowledge_verification_agent`, `knowledge_curator_agent`, `knowledge_synchronization_agent` (super-admin-gated), `ai_memory_manager`, `public_information_agent`. Runs are deterministic, labelled `aiGenerated: false`, audit-logged and kernel-dispatched.

### 2.5 Web — `IdentityKnowledgePage` at `/app/identity-knowledge`

Super Admin sees the Biography Manager tabs (records + versions, Approval Center, Document Upload Center, Knowledge Graph, Activity History) plus Library and AI Knowledge Insights (ask + agents + bulk import/export). Non-super-admins see only Library + Ask, with an explicit notice that only the Super Admin manages records. Verified badges, classification badges, version timelines, agent runs and the source traceability of every answer are rendered.

## 3. Honesty & security notes

- Only the Super Admin can create/edit/approve/publish/archive/delete/import/grant — enforced twice (route + service).
- `verified` cannot be set by any other path than a Super Admin publish; editing a published record returns it to `pending_approval` and clears verification until re-approved.
- The AI engine never answers from drafts or archived records, never leaks restricted records to unauthorized callers, and labels every AI-generated summary.
- Memory-fabric sync is content-deduplicated by the fabric itself (no duplicate knowledge), and Kernel events make every change visible to the orchestrator/command center.
- Enterprise Search indexes only published records the caller may see; private records are never indexed.

## 4. Tests

- `identityKnowledge/identityKnowledge.test.ts` (22): Super Admin authority (every mutation refused for ADMIN/USER), classification access (public/organization/private + grants + ORG_ADMIN), org isolation, publish→verified + memory-fabric dedupe, edit-from-published→pending_approval, append-only chronological versions, AuditLog rows for every action, ask engine (verified-first, approval gates usage, insufficient-knowledge honesty, restricted non-leak, organization sections), agents (biography, verification, curator, sync gating), graph, import/export, shared Zod.
- `tests/e2e/identityKnowledge.spec.ts` (5): non-super-admin 403 over HTTP, full lifecycle → ask with sources → unknown honesty, agents, document upload, dashboard/graph/activity + anonymous refusals.
- Enterprise Search: `knowledge` entity type wired into `scanType` (permission-aware via the threaded viewer) and `indexedCounts`.

**Full suite: 1775 passing / 51 skipped / 120 files** (Session 124 baseline 1753 / 51 / 119). API + web typecheck and production build clean.

## 5. Runtime validation

Live PostgreSQL 17 + Redis 8 are not available in this sandbox, so this session ends **🟡 VERIFIED (partial)** and ships `docs/SESSION_125_RUNTIME_VALIDATION_CHECKLIST.md`.

## 6. Files touched

| File | Change |
| --- | --- |
| `packages/shared/src/identityKnowledge.ts` | **new** — kinds, classifications, statuses, records, versions, answer types, agents, graph, dashboard + Zod |
| `packages/shared/src/index.ts` | export added |
| `packages/shared/src/enterpriseSearch.ts` | `knowledge` entity type added |
| `apps/api/src/identityKnowledge/identityKnowledge.service.ts` | **new** — records, lifecycle, versions, grants, relations, sync, ask, agents, import/export, documents, audit |
| `apps/api/src/http/routes/identityKnowledge.ts` | **new** — 22 routes (super-admin-gated writes) |
| `apps/api/src/http/server.ts` | `/api/v1/identity-knowledge` mount |
| `apps/api/src/tenantIsolation/tenantIsolation.service.ts` | `ik` catalogued org-scoped |
| `apps/api/src/enterpriseSearch/enterpriseSearch.service.ts` | `knowledge` scan case + viewer threading + counts |
| `apps/api/src/http/routes/enterpriseSearch.ts` | viewer passed to search |
| `apps/api/src/identityKnowledge/identityKnowledge.test.ts` | **new** — 22 tests |
| `apps/web/src/lib/identityKnowledge.ts` | **new** — client |
| `apps/web/src/pages/admin/IdentityKnowledgePage.tsx` | **new** — Biography Manager + Library + AI Insights |
| `apps/web/src/router.tsx`, `apps/web/src/app/Sidebar.tsx` | `/app/identity-knowledge` wired |
| `tests/e2e/identityKnowledge.spec.ts` | **new** — 5 cases |
| `audit/module-inventory.json` | regenerated (108 modules, 105 COMPLETE) |
| `PROGRESS.md`, `docs/CHANGELOG.md`, `CONVENTIONS.md`, `README.md`, `project-understanding.md` | updated |
