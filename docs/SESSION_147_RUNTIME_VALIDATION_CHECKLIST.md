# Session 147 Runtime Validation Checklist — Knowledge Coverage Completion (§5–§23)

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 147 stays 🟡 VERIFIED (partial).

---

## 1. Catalog & Integrity

- [ ] `GET /knowledge/catalog` reports `recordCount > 240` with the stable/dynamic and confidence breakdowns intact.
- [ ] `GET /knowledge/integrity` returns `{ ok: true, issues: [] }` — every relatedId resolves within the knowledge catalog.

## 2. Coverage by Section

- [ ] **§5 People:** `who.nkrumah`, `who.churchill`, `who.dangote`, `who.socrates`, `who.confucius`, `who.fela-kuti`, `who.serena-williams` resolve with biography + achievements + historical context.
- [ ] **§7 Places:** `place.nile`, `place.kilimanjaro`, `place.atlantic-ocean`, `place.lagos` resolve with the geography section.
- [ ] **§9 Disciplines:** `disc.sociology`, `disc.philosophy`, `disc.history`, `disc.geography`, `disc.accounting`, `disc.political-science` resolve with learning paths.
- [ ] **§10 Science:** `sci.oceanography`, `sci.meteorology`, `sci.microbiology`, `sci.materials-science` resolve with FOUNDATIONS→RESEARCH levels.
- [ ] **§11 Technology:** `tech.smartphones`, `tech.operating-systems`, `tech.networking`, `tech.apis`, `tech.machine-learning`, `tech.robotics`, `tech.semiconductors`, `tech.telecommunications`, `tech.devops` resolve with how-it-works.
- [ ] **§12 Business:** `bus.marketing`, `bus.sales`, `bus.accounting`, `bus.investment`, `bus.supply-chains`, `bus.management`, `bus.leadership`, `bus.customer-service` resolve.
- [ ] **§13 Careers:** `car.remote-work`, `car.freelancing` resolve.
- [ ] **§14 Law:** `law.criminal`, `law.civil`, `law.property`, `law.family`, `law.employment`, `law.business`, `law.legislatures`, `law.executive`, `law.international` resolve; criminal/civil/property/family/employment/business carry professional-assistance notes.
- [ ] **§15 Health:** `hlth.diseases`, `hlth.medications`, `hlth.public-health` resolve with disclaimers.
- [ ] **§19/§20/§21/§22/§23/§18:** `rel.negotiation`, `rel.emotional-intelligence`, `ent.music`, `ent.games`, `ent.sports`, `lng.grammar`, `lng.linguistics`, `day.shopping`, `day.basic-tech`, `day.parenting`, `cre.graphic-design`, `cre.photography`, `cre.content-creation`, `trv.accommodation`, `trv.planning` resolve.

## 3. Question Coverage

- [ ] `POST /knowledge/ask` answers "Who was Kwame Nkrumah?" with `who.nkrumah`.
- [ ] "What is machine learning?" → `tech.machine-learning`.
- [ ] "What is civil law?" → `law.civil`.
- [ ] "Where is Lagos?" → `place.lagos`.
- [ ] The Session 140 anchors still work ("What is democracy?", "How do I start a business?", "Why does inflation happen?", "Explain electricity to a child").

## 4. UI & Audit

- [ ] The `/app/knowledge` console still renders the six tabs; searching "machine learning", "civil law", "Lagos", "Nkrumah" returns the new records.
- [ ] `node audit/build-inventory.mjs` lists `knowledge` as **COMPLETE**.
