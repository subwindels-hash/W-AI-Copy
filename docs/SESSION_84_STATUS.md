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
