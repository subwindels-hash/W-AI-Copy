-- 003 — Tenant Isolation (Node Session 89) + Usage Intelligence (Session 55/123)
--
-- Applies to an EXISTING installation. Fresh installs get the same objects from
-- database/production.sql. Idempotent — importing it twice changes nothing.
--
-- Node keeps isolation policies, compliance runs and the usage ledger in Redis.
-- This port keeps them in MySQL. See the controller and model headers for the
-- two places the audit had to be re-specified rather than translated: the
-- namespace scan becomes a real row-level tenancy scan, and the cross-tenant
-- probe writes and then reads back a sentinel row instead of a Redis key.

CREATE TABLE IF NOT EXISTS tenant_isolation_policies (
  organization_id CHAR(36) NOT NULL,
  allow_cross_tenant_export TINYINT(1) NOT NULL DEFAULT 0,
  allow_external_sharing TINYINT(1) NOT NULL DEFAULT 0,
  pii_redaction_level ENUM('none','basic','strict') NOT NULL DEFAULT 'basic',
  retention_days INT NOT NULL DEFAULT 365,
  region_pin VARCHAR(64) NULL,
  updated_at DATETIME NOT NULL,
  updated_by CHAR(36) NULL,
  PRIMARY KEY (organization_id),
  CONSTRAINT fk_ti_policy_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_isolation_runs (
  id CHAR(14) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  status ENUM('compliant','review_required','failed') NOT NULL,
  score SMALLINT NOT NULL,
  namespaces JSON NOT NULL,
  probes JSON NOT NULL,
  findings JSON NOT NULL,
  summary VARCHAR(500) NOT NULL,
  ran_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_ti_runs_org_time (organization_id, ran_at),
  CONSTRAINT fk_ti_run_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sentinel rows for the cross-tenant self-test. Deliberately NOT foreign-keyed
-- to organizations: the probe invents a throwaway organization id that must not
-- exist, because the thing being proved is that another tenant's scope cannot
-- see it. A foreign key here would make the probe unrepresentable.
CREATE TABLE IF NOT EXISTS tenant_isolation_probes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  probe_key VARCHAR(64) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  payload JSON NULL,
  created_at DATETIME NOT NULL,
  KEY idx_ti_probe_org (organization_id, probe_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_events (
  id CHAR(22) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  feature VARCHAR(64) NOT NULL,
  actor VARCHAR(120) NOT NULL,
  quantity DECIMAL(20,4) NOT NULL DEFAULT 0,
  unit VARCHAR(24) NOT NULL,
  meta JSON NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_usage_events_org_time (organization_id, created_at),
  CONSTRAINT fk_usage_event_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
