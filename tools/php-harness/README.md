# PHP/cPanel test harness

Runs the PHP build on a machine that has **no PHP, no MySQL, no Apache and no
root package manager** — which is the situation inside this repository's
development sandbox. It exists so the acceptance and parity specs under
`tests/php-api/` and `docs/`'s acceptance checklist can be executed for real,
instead of being argued about.

It is a **development tool only**. Nothing in this directory is part of the
cPanel package: `php/build-deployment.sh` zips `php/` and never looks here.

## What it stands in for

| cPanel host | This harness |
|---|---|
| PHP 8.2 with `mysqli` | `@php-wasm/node` + `@php-wasm/node-8-2` (PHP 8.2.32, WASM) |
| MySQL 5.7 | `mysql-server-5.7-lin-x64` (a real `mysqld` binary from npm) |
| Apache + the shipped `.htaccess` | `server.mjs`: `DirectoryIndex`, the `!-f` front-controller rewrite, and 403 for `/.env`, `*.sql`, `/application/**`, `/system/**`, `/database/**` |
| File Manager / phpMyAdmin | `reset-db.mjs` and plain `cp` |

## Setup (one time)

```bash
cd tools/php-harness
npm init -y
npm i mysql2 mysql-server-5.7-lin-x64 @php-wasm/node @php-wasm/node-8-2@3.1.51
```

Two sandboxes needs two extras:

1. **`libaio.so.1`** — `mysqld` links it and the sandbox has no package mirror.
   `libaio_stub.c` is a 20-line stand-in that forwards the three calls `mysqld`
   actually makes (`io_setup`, `io_submit`, `io_getevents`) to their syscalls:

   ```bash
   gcc -shared -fPIC -O2 -o libaio.so.1 libaio_stub.c -Wl,--version-script=libaio.map
   ```

2. **A non-empty MySQL password.** `php/application/config/database.php` reads
   `getenv('VP_DB_PASS') ?: 'windels'`, so an empty password silently falls back
   to the literal `windels`. Create a user with a real password:

   ```sql
   CREATE USER 'windels'@'%' IDENTIFIED BY 'windels';
   GRANT ALL PRIVILEGES ON *.* TO 'windels'@'%' WITH GRANT OPTION;
   ```

## Running

```bash
# 1. MySQL (one instance, port 3306, datadir inside the mysql-server package)
LD_LIBRARY_PATH=$PWD node db.cjs

# 2. A deployment: copy php/ to a docroot, write .env, import the schema
cp -r php /tmp/deploy/final-a
#   ... write .env from php/.env.example (VP_DB_NAME, VP_ENCRYPTION_KEY ≥ 32
#       chars and VP_AUTH_SECRET ≥ 32 chars, VP_SETUP_KEY ≥ 16 chars) ...
node reset-db.mjs wnd_final_a php/database/production.sql

# 3. The .htaccess rules and the WASM workarounds (see below)
node apply-harness-workarounds.mjs /tmp/deploy/final-a

# 4. Serve
node server.mjs 8082 /tmp/deploy/final-a 8.2

# 5. Create the first administrator the way cPanel users do — in the browser
curl -X POST 'http://localhost:8082/setup?key=YOUR_VP_SETUP_KEY' \
  --data-urlencode 'email=owner@windels.example' \
  --data-urlencode 'password=Owner!Pass#2026' \
  --data-urlencode 'organization=Windels'
```

Then, from the repository root:

```bash
node tests/php-api/kernel.spec.mjs   http://localhost:8082 owner@windels.example 'Owner!Pass#2026'
node tests/php-api/platform.spec.mjs http://localhost:8082 owner@windels.example 'Owner!Pass#2026' \
     <dbUser> <dbPass> <dbName> 127.0.0.1 3306 "$VP_AUTH_SECRET"
node tools/php-harness/acceptance.mjs http://localhost:8082 owner@windels.example 'Owner!Pass#2026' /tmp/deploy/final-a
```

## The two workarounds, and why they are not in the shipped package

`apply-harness-workarounds.mjs` patches **the docroot copy only**:

1. **`stricton => NULL`** in `application/config/database.php`. CodeIgniter sets
   `MYSQLI_INIT_COMMAND` whenever `stricton` is present (in both the `TRUE` and
   the `FALSE` branch), and the WASM build traps with
   `RuntimeError: null function or function signature mismatch` in
   `mysqlnd_execute_init_commands`.

2. **`mysqli::autocommit()` removed** from `_trans_begin()`, `_trans_commit()`
   and `_trans_rollback()` in `system/database/drivers/mysqli/mysqli_driver.php`.
   The asyncify build traps with `RuntimeError: unreachable` in
   `zif_mysqli_autocommit`. The three methods issue `START TRANSACTION` /
   `COMMIT` / `ROLLBACK` directly instead, so statements still run; only an
   explicit rollback of an already-executed statement would behave differently.
   (The JSPI build avoids this, but Node 22 in this sandbox does not enable JSPI.)

Both are ordinary, well-supported `mysqli` features on a cPanel host.

## Known limits

* PHP inside WASM cannot open outbound sockets — even to loopback — so a real
  AI provider call cannot be demonstrated here. AI endpoints are exercised
  through their "no provider configured" and provider-probe paths.
* `php.run({ code })` (CLI-style) hangs in this WASM build; the harness drives
  PHP over HTTP only.
* One PHP instance per port, and every request shares it, so a WASM trap takes
  the port down. Restart the server after a trap.
