-- 009 — Memory Evolution: the enterprise memory register
--
-- Applies to an EXISTING installation. Fresh installs get the same tables from
-- database/production.sql. Idempotent.
--
-- Node keeps this module in Redis under keys with NO organization segment
-- (`me:mems`, `me:mem:<id>`, `me:type:<t>`, `me:scope:<s>`, `me:consol`,
-- `me:cj:<id>` and three `me:m:*` counters) — one global register shared by
-- every tenant, guarded only by an admin gate.
--
-- THIS PORT IS ORGANIZATION-SCOPED, and that divergence is deliberate:
--
--   * the rest of the PHP build scopes every module by organization_id,
--     including `platform`, whose Node state was process-global;
--   * a memory register is enterprise knowledge — project plans, team
--     rituals, user preferences — and two tenants sharing one register would
--     be a data leak, not a feature;
--   * the admin gate alone (Node's only guard) does not separate tenants:
--     an admin of organization B would read organization A's memories.
--
-- Every read and write therefore carries organization_id. The behaviour that
-- is *not* changed is the substance of the module: the nine memory types, the
-- 1%-per-day decay, the 0.2 strength cut-off below which a memory stops being
-- surfaced, the 0.05/0.5 forget threshold, deduplication by content within a
-- scope, and consolidation job accounting.
--
-- No seed rows. Node's `TYPE_SEEDS` (nine plausible-looking memories about
-- platform mission, voice-consent policy and team standups) were already
-- opt-in behind `demoDataEnabled()` — production starts empty, and seeding
-- them here would put invented enterprise facts into a real register.

CREATE TABLE IF NOT EXISTS memory_evolution_memories (
  id                CHAR(12)      NOT NULL PRIMARY KEY,        -- 'mem-' + 8 hex
  organization_id   CHAR(36)      NOT NULL,
  type              ENUM('episodic','semantic','procedural','organizational','department',
                         'project','user','team','knowledge') NOT NULL,
  content           TEXT          NOT NULL,
  confidence        DECIMAL(4,3)  NOT NULL DEFAULT 0.800,
  access_count      INT UNSIGNED  NOT NULL DEFAULT 1,
  last_accessed_at  DATETIME      NOT NULL,
  created_at        DATETIME      NOT NULL,
  decayed_strength  DECIMAL(6,4)  NOT NULL DEFAULT 1.0000,     -- 1% per day since last access
  tags              JSON          NOT NULL,
  scope             VARCHAR(200)  NOT NULL DEFAULT 'enterprise:windels',
  seq               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UNIQUE KEY uk_memory_evolution_memories_seq (seq),
  KEY idx_me_memories_org (organization_id, seq),
  KEY idx_me_memories_type (organization_id, type),
  KEY idx_me_memories_scope (organization_id, scope)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per consolidation pass. Node counts every job ever run for
-- `consolidationJobs24h`; the name says 24h but the zset is never trimmed, so
-- the count is reproduced as it is rather than silently time-boxed.
CREATE TABLE IF NOT EXISTS memory_evolution_jobs (
  id              CHAR(11)      NOT NULL PRIMARY KEY,          -- 'cj-' + 8 hex
  organization_id CHAR(36)      NOT NULL,
  kind            ENUM('merge','deduplicate','refine','age','forget') NOT NULL,
  processed_at    DATETIME      NOT NULL,
  affected        INT UNSIGNED  NOT NULL DEFAULT 0,
  seq             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UNIQUE KEY uk_memory_evolution_jobs_seq (seq),
  KEY idx_me_jobs_org (organization_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The three counters Node kept as Redis strings. They cannot be derived: a
-- share leaves no row of its own, and a merge deletes the duplicate it counts.
CREATE TABLE IF NOT EXISTS memory_evolution_metrics (
  organization_id     CHAR(36)     NOT NULL PRIMARY KEY,
  duplicates_merged   INT UNSIGNED NOT NULL DEFAULT 0,
  memories_forgotten  INT UNSIGNED NOT NULL DEFAULT 0,
  cross_agent_shares  INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at          DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
