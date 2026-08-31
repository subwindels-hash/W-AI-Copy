-- 007 — Autonomous Organization: the board-decision approval register
--
-- Applies to an EXISTING installation. Fresh installs get the same table from
-- database/production.sql. Idempotent.
--
-- Node keeps the whole register in Redis: one hash per decision plus a sorted
-- set index per organization. Under PHP there is no Redis and no process
-- memory, so the register is a MySQL table keyed and filtered by
-- organization_id — every read and write is scoped exactly the way the Redis
-- keys were (`aut:decision:i:<org>:<id>`-style namespacing, here a column).
--
-- What is deliberately NOT stored: the dashboard's budgets, board seats, AI
-- executives, strategic plans and department headcount. Node returns literal
-- zeros for all of them because no ledger backs them, and a MySQL column full
-- of default zeros would only make invented numbers look retrieved. They stay
-- computed literals in the controller, and the parity doc says so.

CREATE TABLE IF NOT EXISTS autonomous_decisions (
  -- Node mints ids as `decision-<uuid>` (autonomous.service.ts: uid()).
  id                   CHAR(45)      NOT NULL PRIMARY KEY,
  organization_id      CHAR(36)      NOT NULL,
  title                VARCHAR(200)  NOT NULL,
  department           VARCHAR(64)   NOT NULL,
  recommendation       TEXT          NOT NULL,
  confidence           DECIMAL(4,3)  NOT NULL DEFAULT 0,
  risk_level           ENUM('low','med','high','critical') NOT NULL DEFAULT 'low',
  estimated_impact_usd DECIMAL(20,2) NOT NULL DEFAULT 0,
  status               ENUM('drafted','awaiting_human','approved','rejected','executing','executed') NOT NULL DEFAULT 'awaiting_human',
  human_approver       CHAR(36)      NULL,
  reasoning            TEXT          NOT NULL,
  decision_note        VARCHAR(2000) NULL,
  created_at           DATETIME      NOT NULL,
  decided_at           DATETIME      NULL,
  updated_at           DATETIME      NOT NULL,
  KEY idx_autonomous_decisions_org (organization_id, created_at),
  KEY idx_autonomous_decisions_status (organization_id, status),
  KEY idx_autonomous_decisions_department (organization_id, department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
