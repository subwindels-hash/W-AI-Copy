#!/usr/bin/env bash
# Rebuild the PHP/cPanel test harness from nothing.
#
# The sandbox that runs these specs is ephemeral: everything outside this
# repository (node_modules, the mysqld datadir, the docroot) disappears between
# turns. This script recreates all of it in one command, so "run the spec" never
# turns into an afternoon of rediscovering setup steps.
#
#   bash tools/php-harness/bootstrap.sh [port] [dbname]
#
# When it finishes you have:
#   * mysqld 5.7 on 3306 with a `windels` / `windels` superuser
#   * ${dbname} imported from php/database/production.sql
#   * a docroot at ~/ _tools/deploy/final-a with a generated .env
#   * the php-wasm server on ${port}
#   * an administrator owner@windels.example / Owner!Pass#2026, promoted to
#     SUPER_ADMIN (the Module Center needs it)
#
# Nothing here is part of the cPanel package.
set -euo pipefail

PORT="${1:-8082}"
DB="${2:-wnd_final_a}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOLS="$HOME/_tools"
PG="$TOOLS/pgtest"
DOCROOT="$TOOLS/deploy/final-a"

echo "== repository: $REPO"

mkdir -p "$TOOLS/lib" "$PG" "$TOOLS/deploy"
cp "$REPO"/tools/php-harness/{server.mjs,db.cjs,reset-db.mjs,apply-harness-workarounds.mjs,acceptance.mjs,libaio_stub.c,libaio.map} "$PG/"

# ---------------------------------------------------------------- 1. node deps
if [ ! -d "$PG/node_modules/mysql-server-5.7-lin-x64" ] || [ ! -d "$PG/node_modules/@php-wasm" ]; then
  echo "== installing harness dependencies"
  (cd "$PG" && [ -f package.json ] || npm init -y >/dev/null 2>&1)
  (cd "$PG" && npm i --no-audit --no-fund mysql2 mysql-server-5.7-lin-x64 @php-wasm/node @php-wasm/node-8-2@3.1.51)
fi

# ------------------------------------------------------- 2. libaio stand-in
if [ ! -f "$TOOLS/lib/libaio.so.1" ]; then
  echo "== building libaio stub (no package mirror in this sandbox)"
  gcc -shared -fPIC -O2 -o "$TOOLS/lib/libaio.so.1" "$PG/libaio_stub.c" -Wl,--version-script="$PG/libaio.map"
fi

# ----------------------------------------------------------------- 3. mysqld
if ! (exec 3<>/dev/tcp/127.0.0.1/3306) 2>/dev/null; then
  echo "== starting mysqld"
  (cd "$PG" && env LD_LIBRARY_PATH="$TOOLS/lib" nohup node "$PG/db.cjs" > /tmp/mysqld.log 2>&1 &)
  for _ in $(seq 1 60); do
    (exec 3<>/dev/tcp/127.0.0.1/3306) 2>/dev/null && break
    sleep 1
  done
fi
(exec 3<>/dev/tcp/127.0.0.1/3306) 2>/dev/null || { echo "mysqld did not come up; see /tmp/mysqld.log" >&2; exit 1; }
echo "== mysqld listening"

# ------------------------------------------------------------- 4. docroot
if [ ! -f "$DOCROOT/index.php" ]; then
  echo "== building the docroot"
  rm -rf "$DOCROOT"
  mkdir -p "$TOOLS/deploy"
  cp -r "$REPO/php" "$DOCROOT"
  SECRET="harness-auth-secret-$(head -c 12 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9')"
  ENCKEY="harness-encryption-key-$(head -c 12 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9')"
  cat > "$DOCROOT/.env" <<EOF
CI_ENV=production
VP_BASE_URL=http://localhost:${PORT}
VP_DB_HOST=127.0.0.1
VP_DB_PORT=3306
VP_DB_NAME=${DB}
VP_DB_USER=windels
VP_DB_PASS=windels
VP_ENCRYPTION_KEY=${ENCKEY}
VP_AUTH_SECRET=${SECRET}
VP_SETUP_KEY=harness-setup-key-0123456789
VP_SESSION_NAME=windels_session
VP_UPLOAD_MAX_KB=10240
VP_WEBHOOK_SECRET=harness-webhook-secret-0123456789abcdefghij
VP_CDN_ENABLED=false
VP_CDN_PROVIDER=
CORS_ORIGIN=*
JWT_ISSUER=windels-php
# A signing secret with NO runner URL: the module gateway can sign its context
# header while the Module Center still reports runnerConfigured:false.
VP_MODULE_RUNNER_HMAC_SECRET=harness-module-runtime-signing-secret-0123456789
EOF
  (cd "$PG" && node apply-harness-workarounds.mjs "$DOCROOT" >/dev/null)
fi

# ------------------------------------------------------------ 5. schema
echo "== importing ${DB}"
(cd "$PG" && node -e "
const mysql = require('mysql2/promise');
(async () => {
  const root = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'root', password: '', multipleStatements: true });
  await root.query(\"CREATE USER IF NOT EXISTS 'windels'@'%' IDENTIFIED BY 'windels'\");
  await root.query(\"GRANT ALL PRIVILEGES ON *.* TO 'windels'@'%' WITH GRANT OPTION\");
  await root.query('FLUSH PRIVILEGES');
  await root.end();
})();
")
(cd "$PG" && node reset-db.mjs "$DB" "$REPO/php/database/production.sql" | tail -1)

# ------------------------------------------------- 6. publisher signing key
if [ ! -f "$PG/module-publisher.json" ]; then
  echo "== generating a publisher signing key for the Module Center spec"
  (cd "$PG" && node -e "
const crypto = require('crypto'), fs = require('fs');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
fs.writeFileSync('$PG/module-publisher.json', JSON.stringify({ keyId: 'harness-publisher', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publicKey: pub }, null, 2));
const env = fs.readFileSync('$DOCROOT/.env', 'utf8').split('\n').filter(l => !l.startsWith('VP_MODULE_TRUSTED_PUBLISHER_KEYS='));
env.splice(1, 0, 'VP_MODULE_TRUSTED_PUBLISHER_KEYS=' + JSON.stringify({ 'harness-publisher': pub }));
fs.writeFileSync('$DOCROOT/.env', env.join('\n'));
")
fi

# ------------------------------------------------------------- 7. serve
if ! (exec 3<>/dev/tcp/127.0.0.1/"$PORT") 2>/dev/null; then
  echo "== starting the php-wasm server on ${PORT}"
  (cd "$PG" && nohup node server.mjs "$PORT" "$DOCROOT" 8.2 > /tmp/php-"$PORT".log 2>&1 &)
  for _ in $(seq 1 40); do
    (exec 3<>/dev/tcp/127.0.0.1/"$PORT") 2>/dev/null && break
    sleep 1
  done
fi

# --------------------------------------------- 8. first-run admin (browser path)
echo "== running first-run setup"
curl -s -o /dev/null -X POST "http://localhost:${PORT}/setup?key=harness-setup-key-0123456789" \
  --data-urlencode 'email=owner@windels.example' \
  --data-urlencode 'password=Owner!Pass#2026' \
  --data-urlencode 'organization=Windels' || true

(cd "$PG" && node -e "
const mysql = require('mysql2/promise');
(async () => {
  const db = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'windels', password: 'windels', database: '$DB' });
  await db.query(\"UPDATE users SET role = 'SUPER_ADMIN' WHERE email = 'owner@windels.example'\");
  await db.end();
})();
")

echo
echo "== ready"
echo "   app      http://localhost:${PORT}"
echo "   docroot  ${DOCROOT}"
echo "   mysql    127.0.0.1:3306  windels/windels  db ${DB}"
echo "   admin    owner@windels.example / Owner!Pass#2026 (SUPER_ADMIN)"
echo "   specs    node tests/php-api/<module>.spec.mjs http://localhost:${PORT} owner@windels.example 'Owner!Pass#2026' windels windels ${DB} 127.0.0.1 3306"
