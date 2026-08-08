# Session 141 Runtime Validation Checklist — Global Religion, Belief & Spirituality Knowledge System (`religions`)

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 141 stays 🟡 VERIFIED (partial).

The unit suites prove the question engine, neutrality answers, comparison engine, teaching levels, catalog integrity and the expansion pipeline against mocked Redis; only a live deployment proves Redis persistence, real auth sessions, the Super Admin role and the web console end to end.

---

## 1. Route Mounting & Auth

- [ ] `GET /api/v1/religions/catalog` returns `200 OK` with `catalogVersion`, `recordCount > 100`, `familyCount: 12`, the neutrality note and the expansion note.
- [ ] All `/api/v1/religions/*` endpoints refuse anonymous callers (`401 Unauthorized`).
- [ ] Submission endpoints refuse a no-organization session with `403 Forbidden`.
- [ ] `PATCH /religions/submissions/:id` (approve/reject) refuses non-Super-Admin callers with `403 Forbidden` and never bypasses the service-level role check.
- [ ] Existing routes (`/api/v1/knowledge/*`, `/api/v1/payments/*`, …) still answer on their original paths and shapes.

## 2. Catalog & Coverage

- [ ] `GET /religions/search` finds traditions by English, indigenous (e.g. `Ìṣẹ̀ṣe`) and non-Latin (e.g. Hebrew `יַהֲדוּת`) names.
- [ ] Every major family has records: Abrahamic, Dharmic, Iranian, East Asian, African traditional, African diaspora, Indigenous American, Oceanian, Ancient, NRM, Humanistic.
- [ ] The spec's required lists resolve: 9 Abrahamic majors, 24+ Christian denominations, Sunni/Shia/Ibadi/Ahmadiyya/Sufism + legal/theological schools, Jewish movements + Kabbalah, Hindu schools, 12 Buddhist schools, 4 Jain branches, 18 African traditions, 11 Indigenous American traditions, 6 Oceanian traditions, 16+ ancient religions.
- [ ] `GET /religions/integrity` returns `{ ok: true, issues: [] }`.
- [ ] Every record carries the §12 core fields (name, family, region, origin, central teachings, deity concept, afterlife, historical development, summary, beginner explanation, sources, last reviewed).

## 3. Question Engine & Neutrality

- [ ] `POST /religions/ask` with "What is Islam?" returns the Islam record with sections rendered at the requested level.
- [ ] "What is the difference between Christianity and Islam?" routes to the comparison engine (`mode: "comparison"`, 18 rows, no winner note).
- [ ] "Which religion is true?" and "Is Christianity the true religion?" return the neutrality answer (`mode: "neutrality"`, `pol.neutrality`, note stating truth claims are matters of faith/theology/philosophy/personal belief).
- [ ] "When did Buddhism begin?" returns the history classification with origin information.
- [ ] A nonsense question returns `matches: []` with the explicit "do not have sufficient verified knowledge" note.

## 4. Comparison Engine

- [ ] `POST /religions/compare` with `["rel.christianity", "rel.islam"]` returns exactly the 18 spec categories (origin → differences) with each tradition's own text.
- [ ] Missing ids are reported in `missing`; a comparison with only missing ids answers 404.
- [ ] The response contains no winner/ranking and carries the neutrality note.

## 5. Teaching Levels

- [ ] `GET /religions/records/rel.buddhism/teach?level=beginner` returns the simple explanation.
- [ ] `?level=research` returns more sections, including research/debate content; the underlying record fields are identical across levels.

## 6. Expansion Pipeline (§18)

- [ ] `POST /religions/submissions` returns a `pending_review` submission with all 10 checks, confidence `unverified`, and the approval check failed.
- [ ] Submitting "Islam" (or any existing name/alias) fails the duplicate-detection check with a "record as an alias" note.
- [ ] Submissions without `sources` fail source verification and `allAutomatedPassed` is false.
- [ ] Two organizations cannot read or delete each other's submissions.
- [ ] `PATCH /religions/submissions/:id` with `{ status: "approved" }` as Super Admin publishes the record into the shared store, and it becomes searchable from other organizations.
- [ ] Rejection leaves the record out of the knowledge base; a reviewed submission cannot be reviewed twice (409).
- [ ] Redis unreachable → submissions and extensions degrade to the in-memory stores without erroring.

## 7. Integrations, UI & Audit

- [ ] `/app/religions` renders the five tabs without console errors; the truth-claim answer shows the neutrality panel; Compare renders the 18-category table; Expand shows the check report and (for Super Admin) Approve/Reject.
- [ ] Sidebar shows "World Religions" linking to `/app/religions`.
- [ ] Enterprise Search over the `religion` entity type returns catalog records (e.g. "Yoruba", "Vodou", "Zoroastrianism").
- [ ] S89 tenant-isolation sweep confirms `rel:sub` is `org_scoped` and conforming, and `rel:ext` is catalogued `shared` with its rationale.
- [ ] `node audit/build-inventory.mjs` lists `religions` as **COMPLETE** and reports the full inventory.
