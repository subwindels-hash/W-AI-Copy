# Session 152 Runtime Validation Checklist — Cyber & Cloud Academy Completion

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 152 stays 🟡 VERIFIED (partial).

---

## 1. Catalog

- [ ] `GET /cyber-cloud-academy/catalog` returns `total === 17` with 9 cybersecurity and 8 cloud topics, each with level, teachingTopic, description and resolving prerequisites.
- [ ] Both tracks have a beginner entry point with no prerequisites.

## 2. Progress & Path

- [ ] `GET /cyber-cloud-academy/progress` returns 17 entries; never-started topics report `masteryPct: null`, `started: false`, `completed: false`.
- [ ] `GET /cyber-cloud-academy/path` returns 17 nodes; exactly one `nextRecommended` per track; a fresh learner's first recommendation is `cyber-fundamentals` and `cloud-fundamentals`.
- [ ] Completing prerequisites through the lecturer loop (answer repeatedly) advances the next-recommended node.

## 3. Learning

- [ ] `POST /cyber-cloud-academy/start` with `{ topicId: "ethical-hacking" }` returns the topic plus a lecturer session (`sessionId` `ls-*`, `stage: "question"`), with `modelSource` honestly `real` or `fallback` and the warnings array surfaced when no AI provider is configured.
- [ ] `POST /start` with `{ topicId: "zero-trust", level: "expert" }` honours the override.
- [ ] Unknown topic ids → 404 `TOPIC_NOT_FOUND` on both `/start` and `/topic/:id`.
- [ ] `GET /cyber-cloud-academy/topic/:id` returns the topic with its lecturer mastery.

## 4. UI & Audit

- [ ] The `/app/cyber-cloud-academy` console renders the four tabs; the sidebar shows "Cyber & Cloud Academy"; never-started topics render "not started", never 0%.
- [ ] `node audit/build-inventory.mjs` lists `cyberCloudAcademy` as **COMPLETE** (125 modules / 123 COMPLETE / 2 PARTIAL).

## 5. Regression

- [ ] `education/lecturer.test.ts` and the university/engine suites pass unchanged; guard suites `noRandomData`, `demoCleanup` pass; `noFakeVerdict` shows only the pre-existing `voice/voice.module.ts:311` finding.
