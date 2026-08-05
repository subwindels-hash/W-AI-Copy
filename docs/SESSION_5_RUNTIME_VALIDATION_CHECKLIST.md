# SESSION 5 — RUNTIME VALIDATION CHECKLIST

**Applies to:** WINDELS AI OS, Session 5 (Windels Workspace / Canvas)
**Status:** 🟡 NOT YET EXECUTED — must run in the target deployment environment.
Session 5 cannot be **PRODUCTION COMPLETE** until this passes.

> Sandbox unit tests are not a substitute for any row below.

## 1. Build & DB
- [ ] `pnpm build` succeeds; `prisma migrate deploy` (Canvas/CanvasBlock/CanvasConnection tables).
- [ ] `.env` populated.

## 2. Startup & canvases
- [ ] API boots; `/healthz` → 200.
- [ ] Create canvas → org/workspace scoped; list returns own-org canvases only.

## 3. Access levels (live DB)
- [ ] PRIVATE canvas readable only by creator; same-org other user denied (403).
- [ ] WORKSPACE canvas visible to same-workspace members; ORGANIZATION visible org-wide.
- [ ] Cross-tenant: org B cannot read/modify org A canvas (404/403).

## 4. Blocks
- [ ] Add/update/delete block; block-must-belong-to-canvas enforced (update to wrong canvas → 404).
- [ ] Canvas `updatedAt` touches on block/connection change.

## 5. Connections
- [ ] Self-connection → 400; duplicate → 409; cross-canvas block reference → 404.
- [ ] Deleting a block removes its connections.

## 6. Soft-delete
- [ ] Delete canvas sets `deletedAt` (row survives for audit) and it stops being listed.

## 7. AI block generation
- [ ] With a real provider: generates content and streams `{delta}` → `{done, result}`.
- [ ] Strict mode without provider: honest provider-required error, no canned content.

## 8. Realtime collab
- [ ] Presence heartbeat + leave; cursor sync; canvas isolation (per-org).

## 9. Frontend / e2e
- [ ] `/app/canvas` renders, edits blocks, and adds connections.
- [ ] `pnpm test:e2e --project=chromium` — canvas specs pass.

## 10. Security
- [ ] No cross-org canvas data leak; AI block prompts not exposed cross-tenant.

## Sign-off
All boxes checked with evidence → Session 5 becomes **PRODUCTION COMPLETE**. Until then, 🟡 VERIFIED (partial).
