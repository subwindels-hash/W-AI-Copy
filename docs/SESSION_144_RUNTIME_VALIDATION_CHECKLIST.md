# Session 144 Runtime Validation Checklist — Global Politics, Government & Political History Intelligence System (`politics`)

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 144 stays 🟡 VERIFIED (partial).

---

## 1. Route Mounting & Auth

- [ ] `GET /api/v1/politics/catalog` returns `200 OK` with `catalogVersion`, `recordCount > 140`, `countryCount > 15`, the neutrality note and the current-info note.
- [ ] All `/api/v1/politics/*` endpoints refuse anonymous callers (`401 Unauthorized`).
- [ ] The update engine's routes refuse a no-organization session with `403`; `PATCH /updates/:id` refuses non-Super-Admin callers.
- [ ] Existing routes (`/api/v1/religions/*`, `/api/v1/knowledge/*`, …) still answer on their original paths.

## 2. Catalog & Coverage

- [ ] `GET /politics/search` finds countries, leaders, parties, elections, ideologies, movements and organizations by name.
- [ ] `GET /politics/integrity` returns `{ ok: true, issues: [] }`.
- [ ] Every record carries §29 version metadata (created/updated/lastReviewed/verification).
- [ ] Current records (`pol.leader.nigeria.tinubu`, `pol.leader.usa.trump`, `pol.leader.uk.starmer`, `pol.leader.kenya.ruto`, `pol.leader.ghana.mahama`, `pol.leader.sa.ramaphosa`, `pol.leader.india.modi`, `pol.leader.ethiopia.abiy`, `pol.gov.lagos.sanwo-olu`) carry `current_as_of` + `lastVerified` + `asOfDate`.

## 3. Question Engine (§26)

- [ ] "Tell me the history of Nigeria." → the Nigeria country profile with pre-colonial sections.
- [ ] "Who was Nigeria's first president?" → Nnamdi Azikiwe.
- [ ] "List all presidents of Nigeria" → chronological leader list (14+), Azikiwe first, Tinubu last with a current badge.
- [ ] "Who is the current president of Nigeria?" → Bola Tinubu (current_as_of).
- [ ] "Explain every Nigerian presidential election" → 1979 → 2023 election records with official-source results.
- [ ] "How does Nigeria's federal government work?" → the country profile and/or the 1999 constitution.
- [ ] "What happened during Nigeria's transition to democracy?" → the 1999 transition event.
- [ ] A nonsense question returns the honest "do not have sufficient verified political knowledge" answer.

## 4. Comparison & Claim Engines

- [ ] `POST /politics/compare` with Nigeria + USA returns ≥ 10 attributed rows and the "does not rank political systems" note.
- [ ] Nigeria + UK shows Federal republic vs Parliamentary monarchy.
- [ ] `POST /politics/claim`: the §23 examples classify as verified_fact / opinion / historical_interpretation / allegation; disputed and propaganda phrasings classify accordingly.

## 5. Timelines, Leaders & Graph

- [ ] `GET /politics/timeline/pol.country.nigeria` returns ≥ 5 periods and the independence/coup/civil-war events.
- [ ] `GET /politics/leaders/pol.country.nigeria` returns 14+ leaders in order.
- [ ] `POST /politics/graph/answer` with "Who was president during the Nigerian civil war?" returns Yakubu Gowon.
- [ ] `GET /politics/graph/pol.country.nigeria` resolves related leaders, parties, constitutions and organizations.

## 6. Education Mode

- [ ] `POST /politics/quiz` with `pol.country.nigeria` returns 5 four-choice questions with explanations; identical inputs → identical questions.
- [ ] `GET /politics/education/catalog` lists every country as a course.

## 7. Update Engine (§28/§29)

- [ ] `POST /politics/updates` creates a `pending_review` update with previous/new values and a source.
- [ ] `PATCH /updates/:id` with `applied` as Super Admin records a change log (previous value, new value, effective date, source, appliedBy).
- [ ] The historical leader records are unchanged after applying an update.
- [ ] `GET /records/pol.country.nigeria/history?field=currentSituation` returns the versioned trail.
- [ ] Two organizations cannot see or review each other's updates; a reviewed update cannot be reviewed twice (409).
- [ ] Redis unreachable → the update ledger degrades to memory without erroring.

## 8. UI & Audit

- [ ] `/app/politics` renders the six tabs without console errors; Ask answers the §26 chips; Updates shows the change-log view and (for Super Admin) Apply/Reject.
- [ ] Sidebar shows "Politics & Government" linking to `/app/politics`.
- [ ] Enterprise Search over the `politics` entity type returns records (e.g. "Tinubu", "ECOWAS", "social democracy").
- [ ] S89 tenant-isolation sweep confirms `pol:upd` is `org_scoped` and conforming.
- [ ] `node audit/build-inventory.mjs` lists `politics` as **COMPLETE**.
