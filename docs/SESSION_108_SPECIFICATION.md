# SESSION 108 SPECIFICATION — CAMERA FEED REGISTRY & ALERT CONSOLE COMPLETION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S107, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Computer Vision & Safety Systems
```

## 1. Objective

The Camera Intelligence feed registry already stored RTSP/RTMP feed metadata
and exposed WebRTC handoff/alert paths, but the audit classified it as
`PARTIAL`: feed/alert contracts were service-local, feed paths were mounted
with a duplicated `/camera` prefix, there were no update/delete/alert-create
routes, alert reads lacked an organization check, the client had no mutations
and no dedicated UI, and only the broad collaboration E2E suite covered it.

Session 108 completes the registry without pretending to implement a media
inference provider:

1. shared `Cam` feed, alert, stream-session and Zod contracts;
2. org-scoped feed records/indexes with legacy-key migration;
3. org-scoped alert records/indexes and feed ownership checks;
4. feed update/delete and operator/model alert-create paths protected by admin
   RBAC;
5. corrected mounted route paths (`/api/v1/camera/feeds`, not a duplicated
   `/camera/camera` path);
6. short-lived stream handoff responses explicitly reporting external gateway
   availability and feed status;
7. dedicated Camera Intelligence page with feed registry, status controls,
   stream handoff honesty and advisory alert timeline;
8. nine service/contract tests covering tenant isolation and lifecycle.

## 2. Storage and honesty

New feed keys:

- `cam:feed:i:<org>:<id>` and `cam:feed:idx:<org>`
- `cam:alert:i:<org>:<cameraId>:<id>` and `cam:alert:idx:<org>:<cameraId>`

Legacy `cam:feed:<org>:<id>`/`cam:feeds:<org>` records are migrated when
read. New alerts always carry the organization in their storage key and
payload. Feed status defaults to `offline`; `streamAvailable` is true only
when the feed is explicitly observed/configured as `online`, and the stream
response states that an external WebRTC gateway is still required. No YOLO
confidence, snapshot or automated safety verdict is fabricated.

## 3. API surface (`/api/v1/camera`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/feeds` | list org-scoped feed metadata |
| POST | `/feeds` | admin register feed |
| PATCH | `/feeds/:id` | admin update metadata/status |
| DELETE | `/feeds/:id` | admin delete feed and alert records |
| GET | `/feeds/:id/stream` | short-lived stream handoff with availability note |
| GET | `/feeds/:id/alerts` | org-scoped alert timeline |
| POST | `/feeds/:id/alerts` | admin record advisory alert |
| GET/POST/PATCH/DELETE | `/notes*` | existing org-scoped annotation ledger |

## 4. UI

`/app/camera` is a dedicated registry and alert console. The existing
PlatformPage camera tab remains compatible with the typed client. The page
shows:

- feed counts and status controls;
- feed creation/deletion for administrators;
- stream-session expiration and external-gateway/STUN/TURN state;
- alert timeline and manual advisory alert entry;
- read-only messaging for non-admins and explicit no-automatic-action notice.

## 5. Verification gate

- `apps/api/src/camera/camera.test.ts` covers 9 cases: org-scoped creation,
  cross-tenant reads/mutations, status updates, alert ownership, stream
  availability, cascade deletion, legacy migration and contracts.
- `make verify` must pass with offline Prisma generation; live camera gateway,
  RTSP/RTMP decoding, TURN and CV provider runtime validation remain gates.
- The inventory may mark Camera COMPLETE only when shared contracts, scoped
  service/routes, typed client, dedicated UI, tests and isolation registration
  exist.
