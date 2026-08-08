# Session 150 Runtime Validation Checklist — Life Operating Principles Engine

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 150 stays 🟡 VERIFIED (partial).

---

## 1. Mount & Catalog

- [ ] `GET /api/v1/life-principles/catalog` returns 200 with `catalogVersion` containing `150`, `ruleCount === 115`, `partCount === 10`, `areaCount === 13`, `philosophyPairCount === 12`, and the "not absolute laws" note.
- [ ] `GET /life-principles/parts` returns the 10 parts with counts (10/10/10/10/10/25/10/10/8/12).
- [ ] `GET /life-principles/integrity` returns `{ ok: true, issues: [] }`.

## 2. Rules

- [ ] `GET /life-principles/rules?limit=115` returns all 115 rules; `GET /rules/1` → "Stay Alert"; `GET /rules/115` → "Leave a Legacy"; `GET /rules/116` → 404.
- [ ] `POST /life-principles/search` with `q: "password"` returns rule 96; with `q: "trust"` returns multiple.
- [ ] Rule detail includes title, principle, whyItMatters, howToApply, action, reflectionQuestion; considerations present on rules 2/5/9/33/34/42/62/84.

## 3. Engines

- [ ] `POST /life-principles/ask` classifies: "How do I save money and pay off debt?" → money; "My marriage is going through a hard time" → relationships; "How do I protect my passwords online?" → digital_life; "Should I start a business?" → business.
- [ ] `POST /life-principles/ask` with "What are the rules of life?" returns `general: true` with the 13-area menu and NO full rule list.
- [ ] `GET /life-principles/areas` returns 13 areas with ruleCounts.
- [ ] `GET /life-principles/daily?date=2026-08-08` is deterministic (two calls identical), carries todayRule/whyItMatters/howToApply/todayAction/reflectionQuestion; a different date gives a different rule; `?rule=1` overrides to Rule 1.
- [ ] `POST /life-principles/decision` returns exactly the 10 framework questions in order and the note "does not make the decision for you".
- [ ] `GET /life-principles/philosophy` returns 12 pairs including "Discipline without cruelty." and "Privacy without paranoia.".
- [ ] `GET /life-principles/principle` returns the 10 steps starting "THINK BEFORE YOU ACT." and ending "NEVER STOP LEARNING.".

## 4. Integration

- [ ] `GET /search/query?q=protect%20your%20passwords&types=life_principle` returns the life-principle hit (Rule 96).
- [ ] `GET /search/dashboard/rollup` reports `indexedCounts.life_principle === 115`.
- [ ] The `/app/life-principles` console renders the five tabs; the sidebar shows "Rules of Life"; searching and the daily/decision/ask flows work in the UI.

## 5. Regression

- [ ] `knowledge` (105), `religions` (69), `politics` (75) suites pass unchanged; guard suites `noRandomData`, `demoCleanup` pass; `noFakeVerdict` shows only the pre-existing `voice/voice.module.ts:311` finding.
- [ ] `node audit/build-inventory.mjs` lists `lifePrinciples` as COMPLETE with prefix `/api/v1/life-principles` (125 modules / 122 COMPLETE / 3 PARTIAL).
