# Session 160 — Scientific runtime validation

- [ ] Fresh org, demo off: dashboard `knowledgeGraphNodes`, `collaborators`, `simulationsRun30d` are JSON null; `publicationsInProgress` is 0.
- [ ] `GET /scientific/experiments` is `[]` (no KRAS / TLS / perovskite seed).
- [ ] `POST /scientific/experiments` returns `status: "planned"`, `progressPct: 0`.
- [ ] `POST /scientific/papers` returns `citations: null`, `relevanceScore: null`.
- [ ] `POST /scientific/hypotheses` returns `confidence: null`; dashboard `publicationsInProgress` stays 0.
- [ ] Org B cannot list org A's experiments (`[]`).
- [ ] `/app/scientific` loads; empty KG / collaborators / simulations cards are "—".
