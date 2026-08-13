#!/usr/bin/env bash
#
# Activate the CI pipeline.
#
# The workflow is committed to .github/workflows-staged/ instead of
# .github/workflows/ because the automation account that authored it is a
# GitHub App without `workflows` permission: GitHub rejects any push that
# creates or updates a file under .github/workflows/ from such a token, with
#
#   refusing to allow a GitHub App to create or update workflow
#   `.github/workflows/ci.yml` without `workflows` permission
#
# The rejection is atomic — it fails the entire push, not just that file — so
# staging the workflow one directory across is what allows the rest of the work
# to land at all.
#
# Run this from an account or token that does have the permission (a normal
# user push, or a PAT with the `workflow` scope). It moves the workflows into
# place and commits them; CI is live from the next push.

set -euo pipefail

cd "$(dirname "$0")/.."

STAGED=".github/workflows-staged"
LIVE=".github/workflows"

if [ ! -d "$STAGED" ]; then
  echo "Nothing to install: $STAGED does not exist."
  echo "The workflows are probably already active in $LIVE."
  exit 0
fi

mkdir -p "$LIVE"
count=0
for f in "$STAGED"/*.yml "$STAGED"/*.yaml; do
  [ -e "$f" ] || continue
  git mv -f "$f" "$LIVE/$(basename "$f")" 2>/dev/null || mv -f "$f" "$LIVE/$(basename "$f")"
  echo "  installed $(basename "$f")"
  count=$((count + 1))
done

if [ "$count" -eq 0 ]; then
  echo "No workflow files found in $STAGED."
  exit 0
fi

rmdir "$STAGED" 2>/dev/null || true

git add -A "$LIVE" "$STAGED" 2>/dev/null || git add -A "$LIVE"

cat <<'EOF'

Workflows staged for commit. Finish with:

    git commit -m "ci: activate CI workflows"
    git push

If the push is rejected with "without `workflows` permission", the token still
lacks the scope — use a PAT with `workflow`, or push as a normal user.
EOF
