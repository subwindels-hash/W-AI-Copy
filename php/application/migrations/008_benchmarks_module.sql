-- 008 — Benchmark Center: the result registry
--
-- Applies to an EXISTING installation. Fresh installs get the same tables from
-- database/production.sql. Idempotent.
--
-- Node keeps this module in Redis: `bm:run:<org>:<id>` hashes with a
-- `bm:runs:<org>` sorted set, `bm:sched*:` equivalents, a `bm:area:<org>` zset
-- holding the last score per area, a `bm:m:<org>` counter hash, and the notes
-- ledger in the shared tenantStore (`bm:notes:i:<org>:<id>`). Here that is
-- three tables, every read and write scoped by organization_id — the same
-- tenancy boundary the key namespacing provided.
--
-- THREE DERIVATIONS REPLACE TWO PIECES OF REDIS STATE, deliberately:
--
--   * `areaScores` was a zset overwritten on every run (`zadd` with the area as
--     member), i.e. the last recorded score per area. It is derived here from
--     the newest run per area instead of being copied into a fourth table that
--     could drift from the rows it summarizes.
--   * `optimizedModels` / `pendingRecommendations` were two counters
--     incremented per run (score >= 80 / < 80). They are counted from the runs
--     themselves, with the same threshold, so they cannot disagree with the
--     register.
--
-- `seq` is an auto-increment alongside the CHAR primary key because the Redis
-- index ordered by a millisecond timestamp: two runs recorded in the same
-- second had no defined order. `seq` gives that ordering a stable, replayable
-- meaning (newest first) instead of leaving it to a random id comparison.
--
-- No seed rows: an organization that has never recorded an evaluation has an
-- empty benchmark centre, and that is the correct state to report.

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id              CHAR(11)      NOT NULL PRIMARY KEY,          -- 'br-' + 8 hex
  organization_id CHAR(36)      NOT NULL,
  area            ENUM('ai_models','ai_employees','ai_workflows','voice_models','vision_models',
                       'translation_quality','coding_performance','response_accuracy','latency',
                       'resource_consumption','cost_efficiency','safety_metrics','reliability',
                       'user_satisfaction') NOT NULL,
  target_id       VARCHAR(200)  NULL,
  target_name     VARCHAR(200)  NULL,
  status          ENUM('queued','running','completed','failed') NOT NULL DEFAULT 'completed',
  started_at      DATETIME      NOT NULL,
  completed_at    DATETIME      NULL,
  duration_ms     INT UNSIGNED  NOT NULL DEFAULT 0,
  metrics         JSON          NOT NULL,
  overall_score   DECIMAL(10,4) NOT NULL,
  passed          TINYINT(1)    NOT NULL DEFAULT 0,
  notes           VARCHAR(1000) NULL,
  evaluator       VARCHAR(200)  NOT NULL,
  evidence        VARCHAR(2000) NOT NULL,
  imported        TINYINT(1)    NOT NULL DEFAULT 1,
  created_at      DATETIME      NOT NULL,
  seq             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UNIQUE KEY uk_benchmark_runs_seq (seq),
  KEY idx_benchmark_runs_org (organization_id, seq),
  KEY idx_benchmark_runs_area (organization_id, area, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scheduling stores the schedule only. Nothing here runs it: no cron daemon is
-- started, and creating a schedule must never manufacture a run.
CREATE TABLE IF NOT EXISTS benchmark_schedules (
  id              CHAR(11)      NOT NULL PRIMARY KEY,          -- 'sc-' + 8 hex
  organization_id CHAR(36)      NOT NULL,
  area            ENUM('ai_models','ai_employees','ai_workflows','voice_models','vision_models',
                       'translation_quality','coding_performance','response_accuracy','latency',
                       'resource_consumption','cost_efficiency','safety_metrics','reliability',
                       'user_satisfaction') NOT NULL,
  target_id       VARCHAR(200)  NULL,
  cron            VARCHAR(64)   NOT NULL DEFAULT '0 0 * * *',
  enabled         TINYINT(1)    NOT NULL DEFAULT 1,
  next_run_at     DATETIME      NULL,
  created_at      DATETIME      NOT NULL,
  KEY idx_benchmark_schedules_org (organization_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The user-authored annotations ledger (Node's tenantStore with prefix
-- "bm:notes" and id prefix "bm-"). Only the benchmark centre owns this table:
-- the other modules that use tenantStore carry different payload shapes and
-- get their own table when they are ported, rather than sharing a table of
-- opaque JSON.
CREATE TABLE IF NOT EXISTS benchmark_notes (
  id              CHAR(11)      NOT NULL PRIMARY KEY,          -- 'bm-' + 8 hex
  organization_id CHAR(36)      NOT NULL,
  title           VARCHAR(200)  NOT NULL,
  body            TEXT          NOT NULL,
  tags            JSON          NOT NULL,
  created_by      CHAR(36)      NULL,
  created_at      DATETIME      NOT NULL,
  updated_at      DATETIME      NOT NULL,
  seq             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UNIQUE KEY uk_benchmark_notes_seq (seq),
  KEY idx_benchmark_notes_org (organization_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
