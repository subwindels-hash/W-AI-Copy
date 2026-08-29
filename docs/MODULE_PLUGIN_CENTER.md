# WINDELS AI OS — Super Admin Module & Plugin Center

## Purpose and architecture

The Module & Plugin Center is a permanent additive control plane for future WINDELS capabilities. It extends—not replaces—the existing Plugin OS, Capability Registry, Kernel, IAM, audit service, frontend layout/design system, Prisma database, deployment boundaries, and health model.

```text
Super Admin UI
  ↓ JWT + SUPER_ADMIN
Module Center API
  ↓ bounded streaming intake
Private quarantine volume
  ↓ checksum + Ed25519 + ClamAV + structural/static/compatibility checks
Verified immutable artifact store
  ↓ signed HMAC control request
Isolated WINDELS Module Runner
  ↓ sandbox tests + resource/permission evidence
Super Admin approval
  ↓ runner install + backup + migration + health evidence
PlatformModule registry (ACTIVE only after every gate)
  ├─ Plugin OS / Capability Registry registration
  ├─ Governance Kernel lifecycle events
  ├─ declarative frontend registration
  └─ permission-checked backend module gateway
```

Uploaded code is never imported or executed in the Express API process or core React application. Backend code runs out of process behind the isolated Module Runner. Frontend packages use a declarative page schema rendered with existing WINDELS UI components. Runtime API calls are scoped below `/api/v1/module-runtime/<module-id>`, checked against the signed manifest, IAM permission catalog, active release, role policy, response-size limits, timeouts, and HMAC-signed user context.

## Deployment posture

The control plane fails closed when any production dependency is absent:

- no trusted publisher key → signature verification fails;
- no ClamAV connection/verdict → malware verification fails;
- no isolated Module Runner → sandbox/install/restart/rollback/removal cannot pass;
- incomplete runner evidence → lifecycle does not advance;
- missing backup/migration/health evidence → release is not activated;
- unavailable previous immutable artifact → rollback is refused;
- active dependent module → removal is refused.

A file upload can produce only `UPLOADED` or `QUARANTINED`; it can never produce `ACTIVE`.

## `.wmod` package format

A `.wmod` package is a standard ZIP archive with `manifest.json` at its root:

```text
example-module.wmod
├── manifest.json
├── backend/
├── frontend/
├── agents/
├── workflows/
├── database/
│   ├── migrations/
│   └── rollback/
├── config/
├── tests/
└── docs/
```

The archive inspector rejects:

- absolute paths, `..` traversal, backslashes, empty path segments and drive-qualified paths;
- symbolic links;
- encrypted ZIP entries;
- duplicate and Unicode-normalized/case-colliding paths;
- excessive entry counts, individual sizes, total expansion size, or compression ratio;
- missing, malformed, oversized, unknown-field, or internally inconsistent manifests;
- missing files referenced by the manifest.

Limits default to 50 MB compressed, 5,000 entries, 25 MB per entry and 200 MB total expansion. Security-sensitive `package.json` and SQL files must be small enough for complete static inspection.

## Manifest contract

`packages/shared/src/moduleCenter.ts` is the authoritative strict Zod contract. Major sections include:

- identity: schema version, module ID, name, package type, version, author/vendor and license;
- compatibility: minimum/maximum platform version and API version;
- dependencies and conflicts;
- existing WINDELS IAM permissions and access roles;
- provided capabilities;
- external backend routes, jobs, event handlers, webhooks and health path;
- declarative frontend navigation/pages;
- database migration mode, files, rollback files and backup requirement;
- agent and workflow definitions;
- configuration schema/documentation;
- test command/categories and health checks;
- memory, CPU, storage and network requirements;
- enable/reload/removal capabilities;
- upgrade ranges, downtime, downgrade and rollback policy.

Unknown manifest fields are rejected. API routes are relative and are always namespace-mounted under the module gateway, preventing collisions with core `/api/v1` routes. Frontend routes are namespace-mounted under `/app/modules/<module-id>`, preventing core navigation collisions.

See [`docs/examples/windels-module-manifest.json`](./examples/windels-module-manifest.json).

## Package signing

Publishers sign the exact uploaded package bytes using Ed25519.

1. Compute the package SHA-256 hex digest.
2. Sign the UTF-8 message:

```text
windels-module:<64-character-sha256-hex>
```

3. Upload the base64 signature and trusted key ID as detached multipart fields.
4. Configure the corresponding public key in the production secret manager as `MODULE_TRUSTED_PUBLISHER_KEYS`:

```json
{
  "windels-release-2026": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
}
```

The private key must never be placed in WINDELS configuration or the package. A duplicate byte-identical upload is detected. For a non-active release, the same artifact may be resubmitted with a corrected detached signature without creating a duplicate release; all verification and approval state resets.

## Verification pipeline

`POST /api/v1/super-admin/module-center/releases/:id/verify` performs:

1. package checksum/integrity confirmation;
2. detached Ed25519 signature verification against the trusted key registry;
3. full-package ClamAV INSTREAM scan;
4. archive structure and manifest validation;
5. declared-file checks;
6. package lifecycle-script rejection;
7. privileged source pattern reporting;
8. destructive SQL rejection (`DROP DATABASE/SCHEMA`, `ALTER SYSTEM`, `COPY ... PROGRAM`, `TRUNCATE`);
9. current WINDELS platform-version compatibility;
10. dependency semver resolution against active/disabled registry modules;
11. required-permission validation against the existing Prisma IAM permission enum;
12. declared module/capability conflict detection;
13. resource policy validation.

Critical failure sets the release and module to `QUARANTINED`. Warnings remain visible in the verification report but do not hide or reinterpret evidence.

## Isolated Module Runner contract

The API calls `POST <MODULE_RUNNER_URL>/v1/module-actions` with:

- protocol `windels-module-runner/v1`;
- action and correlation ID;
- Super Admin actor ID;
- full validated manifest;
- immutable artifact path/URI and SHA-256;
- previous release/version where relevant;
- deny-network/read-only-root/no-new-privileges/rollback policies.

Requests use `X-Windels-Timestamp` and `X-Windels-Signature: v1=<HMAC-SHA256>` over `<timestamp>.<canonical-body>`. Runner responses must sign their exact response body with the same timestamp/signature format; missing, stale, or invalid response signatures are rejected. Production requires HTTPS and a 32+ character secret.

For sandbox success the runner must prove these stages:

- startup;
- health;
- permission boundaries;
- resource limits;
- tests;
- API, database, agent, workflow and frontend stages when declared.

The runner's `ok: true` alone is insufficient. Missing required evidence changes `sandboxStatus` to `FAILED` and leaves lifecycle state at `SANDBOX_TEST`.

For installation/update, the runner must additionally prove:

- verified backup when migrations require it;
- successful migrations;
- tests and health;
- valid external service registration for backend modules;
- a recorded list of changed files/components tied to the immutable release;
- automatic rollback on failed updates where a known-good release exists.

Runner logs are bounded, sanitized and persisted on the operation record.

## Lifecycle

```text
UPLOADED
  → SCANNING
  → VALIDATING / COMPATIBILITY_CHECK
  → SANDBOX_TEST
  → VALIDATED
  → APPROVED (explicit Super Admin action)
  → INSTALLING
  → MIGRATING (runner evidence)
  → HEALTH_CHECK
  → ACTIVE
```

Failure paths are persisted as `FAILED` or `QUARANTINED`. An update failure invokes rollback to the previous immutable release where available. The previous version is restored only after migration rollback and health evidence pass.

Enable, disable, restart and health-check operations require a successful runner response. Restart is refused unless the manifest declares reload support. Removal requires:

- `DISABLED` status;
- `lifecycle.removable: true`;
- no active module with a non-optional dependency;
- runner-confirmed service/resource cleanup;
- runner-confirmed migration removal/rollback when applicable.

Rows and audit history are soft-retained after removal.

## Existing platform integration

On successful activation:

- `PlatformModule`, `PlatformModuleRelease`, `PlatformModuleUpload` and `PlatformModuleOperation` remain the durable source of lifecycle truth;
- capabilities are synchronized into the existing Plugin OS and Capability Registry for the Super Admin's organization;
- the existing Plugin OS refuses direct `full_module` installation unless its registry source is an internally approved Module Center release, and unsigned manifests cannot self-claim `verified` trust;
- lifecycle events are dispatched through the existing Governance Kernel;
- runtime frontend registration appears in the existing sidebar/layout;
- declarative pages use existing cards, badges, theme, responsive layout and authentication;
- backend calls pass through existing JWT, IAM/RBAC, rate limiting, request IDs, audit logs and module proxy controls;
- API usage never receives direct access to the package artifact or runner credential;
- raw artifact filesystem paths are omitted from API responses.

## API

All control-plane endpoints require a JWT-authenticated `SUPER_ADMIN`:

```text
GET  /api/v1/super-admin/module-center/dashboard
GET  /api/v1/super-admin/module-center/modules
GET  /api/v1/super-admin/module-center/modules/:id
GET  /api/v1/super-admin/module-center/uploads
GET  /api/v1/super-admin/module-center/operations
POST /api/v1/super-admin/module-center/uploads
POST /api/v1/super-admin/module-center/releases/:id/verify
POST /api/v1/super-admin/module-center/releases/:id/sandbox-test
POST /api/v1/super-admin/module-center/releases/:id/approve
POST /api/v1/super-admin/module-center/releases/:id/install
POST /api/v1/super-admin/module-center/modules/:id/enable
POST /api/v1/super-admin/module-center/modules/:id/disable
POST /api/v1/super-admin/module-center/modules/:id/restart
POST /api/v1/super-admin/module-center/modules/:id/health-check
POST /api/v1/super-admin/module-center/modules/:id/rollback
POST /api/v1/super-admin/module-center/modules/:id/remove
```

Application users receive only active, enabled, role-visible registrations:

```text
GET /api/v1/module-runtime/registrations
ANY /api/v1/module-runtime/:moduleId/*
```

Each mutation requires an idempotency key and is globally rate limited by the existing API middleware plus the admin-specific limiter.

## Audit and governance

The centralized audit system records package upload/rejection, signature replacement, verification/sandbox outcomes, approval, install/update, lifecycle operations, rollback/removal outcomes and runtime reads/writes. Operation rows additionally record correlation ID, actor, release, version transition, runner result, errors, timestamps and sanitized logs.

No success state is inferred from an upload, runner HTTP 200, process start, migration command, or health claim alone. Required evidence is checked structurally before state changes.

## Required production configuration

```text
WINDELS_PLATFORM_VERSION
MODULE_PACKAGE_STORAGE_PATH
MODULE_TRUSTED_PUBLISHER_KEYS
CLAMD_HOST
MODULE_RUNNER_URL
MODULE_RUNNER_HMAC_SECRET
MODULE_RUNNER_ARTIFACT_BASE_URL (or protected shared volume)
MODULE_RUNTIME_ALLOWED_ORIGINS
```

The package storage path should be a private encrypted persistent volume. The Module Runner must be independently hardened (container/VM isolation, no-new-privileges, seccomp/AppArmor or equivalent, network deny-by-default, CPU/memory/PID/time quotas, immutable artifacts and isolated database credentials).

## Validation before production use

1. Apply and validate the Prisma migration against the target PostgreSQL instance.
2. Configure trusted Ed25519 public keys from the release-management secret store.
3. Run EICAR and clean ClamAV package tests.
4. Validate path traversal, ZIP bomb, duplicate path, malformed manifest and signature failures.
5. Exercise the real isolated runner with a benign module and a deliberately failing module.
6. Verify sandbox network/resource/permission limits externally.
7. Test backup, migration failure, automatic rollback and restored data integrity on a disposable environment.
8. Verify active/disabled runtime registration, IAM route denial and response limits.
9. Test dependency conflict and dependent-module removal denial.
10. Review audit/operation records for actor, versions, errors and absence of secrets/artifact paths.
11. Run frontend, API, workflow and agent tests supplied by the package.
12. Promote only after production runner and health evidence pass.
