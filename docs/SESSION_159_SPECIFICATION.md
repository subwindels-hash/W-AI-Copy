# Session 159 — Education completion (unfinished-module track, 5/N)

**Module:** `education` (Session 67)
**Status:** 🟡 VERIFIED (partial)

## What was unfinished

- `dashboard()` called `ensureBootstrapped()` on first GET (seed gated, but a read was still a seeder).
- Seed used RNG for ratings, enrollments, completions, assessment scores and tutor mastery.
- Empty org: `avgMasteryPct: 0` (0% mastery) and `activeLearners: Math.max(1, …)` (at least one learner).
- `hoursLearned30d` was catalog `durationMin × completions`, not recorded study time.
- `certificationsIssued` inferred from `certification_prep` completions &gt; 10.
- No list/create for catalog content or skills. No dedicated console. No unit tests. No TI catalog.

## What this session adds

- Reads never seed. Demo seed (when `WINDELS_DEMO_DATA`) writes titles only — rating null, enrollments/completions 0, skill level 0, no fake assessments or tutors.
- `avgMasteryPct` is `number | null`. `rating` is `number | null`.
- `activeLearners` is the distinct userId set. Hours come from assessment `timeSpentSec`. Certs are passed assessments on `certification_prep` content.
- List + create for content and skills; list paths/assessments/tutor sessions.
- `/app/education` console. Lecturer AI stays at `/app/learn`.
- `edu:c/cs/p/ps/t/ts/a/as/sk/sks` catalogued.
- Existing dashboard/tutor/path/assessment/lecturer paths kept.

## Not claimed

A live LMS, SCORM/xAPI connector, or issued digital certificates. Completions increment only when a recorded assessment passes.
