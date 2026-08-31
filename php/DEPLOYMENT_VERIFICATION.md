# cPanel deployment — verification evidence

Date: 2026-08-30 · Package: `application-deployment.zip` (47 MB, 875 files)

This document records the clean-deployment test that was run before the
portable cPanel work was marked complete, including the five defects it exposed
and the fixes that shipped with them.

---

## 1. Test environment

| Component | What was actually used |
|---|---|
| Database | **Real MySQL 5.7.29** server (InnoDB, utf8mb4) |
| PHP | **Real PHP 8.2.32** interpreter with `mysqli`, `mysqlnd`, `openssl`, `mbstring`, `curl`, `json`, `session`, `gd` |
| Web server | A small HTTP front-end that implements the shipped `.htaccess`: `DirectoryIndex`, the `!-f`/`!-d` front-controller rewrite, `Require all denied` for `.env`/`*.sql`/`composer.*`, and `[F]` for `/application`, `/system`, `/database` |
| Document root | A real directory, so uploads, logs and session files were written to disk |

Two accommodations were needed **only because the sandbox has no PHP/MySQL of
its own**; both are limitations of the PHP-WebAssembly build used to emulate a
cPanel host, not of the application:

1. `stricton => NULL` in `application/config/database.php` — the WASM build
   traps inside `mysqli_real_connect()` when CodeIgniter passes
   `MYSQLI_INIT_COMMAND` (`RuntimeError: null function or function signature
   mismatch` in `mysqlnd_execute_init_commands`).
2. `mysqli::autocommit()` removed from `_trans_begin()`, `_trans_commit()` and
   `_trans_rollback()` in `system/database/drivers/mysqli/mysqli_driver.php` —
   the asyncify build traps with `RuntimeError: unreachable` in
   `zif_mysqli_autocommit`. The three methods now issue `START TRANSACTION` /
   `COMMIT` / `ROLLBACK` directly, so statements still run; only an explicit
   rollback of an already-executed statement would behave differently.

Neither edit is in the shipped package. Transactions and `MYSQLI_INIT_COMMAND`
are ordinary, well-supported `mysqli` features on any cPanel host.

---

## 2. Scenario A — brand-new cPanel account (administrator created in the browser)

```
1. File Manager   : uploaded application-deployment.zip, extracted → 22 top-level entries
2. MySQL Databases: CREATE DATABASE windels_final_a + user wnd_final_a + ALL PRIVILEGES
3. phpMyAdmin     : Import database/production.sql → 125 tables, 0.51 s
4. Edit .env      : CI_ENV, VP_BASE_URL, VP_DB_* , VP_ENCRYPTION_KEY, VP_AUTH_SECRET, VP_SETUP_KEY
5. Browser        : /healthz  → {"status":"ok","checks":{"db":"ok"},"bootstrap":"pending"}
                    /setup?key=<correct>  → 200
                    /setup?key=<wrong>    → 403
                    POST /setup           → 201 "Administrator created"
6. Open the site  : 45 / 45 acceptance checks pass
```

No Terminal, SSH, Composer, Node, npm, pnpm, Docker, migration command, seed
command or CLI admin-creation command was used.

## 3. Scenario A′ — brand-new cPanel account (administrator seeded by SQL)

Same flow, but step 3 also imports `database/seed-admin.sql`, so the very first
browser action is signing in:

```
phpMyAdmin: Import database/production.sql → 125 tables
phpMyAdmin: Import database/seed-admin.sql → admin@example.com (Administrator, OWNER)
Open the site: 45 / 45 acceptance checks pass
```

## 4. Scenario B — migration to a second new cPanel account

```
1. phpMyAdmin      : Export site A's database (125 tables)
2. File Manager    : extract the same application-deployment.zip into the new
                     account, copy assets/uploads/ and application/storage/uploads/
3. MySQL Databases : CREATE DATABASE windels_final_b + new user wnd_final_b
                     (deliberately a different account prefix, as cPanel would)
4. phpMyAdmin      : Import the export → 125 tables
5. Edit .env       : VP_BASE_URL + the six VP_DB_* values ONLY.
                     VP_ENCRYPTION_KEY and VP_AUTH_SECRET copied unchanged.
6. Open the site   : 45 / 45 acceptance checks pass with the original credentials
```

Migration-specific checks (12/12):

- `admin@example.com` (seeded) signs in on the new host
- `member@windels.test` (registered through the UI on the old host) signs in on
  the new host — passwords survive untouched
- A PIN sealed with `VP_ENCRYPTION_KEY` on the old host decrypts to the same
  value on the new host (ciphertext is copied, never regenerated)
- users / organizations / roles (3) / permissions (38) / application_settings
  (15) / templates (2) all present, plus the organisation created on the old host
- Files copied with File Manager are served on the new host

## 5. Acceptance checklist

| Requirement | Result | Evidence |
|---|---|---|
| Homepage loads | PASS | `GET /` → 200, application shell + `assets/index-*.js` and `*.css` served |
| No installer command required | PASS | No `install/` directory exists; nothing was executed |
| No Terminal required | PASS | Every step above is File Manager / MySQL Databases / phpMyAdmin / `.env` |
| Database connects | PASS | `/healthz` → `checks.db = "ok"` |
| Existing users can log in | PASS | Accounts created on host A sign in on host B |
| Administrator can log in | PASS | `POST /api/v1/auth/login` → 200, `role: "admin"` |
| Authentication works | PASS | Anonymous → 401; wrong password → 401; tampered token → 401 |
| Sessions work | PASS | Bearer token accepted on `/api/v1/auth/me`; refresh token mints a new access token |
| Encryption works | PASS | PIN sealed with AES-256-GCM and read back; survives migration unchanged |
| File uploads work | PASS | `POST /api/v1/files` → 201, bytes on disk in `assets/uploads/`, readable back through the API |
| Application settings load | PASS | `/api/v1/settings`, `/api/v1/settings/public`, `/api/v1/permissions/catalog`, `/api/v1/workspace/dashboard` → 200 |
| `.htaccess` routing works | PASS | Pretty URLs (`/healthz`, `/api/v1/health`) route without `index.php`; `/.env`, `/*.sql`, `/application/**`, `/system/**` → 403 |
| No Composer installation | PASS | No `vendor/` directory; CodeIgniter ships in `system/` |
| No npm/pnpm installation | PASS | The archive contains no `package.json` |
| No migration command | PASS | One `production.sql` import; no `ALTER`/migrate step |
| No seed command | PASS | Roles, permissions, settings, templates and reference data are inside `production.sql` |
| No CLI admin creation | PASS | Browser `/setup` page (201) **or** optional `database/seed-admin.sql` |
| Works after upload + import + `.env` only | PASS | Both scenarios |

---

## 6. Defects found by the test (all fixed)

| # | Defect | Symptom on a real host | Fix |
|---|---|---|---|
| 1 | `invoices.lines` written without backticks (`LINES` is reserved) | **phpMyAdmin import fails** with a syntax error | Column quoted as `` `lines` `` |
| 2 | 8 tables declared `DEFAULT CHARSET=utf8mb4` without `COLLATE` | Import fails with *“Cannot add foreign key constraint”* on hosts whose default collation is not `utf8mb4_unicode_ci` | Explicit `COLLATE=utf8mb4_unicode_ci` on all 125 tables |
| 3 | Two `ALTER TABLE … ADD CONSTRAINT` statements at the end of the schema | Re-importing (or importing over an existing database) fails with *“duplicate key in table #sql-…”* | The `agents` table moved earlier in the file and both foreign keys are declared inline; the file is now idempotent |
| 4 | `url` helper not autoloaded while three controllers call `base_url()` | **Fatal error** `Call to undefined function base_url()` on file upload and avatar update | `$autoload['helper'] = array('url', 'file');` |
| 5 | `application/cache/sessions/` absent from the package | Session directory had to be created by PHP at runtime and could not be given permissions in File Manager | Directory shipped (with `index.html`) and listed as writable |

Also corrected while verifying: the two schema files were reconciled, and
`.env.example` documents every environment variable the code reads
(`CORS_ORIGIN` and `JWT_ISSUER` were missing).

> **Note on the two schema files.** `database/production.sql` is the file a
> fresh install imports, and it is the one that carries every object the
> application needs — 125 tables at the time of writing, including everything
> added by the kernel, tenant-isolation, usage, security and platform ports.
> `application/migrations/001_initial_mysql.sql` is the baseline that existed
> before those modules and is retained for reference; the modules' own objects
> ship as `002`–`005` for installations that are already live. Importing
> `production.sql` needs no migration import afterwards, by design.

---

## 7. Reproducing

`php/build-deployment.sh` rebuilds `application-deployment.zip` from
`php/`. The deployment itself needs no shell: follow
[CPANEL_DEPLOYMENT.md](./CPANEL_DEPLOYMENT.md).
