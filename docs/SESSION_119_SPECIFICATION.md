# Session 119 — Prompt Templates: a contract, a renderer that reports its own holes, and usage numbers with a time dimension

**Module:** `promptTemplates` · **Status before:** PARTIAL (routes = 5, shared contract = none, tests = 1 suite / 5 tests)
**Status after:** COMPLETE (routes = 8, shared contract = 319 LOC, tests = 2 suites / 81 tests + 9 Playwright cases)
**Date:** 2026-08-06 · **Branch:** `arena/019fd6f3-win`

---

## 1. What already existed, and is untouched

Session 23 shipped five endpoints on `/api/v1/prompt-templates`:

| Endpoint | Status code | Access |
| --- | --- | --- |
| `GET /prompt-templates` | 200 | any authenticated member |
| `POST /prompt-templates` | 201 | any authenticated member |
| `POST /prompt-templates/:id/use` | 200 | any authenticated member |
| `PATCH /prompt-templates/:id` | 200 (`403` for built-ins) | any authenticated member |
| `DELETE /prompt-templates/:id` | 200 (`403` for built-ins) | any authenticated member |

Their paths, request bodies, status codes and response shapes are **unchanged**.
The route file was restructured (a sub-router at `/prompt-templates` became
literal paths declared on the same router), but the absolute paths and every
behaviour are identical — `tests/e2e/sessions*-*.spec.ts` and
`core-platform.test.ts` still hit `GET /prompt-templates` and pass.
`seedBuiltInTemplates`, the six built-ins, the lazy per-org seeding, the
`usageCount` counter and the org-scoped lookup rules are all intact.
**Nothing was removed or rewritten away.**

## 2. What was wrong

This module was functional but thin, and three of its behaviours were defects
in the direction of silently producing a broken prompt.

| Defect | Consequence before Session 119 |
| --- | --- |
| **`{{var \| default}}` with a space around the pipe leaked the raw placeholder.** The Session 23 pattern `\{\{\s*(\w+)(?:\|([^}]*))?\s*\}\}` required the pipe immediately after the variable name. | A template written as `Tone: {{tone \| professional}}` — the form a human naturally types — rendered the literal text `{{tone | professional}}` into the prompt sent to the model, with the default ignored. |
| **A missing variable was substituted silently.** `vars[key] ?? def ?? ""` replaced `{{var}}` with an empty string and the response said nothing about it. | `Translate this to {{lang}}: …` with no `lang` value produced a prompt with a silent gap, indistinguishable from a complete one. There was no way for the console to warn the user. |
| **A check-then-act race answered 500 instead of 404.** Every mutation looked the row up org-scoped (`findFirst`) and then mutated with `where: { id }`. | If the row vanished between the two calls (another request deleted it), Prisma raised P2025, which escaped the handler as a 500. The same race existed in the usage-counter increment inside `useTemplate`. |
| **No way to fetch a single template.** | The client could only list; the detail view had to re-fetch the whole library and filter client-side. |
| **No correction path for built-ins.** Built-ins cannot be edited or deleted (by design), but there was also no way to copy one into an editable template. | A user who wanted to adapt "Draft an email" had to retype it from scratch. |
| **`usageCount` had no time dimension.** | Nothing could answer "which templates were used this week", "how many times in the last 30 days", or "what is most-used right now". |
| **Icon length was counted in UTF-16 units.** `icon: z.string().max(8)` rejected multi-codepoint emoji: 👨‍👩‍👧‍👦 is 11 units but one 4-codepoint glyph. | A single family emoji was refused as "too long" while being visually one character. |
| **No shared contract.** The API declared its own Zod schemas inside the service file; the web client redeclared every shape by hand. | The two sides could drift without a compiler noticing. |

## 3. What Session 119 adds

### 3.1 Shared contract — `packages/shared/src/promptTemplates.ts` (new, 319 LOC)

The module's first contract, exported from `packages/shared/src/index.ts`:

- **Zod schemas** (one definition for API + web): `PromptTemplateCreateSchema`,
  `PromptTemplateUpdateSchema` (≥ 1 field required), `PromptTemplateIdParamSchema`
  (cuid), `PromptTemplateListQuerySchema` (`category`, `q`, `limit` ≤ 100),
  `PromptTemplateUseBodySchema`, `PromptTemplateDuplicateSchema`,
  `PromptTemplateStatsQuerySchema` (1–90 days, default 7).
- **Types**: `PromptTemplate`, `PromptTemplateUseResult` (now carries
  `unresolved: string[]`), `PromptTemplateStats`, `PromptTemplateDailyUses`,
  `PromptTemplateTopTemplate`.
- **Pure helpers**, unit-tested on both sides of the wire:
  - `extractTemplateVars(content)` — ordered, deduplicated variable names;
  - `extractTemplateDefaults(content)` — declared defaults by name;
  - `renderPromptTemplate(content, vars)` → `{ rendered, missing, usedDefaults }`
    — the fixed renderer (whitespace around the pipe now resolves; holes are
    reported, never hidden);
  - `promptTemplateSharePercent` — **floored**, `null` on an empty denominator;
  - `promptTemplateAvgPerDay` — floored to 2 decimals, `null` on 0 days;
  - `utcDayOf` / `utcDayBefore` — UTC calendar bucketing, so a server
    timezone choice cannot shift a use into another day.

The Session 23 service still re-exports `CreateTemplateSchema` /
`UpdateTemplateSchema` under their old names, so any importer keeps compiling.

### 3.2 Service — fixes to `promptTemplates.service.ts` (Session 23 code kept)

- `useTemplate` now renders through the shared pure function: `{{var | default}}`
  resolves, and the response gains `unresolved: string[]` — the variables that
  were neither supplied nor defaulted (the empty-string substitution itself is
  Session 23's pinned behaviour and is unchanged). The durable `usageCount`
  increment is unchanged; a P2025 on it now maps to 404.
- `updateTemplate` / `deleteTemplate` map P2025 → `AppError.notFound` instead
  of letting a 500 escape.
- New exports (additive): `getTemplate` (single fetch, org-scoped),
  `duplicateTemplate` (the correction path for built-ins — the copy is a
  normal editable user template, `isBuiltIn: false`, title `"<original> (copy)"`
  truncated to 200 chars, or an explicit override title), and
  `listTemplates(userId, category?, { q?, limit? })` — case-insensitive
  substring search over title/content/description (labelled as substring
  search, not relevance), and a 1–100 result cap. The old two-argument call
  keeps working.

### 3.3 Service — the usage ledger — `promptTemplatesUsage.service.ts` (new)

An org-scoped, **best-effort** event ledger in Redis that gives `usageCount`
its time dimension:

| Key | Shape | Contents |
| --- | --- | --- |
| `pt:since:<org>` | string, set with `NX` once | the true ledger start (immune to the event-list cap) |
| `pt:use:<org>` | list, capped at 500, newest first | `{templateId, userId, at}` events |
| `pt:recent:<org>` | sorted set | templateId → last-used epoch ms |
| `pt:day:<org>:<YYYY-MM-DD>` | hash, TTL 92 d (refreshed per write) | templateId → uses that UTC day |

The prefix is `pt:` and **not** a bare `pt` catalog entry: `pt:use:<org>` has
the org in the *second* segment, and a shorter entry would make the Session 89
sweep read the literal `use` as an organization id (the same constraint that
made Session 118 choose `opx:` over `opex:`). All four namespaces are
registered in `TI_NAMESPACE_CATALOG` as org-scoped.

`recordTemplateUse` never throws: a Redis outage must not block a template
use, and the durable `usageCount` increment is the write that matters.

**Statistics — `GET /prompt-templates/stats?days=7|30`** returns
`PromptTemplateStats`, which never mixes the two sources and never invents a
zero:

- *Database side (durable, measured):* `totalTemplates`, `builtInTemplates`,
  `userTemplates`, `totalUses` (sum of `usageCount`).
- *Ledger side (best-effort):* `ledgerAvailable` (false on a Redis read
  failure — the window fields are then empty/`null`, never 0),
  `ledgerStart` (from the NX marker, so the cap-500 list cannot corrupt it),
  `usesInWindow` (sum of the window's day buckets), `distinctUseDays`,
  `ledgerCoveredDays` (calendar days from `max(ledgerStart, window start)` to
  today — days before the ledger began are **not** counted as zero-use days),
  `avgUsesPerDay` (floored, `null` when the ledger covers no day), `daily`
  (only days with recorded events), `topTemplates` / `recentTemplates`
  (titles resolve from the DB; a template deleted after its uses were recorded
  keeps id + count with `title: null` — the title is not invented), and a
  static `note` stating what the numbers are.

### 3.4 Routes — `apps/api/src/http/routes/promptTemplates.ts`

The five Session 23 endpoints keep their exact paths and shapes (the
sub-router was replaced by literal declarations on the same router — same
absolute paths, and the module's endpoints are now visible to the inventory
audit, which previously reported `endpoints: []`). Added, all behind
`authenticate`:

- `GET /prompt-templates/stats` (declared before `/:id` so the literal path is
  not captured by the cuid-validated parameter),
- `GET /prompt-templates/:id`,
- `POST /prompt-templates/:id/duplicate` → 201.

### 3.5 Web — typed client + first console

`apps/web/src/lib/promptTemplates.ts` now imports every shape from the shared
contract (the old hand-rolled interfaces are replaced by re-exports; the five
original method names and paths are unchanged) and adds `get`, `stats`,
`duplicate`.

New `apps/web/src/pages/admin/PromptTemplatesPage.tsx`, routed at
`/app/prompt-templates` with a sidebar entry ("Prompt Templates"):

- **Library** — substring search + category filter, create/edit modal
  (variables extracted live from the content), use/render modal that
  **pre-fills declared defaults, previews the rendered prompt, and shows an
  amber "Unresolved" warning listing the holes**; duplicate, edit and delete
  controls (edit/delete hidden for built-ins, which the API refuses).
- **Usage** — 7/30-day window selector; null-aware stat cards (`avgUsesPerDay`
  prints "not recorded", never `0`); top templates; recently used; a daily
  bar chart where **a day with no recorded event is absent, not a zero bar**;
  `ledgerStart` shown so pre-ledger days cannot be misread; a
  `ledgerAvailable: false` banner on a failed ledger read; the basis note.

### 3.6 Tenant isolation

`TI_NAMESPACE_CATALOG` gains four org-scoped namespaces: `pt:since`, `pt:use`,
`pt:recent`, `pt:day` — each with the org id in the segment straight after the
prefix, with a comment explaining why a bare `pt` entry must never be added.

## 4. Tests

- `apps/api/src/promptTemplates/promptTemplates.test.ts` — Session 23's suite,
  untouched (5 tests, all passing against the changed service).
- `apps/api/src/promptTemplates/promptTemplates.completion.test.ts` — **new,
  76 tests** in 10 groups:
  - shared renderer: whitespace-around-pipe fix, defaults, missing reporting
    + dedupe, malformed placeholders left raw, empty-string-value semantics;
  - `extractTemplateVars` / `extractTemplateDefaults`;
  - floored rates, `null` denominators, UTC day helpers;
  - Zod: category default, **code-point icon counting (the family emoji that
    Session 23 rejected now parses)**, limits, update ≥ 1 field, stats window,
    cuid params;
  - CRUD: lazy per-org seeding with org-scoped rows, category/q/limit filters,
    get/update/delete/duplicate isolation, built-in protection, copy-title
    truncation, duplicate-into-editable;
  - the P2025 race: update/delete/use map it to 404 (spies installed on the
    exact mocked prisma instance), non-P2025 errors propagate;
  - ledger writes: NX marker, event payload, zset, day bucket, 500-cap,
    TTL refresh, **a failing Redis never breaks the use path**;
  - statistics: honest fresh-org shape (`avgUsesPerDay: null`, `daily: []`),
    window math with deterministic `now` injection, pre-window uses excluded,
    top/recent ordering, **deleted templates keep id+count with `title:
    null`**, org isolation, `ledgerAvailable: false` on failure, lifetime
    totals from `usageCount`.
- `tests/e2e/promptTemplates.spec.ts` — **new, 9 Playwright cases** against a
  live API: anonymous refusal on all paths; the Session 23 list shape; a full
  create → get → patch → delete round-trip; render with variables, defaults
  and `unresolved`; stats shape + a recorded use appearing in the window;
  built-in 403s and the duplicate correction path; category/search filters;
  400 on a non-cuid id.

**Full suite: 1618 passing / 51 skipped / 111 files** (baseline was
1542 / 51 / 110). Typecheck: `apps/api` clean (excluding environment-only
`@prisma/client` generated errors) and `apps/web` clean.

## 5. Honesty notes

- The ledger is **best-effort and says so**: `ledgerAvailable: false` on a
  Redis failure, and the note explains that window counts come from the
  ledger, lifetime totals from the database.
- Days before `ledgerStart` are never reported as zero-use days; `daily`
  contains only days with recorded events; `avgUsesPerDay` divides by the
  days the ledger actually covers.
- Rates are floored; an empty denominator is `null`.
- A deleted template's past uses stay in the window aggregates with
  `title: null` — no invented title, no dropped history.
- No `Math.random` anywhere in read or write paths; the ledger ids and event
  payloads carry no fabricated fields.

## 6. Runtime validation

Live PostgreSQL 17 + Redis 8 + Prisma generation is not reachable in this
sandbox, so this session ends **🟡 VERIFIED (partial)** and ships
`docs/SESSION_119_RUNTIME_VALIDATION_CHECKLIST.md` for the target
environment.

## 7. Files touched

| File | Change |
| --- | --- |
| `packages/shared/src/promptTemplates.ts` | **new** — contract, Zod, pure helpers |
| `packages/shared/src/index.ts` | export added |
| `apps/api/src/promptTemplates/promptTemplates.service.ts` | fixes + new CRUD exports (behaviour preserved) |
| `apps/api/src/promptTemplates/promptTemplatesUsage.service.ts` | **new** — ledger + stats |
| `apps/api/src/http/routes/promptTemplates.ts` | same 5 endpoints + 3 new; literal path declarations |
| `apps/api/src/tenantIsolation/tenantIsolation.service.ts` | `pt:*` namespaces catalogued |
| `apps/api/src/promptTemplates/promptTemplates.completion.test.ts` | **new** — 76 tests |
| `apps/web/src/lib/promptTemplates.ts` | shared-contract types + `get`/`stats`/`duplicate` |
| `apps/web/src/pages/admin/PromptTemplatesPage.tsx` | **new** — console |
| `apps/web/src/router.tsx` | `/app/prompt-templates` |
| `apps/web/src/app/Sidebar.tsx` | "Prompt Templates" entry |
| `tests/e2e/promptTemplates.spec.ts` | **new** — 9 cases |
| `audit/module-inventory.json` | regenerated |
| `PROGRESS.md`, `docs/CHANGELOG.md`, `CONVENTIONS.md`, `project-understanding.md` | updated |
