# Cyber & Cloud Academy — Lecturer AI teaching tracks

**Added:** 2026-08-07

Bridges the existing **Cybersecurity Academy / Ethical Hacking** (Session 82) and
**Cloud / Infrastructure** modules to the **Lecturer AI** adaptive tutor, so the
OS can actually *teach students* Cybersecurity, Ethical Hacking, and Cloud
Computing through its own AI lecturer.

## Why

The Lecturer AI was already topic-agnostic (teach *any* topic string), and the
Cyber Academy already had a rich course catalog — but they were **not connected**:
there was no curriculum path for the Lecturer to teach Cyber/Cloud, and no
progress tracking. This integration closes that gap.

## What was added

| File | Purpose |
|---|---|
| `packages/shared/src/cyberCloudAcademy.ts` | Curated teaching catalog (9 Cybersecurity/Ethical-Hacking topics + 8 Cloud topics) with levels, prerequisites, and teaching prompts. Exported from `packages/shared/src/index.ts`. |
| `apps/api/src/education/cyberCloudAcademy.service.ts` | Service: `catalog()`, `getTopic()`, `startTopic()` (delegates to `LecturerService.start`), `progress()` (derived from lecturer mastery), `path()` (learning path with one `nextRecommended` node per track). |
| `apps/api/src/http/routes/cyberCloudAcademy.ts` | REST routes mounted at `/api/v1/cyber-cloud-academy` (auth-protected). |
| `apps/api/src/education/cyberCloudAcademy.test.ts` | 6 unit tests (catalog, teaching sessions, progress, path, TOPIC_NOT_FOUND). |

## Endpoints

```
GET  /api/v1/cyber-cloud-academy/catalog    # the full teaching catalog
GET  /api/v1/cyber-cloud-academy/progress   # per-topic mastery (null = never started)
GET  /api/v1/cyber-cloud-academy/path       # learning path + next recommended per track
POST /api/v1/cyber-cloud-academy/start      # { topicId, level? } → Lecturer AI session
GET  /api/v1/cyber-cloud-academy/topic/:id  # a topic + its current mastery
```

The Lecturer AI session itself (answer / ask / follow-up) continues to run through
the existing `/api/v1/education/lecturer/*` endpoints, reusing `sessionId`.

## Honesty rules (unchanged, carried through)

- **No faked teaching.** `startTopic` delegates to the real `LecturerService.start`.
  Without an AI provider key it returns the lecturer's honest `demo-ai` structured
  fallback plus a `warnings[]` entry — never disguised as real tutoring.
- **No fabricated progress.** `progress()` reads `LecturerService.topicMastery`,
  which is only persisted after the learner actually answers a question.
  Never-started topics report `masteryPct: null` (never a `0`).
- **Measured completion.** A topic counts `completed` only at mastery ≥ 85 (the
  lecturer's own completion threshold).

## Status
- ✅ Implemented, typechecks, 6 tests passing (alongside the existing
  `lecturer.test.ts`).
- 🟡 Runtime still requires the normal target-environment checklist (Postgres,
  Redis, and an AI provider key for true adaptive tutoring instead of the
  structured fallback) — same as every module.
