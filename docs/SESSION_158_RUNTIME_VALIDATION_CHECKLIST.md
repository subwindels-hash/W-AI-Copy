# Session 158 — Legal runtime validation

- [ ] Fresh org, demo off: dashboard `compliancePassRate` and `riskAvg` are JSON null.
- [ ] `GET /legal/matters` is `[]` (no Acme/Globex seed).
- [ ] `POST /legal/matters` then dashboard `riskAvg` equals that matter's score.
- [ ] `POST /legal/research` returns `citations: []`, `sources: 0`.
- [ ] Org B cannot ack org A's update (404).
- [ ] `/app/legal` loads; empty compliance card is "—".
