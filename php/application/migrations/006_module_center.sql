-- 006 — Module Center: signed module package registry (.wmod) + lifecycle
--
-- Applies to an EXISTING installation. Fresh installs get the same objects from
-- database/production.sql. Idempotent.
--
-- What this ports
-- ---------------
-- Node keeps the whole module registry in Prisma tables (platformModule,
-- platformModuleRelease, platformModuleUpload, platformModuleOperation) plus
-- files on disk under a package root. Under PHP there is no Prisma, so these
-- four tables are the durable equivalent and the artifacts are stored under
-- application/storage/module-packages/ (quarantine/ + verified/ buckets), which
-- is the same two-bucket layout the Node service uses.
--
-- The one thing this build deliberately does NOT invent
-- -----------------------------------------------------
-- Every lifecycle action beyond VERIFY (sandbox test, install, enable, disable,
-- restart, health check, rollback, remove) is executed by an isolated external
-- "Module Runner" service that the API talks to over a signed HTTP call
-- (apps/api/src/moduleCenter/runner.service.ts). No such service exists in
-- this repository, and running uploaded third-party code inside the PHP
-- request process would be exactly the thing the Module Center exists to
-- prevent.
--
-- So this build ships the full state machine, all validation, the signed runner
-- adapter and the audit trail, and it evaluates runner evidence exactly like
-- Node does. When MODULE_RUNNER_URL / MODULE_RUNNER_HMAC_SECRET are absent the
-- runner-dependent actions do not pretend to succeed: they record the
-- operation, leave the package inactive, and report
-- status NOT_CONFIGURED with the code MODULE_RUNNER_NOT_CONFIGURED -- the same
-- result the Node service returns in that situation. The dashboard surfaces
-- this as runnerConfigured:false so the UI can say so out loud.

CREATE TABLE IF NOT EXISTS platform_modules (
  id                    CHAR(36)     NOT NULL PRIMARY KEY,
  module_key            VARCHAR(80)  NOT NULL,
  name                  VARCHAR(100) NOT NULL,
  package_type          ENUM('module','plugin','integration','approved_software') NOT NULL DEFAULT 'module',
  description           TEXT         NULL,
  vendor                VARCHAR(120) NULL,
  status                ENUM('UPLOADED','SCANNING','VALIDATING','COMPATIBILITY_CHECK','SANDBOX_TEST','VALIDATED','APPROVED','INSTALLING','MIGRATING','HEALTH_CHECK','ACTIVE','DISABLED','FAILED','ROLLING_BACK','QUARANTINED','REMOVING','REMOVED') NOT NULL DEFAULT 'UPLOADED',
  health                ENUM('UNKNOWN','HEALTHY','DEGRADED','UNHEALTHY','DISABLED','QUARANTINED') NOT NULL DEFAULT 'UNKNOWN',
  enabled               TINYINT(1)   NOT NULL DEFAULT 0,
  current_version       VARCHAR(40)  NULL,
  active_release_id     CHAR(36)     NULL,
  manifest              JSON         NULL,
  dependencies          JSON         NULL,
  permissions           JSON         NULL,
  runtime_registration  JSON         NULL,
  installed_by_id       CHAR(36)     NULL,
  installed_at          DATETIME     NULL,
  last_health_check_at  DATETIME     NULL,
  last_error            TEXT         NULL,
  created_at            DATETIME     NOT NULL,
  updated_at            DATETIME     NOT NULL,
  UNIQUE KEY uq_platform_modules_key (module_key),
  KEY idx_platform_modules_status (status),
  KEY idx_platform_modules_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_module_releases (
  id                   CHAR(36)     NOT NULL PRIMARY KEY,
  module_registry_id   CHAR(36)     NOT NULL,
  version              VARCHAR(40)  NOT NULL,
  status               ENUM('UPLOADED','SCANNING','VALIDATING','COMPATIBILITY_CHECK','SANDBOX_TEST','VALIDATED','APPROVED','INSTALLING','MIGRATING','HEALTH_CHECK','ACTIVE','DISABLED','FAILED','ROLLING_BACK','QUARANTINED','REMOVING','REMOVED') NOT NULL DEFAULT 'UPLOADED',
  checksum             CHAR(64)     NOT NULL,
  artifact_path        VARCHAR(500) NOT NULL,
  package_size_bytes   BIGINT       NOT NULL DEFAULT 0,
  manifest             JSON         NULL,
  signature_key_id     VARCHAR(120) NULL,
  signature_verified   TINYINT(1)   NOT NULL DEFAULT 0,
  scan_status          ENUM('PENDING','RUNNING','PASSED','FAILED','NOT_CONFIGURED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  compatibility_status ENUM('PENDING','RUNNING','PASSED','FAILED','NOT_CONFIGURED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  sandbox_status       ENUM('PENDING','RUNNING','PASSED','FAILED','NOT_CONFIGURED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  approval_status      ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  migration_status     ENUM('PENDING','RUNNING','PASSED','FAILED','NOT_REQUIRED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  verification_report  JSON         NULL,
  sandbox_report       JSON         NULL,
  health_report        JSON         NULL,
  rollback_metadata    JSON         NULL,
  previous_release_id  CHAR(36)     NULL,
  uploaded_by_id       CHAR(36)     NULL,
  verified_at          DATETIME     NULL,
  sandboxed_at         DATETIME     NULL,
  approved_by_id       CHAR(36)     NULL,
  approved_at          DATETIME     NULL,
  installed_by_id      CHAR(36)     NULL,
  installed_at         DATETIME     NULL,
  created_at           DATETIME     NOT NULL,
  updated_at           DATETIME     NOT NULL,
  UNIQUE KEY uq_platform_module_releases_version (module_registry_id, version),
  KEY idx_platform_module_releases_module (module_registry_id),
  KEY idx_platform_module_releases_status (status),
  KEY idx_platform_module_releases_checksum (checksum),
  CONSTRAINT fk_platform_module_releases_module FOREIGN KEY (module_registry_id) REFERENCES platform_modules (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_module_uploads (
  id               CHAR(36)      NOT NULL PRIMARY KEY,
  original_name    VARCHAR(255)  NOT NULL,
  checksum         CHAR(64)      NOT NULL,
  size_bytes       BIGINT        NOT NULL DEFAULT 0,
  artifact_path    VARCHAR(500)  NULL,
  status           ENUM('UPLOADED','SCANNING','VALIDATED','INSTALLING','ACTIVE','DISABLED','FAILED','QUARANTINED','REMOVED') NOT NULL DEFAULT 'UPLOADED',
  manifest_id      VARCHAR(80)   NULL,
  manifest_version VARCHAR(40)   NULL,
  signature_key_id VARCHAR(120)  NULL,
  report           JSON          NULL,
  release_id       CHAR(36)      NULL,
  uploaded_by_id   CHAR(36)      NULL,
  created_at       DATETIME      NOT NULL,
  updated_at       DATETIME      NOT NULL,
  KEY idx_platform_module_uploads_checksum (checksum),
  KEY idx_platform_module_uploads_release (release_id),
  KEY idx_platform_module_uploads_created (created_at),
  CONSTRAINT fk_platform_module_uploads_release FOREIGN KEY (release_id) REFERENCES platform_module_releases (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_module_operations (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  module_registry_id CHAR(36)    NOT NULL,
  release_id        CHAR(36)     NULL,
  operation_type    ENUM('UPLOAD','VERIFY','SANDBOX_TEST','APPROVE','INSTALL','UPDATE','ENABLE','DISABLE','RESTART','HEALTH_CHECK','ROLLBACK','REMOVE') NOT NULL,
  status            ENUM('RUNNING','SUCCEEDED','FAILED') NOT NULL DEFAULT 'RUNNING',
  idempotency_key   VARCHAR(180) NOT NULL,
  correlation_id    VARCHAR(100) NULL,
  from_version      VARCHAR(40)  NULL,
  to_version        VARCHAR(40)  NULL,
  requested_by_id   CHAR(36)     NULL,
  request           JSON         NULL,
  result            JSON         NULL,
  logs              JSON         NULL,
  error_code        VARCHAR(80)  NULL,
  error_message     TEXT         NULL,
  started_at        DATETIME     NULL,
  finished_at       DATETIME     NULL,
  created_at        DATETIME     NOT NULL,
  updated_at        DATETIME     NOT NULL,
  UNIQUE KEY uq_platform_module_operations_key (idempotency_key),
  KEY idx_platform_module_operations_module (module_registry_id),
  KEY idx_platform_module_operations_type (operation_type),
  KEY idx_platform_module_operations_created (created_at),
  CONSTRAINT fk_platform_module_operations_module FOREIGN KEY (module_registry_id) REFERENCES platform_modules (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
