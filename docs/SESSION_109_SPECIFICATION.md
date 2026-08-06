# SESSION 109 SPECIFICATION — CANVAS COLLABORATION COMPLETION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S108, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Workspace Collaboration
```

## 1. Objective

The Canvas Collaboration layer already implemented presence heartbeats,
cursor hashes, TTL pruning and Redis pub/sub, but the audit classified it as
`PARTIAL`: collaboration payloads were service-local, Redis keys lacked an
organization segment, routes did not verify canvas ownership before touching
collaboration state, and the actual Canvas page did not use the presence
client. Session 109 completes that layer additively.

1. shared `Cc` presence/cursor contracts and validation;
2. canonical `canvasCollab` service/client/page module entrypoints;
3. org-scoped presence/cursor Redis keys with safe legacy read migration;
4. route-level `getCanvas` organization/access verification before every
   presence/cursor operation;
5. Canvas page heartbeat/presence refresh and collaborator indicators;
6. existing CRUD, TTL, cursor and pub/sub behavior preserved;
7. Session 89 namespace audit registration and expanded tests.

## 2. Storage and isolation

New collaboration keys are:

- `canvas:presence:i:<org>:<canvasId>`
- `canvas:cursor:i:<org>:<canvasId>`
- `canvas:collab:<org>:<canvasId>` for org-qualified pub/sub events

The legacy `canvas:presence:<canvasId>` and `canvas:cursor:<canvasId>` slots
are read/migrated only when an authenticated route has already verified the
canvas's organization. New route writes never use unscoped keys. Presence
records expire lazily from their `lastSeenAt` timestamp; stale users are
removed on read.

## 3. API surface

The existing Canvas Collaboration routes remain available on both mounted
Canvas prefixes:

| Method | Path | Purpose |
|---|---|---|
| POST | `/:id/presence` | org-verified heartbeat |
| GET | `/:id/presence` | active presence with TTL pruning |
| PUT | `/:id/cursor` | org-verified cursor position |
| GET | `/:id/cursors` | latest org-scoped cursors |
| DELETE | `/:id/presence` | org-verified leave/removal |

CRUD routes continue to use the real Prisma Canvas service and its existing
organization/access checks. The typed client exposes `/canvas/...` presence
paths; the Canvas page continues using `/canvases/...` for document CRUD.

## 4. UI

`/app/canvas` now sends a presence heartbeat while open, refreshes active
collaborators and sends a leave event on unmount. A collaborator indicator is
shown in the canvas toolbar area. The `canvasCollab` module entrypoints and
`/app/canvas-collab` compatibility route are available for future focused
collaboration views.

## 5. Verification gate

- Existing `canvasCollab.test.ts` now includes 20 tests, including org-scoped
  key assertions and cross-organization slot isolation.
- `make verify` must pass with offline Prisma generation; live Redis pub/sub,
  multi-user browser synchronization and runtime TTL validation remain gates.
- Inventory may mark Canvas Collaboration COMPLETE only when shared contracts,
  org-scoped service/routes, typed client, UI integration, tests and isolation
  registration exist.
