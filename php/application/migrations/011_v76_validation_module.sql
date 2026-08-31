-- 011 — Final Enterprise Integration & Validation: the report register
--
-- Applies to an EXISTING installation. Fresh installs get the same tables from
-- database/production.sql. Idempotent.
--
-- Node keeps this module in Redis: the report body under
-- `v76:report:<org>:<id>`, a `v76:reportsIdx:<org>` sorted set for the
-- history, `v76:lastReportId:<org>` / `v76:lastReportAt:<org>` pointers, and
-- the notes ledger in the shared tenantStore (`v76:notes:i:<org>:<id>`). Here
-- that is two tables, scoped by organization_id as Node's S195 rewrite made
-- them.
--
-- `v76:lastReportId` / `v76:lastReportAt` are NOT carried over as columns.
-- They are pointers to one row of the history, and the newest row by `seq`
-- already is that pointer — keeping it in a second place would only give it
-- somewhere to disagree with the register. `history` reads the rows newest
-- first; `lastReport` reads the newest one.
--
-- WHAT THIS MODULE IS ALLOWED TO CLAIM is the reason this file exists. Node's
-- report hard-codes sixteen of its systems as `wired` (desktop, mobile, web,
-- identity, api-gateway, aio-bus, trust-center, mission-control, developer,
-- federated, wearables …) and passes fifteen of its twenty-two checklist items
-- with a sentence — "verified in S81 e2e", "csurf middleware mounted in
-- server.ts", "hard-coded `passed: true`" — rather than a check. Its consent
-- gate probe is the worst of it: when the VoiceStudio import fails, the catch
-- branch sets `consentGateOk = true` and reports "verified in prior e2e run",
-- so a probe that could not run reports success.
--
-- This port cannot measure most of that, and it does not pretend to. Every
-- system is probed (a table either exists in this deployment or it does not);
-- every checklist item is either measured here or reported as NOT passed with
-- the reason it could not be verified. A validation report that fails closed
-- is the only kind that is worth reading.
--
-- No seed rows. A report exists only after somebody runs one.

CREATE TABLE IF NOT EXISTS v76_reports (
  id              CHAR(21)      NOT NULL PRIMARY KEY,          -- 'v76r_' + 16 hex
  organization_id CHAR(36)      NOT NULL,
  generated_at    DATETIME      NOT NULL,
  body            JSON          NOT NULL,                      -- the whole report
  seq             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UNIQUE KEY uk_v76_reports_seq (seq),
  KEY idx_v76_reports_org (organization_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The user-authored annotations ledger (Node's tenantStore with prefix
-- "v76:notes" and id prefix "v76-"). Only this module owns this table.
CREATE TABLE IF NOT EXISTS v76_notes (
  id              CHAR(12)      NOT NULL PRIMARY KEY,          -- 'v76-' + 8 hex
  organization_id CHAR(36)      NOT NULL,
  title           VARCHAR(200)  NOT NULL,
  body            TEXT          NOT NULL,
  tags            JSON          NOT NULL,
  created_by      CHAR(36)      NULL,
  created_at      DATETIME      NOT NULL,
  updated_at      DATETIME      NOT NULL,
  seq             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  UNIQUE KEY uk_v76_notes_seq (seq),
  KEY idx_v76_notes_org (organization_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
