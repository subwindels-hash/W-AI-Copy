# Session 149 Runtime Validation Checklist — Spec A Re-Audit Closure (§6–§9)

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 149 stays 🟡 VERIFIED (partial).

---

## 1. Catalog & Integrity

- [ ] `GET /knowledge/catalog` reports `recordCount === 361` and `catalogVersion` contains `149`, with the stable/dynamic and confidence breakdowns intact.
- [ ] `GET /knowledge/integrity` returns `{ ok: true, issues: [] }` — every relatedId resolves within the knowledge catalog.

## 2. Coverage by Section

- [ ] **§6 Timeline (3):** `when.christianity` (c. 33 CE, era-classical), `when.nigeria-republic` (1963, era-contemporary), `when.smartphones` (2007, era-contemporary) resolve with dateLabel/year/eraId.
- [ ] **§7 Places (2):** `place.ogidi` (Anambra State — town/village item; links `who.achebe`), `place.wall-street` (New York City — businesses item; economy section flags current market data as dynamic).
- [ ] **§8 Comparisons (3 + 4 profiles):** `cmp.nigeria-vs-kenya`, `cmp.presidential-vs-parliamentary` and their item profiles — all criteria labeled; `POST /knowledge/compare` reports `basis: "labeled"` and the no-universal-winner note; the Nigeria–Kenya comparison carries a dynamic-statistics verification note.
- [ ] **§9 Education (2):** `disc.vocational-education` (learning path, certificates/diplomas), `con.postgraduate` ("Doctorate (PhD) and master's degrees").

## 3. Question Coverage (POST /knowledge/ask)

- [ ] "When did Christianity begin?" → `when.christianity`.
- [ ] "When did Nigeria become a republic?" → `when.nigeria-republic`.
- [ ] "When did smartphones become popular?" → `when.smartphones`.
- [ ] "Where is Ogidi?" → `place.ogidi`; "Where is Wall Street?" → `place.wall-street`.
- [ ] "What is a PhD?" / "What is a doctorate?" / "What is a master's degree?" → `con.postgraduate`.
- [ ] "What is vocational education?" → `disc.vocational-education`.
- [ ] "Compare Nigeria and Kenya" → `cmp.nigeria-vs-kenya`; "Which is better: presidential or parliamentary system?" → `cmp.presidential-vs-parliamentary`.
- [ ] The Session 140–148 anchors still work ("What is democracy?", "How do I start a business?", "Who was Thomas Edison?", "Where is Nairobi?", "What is earth science?", "Which is better: university or polytechnic?", "Explain electricity to a child").

## 4. UI & Audit

- [ ] The `/app/knowledge` console still renders the six tabs; searching "PhD", "vocational education", "Ogidi", "Nigeria vs Kenya", "presidential or parliamentary" returns the new records.
- [ ] `node audit/build-inventory.mjs` lists `knowledge` as **COMPLETE** (routes unchanged at 20).

## 5. Regression

- [ ] `religions` and `politics` unit suites pass unchanged (153 tests including guards).
- [ ] Guard suites `noRandomData`, `demoCleanup` pass; `noFakeVerdict` shows only the pre-existing `voice/voice.module.ts:311` finding.
