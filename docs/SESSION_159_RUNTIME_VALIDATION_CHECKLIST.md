# Session 159 — Education runtime validation

- [ ] Fresh org, demo off: dashboard `avgMasteryPct` is JSON null; `activeLearners` is 0.
- [ ] `GET /education/content` is `[]` (no AI Literacy / Prompt Engineering seed).
- [ ] `POST /education/content` returns `rating: null`, `enrollments: 0`.
- [ ] `POST /education/skills` with `level: 3` then dashboard `avgMasteryPct` is 60 (one skill / 5).
- [ ] Passed assessment increments that content's `completions`; failed does not.
- [ ] Org B cannot list org A's catalog (`[]`).
- [ ] `/app/education` loads; empty mastery card is "—".
