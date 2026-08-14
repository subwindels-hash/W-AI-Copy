# Session 157 — Quantum runtime validation

- [ ] Fresh org, demo off: `GET /quantum/dashboard/rollup` is `unassessed`, `migrationPct` JSON null, empty inventory.
- [ ] `GET /quantum/connectors` — no vendor `connected`; `qubitsAvailable` is null.
- [ ] Setting `WINDELS_IBM_QUANTUM_TOKEN` only flips IBM to `configured_not_connected`.
- [ ] `POST /inventory` with `RSA-2048` → `quantumVulnerable: true`, `source: operator_entered`.
- [ ] `POST /jobs` → `status: queued`, no `objectiveValue`.
- [ ] Org B cannot read org A's inventory id (404).
- [ ] `/app/quantum` loads; empty copy does not say 0% migrated.
- [ ] Session 89 audit lists `q:inv`, `q:invs`, `q:j`, `q:js`, `q:c`, `q:meta`, `qtm:notes`.
