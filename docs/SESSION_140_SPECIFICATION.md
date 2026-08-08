# Session 140 — Global Human Knowledge & Everyday Question Intelligence System (`knowledge`)

**Module:** `knowledge` (new core capability)
**Mount:** `/api/v1/knowledge`
**Status:** COMPLETE (routes = 20, shared contract = ~800 LOC incl. pure engines, curated catalog = 178 records, unit suite + E2E spec)
**Date:** 2026-08-08 · **Branch:** `arena/019fe26a-win`

---

## 1. Existing Infrastructure Reused (Untouched)

| Existing System | How It Is Reused by `knowledge` |
| --- | --- |
| **Auth / sessions** | Every route is behind `authenticate`; catalog reads work for any authenticated session, the dynamic layer requires an organization (403 without one). |
| **Redis (`db/redis.js`)** | Org-scoped dynamic records persist under `kn:rec:idx:<org>` / `kn:rec:i:<org>:<id>` (zset + JSON string) with an in-memory fallback ledger when Redis is unreachable — the `pay:tx`/`usg:evt` pattern. |
| **Tenant Isolation (S89)** | `kn:rec` catalogued as `org_scoped` in `TI_NAMESPACE_CATALOG` (org in the segment after the index marker, same shape as `usg:evt`/`pay:tx`). |
| **Web console conventions** | `apps/web/src/lib/knowledge.ts` typed client + `/app/knowledge` console + sidebar "Global Knowledge" (BookOpen icon). |

No existing module, route or contract is modified except the two additive mount points (`server.ts`, `TI_NAMESPACE_CATALOG`) and the shared index re-export.

---

## 2. What Was Missing (Why This Session Adds It)

WINDELS AI OS could answer questions about its own products and workspace, but it had **no broad human-knowledge layer**: nothing that explains what democracy, inflation or DNA *is*, how to write a CV or register a company, why wars happen, who Mandela was, when Nigeria became independent, where Kenya is, or which programming language to learn — and, critically, **no mechanism to keep fast-changing facts honest**.

Session 140 adds that layer with two architectural pillars (per the specification):

1. **Question Intent Engine** — every question is classified into one of 13 intents (definition, explanation, history, comparison, instruction, recommendation, calculation, current information, research, education, creative, troubleshooting, personal guidance) plus an honest `general` fallback, and routed to the matching knowledge domain and response style.
2. **Stable / Dynamic knowledge separation** — stable knowledge (mathematics, history, scientific foundations, established concepts) lives in the curated catalog; dynamic knowledge (politics, elections, prices, sports, weather, current events, technology releases, laws, appointments, travel requirements) is **never memorized as permanent**: dynamic records must carry **SOURCE + DATE + VERIFICATION STATUS + LAST UPDATED**, and current-information questions are answered with verification guidance, not stale claims.

---

## 3. What Was Built

### 3.1 Shared Contract (`packages/shared/src/knowledge.ts`)

- **Enumerations:** 24 record kinds (one per content layer of the spec), 13+1 question intents, 5 confidence classes (VERIFIED / WELL-SUPPORTED / DISPUTED / UNCERTAIN / UNVERIFIED) with labels, stable/dynamic tiers with labels, 5 audience levels, 23 section keys.
- **KnowledgeRecord:** unified record shape — categories, aliases, canonical question, intents, tier, confidence, provenance (`catalog` | `self_reported`), summary, sections map, structured examples/misconceptions/steps/criteria, relatedIds (knowledge graph edges), sources, `lastUpdated`, `asOfDate`, `dateLabel`/`year`/`eraId` for the timeline engine, verification and professional-assistance notes.
- **Question Intent Engine (`classifyQuestionIntent`):** deterministic, pattern-weighted, tie-break by specificity; returns intent + honest confidence + matched rules + explanation. All 13 spec examples are pinned by unit tests.
- **Intent → domain routing (`INTENT_ROUTING`):** each intent maps to a knowledge domain with a note (e.g. `current_information` → Dynamic layer: "never memorized… must carry source + date + verification status + last updated").
- **Personalized Teaching Engine (`teachingPlanFor` / `renderRecordAtLevel`):** child / high_school / undergraduate / graduate / research plans select which sections are served; the underlying record is unchanged — only presentation adapts.
- **Comparison Engine (`compareKnowledge`):** union of labeled criteria; scores are `labeled` only where the catalog has them, otherwise `value: null, basis: "not_labeled"` — the system never invents scores and never declares a universal winner.
- **Timeline engine (`sortTimelineEvents`):** deterministic chronological sort; negative years = BCE; unknown years sort last.
- **Confidence/tier helpers + Zod input schemas** for intent, ask, search, compare and the dynamic CRUD (dynamic create requires ≥1 source).

### 3.2 Master Catalog (`knowledge.catalog.ts`)

- The **90 master categories** of the spec (§1), each with id (`cat-01`…`cat-90`), name and description; versioned (`KNOWLEDGE_CATALOG_VERSION = "2026.08.140.1"`) and expandable.
- The **24 content layers** (kinds) with labels and descriptions, and the **eight history eras** (prehistory → contemporary) with approximate, honestly-labelled date ranges.

### 3.3 Curated Knowledge Seed (178 records, all real content)

- **Concepts (17):** the 15 spec concepts (democracy, Christianity, AI, blockchain, inflation, constitution, university, DNA, electricity, cloud computing, mortgage, cryptocurrency, algorithm, capitalism, socialism) + government, money, photosynthesis — each with definition / simple / detailed / history / how-it-works / examples / misconceptions / guidance.
- **Instructions (12):** start a business, register a company, write a CV, apply for university, learn programming, build a website, create an app, send money, travel internationally, create a budget, prepare for an interview, study effectively, use AI — step-by-step with professional/official-assistance flags in guidance, and structured steps (with `requiresProfessional`) on the career records.
- **Explanations (10):** why inflation happens, countries go to war, people migrate, economies grow, religions differ, climate changes, computers need memory, the body needs sleep, businesses fail, elections matter — causes + competing explanations.
- **People (6):** Mandela, Marie Curie, Einstein, Ada Lovelace, Gandhi, Wangari Maathai — biography, achievements, historical context, sources.
- **Timeline (28 events):** Homo sapiens → COVID-19, each with approximate date label, year (BCE negative), era id, summary and sources.
- **Places (8):** Nigeria, Kenya, Egypt, India, United States, United Kingdom, France, Brazil — geography/history/economy/culture, with an explicit note that population/GDP/office-holders are dynamic and **not** memorized.
- **Disciplines (10), science fields (9, each with FOUNDATIONS → INTERMEDIATE → ADVANCED → RESEARCH), technology (9), business (6), careers (5 with structured steps), law (5), health (5 with professional-assistance notes), culture (3), travel (2), relationships (2), entertainment (1), languages (2), everyday (3), creative (2), comparisons (4 text + 9 item records with labeled criteria), policy (3):** the current-information policy, the confidence-classification policy, and the Ask WINDELS routing policy.
- **Comparison item records** (`cmp.item.*`) carry structured labeled criteria (0–100 with notes) so the compare engine scores honestly; the text comparison records explain trade-offs.

### 3.4 Service (`knowledge.service.ts`)

- Catalog meta, categories (with counts), kinds, eras, teaching levels; deterministic search with filters (kind/intent/category/tier/confidence/scope) and honest "no query → not scored" note; record detail; **Ask WINDELS** (intent → route → retrieve with intent boost → render at audience level → sources + disclaimers, or the explicit "I do not have sufficient knowledge" answer); intent classification; comparison; timeline; knowledge graph (nodes + edges + reverse references); stats; **catalog integrity report** (used by tests); and the **org-scoped dynamic layer** (create/update/delete/list with Redis best-effort + memory fallback, 500-record cap, section-key sanitization, tier forced to `dynamic` for current-information kinds, confidence defaults to `unverified` with `self_reported` provenance).

### 3.5 Endpoints (`/api/v1/knowledge/*`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/catalog` | versioned meta + counts by tier/confidence/kind |
| GET | `/categories`, `/categories/:id` | 90 master categories (+ records) |
| GET | `/kinds`, `/levels`, `/eras` | content layers, teaching levels, history eras |
| GET | `/timeline?era=` | global timeline engine |
| GET | `/search` | deterministic retrieval + filters + level rendering |
| GET | `/records/:id` | record detail (catalog or org dynamic) |
| GET | `/records?scope=catalog\|org\|all` | list records |
| POST | `/records` | create org-scoped dynamic record (SOURCE required) |
| PATCH | `/records/:id` | update dynamic record (verification metadata) |
| DELETE | `/records/:id` | correction path (org-scoped) |
| POST | `/intent` | Question Intent Engine |
| POST | `/ask` | Ask WINDELS (intent → route → answer) |
| POST | `/compare` | criteria-based comparison (no winner) |
| GET | `/graph`, `/graph/:id` | knowledge graph stats / node |
| GET | `/stats` | rollup (catalog + org dynamic) |
| GET | `/integrity` | catalog integrity report |

Routes: 20 (16 unique paths). Every dynamic-layer route is org-scoped; catalog reads work for any authenticated session.

### 3.6 UI — Web Client & Console Page

- `apps/web/src/lib/knowledge.ts` — typed client for all 16 endpoints.
- `/app/knowledge` (`pages/knowledge/KnowledgePage.tsx`) with six tabs:
  - **Ask** — question + audience level → intent badge, routing note, answers with sections/steps/misconceptions/sources/disclaimers, and the honest "insufficient knowledge" panel.
  - **Knowledge** — 90 master categories with counts + deterministic search + record detail drawer.
  - **Intent Engine** — live classification with the 13 spec examples.
  - **Compare** — presets (Python vs JS, degree vs apprenticeship, rent vs buy, cloud platforms) rendering the criteria table with `not labeled` for unlabeled cells.
  - **Dynamic** — org-scoped records CRUD with SOURCE + as-of date + confidence labels (unverified by default).
  - **Timeline** — era filter chips + chronological events.
- Sidebar entry "Global Knowledge" (BookOpen icon) + router `/app/knowledge`.

---

## 4. Tenant Isolation & Compliance

- Catalogued `{ prefix: "kn:rec", scope: "org_scoped" }` in `TI_NAMESPACE_CATALOG` — shape `kn:rec:idx:<org>` / `kn:rec:i:<org>:<id>`, org in the segment after the index marker (the `usg:evt`/`pay:tx` convention; bare `kn` deliberately never added).
- Dynamic records are read/written only under the caller's organization key and refuse a no-organization session with 403; unit tests prove cross-org read/update/delete isolation.

---

## 5. Honesty Guarantees (the module's contract with the user)

1. **No "knows everything" claim.** Retrieval with no match returns: *"I do not have sufficient knowledge in the catalog…"* — never a guess. The Ask layer's policy record states this explicitly.
2. **Current facts are never memorized.** No catalog record contains a price, score, office-holder or weather reading; the `pol.current-information` record is the policy, and current-information questions are routed to the dynamic layer with verification guidance.
3. **Confidence travels with every answer** (VERIFIED / WELL-SUPPORTED / DISPUTED / UNCERTAIN / UNVERIFIED), and self-reported dynamic records are labelled as such — never presented as catalog-verified.
4. **No universal winner in comparisons** — criteria are presented, and unlabeled scores render as `not labeled`, never 0.
5. **Health and law educate, never advise** — `professionalAssistanceNote` and warning sections on every health/law record; disclaimers rendered in the console.
6. **Stable vs dynamic metadata** — every record carries `lastUpdated`; dynamic records additionally carry SOURCE (required), `asOfDate` where relevant and confidence.

---

## 6. Tests

- **Unit (`apps/api/src/knowledge/knowledge.test.ts`, 57 tests):** intent engine (all 13 + general + overlaps + determinism), teaching engine (level filtering, identical underlying content), comparison engine (labeled/not-labeled, no winner, missing ids), timeline (BCE/CE order, era filter, null-year last), confidence/tier helpers, catalog integrity (unique ids, categories, kinds, dangling refs, dates), content-layer coverage, person/instruction/health/law record requirements, retrieval + Ask honesty, dynamic-layer CRUD with cross-org isolation, stats and graph.
- **E2E (`tests/e2e/knowledge.spec.ts`, 12 cases):** live API — catalog meta, 90 categories, timeline, intent classifications, ask routing/rendering/honesty, compare, dynamic CRUD + source requirement + catalog-immutability, search filters.
- Guard suites: no `Math.random`, no simulation markers, no demo-data bootstrapping (the catalog is curated static content — no gating needed).

## 7. Docs

- This specification + `docs/SESSION_140_RUNTIME_VALIDATION_CHECKLIST.md`.
- PROGRESS.md row 140; CONVENTIONS.md decision log (Session 140); `audit/module-inventory.json` regenerated.
