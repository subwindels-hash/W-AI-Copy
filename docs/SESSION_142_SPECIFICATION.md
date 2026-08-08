# Session 142 — Religion Knowledge Integration & Teaching Systems (`religions/integrations`)

**Module:** `religions` (integration layer added to the Session 141 module)
**Mount:** `/api/v1/religions/integrations`
**Status:** COMPLETE (routes = 9, integration service = ~600 LOC, 17 unit tests + 8 e2e cases)
**Date:** 2026-08-08 · **Branch:** `arena/019fe26a-win`

---

## 1. What This Session Adds

The Session 141 spec's **§20 final objective** requires the religion knowledge
system to be integrated into *"WINDELS AI OS memory, education, search, AI
agents, AI Training Center, and conversational teaching systems."* Session 141
wired **search** (the Enterprise Search `religion` entity type). Session 142
completes the remaining five channels:

| Channel | Integration |
| --- | --- |
| **Memory** | Syncs the curated catalog (+ approved extensions) into the **Enterprise Memory Fabric** (`MemoryEvolutionService.add`, type `knowledge`, scope `org:<oid>`, confidence mapped from the record's class, tags family/category/religion). The fabric deduplicates by content+scope, so re-syncs never duplicate. |
| **AI agents** | Attaches religion knowledge to AI workforce agents as **`SNIPPET` knowledge rows** (`agentKnowledge.service.addKnowledge`) titled `Religion: <name>` and labelled with the catalog version as source; re-attaching skips titles already present (idempotent). Agent ownership is enforced by the existing service's org check. |
| **AI Training Center** | Creates a **zero-synthetic curated RAG dataset** in the Session 60 training module (`TrainingService.createDataset`, format `jsonl`, `syntheticPct: 0`, `cleaned: true`, `ragbuilderIncluded: true`) plus a real **JSONL export** (`GET /integrations/training/export`) where every row carries `source: WINDELS religion catalog <version>` and question/answer pairs built only from curated records. |
| **Education** | Every record maps to a teachable **course** (`GET /integrations/education/catalog`), and `POST /integrations/education/lesson` hands the record to the real **Lecturer AI** (`LecturerService.start`) with the level mapped (beginner→beginner, intermediate→intermediate, advanced/research→advanced) — the curated record is the source material, the tutor adapts. |
| **Conversational teaching** | `POST /integrations/chat` returns a chat-ready teaching turn: intent classification, rendered sections at the requested level, sources, confidence, `controversialNote`, follow-up suggestions — and the **neutrality answer** for truth-claim questions ("WINDELS does not claim to have chosen a religion"). |

## 2. What Was Built

### 2.1 Integration service (`apps/api/src/religions/religions.integrations.service.ts`)

- `syncMemory(orgId, {family, force})` — walks catalog + approved extensions, writes each into the Memory Fabric with honest counts (attempted/succeeded/failed), records the last sync (`rel:int:mem:<org>`, 1-day TTL), and notes the fabric's deduplication.
- `memoryStatus(orgId)` — last-sync report.
- `attachToAgent(userId, agentId, {family, limit})` / `agentAttachedTitles(...)` — bulk-attach with title-dedupe and version-labelled provenance.
- `trainingCorpus({family})` / `recordToJsonl(record)` — the JSONL corpus (one line per record: id, name, family, category, status, confidence, `What is <name>?` question, answer from summary/teachings/deity/history, tags, catalog-version source).
- `createTrainingDataset(orgId, {family})` — creates the dataset in the training module and records it (`rel:int:ds:<org>`).
- `educationCatalog()` — every record as a course (courseId, title, family, category, status, level, topics, summary).
- `startLesson(userId, recordId, level)` — curated course + real Lecturer AI session; 404 for unknown records.
- `chatAnswer(orgId, {question, level})` — the conversational turn (mode `teach` | `comparison` | `neutrality`, honest no-match, follow-ups).
- `overview(orgId)` — the five-channel status report used by the console.

### 2.2 Routes (`apps/api/src/http/routes/religionsIntegrations.ts`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/integrations` | overview of all five channels |
| GET | `/integrations/memory` | last memory sync |
| POST | `/integrations/memory/sync` | sync catalog → Memory Fabric |
| POST | `/integrations/agents/:agentId/attach` | attach religion knowledge to an agent |
| GET | `/integrations/agents/:agentId` | attached-record status |
| POST | `/integrations/training/dataset` | create the curated RAG dataset |
| GET | `/integrations/training/export?family=` | JSONL export (Content-Type `application/x-ndjson`) |
| GET | `/integrations/education/catalog` | every record as a course |
| POST | `/integrations/education/lesson` | curated lesson + Lecturer AI session |
| POST | `/integrations/chat` | conversational teaching turn |

All authenticated; memory/training/agent channels org-scoped (403 without an organization). The Session 141 routes are untouched.

### 2.3 UI

- `apps/web/src/lib/religions.ts` gained typed client functions for every channel (incl. the JSONL export URL).
- `/app/religions` gained an **Integrations** tab: five-channel overview, Memory sync button with result, agent attach with status, training dataset creation + export link, Lecturer AI lesson starter, and the conversational chat panel (neutrality badge for truth claims, sources and follow-ups).

### 2.4 Server fix (important)

While wiring the Session 142 mount, the Session 141 **religions router mount was found to be missing from `server.ts`** — the Session 141 commit added the import and the route file but the mount block silently failed to insert (the anchor text had drifted). Unit tests passed because they exercise services directly. This session mounts both the Session 141 router and the Session 142 integrations router; the fix is verified by grep and by the mounted-route count in the inventory.

## 3. Honesty Guarantees (unchanged, now enforced across channels)

1. Memory entries and agent knowledge are labelled with the catalog version and `religion` tags; confidence maps from the record's class (verified → 1.0 … unverified → 0.3).
2. The training dataset declares `syntheticPct: 0` and is generated only from curated records; every JSONL row carries its source version.
3. The chat surface returns the neutrality policy for truth-claim questions and the standing "do not have sufficient verified knowledge" answer otherwise.
4. The Lecturer AI handoff keeps the curated record as the source of truth; the tutor's presentation adapts, never the facts.

## 4. Tests

- **Unit (`religions.integrations.test.ts`, 17 tests):** memory sync counts + idempotency note + family filter + honest failure handling; agent attach (version-labelled SNIPPETs, title-dedupe, family filter); training corpus (JSONL schema, provenance, zero-synthetic dataset creation); education (course catalog, Lecturer handoff + level mapping, 404); chat (definitions, neutrality, honest no-match, controversial notes); overview transitions after sync/dataset creation.
- **E2E (`tests/e2e/religions.spec.ts`, 8 new cases):** live API — overview, memory sync, dataset creation, JSONL export, education catalog + lesson, chat neutrality + conversational teaching.
- Session 141 suites still green: 56 total unit tests for `religions` (39 + 17).

## 5. Docs

- This specification + `docs/SESSION_142_RUNTIME_VALIDATION_CHECKLIST.md`.
- PROGRESS.md row 142; CONVENTIONS.md decision log (Session 142); `audit/module-inventory.json` regenerated.
