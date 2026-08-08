# Session 150 — Life Operating Principles Engine ("Rules of Life")

**Module:** `lifePrinciples` (new module)
**Mount:** `/api/v1/life-principles` (12 routes)
**Status:** COMPLETE (115 rules + 13 coaching areas + daily/decision engines + 12 philosophy pairs + 10-step principle; 29 unit tests + 10 e2e cases)
**Date:** 2026-08-08 · **Branch:** `arena/019fe26a-win`

---

## 1. Purpose

The Life Operating Principles Engine turns the spec's "Rules of Life — To
Become Unstoppable" into an educational, read-only knowledge module. Its
core philosophy is structural: **there is no single universal set of
"rules of life"** — different cultures, religions, philosophies, families
and individuals hold different principles. The module therefore presents
the 115 rules as *practical life principles*, not absolute laws, and its
engines help people think, reflect and decide for themselves rather than
telling them how to live.

## 2. Catalog

**115 curated rules** across the 10 parts of the spec (50 + 25 + 10 + 10 + 8
+ 12):

| Part | Rules | Count |
| --- | --- | --- |
| Mindset & Self-Control | 1–10 | 10 |
| Discipline & Daily Life | 11–20 | 10 |
| Knowledge & Skills | 21–30 | 10 |
| Money & Financial Freedom | 31–40 | 10 |
| Privacy, Strategy & Personal Boundaries | 41–50 | 10 |
| Becoming Unstoppable | 51–75 | 25 |
| Relationship Rules | 76–85 | 10 |
| Business & Work Rules | 86–95 | 10 |
| Digital Life Rules | 96–103 | 8 |
| Character Rules | 104–115 | 12 |

Every rule record carries: `number`, `title`, `principle` (the spec text),
`whyItMatters`, `howToApply`, `action` (a concrete daily action), and
`reflectionQuestion`. Rules where an absolutist reading is possible (2, 5,
9, 33, 34, 42, 62, 84 and more) carry a `considerations` balance note —
e.g. "Protect your peace is not the same as avoiding accountability".

## 3. Engines

- **Part VII Life Coaching Engine** (`POST /ask`): classifies the question
  into one of 13 areas (Discipline, Money, Career, Business, Relationships,
  Leadership, Education, Personal growth, Mental resilience, Health habits,
  Digital life, Spirituality, Decision-making) via deterministic keyword
  scoring and returns the mapped principles. **"What are the rules of
  life?" returns the 13-area menu with a sample** — never all 115 rules.
- **Part VIII Daily Rules Mode** (`GET /daily`): a deterministic daily rule
  (day-of-year % 115) composed of TODAY'S RULE / WHY IT MATTERS / HOW TO
  APPLY IT / TODAY'S ACTION / REFLECTION QUESTION, with `?date=` and
  `?rule=` overrides.
- **Part IX Decision Mode** (`POST /decision`): returns the 10-question
  framework (What are you trying to achieve? … What is the next
  responsible action?) plus 11 mapped principles, with the explicit note
  that WINDELS does not decide for the user.
- **Part X The WINDELS Principle** (`GET /principle`): the 10 steps
  (THINK BEFORE YOU ACT … NEVER STOP LEARNING).
- **Philosophy** (`GET /philosophy`): the 12 "X without Y" balance pairs
  (Discipline without cruelty, Privacy without paranoia, Persistence
  without refusing to adapt, …) with meaning + guidance.

## 4. Integration

- **Enterprise Search:** new `life_principle` entity type; all 115 rules
  are indexed (`Rule N: Title` + principle + why + how) and counted in the
  rollup.
- **Tenant isolation:** the module is a static curated catalog with no
  Redis keys — documented in the TI sweep convention (nothing to scope).
- **Console:** `/app/life-principles` ("Rules of Life" in the sidebar) with
  five tabs: Today's Rule, Ask, All 115 Rules, Decision Mode, Philosophy.

## 5. Neutrality & Honesty Discipline

- The catalog meta, ask responses and daily notes all carry the framing:
  "practical life principles, not absolute laws".
- Considerations notes render in the UI alongside rules that carry them.
- Decision Mode never returns a verdict and explicitly warns against
  AI dependency for life decisions.
- No module content claims a universal way to live; the balance pairs
  exist precisely to prevent absolutist readings.

## 6. Files Changed

- `packages/shared/src/lifePrinciples.ts` (new contract: parts, areas,
  philosophy pairs, principle steps, decision framework, rule schema,
  classification/daily helpers) + re-export in `index.ts`
- `packages/shared/src/enterpriseSearch.ts` (+`life_principle` type)
- `apps/api/src/lifePrinciples/` (seed.core 1–50, seed.unstoppable 51–85,
  seed.work 86–115, service, test)
- `apps/api/src/http/routes/lifePrinciples.ts` + mount in `server.ts`
- `apps/api/src/enterpriseSearch/enterpriseSearch.service.ts` (case + count)
- `apps/web/src/lib/lifePrinciples.ts`, `pages/lifePrinciples/LifePrinciplesPage.tsx`,
  `router.tsx`, `app/Sidebar.tsx`
- `audit/build-inventory.mjs` (prefix map + lifePrinciples)
- Docs, PROGRESS, CONVENTIONS

## 7. Verification

- 29/29 unit tests; 287 total with knowledge/religions/politics + guards.
- Catalog integrity `{ ok: true, issues: [] }` (115/115 numbers, all parts,
  all area mappings resolve).
- API typecheck: zero errors in the new module's sources; web typecheck +
  production build clean.
- Inventory regenerated: **125 modules / 122 COMPLETE / 3 PARTIAL**;
  `lifePrinciples` COMPLETE with the correct `/api/v1/life-principles` prefix.
- Runtime validation remains 🟡 pending the target environment (see the
  runtime checklist).
