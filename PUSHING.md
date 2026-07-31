# Saving this work to GitHub — pick any ONE path

**Repo:** `github.com/subwindels-hash/windels` · **Branch:** `arena/019faafb-windels`
The work to push: commit `37d5fe3` "Session 77B: social publishing pipeline" on top of the
remote tip (`dc70822`) — a clean fast-forward, no force-push, no conflicts.

---

## Option A — Agent pushes for you (fastest)
In this chat, paste a **fine-grained Personal Access Token**:
1. Create it at <https://github.com/settings/tokens?type=beta>
2. Resource owner: `subwindels-hash` · Repository access: **only** `subwindels-hash/windels`
3. Permissions → Repository → **Contents: Read and write**
4. Shortest expiry, then paste it here.

The agent will run `GITHUB_TOKEN=<pat> ./PUSH_TO_GITHUB.sh` — the token is used once
in-memory and never stored. Delete the token afterwards if you like.

⚠️ Note: this workspace environment rolls back git commits between sessions (plain
files survive). If you paste the token in a later session, just say "run PUSH_TO_GITHUB.sh"
— the script is restore-proof and rebuilds the commit before pushing.

## Option B — Push from your own machine (no token sharing)
Download **`windels-github-push.bundle`** from this workspace (15 MB, verified
`git bundle` containing the complete history), then on any machine logged into GitHub:

```bash
git clone windels-github-push.bundle windels-push
cd windels-push
git remote set-url origin https://github.com/subwindels-hash/windels.git
git push origin arena/019faafb-windels
```

## Option C — Arena ↔ GitHub sync
If your Arena session syncs this workspace to the `arena/019faafb-windels` branch
externally (the branch your zip originally came from), the current workspace tree
**already is** the state that sync will pick up — nothing further needed. You can
verify afterwards by comparing the branch's latest commit with `37d5fe3`.

---

### What the commit contains (verified)
| Area | Contents |
|---|---|
| `apps/api/src/mediaFactory/publishing/` | Real platform adapters (YouTube resumable, TikTok chunked+poll, Instagram container/rupload, Facebook multipart, X chunked + tweet, Pinterest pin), encrypted OAuth token store (PKCE for X, auto-refresh, revoke-on-failure), org-scoped job engine (backoff retry, scheduling, idempotency, audit, worker) |
| Routes | 11 zod-validated `/media-factory/publishing/*` endpoints (connect/oauth callback/publish/jobs/retry/cancel/audit) |
| Web | `publishingApi` client + Media Factory page: connect/disconnect, publish form with scheduling, live job board, audit feed, OAuth return handling |
| Tests | 29 unit tests (29/29 pass ~1s, fully offline) + Playwright spec `tests/e2e/mediaPublishing.spec.ts` |
| Docs | `.env.example` publishing section, `CONVENTIONS.md` 77B rules, `PROGRESS.md` shipping entry |

Secret hygiene verified: `.env`, `node_modules`, `dist`, `media-cache` are all excluded from the commit.
