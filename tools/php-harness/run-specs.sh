#!/usr/bin/env bash
#
# Run every parity spec against the harness, restarting the PHP server between
# them.
#
#   bash tools/php-harness/run-specs.sh [port] [dbUser] [dbPass] [dbName]
#
# Why the restart: the harness serves every request from ONE php-wasm
# instance, shared for the life of the process. Run enough requests through it
# — several specs' worth of registrations, inserts and validation failures —
# and the instance aborts ("Aborted()" in the server log), after which every
# request on that port hangs instead of failing. Restarting between specs keeps
# each run short enough that the abort never lands mid-assertion, and it makes
# a failure attributable to the spec that caused it rather than to whatever ran
# before.
set -uo pipefail

PORT="${1:-8082}"
DBUSER="${2:-windels}"
DBPASS="${3:-windels}"
DBNAME="${4:-wnd_final_a}"
DBHOST="${5:-127.0.0.1}"
DBPORT="${6:-3306}"

PG="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO="$( cd "$PG/../.." && pwd )"
DOCROOT="$HOME/_tools/deploy/final-a"
BASE="http://localhost:${PORT}"
IDENT="owner@windels.example"
PASS="Owner!Pass#2026"
SEC="$(grep '^VP_AUTH_SECRET=' "$DOCROOT/.env" 2>/dev/null | cut -d= -f2-)"

export NODE_PATH="$HOME/_tools/pgtest/node_modules"

stop_server() {
  pgrep -f 'node [s]erver.mjs' 2>/dev/null | grep -vw "$$" | xargs -r kill 2>/dev/null
  sleep 1
}

# The server runs from the harness working copy, not from the repository:
# that is where the node modules (php-wasm, mysql2) were installed.
SERVER_DIR="$HOME/_tools/pgtest"
start_server() {
  ( cd "$SERVER_DIR" && nohup node server.mjs "$PORT" "$DOCROOT" 8.2 > "/tmp/php-${PORT}.log" 2>&1 & echo $! > "/tmp/php-${PORT}.pid" )
  for _ in $(seq 1 40); do
    (exec 3<>/dev/tcp/127.0.0.1/"$PORT") 2>/dev/null && return 0
    sleep 1
  done
  echo "!! the php server did not come up on ${PORT}" >&2
  return 1
}

run_spec() {
  local name="$1"; shift
  stop_server
  start_server || return 1
  printf '%-18s ' "$name"
  node "$@" 2>&1 | tail -2 | tr '\n' ' '
  echo
}

run_spec kernel             "$REPO/tests/php-api/kernel.spec.mjs"             "$BASE" "$IDENT" "$PASS" "$DBUSER" "$DBPASS" "$DBNAME" "$DBHOST" "$DBPORT"
run_spec tenant-isolation   "$REPO/tests/php-api/tenant-isolation-usage.spec.mjs" "$BASE" "$IDENT" "$PASS" "$DBUSER" "$DBPASS" "$DBNAME" "$DBHOST" "$DBPORT"
run_spec security           "$REPO/tests/php-api/security.spec.mjs"           "$BASE" "$IDENT" "$PASS" "$DBUSER" "$DBPASS" "$DBNAME" "$DBHOST" "$DBPORT"
run_spec platform           "$REPO/tests/php-api/platform.spec.mjs"           "$BASE" "$IDENT" "$PASS" "$DBUSER" "$DBPASS" "$DBNAME" "$DBHOST" "$DBPORT" "$SEC"
run_spec moduleCenter       "$REPO/tests/php-api/moduleCenter.spec.mjs"       "$BASE" "$IDENT" "$PASS" "$DBUSER" "$DBPASS" "$DBNAME" "$DBHOST" "$DBPORT" "$HOME/_tools/pgtest/module-publisher.json"
run_spec moduleRuntime      "$REPO/tests/php-api/moduleRuntime.spec.mjs"      "$BASE" "$IDENT" "$PASS" "$DBUSER" "$DBPASS" "$DBNAME" "$DBHOST" "$DBPORT"
run_spec autonomous         "$REPO/tests/php-api/autonomous.spec.mjs"         "$BASE" "$IDENT" "$PASS" "$DBUSER" "$DBPASS" "$DBNAME" "$DBHOST" "$DBPORT"
run_spec benchmarks         "$REPO/tests/php-api/benchmarks.spec.mjs"         "$BASE" "$IDENT" "$PASS" "$DBUSER" "$DBPASS" "$DBNAME" "$DBHOST" "$DBPORT"
run_spec memoryEvolution    "$REPO/tests/php-api/memoryEvolution.spec.mjs"    "$BASE" "$IDENT" "$PASS" "$DBUSER" "$DBPASS" "$DBNAME" "$DBHOST" "$DBPORT"
run_spec acceptance         "$PG/acceptance.mjs"                              "$BASE" "$IDENT" "$PASS" "$DOCROOT"
