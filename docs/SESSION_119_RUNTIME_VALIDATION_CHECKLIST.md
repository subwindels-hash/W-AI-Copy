# Session 119 Runtime Validation Checklist — Prompt Templates completion

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted.
> Until every box is ticked and signed, Session 119 stays 🟡 VERIFIED (partial).

The unit suite proves the renderer, the ledger arithmetic and the isolation
rules against in-memory Prisma and KV fakes; only a live deployment proves the
`PromptTemplate` table, the `pt:*` keyspace and the Session 89 sweep behave as
this module assumes.

## Route mounting and backwards compatibility

- [ ] All five Session 23 endpoints answer on their original paths with their
      original payload shapes: `GET /prompt-templates`, `POST /prompt-templates`
      (201), `POST /prompt-templates/:id/use`, `PATCH /prompt-templates/:id`,
      `DELETE /prompt-templates/:id`.
- [ ] `POST /prompt-templates` still returns **201** with the Session 23
      template shape (`id`, `title`, `description`, `category`, `icon`,
      `content`, `isBuiltIn`, `usageCount`, `createdById`, `createdAt`,
      `updatedAt`) and the create/list responses still carry
      `meta: { requestId }` exactly as before.
- [ ] `PATCH`/`DELETE` on a built-in template still answer `403` with the
      Session 23 message.
- [ ] `POST /prompt-templates/:id/use` still returns `{ template, rendered }`
      — the new `unresolved` field is additive.
- [ ] All eight paths answer `401` without a token.
- [ ] An unknown path under `/prompt-templates` returns `404`, not a stack
      trace.
- [ ] `GET /prompt-templates/stats` is answered by the stats handler and not
      captured by `GET /prompt-templates/:id` (a `cuid()` id still resolves to
      the detail handler; the literal `stats` must never 400 as a bad id).
- [ ] A non-cuid id answers `400` (validation), not `500`.

## The defects this session fixes

- [ ] Create a template whose content contains `{{tone | professional}}`
      (spaces around the pipe) and call `POST /:id/use` with no variables.
      Confirm `rendered` contains `professional` and `unresolved` is `[]`.
      *(Before this session the raw placeholder leaked into the prompt.)*
- [ ] Call `POST /:id/use` with `{}` against content `[{{missing}}]`. Confirm
      `rendered` is `[]` **and** `unresolved` is `["missing"]`.
- [ ] Delete a template in one request while racing `PATCH`/`DELETE`/`use`
      against the same id from another. Confirm the loser answers **404**,
      never 500. *(Before this session the check-then-act race let Prisma's
      P2025 escape as a 500.)*
- [ ] Create a template with the family emoji 👨‍👩‍👧‍👦 as its icon — it must be
      accepted. *(Before this session `.max(8)` counted UTF-16 units and
      rejected it.)*

## The usage ledger (Redis)

- [ ] Use a template twice; confirm the keyspace shows the org-scoped keys
      with the org id in the **second** segment:
      - [ ] `pt:since:<org>` — one string, set once, never overwritten;
      - [ ] `pt:use:<org>` — a **list** (not a JSON blob) capped at 500 events;
      - [ ] `pt:recent:<org>` — a sorted set with the template id;
      - [ ] `pt:day:<org>:<YYYY-MM-DD>` — a hash `{templateId: count}` with a
            TTL of 92 days refreshed on each write.
- [ ] Fire 600 uses; confirm `pt:use:<org>` holds exactly 500 newest events
      and `pt:since:<org>` still holds the **first** event's timestamp.
- [ ] `KEYS pt:*` with a live Session 89 sweep run: every `pt:` key is
      conforming (org segment present straight after the prefix) and no
      finding is reported for the four new namespaces.
- [ ] Stop Redis, use a template: the use succeeds (200, `usageCount`
      incremented in Postgres) — the ledger is best-effort.
- [ ] Restart Redis; `GET /prompt-templates/stats` answers
      `ledgerAvailable: false` with empty window fields (not zeros) while
      `totalUses` (the database counter) is still reported.

## Statistics honesty

- [ ] Fresh organization with no uses: `GET /prompt-templates/stats?days=7`
      returns `totalTemplates` ≥ 6 (built-ins), `totalUses: 0`,
      `ledgerStart: null`, `avgUsesPerDay: null`, `daily: []`,
      `topTemplates: []` — and the console shows "not recorded", never `0`.
- [ ] Record a use today and one 10 days ago. With `days=7`, `usesInWindow`
      counts only the today use; `ledgerStart` still reports the 10-day-old
      timestamp; `ledgerCoveredDays` is 7, not 11.
- [ ] With 3 uses over 2 covered days, `avgUsesPerDay` is `1.5` (floored to
      2 decimals) — and with 1 use over 7 covered days it is `0.14`, **never
      rounded up**.
- [ ] Delete a template that has recorded uses: the window aggregates keep
      its id and count with `title: null`; no invented title appears.
- [ ] Two organizations: uses recorded by org A never appear in org B's
      stats, and `pt:*` keys for A and B are separate.

## Console (web)

- [ ] `/app/prompt-templates` loads the library with the built-in set and the
      sidebar entry visible.
- [ ] Creating a template, editing it, duplicating a built-in (the copy is
      editable), and deleting a user template all round-trip through the API.
- [ ] The Use dialog pre-fills defaults, previews the render, and shows the
      amber **Unresolved** warning listing holes.
- [ ] The Usage tab shows "not recorded" for a null average, the ledger-start
      line, and no zero bars for days without recorded events.
- [ ] A non-administrator sees the same read surface; write controls behave
      per API rules (built-ins show Duplicate, not Edit/Delete).
