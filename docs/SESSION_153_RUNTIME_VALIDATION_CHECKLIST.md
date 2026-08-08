# Session 153 Runtime Validation Checklist — University Education Completion

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 153 stays 🟡 VERIFIED (partial).

---

## 1. Catalog & Overview

- [ ] `GET /university/overview` returns facultiesCount > 5, coursesCount > 50, researchAreasCount > 0, degreesOffered = [bachelor, master, doctor].
- [ ] `GET /university/catalog` returns courses at all three degree levels; every faculty carries awards for all three levels.
- [ ] `GET /university/faculties/:id/courses` lists a faculty's courses; `?level=bachelor` filters; invalid level → 400; unknown faculty → 404 FACULTY_NOT_FOUND.

## 2. Degree Plan & Progress

- [ ] `GET /university/faculties/:id/degree-plan` returns courses ordered by level → term with exactly one `nextRecommended` (bachelor-level, prerequisites met) for a fresh learner; unknown faculty → 404.
- [ ] `GET /university/progress` reports `masteryPct: null`, `started: false` for never-started courses.
- [ ] Completing a prerequisite course through the lecturer loop advances the next-recommended course.

## 3. Learning & Search

- [ ] `POST /university/start` with `{ courseId: "csc-401" }` returns the course (CSC401, master) and a lecturer session (`ls-*`, stage "question") with `modelSource` honestly `real` or `fallback`.
- [ ] Unknown course id → 404 COURSE_NOT_FOUND on `/start` and `/courses/:id`.
- [ ] `GET /university/search` finds courses by code ("CSC"), title ("Ethical Hacking") and faculty ("law"); nonsense → [].

## 4. UI & Audit

- [ ] The `/app/university` console renders the five tabs; the sidebar shows "University Education"; never-started courses render "not started", never 0%.
- [ ] `node audit/build-inventory.mjs` lists `university` as **COMPLETE** (125 modules / 124 COMPLETE / 1 PARTIAL).

## 5. Regression

- [ ] `education` suites (lecturer, cyberCloudAcademy, universityEngine) pass unchanged; guard suites `noRandomData`, `demoCleanup` pass; `noFakeVerdict` shows only the pre-existing `voice/voice.module.ts:311` finding.
