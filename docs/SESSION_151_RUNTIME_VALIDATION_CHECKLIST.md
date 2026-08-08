# Session 151 Runtime Validation Checklist — Life Principles Verbatim Audit & Coaching Refinement

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 151 stays 🟡 VERIFIED (partial).

---

## 1. Verbatim Spec Pinning

- [ ] `GET /life-principles/rules/:n` returns the spec-exact title and principle for every n in 1–115 (the unit suite pins all 115; spot-check 1, 24, 50, 64, 75, 96, 115 in the live API).
- [ ] `GET /life-principles/areas` returns the 13 labels exactly: Discipline, Money, Career, Business, Relationships, Leadership, Education, Personal growth, Mental resilience, Health habits, Digital life, Spirituality, Decision-making.
- [ ] `GET /life-principles/philosophy` returns the 12 phrases exactly, including "Discipline without cruelty." and "Power with accountability.".

## 2. Coaching Engine Refinements (POST /ask)

- [ ] "How do I become a better father?" → `relationships` with a positive classification score.
- [ ] "How can I be a better mother to my kids?" → `relationships`.
- [ ] "I feel like giving up on my dreams" → `mental_resilience`.
- [ ] "I feel hopeless about the future" → `mental_resilience`.
- [ ] "How do I negotiate a raise with my boss?" → `career`.
- [ ] "I got fired from my job" → `career`.
- [ ] "My son is struggling at school" → `relationships`.
- [ ] Documented tie-breaks unchanged: "Teach me to be more grateful" → education; "I'm afraid of failing my exams" → education.

## 3. Regression

- [ ] `GET /life-principles/integrity` still `{ ok: true, issues: [] }`; `GET /catalog` still `ruleCount === 115`.
- [ ] Daily Rules Mode, Decision Mode, the general "rules of life" area menu, and Enterprise Search `life_principle` rollup (115) all still work.
- [ ] `knowledge` (105), `religions` (69), `politics` (75) suites pass unchanged; guard suites `noRandomData`, `demoCleanup` pass; `noFakeVerdict` shows only the pre-existing `voice/voice.module.ts:311` finding.
