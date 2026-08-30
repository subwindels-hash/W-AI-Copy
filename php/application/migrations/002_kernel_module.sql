-- 002 — Enterprise AI Kernel + AI provider registry (Node Session 39 parity)
--
-- Applies to an EXISTING installation. Fresh installs get the same objects
-- from database/production.sql; this file only has to be imported by sites
-- that installed before the kernel was ported. It is idempotent — running it
-- twice changes nothing.
--
-- Two deliberate differences from the Node implementation, both fixes:
--
--   * Node's "24h" counters (kernel:evt24, kernel:policy24, kernel:block24,
--     kernel:modelsel24, kernel:sh24) were plain Redis INCR keys with no
--     expiry, so `events24h` and friends reported lifetime totals. Here they
--     are counted over a true rolling 24 hour window.
--
--   * Node kept the newest 200 dispatch-latency samples with `LTRIM 0 199`;
--     here the same 200-sample window is kept by pruning on write.
--
--   * Node kept the newest 500 events with `ZREMRANGEBYRANK 0 -501`; the same
--     cap is applied after each dispatch.

CREATE TABLE IF NOT EXISTS kernel_components (
  component_key VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  status ENUM('booting','online','degraded','offline','stub') NOT NULL DEFAULT 'online',
  message_rate INT UNSIGNED NOT NULL DEFAULT 0,
  error_rate DECIMAL(6,4) NOT NULL DEFAULT 0,
  last_heartbeat DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (component_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kernel_events (
  id CHAR(11) NOT NULL,
  kind VARCHAR(80) NOT NULL,
  source VARCHAR(120) NOT NULL,
  target VARCHAR(120) NULL,
  payload JSON NULL,
  organization_id CHAR(36) NULL,
  user_id CHAR(36) NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_kernel_events_time (created_at),
  KEY idx_kernel_events_kind (kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kernel_counters (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  counter_key VARCHAR(40) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_kernel_counter_time (counter_key, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kernel_latencies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  latency_ms INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_kernel_latency_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kernel_state (
  state_key VARCHAR(60) NOT NULL,
  state_value TEXT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (state_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The 20 components seeded by Node's `KernelService.ensureStarted()`.
-- `INSERT IGNORE` so re-running this migration never resets a component that
-- has since taken a heartbeat.
INSERT IGNORE INTO kernel_components
  (component_key, name, status, message_rate, error_rate, last_heartbeat, updated_at)
VALUES
  ('comm-bus',  'AI Communication Bus',         'stub',   0, 0, NOW(), NOW()),
  ('compute',   'Compute Allocation',           'online', 0, 0, NOW(), NOW()),
  ('context',   'Universal Context Mgmt',       'online', 0, 0, NOW(), NOW()),
  ('diag',      'Self-Diagnostics',             'online', 0, 0, NOW(), NOW()),
  ('event-bus', 'Event Bus',                    'online', 0, 0, NOW(), NOW()),
  ('heal',      'Self-Healing',                 'online', 0, 0, NOW(), NOW()),
  ('health',    'Enterprise Health Monitoring', 'online', 0, 0, NOW(), NOW()),
  ('kg-sync',   'Knowledge Synchronization',    'stub',   0, 0, NOW(), NOW()),
  ('media',     'Media Orchestration',          'stub',   0, 0, NOW(), NOW()),
  ('memory',    'Global Memory Coordination',   'stub',   0, 0, NOW(), NOW()),
  ('model-sel', 'Intelligent Model Selection',  'online', 0, 0, NOW(), NOW()),
  ('perf',      'Performance Optimization',     'online', 0, 0, NOW(), NOW()),
  ('policy',    'Policy Enforcement',           'online', 0, 0, NOW(), NOW()),
  ('reasoning', 'Global Reasoning Engine (lite)','online', 0, 0, NOW(), NOW()),
  ('res-agent', 'Agent Scheduling',             'online', 0, 0, NOW(), NOW()),
  ('res-ai',    'AI Resource Scheduling',       'online', 0, 0, NOW(), NOW()),
  ('security',  'Security Enforcement',         'online', 0, 0, NOW(), NOW()),
  ('self-opt',  'Autonomous Self-Optimization', 'online', 0, 0, NOW(), NOW()),
  ('voice',     'Voice Orchestration',          'stub',   0, 0, NOW(), NOW()),
  ('workflow',  'Workflow Orchestration',       'online', 0, 0, NOW(), NOW());
