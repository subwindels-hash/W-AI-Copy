# cPanel deployment — no Terminal required

The deployment archive is `application-deployment.zip`. It already contains CodeIgniter 3.1.13 and every runtime dependency. PHP 7.4–8.3 with `mysqli`, Apache `mod_rewrite`, and MySQL 5.7+/MariaDB 10.3+ are required. Composer, Node.js, npm, pnpm, Docker, SSH, and Terminal are not used.

## New cPanel deployment

### 1. Upload

In **cPanel → File Manager**, open the domain's document root (commonly `public_html`). Upload `application-deployment.zip`, select it, and click **Extract**. The archive's `index.php` and `.htaccess` must be directly in the document root, not in an extra nested folder. Enable “Show Hidden Files” so `.env` and `.htaccess` are visible.

### 2. Create the database

In **cPanel → MySQL Databases**:

1. Create a database and database user.
2. Add the user to the database.
3. grant **ALL PRIVILEGES**.

cPanel usually prefixes both names with the account name; use the complete displayed names in `.env`.

### 3. Import the database

Open **cPanel → phpMyAdmin**, select the new database, choose **Import**, and upload `database/production.sql`. This single idempotent file contains the complete schema, foreign keys, indexes, roles, permissions, settings, reference records, and templates. No migrations or seed commands are needed.

### 4. Configure `.env`

Edit `.env` in File Manager:

```ini
CI_ENV=production
VP_BASE_URL=https://yourdomain.com
VP_DB_HOST=localhost
VP_DB_PORT=3306
VP_DB_NAME=CPANEL_DATABASE_NAME
VP_DB_USER=CPANEL_DATABASE_USER
VP_DB_PASS=DATABASE_PASSWORD
VP_ENCRYPTION_KEY=YOUR_EXISTING_ENCRYPTION_KEY
VP_AUTH_SECRET=YOUR_EXISTING_AUTH_SECRET
VP_SETUP_KEY=A_PRIVATE_RANDOM_VALUE_OF_AT_LEAST_16_CHARACTERS
```

Keep `VP_ENCRYPTION_KEY` and `VP_AUTH_SECRET` unchanged when moving an existing database. Add mail/API credentials in the same file when those integrations are used. `.htaccess` denies web access to `.env` and SQL files.

### 5. First administrator (new databases only)

For a completely new database, visit:

`https://yourdomain.com/setup?key=YOUR_VP_SETUP_KEY`

Create the first administrator in the browser. Setup disables itself as soon as any user exists. Then remove `VP_SETUP_KEY` from `.env` or replace its value. When migrating an existing production database, its existing users and administrator are preserved and this step is neither available nor needed.

### 6. Open the website

Visit `https://yourdomain.com`. No additional installation operation is required.

## Writable folders

The ZIP includes all required folders. Standard cPanel extraction normally creates them writable by the account owner. If a host uses restrictive permissions, use **File Manager → Change Permissions** and set these directories to `755` (or `775` only when the host requires group write):

- `application/cache/`
- `application/cache/sessions/`
- `application/logs/`
- `assets/uploads/`
- `assets/logs/cache/`
- `assets/logs/ratelimit/`

Never use `777`. Uploaded executable script extensions are blocked by `assets/uploads/.htaccess`.

## Moving an existing installation

Export its database in phpMyAdmin, upload/extract the same application package on the new account, import that export, and update only domain/database fields in `.env`. Copy the old encryption and authentication secret values exactly. This preserves passwords, refresh-token validation, and encrypted application data.

## Browser checks

- `/` displays the login page.
- `/healthz` reports database status.
- Existing users and administrators can sign in.
- `/setup` is forbidden after an account exists.
- File uploads use authenticated `POST /api/v1/files` and write to `assets/uploads/`.

If every non-home URL returns cPanel's 404 page, enable Apache `mod_rewrite` through the hosting provider and confirm `.htaccess` exists in the document root.

### Private attachment storage
Ensure `application/storage/uploads` is writable by PHP (normally directory mode `0750` or `0770`, depending on the host). Attachment bytes are stored outside the public `assets` directory and are only served after API authentication and organization checks.

### Webhook retries without cron
Failed outbound webhook deliveries are retried automatically when an authenticated administrator opens an endpoint's delivery history. This request-driven mechanism requires no cron job, worker, Terminal, or daemon. Up to 10 due deliveries are processed per request, with exponential backoff and a maximum of five attempts.
