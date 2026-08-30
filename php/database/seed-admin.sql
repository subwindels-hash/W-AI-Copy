-- ============================================================================
-- WINDELS AI OS — OPTIONAL first administrator seed
-- ============================================================================
--
-- This file is OPTIONAL. Importing `database/production.sql` alone is enough to
-- run the application; the first administrator can then be created in the
-- browser at  https://yourdomain.com/setup?key=YOUR_VP_SETUP_KEY
--
-- Import this file ONLY when you want the administrator account to already
-- exist after the phpMyAdmin import, so that the very first thing you do after
-- editing `.env` is sign in (no extra step, no Terminal).
--
-- HOW TO USE (cPanel → phpMyAdmin → Import)
--   1. Import  database/production.sql   first.
--   2. Edit the three SET lines below (email / organisation / password hash)
--      if you do not want the documented defaults.
--   3. Import  database/seed-admin.sql.
--
-- SECURITY — DO THIS IMMEDIATELY AFTER THE FIRST LOGIN
--   The password hash below is a bcrypt hash of the documented default
--   password:
--
--       Windels!Admin#2026
--
--   Anyone who reads this repository knows it. Sign in once and change it
--   (Account → Password), or generate your own bcrypt hash and replace the
--   value on the SET line below. A bcrypt hash can be produced without any
--   command line by using any online bcrypt generator with cost 10, or by
--   letting /setup create the account instead.
--
--   After seeding, remove `VP_SETUP_KEY` from `.env` (the browser setup page
--   disables itself automatically as soon as a user exists).
--
-- This file is a no-op when the database already contains a user, so it is
-- safe to import into an existing installation by accident.
-- ============================================================================

SET NAMES utf8mb4;

-- ---- Edit these three lines if you do not want the documented defaults ------
SET @admin_email           = 'admin@example.com';
SET @admin_organization    = 'Windels Organization';
SET @admin_password_hash   = '$2y$10$ey9qkSrI.pOKwvDgq9c1VORY.EXjZW86baSZyjWpLoW/ht6KLKcra';
-- ---------------------------------------------------------------------------

SET @seed_org_id       = '00000000-0000-4000-8000-000000000002';
SET @seed_user_id      = '00000000-0000-4000-8000-000000000001';
SET @seed_workspace_id = '00000000-0000-4000-8000-000000000003';
SET @seed_member_id    = '00000000-0000-4000-8000-000000000004';
SET @seed_now          = NOW();
SET @seed_empty        = (SELECT COUNT(*) FROM users);

INSERT IGNORE INTO organizations (id, name, slug, created_at, updated_at)
SELECT @seed_org_id, @admin_organization, 'windels-organization', @seed_now, @seed_now
WHERE @seed_empty = 0;

INSERT IGNORE INTO workspaces (id, organization_id, name, slug, created_at, updated_at)
SELECT @seed_workspace_id, @seed_org_id, 'Main Workspace', 'main', @seed_now, @seed_now
WHERE @seed_empty = 0;

INSERT IGNORE INTO users (
  id, email, username, public_user_id, password_hash, display_name,
  role, locale, timezone, theme, is_active, is_suspended, created_at, updated_at
)
SELECT
  @seed_user_id, @admin_email, NULL, 'WND-000000000001', @admin_password_hash,
  'Administrator', 'ADMIN', 'en-US', 'UTC', 'dark', 1, 0, @seed_now, @seed_now
WHERE @seed_empty = 0;

INSERT IGNORE INTO memberships (id, user_id, organization_id, role, joined_at)
SELECT @seed_member_id, @seed_user_id, @seed_org_id, 'OWNER', @seed_now
WHERE @seed_empty = 0;
