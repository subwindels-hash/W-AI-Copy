# Session 109 Runtime Validation Checklist — Canvas Collaboration

> **Status:** 🟡 pending target-environment execution. Run with live Redis 8,
> PostgreSQL 17 and at least two authenticated browser sessions.

- [ ] Presence/cursor routes resolve the canvas through the authenticated user's
      organization/access before reading or writing collaboration state.
- [ ] Two organizations use the same canvas-id-shaped values; presence/cursors
      remain isolated and foreign canvas access returns authorization/not-found.
- [ ] New Redis writes use `canvas:presence:i:<org>:<canvasId>` and
      `canvas:cursor:i:<org>:<canvasId>`; Session 89 audit reports namespaces
      conforming.
- [ ] Presence heartbeats refresh `lastSeenAt`, stale users are pruned after
      the configured TTL, and leave removes only the requesting user.
- [ ] Cursor updates publish to the org-qualified collaboration channel and
      initial cursor reads match the latest stored positions.
- [ ] Legacy unscoped presence/cursor entries migrate only after canvas access
      is verified; no new unscoped writes occur.
- [ ] `/app/canvas` shows real collaborator count/avatars and sends heartbeat /
      leave events across two browser sessions.
- [ ] Capture request IDs, Redis key/channel evidence and this checklist before
      marking Session 109 🟢.

**Operator:** ____________________  **Environment:** ____________________

**Executed at (UTC):** ___________  **Release/commit:** ____________________
