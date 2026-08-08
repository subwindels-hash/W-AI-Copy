# Session 140 Runtime Validation Checklist — Global Human Knowledge & Everyday Question Intelligence System (`knowledge`)

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 140 stays 🟡 VERIFIED (partial).

The unit suites prove the intent engine, teaching engine, comparison engine, timeline engine, catalog integrity, retrieval/ask honesty and dynamic-layer cross-org isolation against mocked Redis; only a live deployment proves Redis persistence, real auth sessions and the web console end to end.

---

## 1. Route Mounting & Auth

- [ ] `GET /api/v1/knowledge/catalog` returns `200 OK` with `catalogVersion`, `categoryCount: 90`, `recordCount > 100`, `byTier` and `byConfidence`.
- [ ] All `/api/v1/knowledge/*` endpoints refuse anonymous callers (`401 Unauthorized`).
- [ ] Dynamic-layer endpoints (`POST /records`, `PATCH /records/:id`, `DELETE /records/:id`, `GET /records?scope=org|all`) refuse a no-organization session with `403 Forbidden`.
- [ ] Existing routes (`/api/v1/payments/*`, `/api/v1/geo-billing/*`, `/api/v1/ai-engineering/*`, …) still answer on their original paths and shapes.

## 2. Master Catalog & Content Layers

- [ ] `GET /knowledge/categories` lists all 90 master categories with `recordCount`.
- [ ] `GET /knowledge/kinds` lists the 24 content layers (concept → current_information) with counts.
- [ ] `GET /knowledge/eras` lists the eight history eras with event counts.
- [ ] `GET /knowledge/integrity` returns `{ ok: true, issues: [] }` (no dangling relatedIds, no unknown categories/kinds, all dates valid).
- [ ] Every spec content layer has ≥ 1 curated record (concepts, instructions, explanations, people, timeline, places, comparisons, disciplines, science fields, technology, business, careers, law, health, culture, travel, relationships, entertainment, languages, everyday, creative).

## 3. Question Intent Engine

- [ ] `POST /knowledge/intent` classifies all 13 spec examples:
  definition ("What is AI?"), explanation ("How does AI work?"), history ("When did AI begin?"), comparison ("AI vs traditional software?"), instruction ("How do I build an AI app?"), recommendation ("Which cloud platform should I use?"), calculation ("How much will this cost?"), current_information ("Who is the current president?"), research ("Give me everything about this subject."), education ("Teach me mathematics."), creative ("Write a business plan."), troubleshooting ("Why isn't my application working?"), personal_guidance ("What should I do?").
- [ ] Unmatched text returns the `general` fallback with low confidence (never a forced category).

## 4. Ask WINDELS

- [ ] `POST /knowledge/ask` with "What is inflation?" returns intent `definition`, routing domain "Concept layer", top match `con.inflation` with `sources[]` and sections rendered at the requested audience level.
- [ ] "Who is the current president?" routes to the **Dynamic layer** with the "never memorized" note.
- [ ] A nonsense/out-of-catalog question returns `matches: []` with the explicit "I do not have sufficient knowledge in the catalog" note — never a fabricated answer.
- [ ] Audience levels (`child` → `research`) change the rendered sections but not the underlying facts.

## 5. Timeline, Compare, Graph

- [ ] `GET /knowledge/timeline` returns 8 eras and 28 events sorted chronologically (BCE before CE).
- [ ] `POST /knowledge/compare` with `["cmp.item.python", "cmp.item.javascript"]` returns ≥ 6 criteria, all `basis: "labeled"`, and a note stating no universal winner.
- [ ] `GET /knowledge/graph/con.democracy` returns related nodes and reverse references.

## 6. Dynamic Layer (org-scoped)

- [ ] `POST /knowledge/records` creates a record with `provenance: "self_reported"`, `confidence: "unverified"` by default, `lastUpdated` set, and persists across restarts in Redis (`kn:rec:idx:<org>` / `kn:rec:i:<org>:<id>`).
- [ ] Creation without `sources` is refused with `400`.
- [ ] `PATCH /records/:id` updates verification metadata and refreshes `lastUpdated`.
- [ ] `DELETE /records/:id` removes the record; catalog records (`con.democracy`) cannot be deleted (`404`).
- [ ] Two organizations cannot read, update or delete each other's records.
- [ ] Redis unreachable → service degrades to the in-memory ledger without erroring.

## 7. UI & Audit

- [ ] `/app/knowledge` renders the six tabs (Ask, Knowledge, Intent Engine, Compare, Dynamic, Timeline) without console errors; Ask returns answers with sources; Compare renders "not labeled" for unlabeled cells; Dynamic shows unverified labels.
- [ ] Sidebar shows "Global Knowledge" linking to `/app/knowledge`.
- [ ] Verify the S89 tenant-isolation sweep confirms `kn:rec` is `org_scoped` and conforming without org-segment index shifts.
- [ ] Verify `node audit/build-inventory.mjs` lists `knowledge` as **COMPLETE** and reports the full inventory (110 modules, 110 COMPLETE).
