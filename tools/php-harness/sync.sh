#!/usr/bin/env bash
#
# Push the repository copy of php/ into the harness docroot WITHOUT destroying
# the harness-only state that lives there (.env, generated keys, the
# php-wasm workarounds).
#
#   bash tools/php-harness/sync.sh [docroot]
#
# A plain `cp -r php/ <docroot>` overwrites .env (losing VP_AUTH_SECRET and the
# Module Center publisher key) and reverts the php-wasm patches, which is why
# this exists. It:
#   1. copies php/ over the docroot, excluding .env and application/config/.secrets.php
#   2. re-applies the php-wasm workarounds
#   3. leaves .env untouched
#
set -euo pipefail

REPO="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )"
PG="$REPO/tools/php-harness"
DOCROOT="${1:-$HOME/_tools/deploy/final-a}"

[ -d "$DOCROOT" ] || { echo "no docroot at $DOCROOT — run bootstrap.sh first" >&2; exit 1; }
[ -f "$DOCROOT/.env" ] || { echo "$DOCROOT/.env is missing — run bootstrap.sh first" >&2; exit 1; }

# php/.env must never be committed (see php/.gitignore), so a plain copy is
# safe — but guard it anyway: clobbering the generated .env would rotate the
# auth secret out from under every issued token.
if [ -f "$REPO/php/.env" ]; then
  echo "!! $REPO/php/.env exists and would overwrite the docroot .env — refusing" >&2
  exit 1
fi
cp -a "$REPO/php/." "$DOCROOT/"

echo "== re-applying php-wasm workarounds"
( cd "$PG" && node apply-harness-workarounds.mjs "$DOCROOT" )

echo "== done"
