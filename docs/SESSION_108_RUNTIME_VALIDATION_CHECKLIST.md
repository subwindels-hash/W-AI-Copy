# Session 108 Runtime Validation Checklist — Camera Intelligence

> **Status:** 🟡 pending target-environment execution. Run with live Redis 8,
> configured filesystem/gateway and approved camera/CV infrastructure.

- [ ] `/api/v1/camera/feeds` lists feeds without a duplicated `/camera` path;
      unauthenticated access is rejected.
- [ ] Two organizations register identical feed names/URLs; each can read,
      update, stream-check, alert-list and delete only its own feed.
- [ ] New feed records use `cam:feed:i:<org>:<id>` and `cam:feed:idx:<org>`;
      alert records use the matching org-scoped namespaces. Session 89 audit
      reports all `cam:*` namespaces conforming.
- [ ] Allowed feed URL/MIME/status inputs pass; malformed URLs/statuses fail;
      feed defaults to offline and no media is claimed live without gateway
      availability.
- [ ] Stream handoff returns a short expiry, STUN/TURN state and explicit
      external-gateway note; no token is treated as decoded video.
- [ ] Admin alert creation writes a real advisory alert; regular users cannot
      create/update/delete feeds or alerts.
- [ ] Legacy feed keys migrate without duplicate feed rows.
- [ ] `/app/camera` displays real feed/alert state and read-only controls for
      non-admin users.
- [ ] Capture request IDs, Redis audit output, gateway/TURN evidence and this
      checklist before marking Session 108 🟢.

**Operator:** ____________________  **Environment:** ____________________

**Executed at (UTC):** ___________  **Release/commit:** ____________________
