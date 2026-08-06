# Session 112 Runtime Validation Checklist — Conversations / Messaging

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed and the Session 2–4
> chat path working end to end. Until every box is ticked and signed, Session
> 112 stays 🟡 VERIFIED (partial).

## Isolation and access

- [ ] Two organizations each create a conversation with the same title. Every
      Session 112 path — `participants`, `read-state`, `read`, `stats`,
      `transcript`, `digest`, `messages/:messageId`, `restore` — returns `404`
      for the other organization's user and leaves the other tenant's rows
      byte-identical.
- [ ] A user who is a member of the *same* organization but not a participant
      receives `404` on all of the above, and gains access only after
      `POST /:id/participants` adds them.
- [ ] `GET /conversations/search?q=…` executed as each organization's user
      returns hits only from that organization; `searchedConversations` equals
      the number of threads that user can actually read.
- [ ] `POST /:id/participants` with a `userId` that has no `Membership` in the
      conversation's organization returns `404` and creates no row (verify with
      `SELECT * FROM "ConversationParticipant"`).
- [ ] Route registration order holds on the live server: `GET /conversations/search`,
      `/unread` and `/deleted` resolve to their handlers and are **not**
      rejected with a cuid validation `400` by `GET /:id`.

## Read state and unread counts

- [ ] A fresh conversation reports `basis: "never_marked_read"`,
      `lastReadAt: null`, `excludesOwnMessages: true`.
- [ ] Send two messages as the caller and receive one assistant reply:
      `unreadCount` is `1`, not `3` — the caller's own messages are excluded.
- [ ] `POST /:id/read` writes `ConversationParticipant.lastReadAt` in Postgres
      (verify the column directly), flips `basis` to `last_read_at` and drops
      `unreadCount` to `0`.
- [ ] `POST /:id/read` with `at` in the future returns `400` and does not
      mutate the row.
- [ ] A creator whose participant row is missing (legacy thread) gets one
      created by `POST /:id/read` rather than an error.
- [ ] `GET /conversations/unread?limit=N` with more than `N` accessible threads
      reports `truncated: true` and `inspectedConversations: N`; with fewer it
      reports `truncated: false`.

## Measured statistics

- [ ] A thread whose messages predate token accounting reports
      `usage.tokensIn: null`, `usage.costMicros: null`,
      `usage.avgAssistantDurationMs: null` and a non-zero
      `usage.messagesMissingUsage` — never a confident `0`.
- [ ] After a real streamed reply, `tokensIn`/`tokensOut`/`costMicros` equal the
      sum of the `Message` rows' stored counters (compare against SQL), and
      `avgAssistantDurationMs` equals the mean of the stored `durationMs`.
- [ ] `firstMessageAt`/`lastMessageAt` match `MIN`/`MAX` of `created_at` for the
      thread; both are `null` on an empty thread.
- [ ] `measuredFrom` is `"stored_messages"` on every response.

## Edit and redaction

- [ ] Editing an authored user message updates `content` and appends one entry
      to `metadata.conv.edits` with the *previous length* — confirm the replaced
      text itself is not stored anywhere in `metadata`.
- [ ] Editing an assistant message returns `409`; editing another user's message
      returns `403`; editing a redacted message returns `409`.
- [ ] `DELETE /:id/messages/:messageId` blanks `content` in Postgres, keeps the
      row, keeps `tokensIn`/`tokensOut`/`costMicros`/`created_at`, and records
      `metadata.conv.redaction.{redactedAt,redactedBy,reason,redactedLength}`.
- [ ] Redacting twice returns `409`.
- [ ] The redacted body no longer appears in `GET /:id/messages`,
      `GET /:id/transcript` (it renders `[redacted]`), `GET /:id/digest`, or
      `GET /conversations/search` for a term that was only in that body.
- [ ] A thread creator can redact another participant's message; an unrelated
      participant cannot (`403`).

## Search honesty

- [ ] `matchKind` is `"substring_case_insensitive"` on every response.
- [ ] A mixed-case query matches mixed-case stored text, and `excerpt`
      reproduces the stored casing verbatim.
- [ ] `matchOffset` equals the real character index of the match inside the
      stored body (verify against the raw row).
- [ ] Pagination is stable: `total` from the count query matches the number of
      rows reachable by paging through with the same `q`.
- [ ] `q` shorter than two characters is rejected with `400`.

## Digest honesty

- [ ] Every digest carries `kind: "extractive_deterministic"`,
      `aiGenerated: false` and the verbatim disclaimer string.
- [ ] Two consecutive `GET /:id/digest` calls on an unchanged thread return
      identical `keywords` arrays and identical excerpts.
- [ ] Excerpts are byte-for-byte prefixes of stored message bodies (diff against
      the rows) — no rewriting, no ellipsis insertion, no paraphrase.
- [ ] `skippedMessages` equals the number of redacted or empty-bodied rows.
- [ ] No AI provider request is made during a digest call (check provider logs
      / `AiRequest` table stays unchanged).

## Soft-delete recovery

- [ ] `DELETE /conversations/:id` still soft-deletes (row present,
      `deletedAt` set) and the thread disappears from `GET /conversations`.
- [ ] `GET /conversations/deleted` lists it for its creator with the correct
      `messageCount`, and does **not** list it for another participant.
- [ ] `POST /:id/restore` clears `deletedAt`, and the thread reappears in
      `GET /conversations` with its messages and participants intact.
- [ ] Restoring twice returns `409`; restoring as a non-creator returns `403`.

## Non-regression (Sessions 2–4)

- [ ] `GET /conversations`, `POST /conversations`, `GET /conversations/:id`,
      `PATCH /conversations/:id`, `DELETE /conversations/:id` behave exactly as
      before this session.
- [ ] `GET /conversations/:id/messages` and the SSE
      `POST /conversations/:id/messages` stream unchanged, including attachment
      claiming and `@mention` agent enrolment.
- [ ] `/app/chat` is unaffected; `apps/web/src/lib/chat.ts` still serves it.

## UI

- [ ] `/app/conversations` renders the thread list, roster, measured usage,
      digest, search, transcript and recovery panels against live data.
- [ ] A counter with no recorded usage renders "not recorded" in italics — a
      screenshot must show no fabricated `0`.
- [ ] An unread badge's tooltip states the basis ("Never marked read" or the
      last-read timestamp).
- [ ] The creator's roster row has its remove control disabled, and attempting
      the call directly returns `409`.

## Gate

- [ ] `noRandomData.guard.test.ts` and `noFakeVerdict.guard.test.ts` pass;
      `grep -R "Math.random" apps/api/src/conversations` returns nothing.
- [ ] `make verify` passes on the target machine.
- [ ] `npx playwright test tests/e2e/conversations.spec.ts` passes against the
      running stack.
- [ ] Capture request ids, the relevant SQL dumps and this checklist before
      marking Session 112 🟢.

**Operator:** ____________________  **Environment:** ____________________

**Executed at (UTC):** ___________  **Release/commit:** ____________________
