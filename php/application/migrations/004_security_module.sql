-- 004 — Security & governance (Node slices 110/114/118 + governance.service.ts)
--
-- Applies to an EXISTING installation. Fresh installs get the same objects from
-- database/production.sql. Idempotent — importing it twice changes nothing.
--
-- Node keeps incidents, access reviews and breaker state in Redis and in-memory
-- Maps. PHP has neither, so all of it moves to MySQL. Two divergences:
--
--   * Node stores incidents in one global Redis hash, so every tenant sees
--     every other tenant's incidents. Here incidents carry organization_id and
--     are scoped to the caller's organization: a shared incident log is itself
--     a cross-tenant disclosure.
--
--   * Node's dormant-account detection reads User.lastLoginAt. The PHP schema
--     has no such column, so activity is derived from the refresh-token ledger
--     (a real login signal) and falls back to account creation.
--
--   * Node's `Limits` are listed from source; enforcement lives elsewhere. The
--     same is true here — see the self-test, which reports enforcement honestly
--     instead of asserting it.

CREATE TABLE IF NOT EXISTS security_counters (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  counter_key VARCHAR(60) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_sec_counter_time (counter_key, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_breakers (
  name VARCHAR(80) NOT NULL,
  state ENUM('closed','open','half-open') NOT NULL DEFAULT 'closed',
  failures INT UNSIGNED NOT NULL DEFAULT 0,
  successes INT UNSIGNED NOT NULL DEFAULT 0,
  opened_at DATETIME NULL,
  next_probe DATETIME NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_incidents (
  id CHAR(14) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  severity ENUM('low','medium','high','critical') NOT NULL,
  status ENUM('reported','investigating','contained','resolved','postmortem') NOT NULL DEFAULT 'reported',
  reported_by CHAR(36) NULL,
  area ENUM('auth','data','ai','billing','infra','abuse','other') NOT NULL,
  timeline JSON NOT NULL,
  runbook_executions JSON NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sec_incident_org_time (organization_id, created_at),
  KEY idx_sec_incident_status (status),
  CONSTRAINT fk_sec_incident_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_incident_runbooks (
  id CHAR(11) NOT NULL,
  organization_id CHAR(36) NULL,
  name VARCHAR(100) NOT NULL,
  trigger_severity ENUM('low','medium','high','critical') NOT NULL,
  trigger_area ENUM('auth','data','ai','billing','infra','abuse','other') NOT NULL,
  actions JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sec_runbook_org (organization_id, trigger_severity, trigger_area),
  CONSTRAINT fk_sec_runbook_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_runbook_executions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  runbook_id CHAR(11) NOT NULL,
  incident_id CHAR(14) NOT NULL,
  status VARCHAR(20) NOT NULL,
  output JSON NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_sec_rbexec_runbook (runbook_id, created_at),
  KEY idx_sec_rbexec_incident (incident_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_access_review_campaigns (
  id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  dormant_days INT UNSIGNED NOT NULL DEFAULT 90,
  status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
  snapshot JSON NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sec_campaign_org_time (organization_id, created_at),
  CONSTRAINT fk_sec_campaign_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_access_review_items (
  id CHAR(36) NOT NULL,
  campaign_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status ENUM('PENDING','APPROVED','REVOKED','QUARANTINED') NOT NULL DEFAULT 'PENDING',
  reviewed_by CHAR(36) NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sec_review_item (campaign_id, user_id),
  KEY idx_sec_review_campaign (campaign_id, status),
  CONSTRAINT fk_sec_review_campaign FOREIGN KEY (campaign_id) REFERENCES security_access_review_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_sec_review_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
