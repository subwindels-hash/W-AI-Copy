# Session 148 Runtime Validation Checklist — Spec A Re-Send Audit (§5–§23, §8)

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 148 stays 🟡 VERIFIED (partial).

---

## 1. Catalog & Integrity

- [ ] `GET /knowledge/catalog` reports `recordCount === 348` and `catalogVersion` contains `148`, with the stable/dynamic and confidence breakdowns intact.
- [ ] `GET /knowledge/integrity` returns `{ ok: true, issues: [] }` — every relatedId resolves within the knowledge catalog.

## 2. Coverage by Section

- [ ] **§5 People (10):** `who.edison`, `who.achebe`, `who.angelou`, `who.enwonwu`, `who.poitier`, `who.tutu`, `who.hopper`, `who.bello`, `who.wachuku`, `who.okadigbo` resolve with biography + achievements + sources; contested-legacy guidance present on `who.bello` / `who.okadigbo`.
- [ ] **§6 Timeline (3):** `when.first-computer` (1945, era-modern), `when.arpabet` (1969, era-contemporary), `when.us-constitution` (1787, era-early-modern) resolve with dateLabel/year/eraId.
- [ ] **§7 Places (12):** California, Ontario, Nairobi, New York City, Murtala Muhammed International Airport, University of Ibadan, UCH Ibadan, Aso Rock, Timbuktu, Mecca, Silicon Valley, Victoria Falls — all resolve with a geography section.
- [ ] **§9 Disciplines (8):** chemistry, international relations, agriculture, architecture, education, communications, arts, music — all with learning paths.
- [ ] **§10 Science (2):** `sci.earth-science`, `sci.space-science` — levels contain FOUNDATIONS and RESEARCH; definition intent present (they rank first for "What is earth science?").
- [ ] **§11 Technology:** `tech.software-engineering` with how-it-works.
- [ ] **§12 Business (5):** entrepreneurship, bookkeeping, payments, procurement, human resources.
- [ ] **§13 Careers (5):** job search, skills & qualifications, certifications, professional development, salary information (DYNAMIC guidance).
- [ ] **§17 Culture (8):** customs & traditions, food & cuisine, clothing & fashion, arts, family structures, social institutions, regional cultures, diaspora — each guidance section asserts internal diversity.
- [ ] **§18 Travel (4):** transportation, currency & money abroad (DYNAMIC warning), weather & climate (dynamic guidance), local customs & etiquette.
- [ ] **§19 Relationships (5):** friendship, family, marriage, workplace communication, personal development — balanced guidance, no single answer.
- [ ] **§20 Entertainment (5):** television, books, celebrities (verification guidance), artists & creators, history & trends.
- [ ] **§21 Language (6):** vocabulary, pronunciation, dialects & slang, historical languages, indigenous languages, reading.
- [ ] **§22 Everyday (4):** clothing, personal organization, transportation, problem solving.
- [ ] **§23 Creative (7):** poetry, music, visual art, video, presentations, branding, advertising.
- [ ] **§8 Comparisons (6 + 12 profiles):** university vs polytechnic, bootstrap vs funding, saving vs investing, beach vs city break, WW1 vs WW2, open source vs proprietary — each profile carries only labeled criteria; `POST /knowledge/compare` reports `basis: "labeled"` and the no-universal-winner note.

## 3. Question Coverage (POST /knowledge/ask)

- [ ] "Who was Thomas Edison?" → `who.edison`; "Who was Chinua Achebe?" → `who.achebe`; "Who was Desmond Tutu?" → `who.tutu`; "Who was Grace Hopper?" → `who.hopper`.
- [ ] "When was the first computer built?" → `when.first-computer`; "When was the internet created?" → `when.arpabet`; "When was the constitution adopted?" → `when.us-constitution`.
- [ ] "Where is Nairobi?" → `place.nairobi`; "Where is the University of Ibadan?" → `place.university-of-ibadan`; "Where is Aso Rock?" → `place.aso-rock`.
- [ ] "What is earth science?" → `sci.earth-science` (top match); "What is software engineering?" → `tech.software-engineering`; "What is human resources?" → `bus.human-resources`.
- [ ] "Which is better: university or polytechnic?" → `cmp.university-vs-polytechnic`; "Should I bootstrap my business or raise funding?" → `cmp.bootstrapping-vs-funding`; "How do the World Wars compare?" → `cmp.ww1-vs-ww2`.
- [ ] The Session 140/147 anchors still work ("What is democracy?", "How do I start a business?", "Who was Kwame Nkrumah?", "Explain electricity to a child").

## 4. UI & Audit

- [ ] The `/app/knowledge` console still renders the six tabs; searching "Edison", "Nairobi", "earth science", "entrepreneurship", "university or polytechnic" returns the new records.
- [ ] `node audit/build-inventory.mjs` lists `knowledge` as **COMPLETE** (routes unchanged at 20).

## 5. Regression

- [ ] `religions` and `politics` unit suites pass unchanged (144 tests).
- [ ] Guard suites `noRandomData`, `demoCleanup` pass; `noFakeVerdict` shows only the pre-existing `voice/voice.module.ts:311` finding.
