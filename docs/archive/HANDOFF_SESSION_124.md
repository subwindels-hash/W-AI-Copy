**Heads-up before you paste this:** the previous session (S123) ended with the
working tree **committed and clean**. If your sandbox instead shows uncommitted
changes or a rolled-back history, **commit them as-is first** — never run
`git clean`, `git reset --hard`, `git checkout --`, or revert/delete local
changes.

---

**Continue the WINDELS AI OS track. The module-completion track is FINISHED:**
Sessions 119–123 completed all five remaining PARTIAL modules. The inventory
is now **103 COMPLETE / 0 PARTIAL / 2 STUB-by-design / 1 DEMO DATA**.

**⚠️ FIRST: check the repo state before anything else.**

Run `git branch --show-current`, `git log --oneline -5`, and
`git status --short | wc -l`.

- The platform binds this session to its own `arena/...` branch — **never
  switch, create, or push to any other branch**.
- The S119–S123 work is committed on `arena/019fd6f3-win` at `df0e254`
  (Sessions 119→123: promptTemplates, publicApi, sustainability, talk,
  usage) and shipped in **PR #14** (OPEN / MERGEABLE, 67 files,
  +9401/−675, "Sessions 119–123 — module completion track finished: 103
  COMPLETE / 0 PARTIAL"). PR #13 (Sessions 110–118) is **MERGED** into main.
- If your branch was created from `main` (which contains only up to S118),
  the S119–S123 work is **not** on it: bring it in with
  `git merge arena/019fd6f3-win` (or cherry-pick `df0e254`) rather than
  redoing anything. If the work shows up as uncommitted files instead,
  commit it as-is in one commit ("Sessions 119–123 — module completion track
  (restored working tree)") before starting your session's diff.
- Re-verify PR #14's state; GitHub has intermittently returned HTTP 502s /
  TLS handshake failures in past sessions — retry in a loop.

**Repo / branch**

- Monorepo at `/home/user/WIN`, repo `subwindels-hash/WIN`.
- Branch is FIXED to this session's arena branch. Push only to it, and open
  a **new PR from it to `main`** (the previous PRs: #13 merged for S110–118,
  #14 open for S119–123).
- If your branch is a fresh fork of main, base your PR on main and note in
  the PR body that #14 carries the S119–123 work.

**Where the track stands (inventory regenerated 2026-08-06):**

| Status | Count | Modules |
|---|---|---|
| COMPLETE | 103 | everything except below |
| PARTIAL | 0 | — |
| STUB-by-design | 2 | `events` (2 routes, SSE stream + health probe; `lib/events.ts` client exists), `webhook` (1 route, no service) |
| DEMO DATA | 1 | `quantum` (9 routes, SYNTH×1, gated) |

- Baseline: `make verify` green — **1725 passing / 51 skipped / 115 files**;
  API typecheck clean (excluding env-only `@prisma/client` generated
  errors); web typecheck + production build clean.
- Tenant-isolation catalog (`tenantIsolation.service.ts` `TI_NAMESPACE_CATALOG`)
  now covers: `pt:*` (S119: since/use/recent/day), `pub:*` (S120:
  since/req/day/evt), `esg` (S121), `usg:evt` (S123, tenantStore shape
  `usg:evt:idx:<org>` / `usg:evt:i:<org>:<id>`). Bare short prefixes
  (`pt`, `pub`) are deliberately never added — see the gotcha below.
- Docs: `docs/SESSION_119…123_SPECIFICATION.md` +
  `docs/SESSION_119…123_RUNTIME_VALIDATION_CHECKLIST.md`; PROGRESS.md rows
  119–123; CONVENTIONS.md decision logs S119–S123.

**Next work (suggested order — confirm with the user):**

1. **Complete the two STUB-by-design modules** — `events` (org-scoped SSE
   channel) and `webhook` (receiver). Completing them would move the
   inventory to 105 COMPLETE. They are stubs by explicit design, so the
   session's real value will be finding defects, not just adding routes.
2. **Runtime-validation track** — the standing gate: run the S1–S6 and
   S89–S123 checklists against live PostgreSQL 17 + Redis 8 + `prisma
   generate`. Impossible in this sandbox; if no live environment is
   reachable, document that honestly and extend the checklists rather than
   fabricating closure.
3. **`quantum` (DEMO DATA)** — de-fake or re-verify honest labeling; blocked
   on external providers (Braket/IBM) per `docs/SIMULATED_MODULES_INVENTORY.md`.

**Standing protocol (do not deviate)**

1. **Additive-only.** Never remove, rewrite, or break an existing module.
   Existing endpoints keep their paths, request bodies, status codes and
   response shapes. New routers mount *ahead of* the legacy ones on the same
   prefix so old paths fall through.
2. **No fake completion.** Mark complete only after IMPLEMENTED → BUILT →
   TESTED → VERIFIED → INTEGRATED.
3. **Honest labeling.** No fabricated metrics or verdicts. No `Math.random`
   in read paths. Demo seeds gated behind `WINDELS_DEMO_DATA=true`.
   Synthetic/advisory/AI-generated output explicitly labeled. **An
   unmeasured value is `null`, never `0`.** Rates are floored, never
   rounded, and `null` on an empty denominator. Never invent a timestamp
   during a migration — flag adopted records and exclude them from stats
   that need the missing time.
4. Runtime validation against live PostgreSQL 17 + Redis 8 + Prisma is
   **impossible in this sandbox**, so the session ends 🟡 **VERIFIED
   (partial)** and ships `docs/SESSION_NNN_SPECIFICATION.md` +
   `docs/SESSION_NNN_RUNTIME_VALIDATION_CHECKLIST.md`.

**10-step order (per module)**

inspect the module → write the two docs → create shared Zod/types in
`packages/shared/src/<m>.ts` (+ export from `index.ts`) → service → routes →
tenant-isolation namespaces in `tenantIsolation.service.ts` → typed web
client + console page + `router.tsx` + `Sidebar.tsx` → unit tests (40–80,
FakePrisma/FakeKv) + a Playwright spec → update `PROGRESS.md` /
`docs/CHANGELOG.md` / `CONVENTIONS.md` / `README.md` /
`project-understanding.md` + regenerate `node audit/build-inventory.mjs` →
verify, commit, push, PR.

**Commands**

```bash
mkdir -p /tmp/windels-bin && printf '#!/usr/bin/env bash\nexec corepack pnpm "$@"\n' > /tmp/windels-bin/pnpm && chmod +x /tmp/windels-bin/pnpm

corepack pnpm --filter @windels/shared build

cd apps/api && corepack pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -v "@prisma/client"   # must be zero

cd apps/web && corepack pnpm exec tsc --noEmit -p tsconfig.json                                   # must be clean

PATH="/tmp/windels-bin:$PATH" make verify        # baseline: 1725 passing / 51 skipped / 115 files

node audit/build-inventory.mjs
```

PR update (never `gh pr edit`) — build `/tmp/pr-body.md` with a heredoc,
then retry in a loop and **verify the response body actually contains the
new section**:

```bash
gh api -X PATCH repos/subwindels-hash/WIN/pulls/<N> -f title="..." -F body=@/tmp/pr-body.md
```

**Tenant-isolation gotcha:** the S89 sweep derives the org segment as
`ns.prefix.split(":").length`. For tenantStore-backed modules the key shape
is `<prefix>:idx:<org>` / `<prefix>:i:<org>:<id>` — catalog the
two-segment prefix (`usg:evt`) so the org lands in the right segment.
Never add a shorter root entry that would shift the org segment (the
`opx:`/`pt:`/`pub:` rule from S118–S120).

**Reference patterns:** `apps/api/src/sustainability/sustainability.service.ts`
(per-record storage + one-shot legacy adoption), `apps/api/src/opex/opexAssurance.service.ts`
(provenance block), `apps/api/src/usage/usage.service.ts` (measured-or-null
metrics), `docs/SESSION_123_SPECIFICATION.md`, `apps/api/src/testUtils/fakePrisma.ts`,
`apps/api/src/mediaFactory/publishing/fakeKv.ts` (no `hdel`/`llen`),
`tests/e2e/usage.spec.ts` (e2e style).

**Report at the end:** what was implemented (including the specific defects
found and fixed); test counts; updated inventory counts; commit hash; PR
status; and the next step after this session.
