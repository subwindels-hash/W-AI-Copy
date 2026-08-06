# Session 122 — Talk: real unread counts, same-organization members, a meeting lifecycle that cannot be resurrected, and the module's first shared contract

**Module:** `talk` · **Status before:** PARTIAL (routes = 23, shared contract = none, tests = 2 suites)
**Status after:** COMPLETE (routes = 23, shared contract = 340 LOC, tests = 3 suites + 1 e2e spec)
**Date:** 2026-08-06 · **Branch:** `arena/019fd6f3-win`

---

## 1. What already existed, and is untouched

Session 5–6 shipped 23 endpoints on `/api/v1/talk` (channels, DMs, messages, reactions, meetings, action items, available agents). Every path, request body, status code and response shape is **unchanged**. The two existing test suites (`services/talk.test.ts` — access control and messaging semantics — and `services/meeting.service.test.ts` — meeting/action-item org scoping) pass unchanged. The Talk UI (`TalkPage` + the `components/talk/*` pieces) keeps working. **Nothing was removed or rewritten away.**

## 2. What was wrong

| Defect | Consequence before Session 122 |
| --- | --- |
| **`unreadCount` was hardcoded `0`** in every channel payload (the code even said "computed live when needed" — it never was). The channel sidebar rendered the *total message count* as the badge. | Every channel read as "all caught up". The one number in the UI that should tell you where your attention is owed was a lie, and the badge next to it showed something else entirely. |
| **`createChannel` / DMs / `addChannelMembers` accepted users and agents from ANY organization.** `peerUserId`, `memberUserIds` and `memberAgentIds` were never checked against the caller's org. | An org A channel could gain a member from org B who could **never access it** (every lookup is org-scoped → permanent 404) — a dead member row and a DM that was created but unusable. Cross-org references should be refused, not silently persisted. |
| **The meeting status was an anything-goes setter.** `PATCH /meetings/:id { status }` accepted every transition and stamped `startedAt`/`endedAt` accordingly. | A CANCELLED meeting could be flipped LIVE; an ENDED meeting could be resurrected into a new "live" meeting with a fresh startedAt — the audit trail of the lifecycle meant nothing. |
| **AI-extracted action items were indistinguishable from human-typed ones.** The notetaker wrote `metadata: { aiGenerated: true }` on items it extracted from a transcript, but no serializer ever surfaced it. | "Bob — send the deck" extracted by a heuristic read exactly like an item a person had typed and owned. |
| **No shared contract.** Both services declared their own Zod schemas; the 186-LOC web client redeclared every shape by hand. | The sides could drift without a compiler noticing. |

## 3. What Session 122 adds

### 3.1 Shared contract — `packages/shared/src/talk.ts` (new, 340 LOC)

The module's first shared contract: all wire types (`TalkChannel` — with `unreadCount: number | null` — `TalkMember`, `TalkMessage`, `TalkReactions`, `TalkAttachment`, `TalkMeetingSummary`/`TalkMeetingDetail`, `TalkMeetingParticipant`, `TalkActionItem` — with `aiGenerated: boolean` — plus the paginated list shapes) and all ten Zod schemas, moved verbatim from the service files (limits extracted as named constants). The services **re-export the schemas under their old names** (`CreateChannelSchema`, `UpdateMeetingSchema`, …), so every route file keeps compiling unchanged. Input types use `z.input` so defaulted fields (channel `access`, action `priority`, transcript `final`) stay optional for callers, exactly as the old same-file inference behaved. `TALK_MEETING_TRANSITIONS` — the allowed status transitions — lives in the contract so the API and any future client share the rules.

The web client (`apps/web/src/lib/talk.ts`) now imports every type from the shared contract (the method surface is unchanged) and the old names (`TalkChannel`, `TalkMessage`, `ActionItem`, `Meeting`, `TalkMember`, `TalkAttachment`) are preserved as aliases, so all components keep compiling.

### 3.2 Real unread counts

`listChannels` and `getChannel` now compute, per channel: messages after the caller's `lastReadAt`, **excluding the caller's own messages**, excluding deleted — the same convention Session 112 pinned for conversations. When the caller has **no membership row** (e.g. a public channel they have not joined), the value is **`null`** — there is no read position, and `null` is not a fabricated "caught up". The channel sidebar now renders the real unread badge (and only when > 0); the misleading total-message-count badge is gone.

### 3.3 Same-organization member validation

New `assertUsersInOrg` / `assertAgentsInOrg` helpers: every user id must have a membership in the caller's org, every agent id must belong to it. Applied to `getOrCreateDM` (peer), `createChannel` (members + agents) and `addChannelMembers` (users + agents). A cross-org reference is refused with a 400 naming the offending ids, and **nothing is persisted**.

### 3.4 Meeting status lifecycle

`updateMeeting` now validates every status change against `TALK_MEETING_TRANSITIONS`:

```
SCHEDULED → SCHEDULED | LIVE | ENDED | CANCELLED
LIVE      → LIVE | ENDED
ENDED     → ENDED            (terminal)
CANCELLED → CANCELLED        (terminal)
```

Re-sending the current status stays idempotent (no-op, `startedAt`/`endedAt` only filled when missing). An invalid transition answers **409** naming the allowed ones. The check-then-act P2025 race in the update now maps to 404 instead of a 500.

### 3.5 AI-generated action items surfaced

Both action-item serializers (`listActionItems` and `getMeeting`) now emit `aiGenerated: boolean` (from `metadata.aiGenerated` — additive field; absent = false). The ActionItems sidebar shows an **"AI-extracted"** badge with a tooltip ("Extracted from a meeting transcript by the AI notetaker") on those items.

## 4. Tests

- `apps/api/src/services/talk.completion.test.ts` — **new, 21 tests**:
  - unread: counts after lastReadAt excluding own messages, excludes deleted, **null not 0 for non-members**, getChannel parity, fresh-channel creator = 0;
  - same-org: DM-to-foreign-peer refused with nothing persisted, foreign members/agents refused on create and on add, same-org flows unchanged;
  - lifecycle: valid forward transitions stamp startedAt/endedAt, SCHEDULED→CANCELLED, ENDED/CANCELLED refuse resurrection (409), LIVE refuses CANCELLED, idempotent re-send, P2025 → 404;
  - aiGenerated: surfaced true for notetaker items and false for human ones, in both the list and the meeting detail;
  - shared schemas: defaults behave as before, constraints intact, transition map exported.
- `tests/e2e/talk.spec.ts` — **new, 5 Playwright cases**: the 23-endpoint surface answers; a full channel lifecycle with a real unread count; the lifecycle refusing resurrection (409 in both directions); `aiGenerated: false` on a person-created item; anonymous refusals.
- The two existing suites pass unchanged (both are in `services/`, so the inventory counts 3 suites).

**Full suite: 1706 passing / 51 skipped / 114 files** (Session 121 baseline 1684 / 51 / 113). API and web typecheck clean; web production build emits the Talk page chunk.

## 5. Honesty notes

- `unreadCount` is measured or `null` — never a hardcoded 0, and the sidebar no longer shows the total message count as if it were unread.
- AI-extracted action items are labelled in the payload and in the UI; a person-created item is explicitly `aiGenerated: false`.
- A meeting's lifecycle is a state machine with terminal states; the payload of a refused transition names the allowed ones.
- Cross-org member references are refused before anything is written — no dead rows, no unusable DMs.

## 6. Runtime validation

Live PostgreSQL 17 + Redis 8 + Prisma generation is not reachable in this sandbox, so this session ends **🟡 VERIFIED (partial)** and ships `docs/SESSION_122_RUNTIME_VALIDATION_CHECKLIST.md` for the target environment.

## 7. Files touched

| File | Change |
| --- | --- |
| `packages/shared/src/talk.ts` | **new** — contract, Zod, transition map |
| `packages/shared/src/index.ts` | export added |
| `apps/api/src/services/talk.service.ts` | schemas → shared re-exports; same-org validation; real unread counts |
| `apps/api/src/services/meeting.service.ts` | schemas → shared re-exports; lifecycle validation; `aiGenerated`; P2025 → 404 |
| `apps/api/src/services/talk.completion.test.ts` | **new** — 21 tests |
| `apps/web/src/lib/talk.ts` | types from shared contract (method surface unchanged) |
| `apps/web/src/components/talk/ChannelSidebar.tsx` | real unread badge; misleading total-count badge removed |
| `apps/web/src/components/talk/ActionItemsSidebar.tsx` | "AI-extracted" badge |
| `tests/e2e/talk.spec.ts` | **new** — 5 cases |
| `audit/module-inventory.json` | regenerated |
| `PROGRESS.md`, `docs/CHANGELOG.md`, `CONVENTIONS.md`, `README.md`, `project-understanding.md` | updated |
