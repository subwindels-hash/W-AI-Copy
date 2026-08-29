# GitHub connector

Users connect their own GitHub account from **Dashboard → GitHub** (`/app/github`).
This is separate from the org-level workforce tokens in AI Engineering.

## What you need

### Option A — GitHub OAuth App

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App.
2. Set the authorization callback URL to:

   `{API origin}/api/v1/github/callback`

   Example: `http://localhost:4000/api/v1/github/callback`

3. Provide credentials in one of these places (dashboard values override env when enabled):

   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `GITHUB_REDIRECT_URI`
   - Super Admin → Site control → APIs → GitHub OAuth Client ID / Client Secret

4. Scopes requested: `read:user`, `user:email`, `repo`.

A passing configuration check means the values are **present**, not that GitHub has accepted them.

### Option B — Personal access token

GitHub → Settings → Developer settings → Personal access tokens (classic or fine-grained).
Grant at least the same scopes. WINDELS calls `GET https://api.github.com/user` before storing the token.

## Storage and honesty

- Tokens are AES-256-GCM encrypted in Redis (`ghc:conn:<org>:<userId>`).
- API and UI return a masked token only.
- If GitHub rejects the credential, connect fails. Nothing is invented.

Workforce GitHub (repositories, PRs, Actions) remains under `/app/ai-engineering`.
