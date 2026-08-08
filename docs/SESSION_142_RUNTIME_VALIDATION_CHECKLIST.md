# Session 142 Runtime Validation Checklist — Religion Knowledge Integration & Teaching Systems (`religions/integrations`)

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 142 stays 🟡 VERIFIED (partial).

The unit suites prove the five §20 integration channels against mocked Redis/prisma dependencies; only a live deployment proves real Memory Fabric persistence, real agent rows in PostgreSQL, real training-module datasets and the Lecturer AI with a configured AI provider.

---

## 1. Route Mounting & Auth

- [ ] `GET /api/v1/religions/integrations` returns `200 OK` with the five-channel overview.
- [ ] Both the Session 141 router (`/api/v1/religions/*`) and the Session 142 integrations router are mounted in `server.ts` (regression guard for the S141 mount fix).
- [ ] All `/api/v1/religions/integrations/*` endpoints refuse anonymous callers (`401 Unauthorized`).
- [ ] Memory sync, training dataset and agent channels refuse a no-organization session with `403 Forbidden`.

## 2. Memory Channel

- [ ] `POST /religions/integrations/memory/sync` syncs every catalog record into the Memory Fabric with `attempted === succeeded`, `failed === 0`, and the catalog version in the response.
- [ ] Re-running the sync does not duplicate memory entries (fabric content+scope dedupe).
- [ ] `GET /religions/integrations/memory` reports the last sync (at, count, version).

## 3. AI Agents Channel

- [ ] `POST /religions/integrations/agents/:agentId/attach` attaches records as `SNIPPET` knowledge rows titled `Religion: <name>` with the catalog version as source.
- [ ] Re-attaching skips already-present titles (`alreadyPresent > 0`, `attached === 0` on second run).
- [ ] Attaching to an agent outside the caller's organization fails with 404 (ownership enforced by the existing service).

## 4. AI Training Center Channel

- [ ] `POST /religions/integrations/training/dataset` creates a dataset in the Session 60 training module with `format: "jsonl"`, `syntheticPct: 0`, `cleaned: true`, `ragbuilderIncluded: true`.
- [ ] `GET /religions/integrations/training/export` returns `application/x-ndjson`; every row parses and carries `source` containing `WINDELS religion catalog`, a `What is …?` question and a substantive answer.
- [ ] `?family=ancient` (and other family filters) narrow the export correctly.

## 5. Education Channel

- [ ] `GET /religions/integrations/education/catalog` lists every record as a course with topics.
- [ ] `POST /religions/integrations/education/lesson` returns the curated course plus a real Lecturer AI session; level mapping holds (beginner→beginner, research→advanced).
- [ ] Unknown record ids answer 404.

## 6. Conversational Teaching Channel

- [ ] `POST /religions/integrations/chat` with "What is Christianity?" returns a chat turn with sections, sources, confidence and follow-up suggestions.
- [ ] "Which religion is true?" returns `mode: "neutrality"` with the explicit "WINDELS does not claim to have chosen a religion" statement.
- [ ] An out-of-catalog question returns the honest "do not have sufficient verified knowledge" answer with `confidence: null`.

## 7. UI & Audit

- [ ] The `/app/religions` Integrations tab renders the overview and all five action panels without console errors.
- [ ] Memory sync, dataset creation and the chat panel work end to end in the browser.
- [ ] `node audit/build-inventory.mjs` lists `religions` as **COMPLETE** with the integrations routes counted.
