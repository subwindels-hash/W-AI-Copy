# Session 122 Runtime Validation Checklist — Talk completion

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted.
> Until every box is ticked and signed, Session 122 stays 🟡 VERIFIED (partial).

The unit suite proves the unread arithmetic, the same-org validation and the
lifecycle rules against FakePrisma; only a live deployment proves the
`TalkChannel`/`TalkMember`/`TalkMessage`/`Meeting`/`ActionItem` tables and the
real pagination behave as this module assumes.

## Route mounting and backwards compatibility

- [ ] All 23 Session 5–6 endpoints answer on their original paths with their
      original payload shapes, including `GET /talk/channels`,
      `POST /talk/channels` (201), `POST /talk/channels/:id/messages` (201),
      `PATCH /talk/meetings/:id`, `GET /talk/action-items`,
      `GET /talk/available-agents`.
- [ ] `POST /talk/channels` with `type: "DM"` still returns the raw
      `TalkChannel` row (enum-uppercased `type`) exactly as before.
- [ ] All 23 paths answer `401` without a token.
- [ ] The existing Talk UI (`/app/talk`) loads and its channel list, message
      thread, meetings and action items render against the new payloads.

## The defects this session fixes

- [ ] **Real unread counts.** Create a channel, have user B post two
      messages, then list channels as user A (a member who has never read):
      `unreadCount` is `2`. Have A open the channel (list messages), then list
      again: `unreadCount` is `0` — the read position moved. A's own messages
      never count toward A's unread.
- [ ] **null, not 0.** As a member of the org who has **not joined** a public
      channel, `GET /talk/channels` reports `unreadCount: null` for it —
      never 0.
- [ ] **Same-organization members.** With a user in org B:
      - [ ] `POST /talk/channels` with `type: "DM", peerUserId: <org B user>`
            answers **400** ("Peer user not in your organization") and creates
            no channel;
      - [ ] `POST /talk/channels` with `memberUserIds: [<org B user>]` answers
            **400** and creates no channel;
      - [ ] `POST /talk/channels/:id/members` with an org B user or agent
            answers **400** and adds no member row.
- [ ] **Lifecycle.** A SCHEDULED meeting → LIVE → ENDED works and stamps
      `startedAt`/`endedAt`. Then:
      - [ ] `PATCH { status: "LIVE" }` on the ENDED meeting answers **409**;
      - [ ] `PATCH { status: "CANCELLED" }` on a SCHEDULED meeting succeeds,
            and `PATCH { status: "LIVE" }` afterwards answers **409**;
      - [ ] `PATCH { status: "LIVE" }` on a LIVE meeting succeeds (idempotent)
            and does not reset `startedAt`.
- [ ] **AI-extracted items.** End a meeting with a transcript and a notetaker
      agent: the items the notetaker created carry `aiGenerated: true` in
      `GET /talk/action-items` and in `GET /talk/meetings/:id`, and the Talk
      UI shows the "AI-extracted" badge on them. A manually created item is
      `aiGenerated: false`.

## Console (web)

- [ ] `/app/talk` channel sidebar shows the unread badge only when
      `unreadCount > 0`, and nothing (not a total-count badge) otherwise.
- [ ] Opening a channel clears its unread badge after the next list.
- [ ] A cancelled meeting shows as cancelled and the UI cannot move it back
      to live (the API refuses with 409).
