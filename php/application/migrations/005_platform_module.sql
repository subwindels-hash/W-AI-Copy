-- 005 — Global Platform: observability + regions/DR + CDN control plane
--
-- Applies to an EXISTING installation. Fresh installs get the same objects and
-- seed rows from database/production.sql. Idempotent.
--
-- Why each table exists: Node keeps all of this in process memory (a metrics
-- Map, a 2000-entry log ring, a 500-span ring, module-level `let` variables for
-- failover and CDN rules). Under PHP there is no process memory between
-- requests, so every one of those would read back empty and every mutation
-- would be a no-op. These tables are the durable equivalents.
--
-- Two numbers in Node are NOT reproduced, because they are invented:
--
--   * `getDisasterRecoveryReport()` returns `replicationLagMs: 42` as a literal.
--     A single-database deployment has no replication to measure, so this build
--     reports null.
--   * `getCdnConfig()` returns `popCount: 42`, `cacheHitRate: 0.87` (commented
--     "simulated" in the source) and `bandwidthGb: 12.4`. This build reports
--     null for all three unless a CDN provider is configured and reporting.
--
--   Logs are NOT given their own table: the durable log-like record this build
--   already keeps is `audit_events`, so GET /platform/logs reads from that plus
--   failed spans and failed AI requests, and labels every row with its source.

CREATE TABLE IF NOT EXISTS platform_metric_counters (
  name VARCHAR(80) NOT NULL,
  tag_key VARCHAR(120) NOT NULL DEFAULT '',
  bucket_at DATETIME NOT NULL,
  value BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (name, tag_key, bucket_at),
  KEY idx_pmc_time (bucket_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_metric_histograms (
  name VARCHAR(80) NOT NULL,
  tag_key VARCHAR(120) NOT NULL DEFAULT '',
  bucket_at DATETIME NOT NULL,
  count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `sum` DOUBLE NOT NULL DEFAULT 0,
  `min` DOUBLE NOT NULL DEFAULT 0,
  `max` DOUBLE NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (name, tag_key, bucket_at),
  KEY idx_pmh_time (bucket_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_spans (
  span_id CHAR(16) NOT NULL,
  trace_id CHAR(32) NOT NULL,
  parent_span_id CHAR(16) NULL,
  name VARCHAR(120) NOT NULL,
  kind ENUM('server','client','internal','producer','consumer') NOT NULL DEFAULT 'internal',
  organization_id CHAR(36) NULL,
  user_id CHAR(36) NULL,
  status ENUM('ok','error') NOT NULL DEFAULT 'ok',
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  duration_ms INT UNSIGNED NULL,
  error_message VARCHAR(500) NULL,
  attributes JSON NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (span_id),
  KEY idx_pspan_trace (trace_id),
  KEY idx_pspan_time (started_at),
  CONSTRAINT fk_pspan_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_state (
  state_key VARCHAR(60) NOT NULL,
  value JSON NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (state_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_cdn_rules (
  id CHAR(36) NOT NULL,
  path_pattern VARCHAR(200) NOT NULL,
  ttl_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  stale_while_revalidate INT UNSIGNED NOT NULL DEFAULT 0,
  cache_key_includes JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_pcdn_rule_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_cdn_purges (
  id CHAR(36) NOT NULL,
  paths JSON NOT NULL,
  status ENUM('pending','complete','skipped') NOT NULL DEFAULT 'pending',
  detail VARCHAR(500) NULL,
  requested_by CHAR(36) NULL,
  created_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_pcdn_purge_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cache rules are configuration, not measurement: these are the three defaults
-- cdn.service.ts ships, so an operator sees the same starting policy.
INSERT IGNORE INTO platform_cdn_rules (id, path_pattern, ttl_seconds, stale_while_revalidate, cache_key_includes, enabled, sort_order, updated_at) VALUES
('00000000-0000-4000-8000-000000000301', '/assets/*',       31536000, 0, '[]',                 1, 1, NOW()),
('00000000-0000-4000-8000-000000000302', '/api/rest/v1/*',         0, 0, '["Authorization"]',  0, 2, NOW()),
('00000000-0000-4000-8000-000000000303', '/*',                     0, 0, '[]',                 1, 3, NOW());
