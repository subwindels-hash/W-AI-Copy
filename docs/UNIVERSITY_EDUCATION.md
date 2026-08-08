# University Education — Lecturer AI teaching platform

**Added:** 2026-08-07

Implements a full **university** inside WINDELS AI OS — a high-level institution
of learning that:
- teaches after secondary school (post-secondary),
- spans **many subjects** across multiple **faculties / colleges / departments**,
- awards **degrees at three levels** — **Bachelor** (undergraduate), **Master**
  (postgraduate) and **Doctorate / Doctor** (doctoral research),
- conducts **research work**.

Every course in the catalog is taught by the existing **Lecturer AI** adaptive
tutor, so students can actually be taught any university course through the OS.

## Faculties

| Faculty | Degree awards | Research areas |
|---|---|---|
| **Engineering** | B.Eng · M.Eng · Ph.D (Eng) | Materials, robotics, sustainable energy, structural safety, additive manufacturing |
| **Computing & IT** | B.Sc (Comp) · M.Sc (Comp) · Ph.D (Comp) | AI/ML, cybersecurity & ethical hacking, HCI, distributed/cloud, data science |
| **Natural & Physical Sciences** | B.Sc · M.Sc · Ph.D (Sci) | Quantum physics, climate science, biochemistry, mathematics, materials chemistry |
| **Health Sciences** | B.Sc / MB.BS · M.P.H / M.Sc · Ph.D / M.D | Clinical trials, public health, pharmacology, epidemiology, health informatics |
| **Business & Management** | B.B.A · M.B.A · Ph.D (Mgmt) | Corporate finance, organisational behaviour, marketing analytics, entrepreneurship |
| **Law** | LL.B · LL.M · Ph.D (Law) | International & human-rights law, criminal justice, constitutional & commercial law |
| **Humanities & Social Sciences** | B.A · M.A · Ph.D (Arts) | Linguistics, social/cultural studies, cognitive psychology, public policy, history |
| **Agriculture & Environment** | B.Agric · M.Sc (Agric) · Ph.D (Agric) | Food security, soil/water science, animal science, conservation, agri-economics |
| **Education** | B.Ed · M.Ed · Ph.D (Educ) | Instructional design & ed-tech, assessment & analytics, inclusive education, curriculum |
| **Arts, Design & Communication** | B.A (Design) · M.F.A · Ph.D (Fine Arts) | Visual & comms design, film & media, music & performing arts, journalism ethics |

## Course catalogue
> **60+ courses** across the 10 faculties, each with a code, credit count,
> degree level, department, prerequisites and a `teachingTopic` handed to the
> Lecturer AI. Courses are sequenced bachelor → master → doctor, with research
> thesis courses (doctoral) at the top of each faculty.

## Endpoints

```
GET  /api/v1/university/overview              # faculties, totals, degrees, research areas
GET  /api/v1/university/catalog               # full course + faculty catalog
GET  /api/v1/university/faculties             # all faculties
GET  /api/v1/university/faculties/:id/courses # ?level=bachelor|master|doctor
GET  /api/v1/university/faculties/:id/degree-plan  # degree roadmap for a faculty
GET  /api/v1/university/progress              # per-course mastery (null = never started)
GET  /api/v1/university/search?q=             # search by title/code/department/faculty
POST /api/v1/university/start                 # { courseId } → Lecturer AI teaching session
GET  /api/v1/university/courses/:id           # a course + its current mastery
```

The Lecturer AI session itself (answer / ask / follow-up) continues through the
existing `/api/v1/education/lecturer/*` endpoints, reusing `sessionId`.

## Degree-level → lecturer mapping
| University degree | Lecturer AI difficulty |
|---|---|
| Bachelor | beginner |
| Master | advanced |
| Doctor | advanced (lecturer ceiling) |

## Honesty rules (unchanged, carried through)
- **No faked teaching** — `startCourse` delegates to the real `LecturerService.start`.
  Without an AI provider key it returns the lecturer's honest `demo-ai`
  structured fallback plus a `warnings[]` entry.
- **No fabricated progress** — `progress()`/`degreePlan()` read
  `LecturerService.topicMastery`, persisted only after the student actually
  answers a question. Never-started courses report `masteryPct: null`.
- **Measured completion** — a course counts `completed` only at mastery ≥ 85.
- **Real degree plans** — `degreePlan` marks exactly one `nextRecommended` course
  per faculty: the first un-completed course at the lowest degree level whose
  prerequisites are met.

## Status
- ✅ Implemented, typechecks, **7 tests passing** (14 across the education suite).
- 🟡 Runtime requires the standard target-environment checklist (Postgres, Redis,
  and an AI provider key for true adaptive tutoring instead of the structured
  fallback) — same as every module.
