-- 010 — Enterprise AI Model Factory: the model lifecycle register
--
-- Applies to an EXISTING installation. Fresh installs get the same tables from
-- database/production.sql. Idempotent.
--
-- Node keeps this module in Redis under `mf2:*` — `mf2:models` (a sorted set
-- of ids), `mf2:model:<id>` (a hash holding the whole document as one `_doc`
-- string), `mf2:tunes` / `mf2:tune:<id>`, `mf2:bench` / `mf2:bench:<id>` — and
-- the notes ledger in the shared tenantStore (`mf:notes:i:<org>:<id>`). Here
-- that is four tables.
--
-- THE TENANCY BOUNDARY MOVED, deliberately. Node's `mf2:*` keys carry no
-- organization segment: one global model registry shared by every tenant, with
-- the router's admin gate as the only thing in front of it. An administrator
-- of one organization could read another organization's models, rename them,
-- advance them into canary or retire them. The register is scoped by
-- organization_id here, for the same reason the memory register is: a model
-- registry says what a company is building, what stage it has reached and what
-- it has failed, and that is not information another tenant's administrator
-- should be able to enumerate. The notes ledger was already org-scoped in Node
-- (`mf:notes:idx:<org>`) and stays that way.
--
-- TWO PIECES OF NODE STATE ARE NOT CARRIED OVER, both because nothing reads
-- them: `mf2:m:safety` and `mf2:m:appr` are incremented on a safety evaluation
-- and on a blocked canary attempt, and no route, dashboard or response ever
-- returns them. Copying them into a fifth table would add state that can drift
-- from the rows it counts, so `safetyEvaluations` is counted from the models
-- themselves (a model whose safety_passed is not NULL has been evaluated) and
-- `governanceBlocking` from the models sitting in the approval stage.
--
-- `seq` is an auto-increment alongside the CHAR primary key because Node's
-- tunes and benchmark results were ordered by a millisecond zset score while
-- its models all carried score 0 — a tie that Redis breaks lexicographically
-- by id. That ordering is preserved (`ORDER BY id` for models, `ORDER BY seq`
-- for the two time-ordered collections) so a page shows the same list in the
-- same order as the Node deployment it replaces.
--
-- No seed rows. Node guards its five sample models behind `demoDataEnabled()`
-- and a production tenant starts empty; the same is true here.

CREATE TABLE IF NOT EXISTS model_factory_models (
  id                  CHAR(11)      NOT NULL PRIMARY KEY,      -- 'm2-' + 8 hex
  organization_id     CHAR(36)      NOT NULL,
  name                VARCHAR(200)  NOT NULL,
  builder             ENUM('slm','llm','vision','speech','audio','multimodal','domain') NOT NULL,
  stage               ENUM('research','benchmarking','validation','approval',
                           'canary','deployed','monitoring','retired') NOT NULL DEFAULT 'research',
  base_model_id       VARCHAR(64)   NULL,
  size                VARCHAR(32)   NOT NULL,
  quant               VARCHAR(32)   NOT NULL,
  vram_mb             INT UNSIGNED  NOT NULL,
  benchmark_score     DECIMAL(6,2)  NULL,
  safety_passed       TINYINT(1)    NULL,                      -- NULL = never evaluated
  governance_approved TINYINT(1)    NOT NULL DEFAULT 0,
  canary_pct          TINYINT UNSIGNED NULL,
  versions            INT UNSIGNED  NOT NULL DEFAULT 1,
  created_at          DATETIME      NOT NULL,
  seq                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UNIQUE KEY uk_model_factory_models_seq (seq),
  KEY idx_model_factory_models_org (organization_id, id),
  KEY idx_model_factory_models_stage (organization_id, stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per measured result. Nothing here computes a score: the evaluator
-- that ran the benchmark supplies `score` and `pass`, and both are stored as
-- given. Node's earlier version invented the number (`50 + random * 45` and a
-- hard-coded `pass: true`); the rewritten service this port mirrors does not.
CREATE TABLE IF NOT EXISTS model_factory_benchmarks (
  id              CHAR(11)      NOT NULL PRIMARY KEY,          -- 'br-' + 8 hex
  organization_id CHAR(36)      NOT NULL,
  model_id        CHAR(11)      NOT NULL,
  benchmark       VARCHAR(120)  NOT NULL,
  score           DECIMAL(6,2)  NOT NULL,
  passed          TINYINT(1)    NOT NULL DEFAULT 0,
  recorded_at     DATETIME      NOT NULL,
  seq             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UNIQUE KEY uk_model_factory_benchmarks_seq (seq),
  KEY idx_model_factory_benchmarks_org (organization_id, seq),
  KEY idx_model_factory_benchmarks_model (organization_id, model_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fine-tune jobs. `model_id` is nullable because that is what Node records:
-- its route reads `req.body.modelId ?? req.params.modelId`, and the body
-- schema has no `modelId` while the path has no parameter — so Node stores a
-- job with no model at all. This port accepts an optional `modelId` when the
-- client sends one (the web client does) and stores NULL when it does not, so
-- a job can at least be traced back to what it was tuning. Starting a job
-- never runs one: no trainer is launched here, and `status` stays 'running'
-- with `progressPct` 0 until something outside the request updates it, which
-- is exactly as far as Node goes.
CREATE TABLE IF NOT EXISTS model_factory_fine_tunes (
  id              CHAR(11)      NOT NULL PRIMARY KEY,          -- 'ft-' + 8 hex
  organization_id CHAR(36)      NOT NULL,
  model_id        CHAR(11)      NULL,
  dataset         VARCHAR(200)  NOT NULL,
  method          ENUM('supervised','rlhf','dpo','lora','qlora') NOT NULL,
  status          ENUM('queued','running','evaluating','complete','failed') NOT NULL DEFAULT 'running',
  progress_pct    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  started_at      DATETIME      NOT NULL,
  seq             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UNIQUE KEY uk_model_factory_tunes_seq (seq),
  KEY idx_model_factory_tunes_org (organization_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The user-authored annotations ledger (Node's tenantStore with prefix
-- "mf:notes" and id prefix "mf-"). Only the model factory owns this table.
CREATE TABLE IF NOT EXISTS model_factory_notes (
  id              CHAR(11)      NOT NULL PRIMARY KEY,          -- 'mf-' + 8 hex
  organization_id CHAR(36)      NOT NULL,
  title           VARCHAR(200)  NOT NULL,
  body            TEXT          NOT NULL,
  tags            JSON          NOT NULL,
  created_by      CHAR(36)      NULL,
  created_at      DATETIME      NOT NULL,
  updated_at      DATETIME      NOT NULL,
  seq             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UNIQUE KEY uk_model_factory_notes_seq (seq),
  KEY idx_model_factory_notes_org (organization_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
