# Session 157 — Quantum completion (unfinished-module track, 3/N)

**Module:** `quantum` (Session 63 / 127)
**Status:** 🟡 VERIFIED (partial)

## What was unfinished

S127 gated the demo seed. Remaining defects:

- `inventory()`, `jobs()` and `dashboard()` still called `ensureBootstrapped()` on first read.
- `connectors()` claimed IBM was `connected` with 127 qubits (demo on) or reported `qubitsAvailable: 0` (demo off) — both lies.
- `submitJob` invented a qubit count with `randInt(20, 200)`.
- Empty inventory produced `migrationPct: 0` and `readiness: "planning"`.
- No way to record a real crypto system without turning demo data on.
- No dedicated console, no unit tests, no tenant-isolation catalog.

## What this session adds

- Reads never seed.
- Connectors are an environment report. Status is `not_configured` or `configured_not_connected` (local sim `ready` only if `WINDELS_QUANTUM_LOCAL_SIM=true`). Never `connected`. `qubitsAvailable` / `queueDepth` are `null` without a session.
- Inventory CRUD (`POST/PATCH/DELETE /inventory`). RSA/ECDSA/ECDH flagged vulnerable by name unless overridden.
- Jobs stay `queued` with no `objectiveValue`. Qubit count is operator-supplied or omitted.
- Empty inventory → `readiness: "unassessed"`, `migrationPct: null`.
- `/app/quantum` console. `q:inv/invs/j/js/c/meta` + `qtm:notes` catalogued.
- Existing dashboard/inventory/connectors/jobs/notes paths kept.

## Not claimed

A live IBM / Braket / Azure / Cirq / D-Wave session, or local circuit execution.
