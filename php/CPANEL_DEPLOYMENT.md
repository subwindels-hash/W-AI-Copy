# Portable cPanel deployment — no Terminal required

```text
Upload files  →  Create database  →  Import database/production.sql  →  Edit .env  →  Open the site
```

That is the whole deployment. **Terminal, SSH, Composer, Node.js, npm, pnpm,
Docker and migration/seed commands are never used.** The deployment archive
already contains every runtime dependency: CodeIgniter 3.1.13 ships inside
`system/`, there is no `vendor/` directory, and no build step exists.

Requirements on the hosting account: PHP 7.4–8.3 with the `mysqli` extension,
MySQL 5.7+ / MariaDB 10.3+, and Apache with `mod_rewrite` (both are standard on
cPanel).

---

## 1. New cPanel deployment

### 1.1 Upload

1. Download `application-deployment.zip`.
2. **cPanel → File Manager** → open the domain's document root
   (usually `public_html`; for an add-on domain use that domain's folder).
3. Turn on **Settings → Show Hidden Files (dotfiles)** so `.htaccess` and
   `.env` are visible.
4. **Upload** the ZIP, select it, and press **Extract**.
5. Check that `index.php`, `index.html` and `.htaccess` are directly inside the
   document root — not inside an extra nested folder. (If they are, move them
   up one level and delete the empty folder.)

### 1.2 Create the database

**cPanel → MySQL Databases**

1. **Create a new database** — cPanel prefixes it with the account name, e.g.
   `cpaneluser_windels`. Copy the full name.
2. **Create a database user** with a strong password. Copy the full user name
   (also prefixed) and the password.
3. **Add the user to the database**.
4. On the privileges screen select **ALL PRIVILEGES**.

That is everything phpMyAdmin needs. Do not create any tables — the import in
the next step creates all 103 of them.

### 1.3 Import the database

**cPanel → phpMyAdmin**

1. Select the new database in the left sidebar.
2. Open the **Import** tab.
3. Choose `database/production.sql` from the extracted files
   (File Manager path: `public_html/database/production.sql`).
4. Leave every option at its default and press **Go**.

`database/production.sql` is one complete, idempotent file. It contains every
table, column, index and foreign key, plus the default records the application
needs to start: roles, permissions, role-permission mappings, application
settings, templates, the AI model registry, plugins, governance standards,
event schemas, the service registry, the API version row and the schema version
marker. Importing it twice is safe.

There is **no migration command and no seed command**. phpMyAdmin is the only
tool needed.

### 1.4 Configure `.env`

Create `.env` in the document root (**File Manager → + File**), or copy
`.env.example` to `.env` and edit it. Only these values normally change:

```ini
CI_ENV=production

VP_BASE_URL=https://yourdomain.com

VP_DB_HOST=localhost
VP_DB_PORT=3306
VP_DB_NAME=cpaneluser_windels
VP_DB_USER=cpaneluser_windels
VP_DB_PASS=the-password-you-created

VP_ENCRYPTION_KEY=your-existing-encryption-key
VP_AUTH_SECRET=your-existing-auth-secret
```

* `VP_DB_HOST` is `localhost` on virtually every cPanel account.
* Use the **complete** database and user names shown by cPanel, including the
  account prefix.
* Optional values (mail, OpenAI, webhook secret, upload limit, CORS origin) are
  documented inside `.env.example`. The application runs without them; mail
  delivery and AI features simply stay inactive until they are filled in.
* `.htaccess` blocks web access to `.env`, `.env.*`, `composer.*` and `*.sql`,
  so the file cannot be downloaded by visitors.

#### Optional: response security headers

The API always sends `X-Content-Type-Options: nosniff` and
`Referrer-Policy: strict-origin-when-cross-origin`, and `Strict-Transport-Security`
on HTTPS requests. The two headers that need to match your deployment are opt-in,
because a wrong default breaks real pages:

```ini
# Full CSP string, sent only if set. The bundled SPA has an inline boot script
# and inline styles, so a strict script-src 'self' policy will blank the splash
# screen until you add the directives your bundle needs.
VP_SECURITY_CSP=

# Frame policy. Leave unset while the app is embedded anywhere (dashboards,
# preview panels). 'none' -> X-Frame-Options: DENY, 'self' -> SAMEORIGIN,
# or an explicit source list for Content-Security-Policy: frame-ancestors.
VP_SECURITY_FRAME_ANCESTORS=

# HSTS max-age in seconds (default 15552000 = 180 days). Set 0 to omit HSTS.
VP_SECURITY_HSTS_MAX_AGE=15552000

# Overrides the referrer policy above.
VP_SECURITY_REFERRER_POLICY=strict-origin-when-cross-origin
```

The admin **Security Center → Overview** tab reports which of these are actually
on the response, so what you see there is what the browser received — it is read
back from the live response, not from this file. Static files (the SPA under
`/assets`) are served by Apache rather than PHP, so they need the same headers
from `.htaccess` if you want them covered:

```apache
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>
```

### 1.5 First administrator

A brand-new database has no users, so one account must be created once. Pick
either option — neither uses a command line.

**Option A — seed it with the import (nothing else to do)**

Right after `database/production.sql`, import `database/seed-admin.sql`. It
creates:

| Field | Default value |
|---|---|
| Email | `admin@example.com` |
| Password | `Windels!Admin#2026` |
| Role | Administrator (owner of the default organisation) |

Edit the three `SET` lines at the top of that file first if you want a
different email, organisation name or password hash (the file explains how to
produce a bcrypt hash without a command line).

> **Change that password immediately after the first login** — the default is
> published in this repository. Then delete `VP_SETUP_KEY` from `.env`.

The file is a no-op when the database already contains a user, so it is safe to
import at any time.

**Option B — one-time browser setup page**

1. Set `VP_SETUP_KEY` in `.env` to a private value of at least 16 characters.
2. Open `https://yourdomain.com/setup?key=YOUR_VP_SETUP_KEY`.
3. Fill in email, organisation, display name and a password of 12+ characters.
4. The page locks itself as soon as an account exists. Remove or replace
   `VP_SETUP_KEY` afterwards.

### 1.6 Open the website

Visit `https://yourdomain.com`. Nothing else has to be run.

Quick self-checks:

| URL | Expected result |
|---|---|
| `/` | The application loads |
| `/healthz` | `{"status":"ok","checks":{"db":"ok"},"bootstrap":"complete"}` |
| `/.env` | 403 Forbidden |
| `/database/production.sql` | 403 Forbidden |

If `/healthz` reports `bootstrap: "pending"`, no administrator exists yet —
see §1.5. If it reports `db: "error"`, re-check the six `VP_DB_*` values.

---

## 2. Writable folders

The ZIP already contains these directories. Standard cPanel extraction makes
them writable by the account owner, and PHP (which runs as the account owner)
can write to them. If your host uses restrictive permissions, use
**File Manager → right-click the folder → Change Permissions** and set `755`
(or `775` when the host requires group write). Never use `777`.

| Folder | Used for |
|---|---|
| `assets/uploads/` | Public uploads (files, avatars) |
| `application/storage/uploads/` | Private attachments, served only after authentication |
| `application/cache/` | Framework cache |
| `application/cache/sessions/` | PHP session files (created automatically if missing) |
| `application/logs/` | Application log files |
| `assets/logs/cache/` | File-based cache |
| `assets/logs/ratelimit/` | Rate-limit counters |

`assets/uploads/.htaccess` blocks script execution inside the upload folder,
and `.htaccess` denies web access to `application/`, `system/` and `database/`.

---

## 2b. Upgrading an existing installation

A fresh install imports `database/production.sql`, which already contains every
object the application needs. An account that is **already live** was installed
from an earlier `production.sql`, so it is missing anything added since. Those
additions ship as numbered files in `application/migrations/` and are applied by
importing them — still no Terminal:

1. cPanel → **File Manager** → open the deployed folder → `application/migrations/`
2. **Download** the migration file you need (`002_kernel_module.sql`,
   `003_tenant_isolation_and_usage.sql`, `004_security_module.sql`,
   `005_platform_module.sql`, `006_module_center.sql`,
   `007_autonomous_module.sql` or `008_benchmarks_module.sql`) to your
   computer.
3. cPanel → **phpMyAdmin** → select the database → **Import** → **Choose File** →
   pick the downloaded file → **Go**.
4. Reload the site. Nothing else changes: no files are replaced, no keys are
   regenerated, and no data is lost.

Every migration is idempotent — importing it twice, or importing one that is
already applied, changes nothing.

| Migration | Adds |
|---|---|
| `002_kernel_module.sql` | The AI Kernel: `kernel_components`, `kernel_events`, `kernel_counters`, `kernel_latencies`, `kernel_state`, plus the 20 seeded kernel components. Until it is imported, `/api/v1/kernel/*` and `/api/v1/ai/*` return `501 MODULE_NOT_MIGRATED`. |
| `003_tenant_isolation_and_usage.sql` | Tenant Isolation and Usage Intelligence: `tenant_isolation_policies`, `tenant_isolation_runs`, `tenant_isolation_probes`, `usage_events`. Until it is imported, `/api/v1/tenant-isolation/*` and `/api/v1/usage-intel/*` return `501 MODULE_NOT_MIGRATED`. |
| `004_security_module.sql` | Security & governance: `security_counters`, `security_breakers`, `security_incidents`, `security_incident_runbooks`, `security_runbook_executions`, `security_access_review_campaigns`, `security_access_review_items`. Until it is imported, `/api/v1/security/*` returns `501 MODULE_NOT_MIGRATED`. |
| `005_platform_module.sql` | Global Platform: `platform_metric_counters`, `platform_metric_histograms`, `platform_spans`, `platform_state`, `platform_cdn_rules` (plus the three default cache rules) and `platform_cdn_purges`. Until it is imported, `/api/v1/platform/*` returns `501 MODULE_NOT_MIGRATED`. |
| `006_module_center.sql` | Module Center **and** Module Runtime: `platform_modules`, `platform_module_releases`, `platform_module_uploads` and `platform_module_operations`. Until it is imported, `/api/v1/super-admin/module-center/*` and `/api/v1/module-runtime/*` return `404`/`501`. The package storage directory (`application/storage/module-packages` by default) is created on first upload; if PHP cannot create it, make it in File Manager and set it to `0700`. The runtime gateway additionally needs `VP_MODULE_RUNNER_HMAC_SECRET` (32+ characters) before it will call a module backend. |
| `007_autonomous_module.sql` | The Autonomous Organization approval register: `autonomous_decisions`. Until it is imported, `/api/v1/autonomous/*` returns `501 MODULE_NOT_MIGRATED`. No seed data is added — an organization with no proposals is the correct empty state, and the dashboard's budgets, board seats and AI executives stay zero because no backing ledger is shipped with it. |
| `008_benchmarks_module.sql` | The Benchmark Center result registry: `benchmark_runs`, `benchmark_schedules` and `benchmark_notes`. Until it is imported, `/api/v1/benchmarks/*` returns `501 MODULE_NOT_MIGRATED`. No runs are seeded: an organization that has never recorded an evaluation reports zero runs, a zero average and fourteen zero area scores, and a result can only be recorded with an evaluator and an evidence reference. |
Upgrading files (uploading a newer package over an older one) is independent of
this step and safe on its own — but the new endpoints will keep returning 501
until the matching migration has been imported.

---

## 3. Moving an existing installation to another cPanel account

Encryption keys and authentication secrets are **not** regenerated by a move, so
passwords, refresh tokens and encrypted data keep working.

1. **Export the database** on the old account: phpMyAdmin → select the
   database → **Export** → Quick or Custom (default options) → **Go**. Keep
   the resulting `.sql` file.
2. **Upload and extract** `application-deployment.zip` on the new account
   (§1.1).
3. **Create the database and user** on the new account (§1.2).
4. **Import** your exported `.sql` file with phpMyAdmin (§1.3). Uploaded files
   and attachments must be copied over with File Manager as well:
   `assets/uploads/` and `application/storage/uploads/`.
5. **Edit `.env`** (§1.4) and change only the server-specific values:
   `VP_BASE_URL` and the six `VP_DB_*` entries.
   **Copy `VP_ENCRYPTION_KEY` and `VP_AUTH_SECRET` across unchanged.**
6. Open the site. Existing users and the administrator sign in with their
   existing passwords; nothing is re-created and no command is run.

A brand-new database can also be built from scratch: import
`database/production.sql`, then restore your own data export on top of it.

---

## 4. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Every page except `/` shows the host's 404 page | `mod_rewrite` is disabled (ask the provider to enable it) or `.htaccess` is missing from the document root. |
| Blank page | Check the PHP version (7.4–8.3) and confirm `.env` exists. Set `CI_ENV=development` temporarily to see the error, then switch back to `production`. |
| `/healthz` reports `db: "error"` | Database name/user/password in `.env` do not match cPanel, or the user was not granted privileges on the database. |
| Database error mentioning a table | The import was incomplete. Re-import `database/production.sql` — it is idempotent. |
| Login works but the page immediately logs out | `VP_BASE_URL` does not match the domain actually being used (including `https://` and `www`). |
| Uploads fail | `assets/uploads/` is not writable — apply `755` through File Manager. |
| Emails are not sent | Fill in `VP_MAIL_*` in `.env`. The application keeps working and logs instead when mail is unconfigured. |

---

## 5. For developers: rebuilding the package

```sh
php/build-deployment.sh          # writes php/application-deployment.zip
php/build-deployment.sh out.zip  # or a custom path
```

The script stages the runtime files, recreates the writable directories, drops
development-only files (`Dockerfile`, `composer.json`, framework readmes,
`application/migrations/`), and zips everything at the archive root so it can be
extracted straight into `public_html`. Running it is a packaging step for
maintainers — deploying never requires a shell.
