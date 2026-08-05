# SESSION 6 — RUNTIME VALIDATION CHECKLIST

**Applies to:** WINDELS AI OS, Session 6 (Talk: channels, messaging, meetings, action items)
**Status:** 🟡 NOT YET EXECUTED — must run in the target deployment environment.
Session 6 cannot be **PRODUCTION COMPLETE** until this passes.

> Sandbox unit tests are not a substitute for any row below.

## 1. Build & DB
- [ ] `pnpm build` succeeds; `prisma migrate deploy` (TalkChannel/TalkMember/TalkMessage/Meeting/MeetingParticipant/ActionItem tables).
- [ ] `.env` populated.

## 2. Channels & messaging
- [ ] Create public + private + DM channels; public org-readable; private membership-gated.
- [ ] Send message (user/agent); thread reply; cross-channel parent → 400.
- [ ] Author edit/delete; non-author denied; delete soft-deletes + redacts content.
- [ ] Reactions toggle per actor; cross-org reaction refused.

## 3. Meetings
- [ ] Create meeting → organizer participant; instant meeting returns + persists LIVE.
- [ ] Cross-org meeting list/get/update denied.
- [ ] Add transcript; end meeting → `endedAt` set + notetaker summarization produces a summary.

## 4. Action items
- [ ] Create action item (org-scoped); binding to a cross-org channel/meeting → 404.
- [ ] Complete → `completedAt` set; reopen clears it; `mine` filter works.
- [ ] Cross-org update/delete denied.

## 5. Cross-tenant isolation
- [ ] No org A channel/meeting/message data visible or writable from org B.

## 6. Frontend / e2e
- [ ] `/app/talk` renders channels, sends a message, and shows meetings/action items.
- [ ] `pnpm test:e2e --project=chromium` — talk specs pass.

## 7. Performance
- [ ] Message/meeting calls < 300 ms p95; lists paginated.

## 8. Security
- [ ] No cross-org data leak; message soft-deletes hide content from all but author.

## Sign-off
All boxes checked with evidence → Session 6 becomes **PRODUCTION COMPLETE**. Until then, 🟡 VERIFIED (partial).
