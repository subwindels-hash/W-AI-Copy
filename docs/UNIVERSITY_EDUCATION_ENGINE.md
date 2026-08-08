# WINDELS Universal University & Higher Education Engine

**Understand. Choose. Learn. Research. Graduate. Build Your Future.**

A major WINDELS AI OS module that understands higher education globally and
helps users **discover, learn, plan, enroll, manage and progress** through
university-level study — across universities, colleges, polytechnics, institutes
and professional schools worldwide.

> **Architecture decision:** built as a **Universal Academic Knowledge
> Architecture** (`Domain → Field → Program → Degree → Course → Module → Topic →
> Learning Objective → Assessment`), NOT a hand-coded list of every course on
> Earth. Domains and fields are curated structured data; programs and courses
> are generated deterministically from that data on demand, and providers can
> extend the system via imports / admin tools / university APIs / CSV.

## 1. Education levels (global)
Undergraduate (certificate, diploma, **associate**, **bachelor**) · Postgraduate
(postgrad diploma, **master**, professional master) · Doctoral (**PhD**,
professional doctorate, EdD, DBA, other) · **Postdoctoral** research ·
Professional certifications · Continuing education · Executive education.

## 2. Academic catalog — 16 faculties / 100+ course families
Engineering & Technology, Computer Science & IT, Medicine & Health Sciences,
Business & Economics, Law, Natural Sciences, Social Sciences, Arts & Humanities,
Education, Agriculture & Environmental Studies, Architecture & Built Environment,
Media & Communication, Hospitality/Tourism/Aviation, Transportation & Maritime,
Military/Security/Emergency, and Professional & Specialized fields — covering all
the course families you specified (Robotics, Cybersecurity, Data Science, Cloud,
ML, Nursing, Pharmacy, Accounting, Finance, IP Law, Psychology, Music, Early
Childhood Education, Climate Science, Architecture, Journalism, Hotel Management,
Marine Engineering, Forensic Science, Gender Studies, African Studies, and more).

## 3. Global university directory + country education systems
Representative real institutions across **Nigeria, US, UK, Canada, Australia,
South Africa, Ghana, Kenya, Germany, France, India, China, Japan, UAE, Saudi
Arabia** and more, with name, country, city, type (university/college/polytechnic/
institute/professional school), ownership, founded, website, domains, degrees and
notes. Country profiles capture the local system: degree names, admission
requirements, grading, academic calendar and accreditation (e.g. NUC for Nigeria,
GTEC for Ghana, QAA for UK, regional accreditors for US).

## 4. AI University Advisor
Tell WINDELS **"I want to become an AI engineer. I finished secondary school."**
It matches your goal against fields + career keywords and returns:
- matched fields with relevance scores
- a recommended **degree pathway** (undergraduate → bachelor → master → PhD)
- an AI rationale
- career outcomes
Then create a **semester-by-semester study plan** for the field.

## 5. University Learning System
Every field/course connects to the real **Lecturer AI** adaptive tutor —
`POST /teach { field, level }` starts a teaching session (adaptive ASSESS→LESSON→
QUESTION→FEEDBACK loop; honest "demo-ai" fallback without an AI provider key).
Programs expose their core courses/modules with teaching topics.

## 6. Research & Thesis System
Per-field research guidance: suggested research topics, research methodologies
(literature review, quantitative, qualitative, design science), and thesis stages
(proposal → ethics → lit review → methodology → analysis → writing → defence).

## 7. Academic Intelligence
Answers questions such as *"What courses do I need for Computer Science?"*,
*"What's the difference between CS and Software Engineering?"*,
*"What careers does a Finance degree lead to?"*.

## Endpoints (`/api/v1/education-engine`, auth-protected)

```
GET  /domains                      # all faculties / domains
GET  /domains/:id                  # one domain + its fields
GET  /fields/:id                   # one field + its domain
GET  /education-levels             # education levels by group
GET  /search?q=                    # search domains/fields/careers
GET  /program?field=&level=        # generate a program for a field
GET  /program/courses?field=&level=# the field's courses
GET  /universities[?country=]      # global university directory
GET  /universities/:id             # one university
GET  /countries                    # country education-system profiles
GET  /countries/:code              # one country profile
POST /advise                       # { goal, level? } → recommended pathway
POST /study-plan                   # { field, level?, years? } → semester plan
POST /teach                        # { field|title, level? } → Lecturer AI session
GET  /research/:fieldId            # research & thesis guidance
GET  /insight?q=                   # academic-intelligence answer
```

## Integration with the rest of the OS
Designed to plug into the **AI Training Center** (via Lecturer AI), **Knowledge /
Memory** (progress persistence), **Document Generation Center** (plans/certificates),
**AI Workforce** (professor/tutor/advisor agents), **Marketplace**, **Geographic
Intelligence** (country profiles), and the **Public API Platform**.

## Files added
| File | Purpose |
|---|---|
| `packages/shared/src/universityEngine.ts` | Types: education levels, knowledge architecture, university record, advisor/plan/research output |
| `packages/shared/src/universityEngineData.ts` | Curated 16-domain / 100+ field catalog |
| `packages/shared/src/universityDirectory.ts` | Global university directory + country profiles |
| `apps/api/src/education/universityEngine.service.ts` | Engine: catalog, advisor, planner, learning, research, academic intelligence |
| `apps/api/src/http/routes/universityEngine.ts` | REST routes |
| `apps/api/src/education/universityEngine.test.ts` | 10 tests |

## Status
- ✅ Implemented, typechecks, **10 tests passing** (24 across the education suite).
- 🟡 Runtime requires the standard target-environment checklist (Postgres, Redis,
  an AI provider key for true adaptive tutoring). Program generation, search,
  advisor, planner, directory and research guidance are all live from data.
- 🟢 Extensible: import/admin/API hooks can populate real institution curricula.
