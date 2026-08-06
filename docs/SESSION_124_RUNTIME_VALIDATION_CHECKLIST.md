# Session 124 Runtime Validation Checklist — AI Software Engineering Workforce

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 + `prisma generate` completed and the API booted,
> with a reachable `https://api.github.com`. Until every box is ticked and
> signed, Session 124 stays 🟡 VERIFIED (partial).

The unit suite proves the pipeline, the GitHub client (mocked transport), the
scanner (fixture directory) and memory against in-memory fakes; only a live
deployment proves the real GitHub API, real checkout scanning and the
Session 89 sweep behave as this module assumes.

## Route mounting

- [ ] `GET /api/v1/ai-engineering/roles` returns the 19-role catalog.
- [ ] Repos, tasks, memory, connections and command-center endpoints answer
      with their documented shapes; all 42 routes answer `401` without a
      token.
- [ ] The Session 26 `/api/v1/engineering` observability endpoints are
      unchanged.
- [ ] `/app/ai-engineering` loads with the sidebar entry; the command center
      renders with "not connected" states where no GitHub account is linked.

## The workforce & autonomous pipeline

- [ ] Add a repository with a `localPath`, assign a backend engineer to its
      team, create a task and run the pipeline:
      - [ ] status walks queued → planning → implementing → testing →
            reviewing → pr_ready → done;
      - [ ] steps carry `mode: "advisory"` labels and the test result says
            "not executed" when `execute` was not requested;
      - [ ] with `execute: true` and a real checkout, the test phase runs a
            real command and the result reflects its exit code; a failing
            run enters the fix loop;
      - [ ] a failed pipeline records a `lesson` memory entry with
            `source: "task"`.
- [ ] `POST /tasks/:id/pr` on a repo with no connection answers an honest
      "no GitHub connection" error; with a connection it opens a PR on the
      branch `ai-eng/<taskId>` and marks the task `pr_open`.

## GitHub engineering module (live API)

- [ ] Connect a real token: the connection verifies (`/user`,
      `/user/orgs`), reports `connected` with the org list, and **no** read
      response ever contains the full token (only `tokenMasked`).
- [ ] Connect a bad token: the connection is recorded as `failed` and still
      listed.
- [ ] With a connected repo, exercise the capabilities end to end:
      list/create repositories; read structure; list/create branches;
      commit files (blobs→tree→commit→refs); open, list, merge, approve and
      close a PR; create/update/close an issue; create a milestone; create a
      release and generate release notes; list workflows, trigger
      `workflow_dispatch`, list runs; read check-runs for a ref.
- [ ] An upstream 404/401 surfaces with its status and message — never a
      fabricated success.

## Repository intelligence

- [ ] Scan a real checkout: observed nodes (structure, dependencies,
      frameworks, Prisma models, routes, docs, CI, tests) and heuristic
      nodes (duplicates, dead exports, secrets, large files, TODOs) carry
      their `basis` and `confidence`.
- [ ] Re-scan replaces the graph (no duplicated nodes); `node_modules`,
      `.git` and build output are ignored.
- [ ] A scan of an empty directory reports zero nodes with repo status
      `ready` — not an error and not invented data.

## Engineering memory

- [ ] Create org-scoped and repo-scoped entries; filter by kind/tag/repo/
      search; remove them. Entries carry their `source` and the workforce
      never creates entries with `source: "user"` on its own.

## Command center & tenant isolation

- [ ] With a connected account, the command center's PR/issue/build/release
      counts reflect the connected repos; with none, they show 0 with the
      note explaining why (not "all is well").
- [ ] `KEYS aew:*` with a live Session 89 sweep run: every key conforms
      (org segment straight after `aew:`) and no finding is reported for the
      `aew` namespace.
- [ ] Two organizations: repos, tasks, memory and connections are fully
      isolated.
