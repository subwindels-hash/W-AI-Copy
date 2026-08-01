#!/usr/bin/env bash
# Generate the Prisma Client when binaries.prisma.sh is unreachable.
#
# WHY THIS EXISTS
# ---------------
# `prisma generate` insists on fetching the query/schema engine binaries from
# binaries.prisma.sh. In network-restricted environments (sandboxes, air-gapped
# CI, some corporate networks) that host is blocked, generation fails, and
# @prisma/client is never emitted. Every file that imports it then fails to
# typecheck — which is why `tsc` could not run end-to-end on this repo.
#
# WHAT IT DOES
# ------------
# Points Prisma at placeholder engine paths and runs `generate --no-engine`,
# which emits the TypeScript client (types + query builder) without needing the
# native binaries. This is enough to typecheck and build the whole API.
#
# IMPORTANT
# ---------
# The client produced this way is generated in "no engine" mode: it can be
# compiled against, but it cannot open a direct database connection at runtime.
# For a real deployment run the normal command on a network with access to
# binaries.prisma.sh (or a mirror via PRISMA_ENGINES_MIRROR):
#
#     pnpm db:generate
#
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../apps/api" && pwd)"
STUB_DIR="${TMPDIR:-/tmp}/windels-prisma-stub"

mkdir -p "$STUB_DIR"
touch "$STUB_DIR/schema-engine" "$STUB_DIR/libquery_engine.so.node"
chmod +x "$STUB_DIR/schema-engine"

cd "$API_DIR"
PRISMA_SCHEMA_ENGINE_BINARY="$STUB_DIR/schema-engine" \
PRISMA_QUERY_ENGINE_LIBRARY="$STUB_DIR/libquery_engine.so.node" \
PRISMA_CLI_QUERY_ENGINE_TYPE=library \
  npx prisma generate --no-engine

echo
echo "Prisma Client generated in no-engine mode (typecheck/build only)."
echo "For runtime DB access, run 'pnpm db:generate' with network access."
