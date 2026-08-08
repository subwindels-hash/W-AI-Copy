# Session 144 — Global Politics, Government & Political History Intelligence System (`politics`)

**Module:** `politics` (new core capability)
**Mount:** `/api/v1/politics`
**Status:** COMPLETE (routes = 16, shared contract = ~1000 LOC incl. pure engines, curated catalog = 144 records, 41 unit tests + 9 e2e cases)
**Date:** 2026-08-08 · **Branch:** `arena/019fe26a-win`

---

## 1. Purpose (§1)

An **educational and informational** global politics knowledge system — not a
political persuasion engine. WINDELS presents political information
accurately, neutrally, transparently and with historical context, and never
secretly favors a party, candidate, government, ideology, country or
movement (§24: **INFORM, NOT MANIPULATE**).

## 2. What Was Built

### 2.1 Shared contract (`packages/shared/src/politics.ts`, ~1000 LOC)

- **Enumerations:** 13 government forms (§12), 17 office-title kinds (§4 —
  "do not assume every country has a president"), 14 entity kinds (§27),
  4 education levels (§25), 6 verification classes incl. `current_as_of`
  (§21/§22), 9 source types on the §22 priority ladder, 7 fact-vs-opinion
  categories (§23), 11 question intents.
- **Record schemas (§2–§17):** `CountryProfile` (capital, form, federal
  structure, pre-colonial/colonial/independence/modern history, the four
  branches, electoral system, parties, current situation, history periods
  §3), `LeaderRecord` (§4/§5 — with head-of-state vs head-of-government
  `role`), `PartyRecord` (§9 — self-description vs academic classification),
  `ElectionRecord` (§10 — official-source vote data, importance, disputes),
  `MinistryRecord` (§8), `OfficeHolderRecord` (§6/§7 — governors, senators,
  MPs), `ConstitutionRecord` (§11), `MovementRecord` (§14), `IdeologyRecord`
  (§13 — with `advocacyNote`), `InternationalOrgRecord` (§16),
  `GovernmentFormRecord` (§12), `PoliticalEventRecord` (§15 — with a
  non-glorification note), and versioning metadata on every record (§29:
  created/updated/lastReviewed/verification/asOfDate/lastVerified).
- **Pure engines:**
  - `classifyPoliticalClaim` (§23) — deterministic fact / historical
    interpretation / political analysis / opinion / allegation / disputed
    claim / propaganda classification.
  - `classifyPoliticsQuestion` — 11 intents with specificity weights.
  - `compareCountries` (§24-neutral) — 10 attributed categories, never a
    ranking.
  - `renderCountryAtLevel` (§25) — beginner → research.
  - Update/versioning types (§28/§29): `PoliticsUpdate`, change-log entries,
    previous/new values, effective dates, sources.

### 2.2 Curated catalog (144 records)

- **18 country profiles** (§2/§3): Nigeria, United States, United Kingdom,
  Kenya, Ghana, South Africa, France, Germany, India, China, Brazil, Canada,
  Japan, Russia, Egypt, Ethiopia, Mexico, Australia — each with
  pre-colonial → colonial → independence → modern history, institutions,
  electoral system, parties and a `current_as_of` current situation.
- **9 constitutions** (§11): Nigeria 1960/1963/1979/1999 (full records) plus
  the US 1787, UK uncodified, Kenya 2010, South Africa 1996 and India 1950.
- **29 leaders** (§4/§5): all 14 Nigerian heads of state (Azikiwe → Tinubu),
  and notable leaders of the US, UK, Kenya, Ghana, South Africa, India and
  Ethiopia — with office periods, predecessors/successors, how they came to
  office, policies, achievements, controversies, and head-of-state vs
  head-of-government roles.
- **8 Nigerian parties** (§9) with self-description vs academic
  classification; **10 Nigerian presidential elections** (§10) with
  official-source results (1979 → 2023, including the 1993 annulment and the
  2023 disputes); **6 Lagos State governors** (§6); **1 legislator** (§7,
  Anthony Enahoro); **3 ministries** (§8); **6 Nigerian political events**
  (§15: independence, the 1966 coup, the civil war, June 12, the 1999
  transition, 2015).
- **22 ideologies** (§13) taught academically (liberalism → fascism →
  African socialism → indigenous political philosophies), **6 movements**
  (§14), **14 international organizations** (§16: UN → BRICS), **10
  government forms** (§12), and **2 policy records** (neutrality §24;
  current-info/Last Verified §21).
- Current office-holders (Tinubu, Trump, Starmer, Ruto, Mahama, Ramaphosa,
  Modi, Abiy, Sanwo-Olu, ministers) carry `current_as_of` + `lastVerified`.

### 2.3 Service (`politics.service.ts`)

Search (§30), the question engine with the §26 examples (including
`leader_list` mode for "List all presidents of Nigeria"), the neutral
comparison engine, country timelines (§18) and leader timelines (§19), the
knowledge graph (§20) plus `graphAnswer` for "who was president when X
happened?", the fact-vs-opinion engine (§23), education mode with
deterministic quizzes (§31), and the **update engine** (§28/§29):
org-scoped change requests (`pol:upd` keys, catalogued org_scoped), a
Super Admin apply gate, and change-log entries that record previous/new
values, effective dates and sources — **history is never overwritten**.
Applied updates merge into that org's search. Applied updates merge into that org's search. Also: `fieldHistory` (§29 versioned answers), stats, an
integrity report, and the enterprise-search hook.

### 2.4 Routes (`/api/v1/politics/*`, 16)

`GET /catalog` · `GET /kinds` · `GET /integrity` · `GET /search` ·
`GET /records/:id` · `GET /records/:id/history` · `POST /ask` ·
`POST /compare` · `POST /claim` · `GET /timeline/:countryId` ·
`GET /leaders/:countryId` · `GET /graph` · `GET /graph/:id` ·
`POST /graph/answer` · `GET /education/catalog` · `POST /quiz` ·
`POST /updates` · `GET /updates(/:id)` · `PATCH /updates/:id` · `GET /stats`.

### 2.5 Integrations

- **Enterprise Search:** new `politics` entity type (countries, leaders,
  parties, elections, ideologies, movements, organizations indexed).
- **Tenant Isolation:** `pol:upd` catalogued `org_scoped` (org in the
  segment after the index marker).
- **Console:** `/app/politics` with six tabs — Ask (the §26 examples as
  chips), Countries (timeline + leader timeline + detail), Compare (neutral
  table with presets), Fact vs Opinion, Learn (quizzes + government-form
  and ideology lessons), Updates (submit + Super Admin apply, with the
  change-log view). Sidebar "Politics & Government".

## 3. Honesty Guarantees

1. **Neutrality is structural** — comparisons attribute, never rank;
   parties carry self-description AND academic classification; the policy
   record states INFORM, NOT MANIPULATE.
2. **Fact vs opinion is explicit** — the §23 classifier is exposed both as
   an API and in the console; causal claims are interpretations, not facts.
3. **Current ≠ permanent** — current office-holders carry Last Verified
   timestamps and `current_as_of`; the catalog's current-info policy
   explains the update path.
4. **History is never overwritten** — the update engine's change logs
   preserve previous values; applying an update never edits the historical
   leader records (pinned by tests).
5. **Violence is not glorified** — political events carry a
   non-glorification note and are presented educationally (§15).
6. **Sources follow the §22 ladder** — election results cite INEC and the
   official sources; current claims are attributed and marked.

## 4. Tests

- **Unit (`politics.test.ts`, 41):** coverage (every kind; §16 orgs; §13
  ideologies with advocacy notes; §12 forms; §14 movements; deep Nigeria:
  14 leaders/8 parties/10 elections/6 governors/4 constitutions/6 events;
  head-of-state vs head-of-government roles), integrity (clean; version
  metadata everywhere; current records carry asOfDate/lastVerified), the
  §26 question examples (history, first president, list-all, current
  president, elections, federal government, transition), the neutral
  comparison engine, timelines, the graph answer, the §23 classifier, the
  deterministic quiz, and the update engine (pending → Super Admin apply →
  change log; never overwrites history; org isolation; field history;
  applied updates in org search).
- **E2E (`tests/e2e/politics.spec.ts`, 9 cases):** catalog, §26 questions,
  neutral comparison, §23 classification, timelines, graph answer, quiz,
  the update-engine change log, Last Verified timestamps.

## 5. Docs

- This specification + `docs/SESSION_144_RUNTIME_VALIDATION_CHECKLIST.md`.
- PROGRESS.md row 144; CONVENTIONS.md decision log (Session 144);
  `audit/module-inventory.json` regenerated.
