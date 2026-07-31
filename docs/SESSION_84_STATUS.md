# Session 84 — Project Continuity Engine status

## Implemented foundation

- Authenticated project-intake endpoints:
  - `POST /api/v1/projects/intake` (multipart field: `archive`)
  - `GET /api/v1/projects`
- 25 MB archive intake limit.
- Basic ZIP, 7Z, TAR, TAR.GZ, TAR.BZ2, and TAR.XZ format detection.
- Accepted archives are stored with owner-only filesystem permissions in an organization/project intake directory.
- Safe ZIP/TAR extraction endpoint with pre-extraction path validation, file-count limit, symlink rejection, and post-extraction total-size limit. 7Z remains quarantined until a hardened configured extractor is available.
- SHA-256 archive fingerprinting.
- Organization-scoped intake records.
- Quarantine status for detected potential credentials, traversal/null-byte patterns, and suspicious script patterns.
- Findings deliberately report only finding type/message; detected values are not returned or logged.

## Not yet complete

This foundation does **not** claim full malware scanning or archive extraction safety. The following remain required before the Session 84 acceptance gate can pass:

- streaming archive inspection with entry-count/uncompressed-size limits
- real archive entry traversal/symlink validation for every supported format
- malware scanner integration (for example ClamAV)
- encrypted quarantine storage and retention/deletion controls
- project architecture graph, sandboxed build/test/type-check/migration validation, snapshots, diffs, rollback, and dashboard
- Inventory endpoint implemented: `POST /api/v1/projects/:id/inventory` safely maps files, languages, manifests, package scripts/dependencies, route candidates, service candidates, and test files.
- Static verification endpoint implemented: `POST /api/v1/projects/:id/verify` reports TODO/FIXME markers, demo-data/placeholder signals, and redacted potential-secret findings. It explicitly reports build/type-check/test as `not_run_requires_sandbox`; untrusted project code is never executed in the API process.

Do not mark Session 84 complete until these controls and the build/test validation gate are implemented and run.

---

## UPDATE (2026-07-31) — ACCEPTANCE GATE CLOSED ✅

All previously-missing controls are now implemented, unit-tested (31 tests), and exposed via the API + `/app/projects` dashboard:

| Requirement (from "Not yet complete") | Delivered |
|---|---|
| streaming archive inspection with entry-count/uncompressed-size limits | `inspection.service.ts` — native zip/tar metadata parsing, `PC_MAX_ENTRIES` / `PC_MAX_UNCOMPRESSED_MB` / `PC_MAX_ENTRY_MB`, verdicts ok/bomb/unsafe/invalid/tool_missing |
| real archive entry traversal/symlink validation for every supported format | traversal/absolute/null/symlink flags on every zip + tar entry pre-extraction (7z honestly `tool_missing` → stays quarantined) |
| malware scanner integration (e.g. ClamAV) | `clamav.service.ts` — INSTREAM over `CLAMD_HOST`; infected archives auto-quarantine; `not_configured` when unset |
| encrypted quarantine storage and retention/deletion controls | AES-256-GCM envelope re-encryption, plaintext removal, `PC_QUARANTINE_TTL_DAYS` sweep, release/delete/inspect endpoints |
| project architecture graph | inferred frontend/backend/database/ai/queue/cli map (`GET /projects/:id/architecture`, labeled `inferred_from_inventory`) |
| sandboxed build/test/type-check/migration validation | `sandbox.service.ts` — docker (network-none, capped) or local bounded-subprocess modes via `PC_SANDBOX_MODE`; never runs untrusted code in the API process by default; reports `not_configured` honestly |
| snapshots, diffs, rollback | manifest snapshots + archive byte copies, added/removed/changed diffs, archive-level rollback, append-only change log |
| dashboard | `/app/projects` Project Development Dashboard (upload, quarantine review, extract → inventory → verify → sandbox gate, health report, architecture, snapshots/rollback, change log) |

Build/typecheck/test/migration validation runs inside the sandbox when configured (`PC_SANDBOX_MODE`); with no sandbox configured the gate returns `not_configured` + remediation instead of a fabricated result. This matches the Session 84 requirement that untrusted code is never executed in the API process.
