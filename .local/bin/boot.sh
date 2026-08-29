#!/usr/bin/env bash
# WINDELS AI OS — local sandbox boot script
# Starts Postgres 18 + Redis 6 + Vite (web) + API (with WASM Prisma engine).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/.local/pg/bin:$ROOT/.local/redis/bin:$PATH"
mkdir -p .local/logs .local/run

# ── Postgres ─────────────────────────────────────
if [ ! -f .local/data/pg/PG_VERSION ]; then
  initdb -D .local/data/pg -U windels --pwfile=<(echo "windels") --auth=md5 --auth-host=md5 --auth-local=trust -E UTF8 >/dev/null
fi
if ! pg_ctl -D .local/data/pg status >/dev/null 2>&1; then
  pg_ctl -D .local/data/pg -l .local/logs/pg.log -o "-p 5432 -k /tmp -h 127.0.0.1" start
fi
python3 - <<'PY' >/dev/null
import psycopg
c = psycopg.connect('postgresql://windels:windels@127.0.0.1:5432/postgres', autocommit=True)
cur = c.execute("SELECT 1 FROM pg_database WHERE datname='windels'")
if not cur.fetchone(): c.execute('CREATE DATABASE windels')
c.close()
PY
echo "✓ Postgres :5432"

# ── Redis ─────────────────────────────────────
if ! redis-cli ping >/dev/null 2>&1; then
  nohup redis-server .local/redis/redis.conf > .local/logs/redis.log 2>&1 &
  echo $! > .local/run/redis.pid
  sleep 1
fi
redis-cli ping >/dev/null && echo "✓ Redis :6379"

# ── Prisma mirror (skips CDN fetch, uses WASM engine) ─────────────────────
if ! curl -s -o /dev/null http://127.0.0.1:18899/x.sha256 2>/dev/null; then
  nohup python3 .local/bin/prisma-mirror.py > .local/logs/prisma-mirror.log 2>&1 &
  echo $! > .local/run/mirror.pid
  sleep 1
fi

# ── Web (Vite) ─────────────────────────────────────
if ! curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/ | grep -q 200; then
  setsid bash -c "cd apps/web && exec pnpm dev --host 0.0.0.0 --port 5173" > .local/logs/web.log 2>&1 < /dev/null &
  disown
  sleep 3
fi
echo "✓ Web :5173"

# ── API ─────────────────────────────────────
if ! curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/healthz | grep -q 200; then
  set -a; . ./.env; set +a
  setsid bash -c "cd apps/api && exec env \
    DATABASE_URL='$DATABASE_URL' REDIS_URL='$REDIS_URL' JWT_SECRET='$JWT_SECRET' \
    WINDELS_ENCRYPTION_KEY='$WINDELS_ENCRYPTION_KEY' \
    API_PORT=4000 API_HOST=0.0.0.0 API_CORS_ORIGIN=http://localhost:5173 \
    NODE_ENV=development LOG_LEVEL=info \
    BOOTSTRAP_SUPERADMIN_EMAIL=admin@windels.ai BOOTSTRAP_SUPERADMIN_PASSWORD='W1ndels!Admin#2026' \
    VAPID_PUBLIC_KEY='$VAPID_PUBLIC_KEY' VAPID_PRIVATE_KEY='$VAPID_PRIVATE_KEY' VAPID_SUBJECT='$VAPID_SUBJECT' \
    NODE_OPTIONS='--experimental-wasm-modules' \
    npx tsx src/index.ts" > .local/logs/api.log 2>&1 < /dev/null &
  disown
  sleep 12
fi
echo "✓ API :4000"

echo
echo "Web:      http://localhost:5173"
echo "API:      http://localhost:4000/api/v1  (healthz: http://localhost:4000/healthz)"
echo "Postgres: postgresql://windels:windels@localhost:5432/windels"
echo "Redis:    redis://localhost:6379"
echo
echo "Admin:    admin@windels.ai / W1ndels!Admin#2026"
