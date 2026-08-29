#!/usr/bin/env bash
# One-command push of the Windels AI OS project to GitHub.
# Defaults: https://github.com/subwindels-hash/WIN.git, branch main.
#
# Usage:
#   GITHUB_TOKEN=<pat> ./PUSH_TO_GITHUB.sh     ← token used once, never stored
#   REPO=... BRANCH=... ./PUSH_TO_GITHUB.sh    ← custom destination
#
# Restore-proof: the S77B overlay (~/s77-overlay.tar) is re-applied before
# committing, so the script can be re-run any number of times. The commit is
# placed ON TOP of the destination branch tip (init commit included) — a
# fast-forward, never a force-push.
set -euo pipefail
cd "$(dirname "$0")"

REPO="${REPO:-https://github.com/subwindels-hash/WIN.git}"
BRANCH="${BRANCH:-main}"
OVERLAY="$HOME/s77-overlay.tar"

git config user.name  "${GIT_AUTHOR_NAME:-subwindels-hash}"
git config user.email "${GIT_AUTHOR_EMAIL:-subwindels@gmail.com}"

git remote remove dest 2>/dev/null || true
git remote add dest "$REPO"

echo "→ fetching dest/$BRANCH…"
if git fetch dest "$BRANCH" 2>/dev/null; then
  git reset "dest/$BRANCH" >/dev/null   # move HEAD to remote tip, keep working tree
else
  echo "  (new or unreachable repo — committing onto local history)"
fi
[ -f "$OVERLAY" ] && tar -xf "$OVERLAY" && echo "→ overlay applied ($(tar -tf "$OVERLAY" | wc -l) entries)"

git add -A
if git diff --cached --quiet; then
  echo "→ nothing new to commit (already up to date)"
else
  git commit -m "WINDELS AI OS (sessions 1–88) + Session 77B social publishing pipeline

Full project tree plus the S77B publishing completion: real per-platform upload
adapters (YouTube/TikTok/Instagram/Facebook/X/Pinterest), encrypted OAuth token
store with PKCE + auto-refresh, org-scoped publish job engine (retry/backoff,
scheduling, idempotency, audit trail, boot worker), 11 validated endpoints,
Media Factory publish UI, 29/29 unit tests + Playwright spec." >/dev/null
  echo "→ committed $(git rev-parse --short HEAD)"
fi

if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "→ pushing with one-shot token (not stored)…"
  HOSTPATH="${REPO#https://}"
  git push "https://x-access-token:${GITHUB_TOKEN}@${HOSTPATH}" "HEAD:$BRANCH"
else
  echo "→ pushing with configured git credentials…"
  git push dest "HEAD:$BRANCH"
fi
echo "✅ Pushed to $REPO ($BRANCH)"
