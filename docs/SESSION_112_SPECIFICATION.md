# SESSION 112 SPECIFICATION — CONVERSATIONS / MESSAGING COMPLETION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S111, removes nothing)
Document Owner: Core Product — Conversations
Applies To: WINDELS AI OS Monorepo
```

## 1. Objective

Sessions 2–4 delivered the thread itself: create a conversation, stream an
assistant reply over SSE, list the messages, attach files. That part works and
is untouched by this session. What was missing was everything *around* the
thread, and the gaps were not cosmetic — several were columns the schema had
carried since Session 2 that no code path ever wrote:

- **`ConversationParticipant.lastReadAt` was never set by anything.** An unread
  count was therefore impossible to compute, and no endpoint exposed one.
- **The roster was frozen at creation.** There was no way to add or remove a
  participant afterwards; the creator plus whichever agents were `@mentioned`
  on the first send were permanent.
- **A stored `Message` could never be corrected or withdrawn.** A typo, or a
  credential pasted into a thread, was permanent for the life of the row.
- **Search matched conversation titles only.** `listConversations` applied
  `q` to `title`; the message bodies — the part people actually remember — were
  unsearchable.
- **`deleteConversation` soft-deleted into a void.** Nothing could list or
  restore a soft-deleted thread, which makes a soft delete a hard delete that
  also wastes storage.
- **There was no shared contract.** `packages/shared/src/conversations.ts` did
  not exist; `apps/web/src/lib/chat.ts` re-declared its own `Conversation` and
  `ChatMessage` interfaces, so the two halves of the module could drift with
  nothing to catch it. This is why the audit held the module at `PARTIAL`
  (`sharedTypes: null`) despite 7 working endpoints.

Session 112 completes the module additively:

1. a shared `Conv*` contract with Zod input schemas;
2. an operations service over the existing Prisma rows — participants, read
   state, statistics, search, edit/redact, transcript, digest, recovery;
3. fifteen new endpoints mounted ahead of the Session 2 router;
4. a typed web client and a dedicated `/app/conversations` console;
5. twenty-three unit tests and a six-case Playwright spec.

Nothing in `conversations.service.ts`, `message.service.ts`,
`routes/conversations.ts` or `routes/messages.ts` was rewritten or removed.

## 2. Domain model

| Record / view | Purpose | Honesty rule |
|---|---|---|
| `ConvParticipant` | a human or agent seat on a thread | `lastReadAt` is `null` until that participant actually marks the thread read; the creator's seat is flagged and cannot be removed |
| `ConvReadState` | one participant's unread position | carries `basis` — `last_read_at` or `never_marked_read` — so the number is never presented without the definition that produced it. `excludesOwnMessages` is always `true` |
| `ConvUnreadSummary` | unread across threads | reports `inspectedConversations` and `truncated`; a capped scan says it was capped rather than implying the total is complete |
| `ConvStats` | measured thread statistics | counted from stored rows only (`measuredFrom: "stored_messages"`). A usage counter that **no** message recorded is `null`, never `0`, and `messagesMissingUsage` says how many rows lacked it |
| `ConvSearchResult` | cross-thread body search | `matchKind: "substring_case_insensitive"`. Excerpts are verbatim slices at a reported `matchOffset`; nothing is ranked, stemmed or semantically expanded |
| `ConvMessage` | a message with its audit trail | `edits[]` is append-only and records only lengths and reasons, not the replaced text; `redaction` records who blanked the body, when, why and how long it was |
| `ConvTranscript` | export | a redacted body exports as `[redacted]`, never as its original text |
| `ConvDigest` | extractive digest | `kind: "extractive_deterministic"`, `aiGenerated: false`, plus a verbatim disclaimer. It quotes the first and last readable bodies and counts terms — no model is invoked and no sentence is composed |
| `ConvDeletedConversation` | recovery listing | creator-scoped, so `restorableByCaller` is a fact about the caller, not a hint |

### What is deliberately *not* implemented

- **No AI summarisation.** The `Conversation.summary` column is still written by
  Session 4's send path as a 120-character slice of the latest assistant reply.
  This session does not relabel that column as a summary or feed it into
  anything; the digest endpoint is separate, extractive and explicitly labelled.
- **No semantic or ranked search.** Postgres full-text and embeddings are both
  plausible next steps; neither is claimed here, and the contract names the
  matcher so no caller can mistake it for one.
- **No hard delete.** Redaction blanks a body and keeps the row; conversation
  deletion stays a reversible soft delete. Purge/retention policy is a separate
  concern and is not implied by any field in this contract.
- **No read receipts for agents.** Only human participants have a meaningful
  `lastReadAt`; agent seats keep the column `null` rather than being stamped
  when a model happens to read context.

## 3. Storage and isolation

This module's records are **relational rows, not Redis blobs** — `Conversation`,
`Message` and `ConversationParticipant` in Postgres via Prisma. It therefore has
no entry in `TI_NAMESPACE_CATALOG` (that catalog audits Redis key namespaces).
Isolation is enforced in the query layer instead:

- every operation resolves the caller's organization through
  `resolveUserContext(userId)` and filters on `organizationId`;
- access additionally requires `createdById = caller` **or** a participant row
  for the caller — org membership alone is not enough to read a thread;
- `requireAccess()` is fail-closed: the loaded row's `organizationId` is
  compared to the caller's context *again* after the query returns, so a
  mis-scoped filter cannot surface another tenant's thread;
- adding a participant verifies the target's `Membership` in the *conversation's*
  organization, so a thread can never be used to widen someone's tenant access;
- search resolves the caller's accessible conversation ids first and scopes the
  message query with `conversationId: { in: ids }`, so an unscoped body match is
  structurally impossible;
- restore is creator-only and org-filtered.

Two dedicated test blocks pin this: every new operation is rejected for a
different organization's user, and a same-org non-participant is refused until
they are actually added to the roster.

There is no `Math.random` in the module — ids are Prisma cuids on the write
path, and nothing on a read path generates values.

## 4. Derivation rules (stated, not implied)

| Output | Definition |
|---|---|
| `unreadCount` | messages in the thread **not authored by the caller** and, when `lastReadAt` is set, created strictly after it. Assistant/agent rows (`userId = null`) count as unread |
| `basis` | `last_read_at` when the participant has a marker, `never_marked_read` otherwise. Reported alongside every count |
| `usage.tokensIn/tokensOut/costMicros` | sum over rows that recorded the counter; `null` when **no** row did |
| `usage.avgAssistantDurationMs` | mean of recorded assistant `durationMs`; `null` when none recorded |
| `messagesWithUsage` / `messagesMissingUsage` | partition of the thread by whether any usage counter was stored |
| `keywords` | term counts over non-redacted, non-empty bodies, excluding a fixed stop-word list and terms shorter than three characters; ordered by occurrences descending then term ascending, so the same thread always yields the same digest |
| `openingExcerpt` / `latestExcerpt` | verbatim first/last 240 characters of the earliest/latest readable body; `null` when the thread has none |
| `matchOffset` | index of the first case-insensitive match inside the stored body; `excerpt` is the ±100-character window around it |
| `firstMessageAt` / `lastMessageAt` | min/max stored `createdAt`; `null` on an empty thread |

`markRead` refuses a future timestamp (`400`) — accepting one would silently
mark messages read before they exist.

## 5. API surface (`/api/v1/conversations`, authenticated)

Registered by `registerConversationOpsRoutes` **before** the Session 2 router,
because `GET /search`, `GET /unread` and `GET /deleted` are literal collection
paths that the existing cuid-validated `GET /:id` would otherwise reject with a
`400`. Because these handlers run ahead of that router's
`router.use(authenticate)`, each attaches `authenticate` itself.

| Method | Path | Purpose |
|---|---|---|
| GET | `/search` | cross-thread message body search (`q`, `conversationId?`, `role?`, pagination) |
| GET | `/unread` | unread summary across the caller's threads (`limit`) |
| GET | `/deleted` | soft-deleted threads the caller created |
| GET | `/:id/participants` | roster with per-seat read markers |
| POST | `/:id/participants` | add a user (membership-verified) or agent (org-verified) |
| DELETE | `/:id/participants/:participantId` | remove a seat; the creator's seat is a `409` |
| GET | `/:id/read-state` | caller's unread position and its basis |
| POST | `/:id/read` | mark read at now, or at a stated past time |
| GET | `/:id/stats` | measured statistics for the thread |
| GET | `/:id/transcript` | ordered transcript, `format=json\|markdown` |
| GET | `/:id/digest` | extractive digest (`maxKeywords`) |
| POST | `/:id/restore` | creator-only restore of a soft-deleted thread |
| GET | `/:id/messages/:messageId` | one message with attachments and audit trail |
| PATCH | `/:id/messages/:messageId` | author-only edit of a **user** message |
| DELETE | `/:id/messages/:messageId` | redact a body (author or thread creator) |

Twenty-two endpoints for the module, up from seven. Guard rails at the boundary:

- editing model output is a `409` — assistant text is kept as produced;
- editing someone else's message is a `403`;
- editing a redacted message is a `409`;
- redacting twice is a `409`;
- adding a user with no membership in the thread's organization is a `404`, and
  adding an existing participant is a `409` rather than a duplicate row;
- restoring a thread that is not deleted is a `409`; restoring one the caller
  did not create is a `403`.

## 6. UI

`/app/conversations` (sidebar: "Conversation Ops") is the administration
console; `/app/chat` remains the place you talk, unchanged.

- thread list with unread badges whose tooltip states the basis;
- roster management with the creator's seat explicitly non-removable, and each
  seat showing "never marked read" rather than a fabricated timestamp;
- measured usage panel that renders "not recorded" — in italics, not `0` — for
  any counter no message stored, plus "N of M messages recorded usage";
- the digest with its `extractive deterministic` badge and verbatim disclaimer;
- search results labelled "substring case insensitive" with the match offset
  shown per hit;
- transcript export (JSON/Markdown) where redacted entries read `[redacted]`;
- recovery list for soft-deleted threads.

## 7. Verification gate

- `apps/api/src/conversations/conversationOps.test.ts` — **23 tests**:
  participant labelling and creator protection, cross-org agent/user rejection,
  duplicate-participant `409`, never-marked-read basis, own-message exclusion,
  mark-read persistence, future-timestamp rejection, unread summary truncation
  honesty, `null` usage totals on an unmeasured thread, correct sums and
  averages on a measured one, case-insensitive search with a verbatim excerpt
  and real offset, cross-organization search isolation, append-only edit trail,
  refusal to edit model output or another author's message, redaction that
  preserves the row and its usage counters, double-redaction `409`, markdown
  transcript with `[redacted]` bodies, deterministic non-AI digest that skips
  redacted text, soft-delete listing and restore round-trip with a
  not-deleted `409` and a non-creator `403`, and two tenant-isolation blocks
  covering all nine new read/write paths.
- `tests/e2e/conversations.spec.ts` — 6 Playwright cases against a live API.
- The Session 2–4 suites (`conversations.test.ts`,
  `services/message.service.test.ts`) still pass unmodified.
- `make verify` (offline Prisma generate + build + typecheck + test) passes:
  **1219 tests, 51 skipped, 0 failures** (1196 before this session).
- Runtime validation against live PostgreSQL 17 + Redis 8 + `prisma generate`
  remains pending in this sandbox, so Session 112 is recorded
  🟡 **VERIFIED (partial)** — see
  `docs/SESSION_112_RUNTIME_VALIDATION_CHECKLIST.md`.

## 8. Inventory effect

`audit/build-inventory.mjs` gains one `ROUTE_OVERRIDES` entry
(`conversationOps → conversations`, the same mapping `messages` already has).
The module moves `PARTIAL → COMPLETE`: routes 7 → 22, service SLOC 621 → 2794,
shared contract present, web client `apps/web/src/lib/conversations.ts`, four
test suites. Repository totals: **92 COMPLETE, 11 PARTIAL**, 2 STUB-by-design
(`events`, `webhook`), 1 DEMO DATA (`quantum`) across 106 modules.
