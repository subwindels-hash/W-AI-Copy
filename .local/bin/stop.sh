#!/usr/bin/env bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/.local/pg/bin:$ROOT/.local/redis/bin:$PATH"
pkill -f "tsx.*apps/api/src/index" 2>/dev/null || true
pkill -f "vite.*5173" 2>/dev/null || true
pkill -f "pnpm.*dev.*5173" 2>/dev/null || true
pkill -f "prisma-mirror" 2>/dev/null || true
[ -f .local/run/redis.pid ] && kill "$(cat .local/run/redis.pid)" 2>/dev/null || true
pg_ctl -D .local/data/pg stop 2>/dev/null || true
echo "stopped"
