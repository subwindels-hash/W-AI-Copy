# Session 154 Runtime Validation Checklist — Universal University & Higher Education Engine Completion

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 154 stays 🟡 VERIFIED (partial).

---

## 1. Catalog & Discovery

- [ ] `GET /education-engine/domains` returns > 10 domains and > 100 fields, including Engineering & Technology and Medicine & Health Sciences.
- [ ] `GET /education-engine/education-levels` covers the full ladder (undergraduate → postdoctoral → executive education; 16 levels).
- [ ] `GET /education-engine/search?q=robotics` and `?q=data%20scientist` return hits; nonsense returns [].

## 2. Programs & Plans

- [ ] `GET /education-engine/program?field=robotics&level=bachelor` returns B.Sc, 120 credits, core modules; `/program/courses` returns matching ENG-coded courses; unknown field → 404 FIELD_NOT_FOUND.
- [ ] `POST /education-engine/study-plan` with `{ field: "computer-science", level: "bachelor", years: 4 }` returns 8 semesters labelled Year 1…; unknown field → 404.

## 3. Advisor, Directory & Countries

- [ ] `POST /education-engine/advise` with an AI-engineering goal returns matched fields, a pathway from undergraduate_certificate upward, career outcomes and a rationale.
- [ ] `POST /education-engine/advise` with nonsense returns empty matches/pathway and the "could not strongly match" rationale.
- [ ] `GET /education-engine/universities?country=NG` returns Nigerian universities; `/countries/NG` returns a profile with bachelorDurationYears 4; unknown university → 404.

## 4. Learning & Research

- [ ] `POST /education-engine/teach` with `{ field: "cybersecurity", level: "master" }` returns a Lecturer session (`ls-*`, question present); `{ title: "Advanced Quantum Mechanics", level: "phd" }` works; `{}` → 400 VALIDATION_ERROR.
- [ ] `GET /education-engine/research/biology` returns methodologies + thesis stages including "Defence & submission"; unknown field → 404.
- [ ] `GET /education-engine/insight?q=what%20courses%20do%20I%20need%20to%20study%20computer%20science` returns category "pathway".

## 5. UI & Audit

- [ ] The `/app/education-engine` console renders the six tabs; the sidebar shows "Higher Education Engine"; the advisor shows its rationale; teaching surfaces modelSource/warnings.
- [ ] `node audit/build-inventory.mjs` lists `universityEngine` as **COMPLETE** — the inventory is now **125 modules / 125 COMPLETE / 0 PARTIAL / 0 STUB / 0 DEMO DATA**.

## 6. Regression

- [ ] `education` suites (lecturer, cyberCloudAcademy, university, universityEngine) pass; guard suites `noRandomData`, `demoCleanup` pass; `noFakeVerdict` shows only the pre-existing `voice/voice.module.ts:311` finding.
