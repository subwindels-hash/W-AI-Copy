# SESSION 2 — RUNTIME VALIDATION CHECKLIST

**Applies to:** WINDELS AI OS, Session 2 (Universal Workspace)
**Status:** 🟡 NOT YET EXECUTED — must run in the target deployment environment
(live PostgreSQL 17, Redis 8, Node 20/22, pnpm ≥9, reachable Prisma engine download).
Session 2 cannot be **PRODUCTION COMPLETE** until this passes.

> Sandbox unit tests are not a substitute for any row below.

## 1. Build & DB
- [ ] `pnpm build` (all workspaces) succeeds.
- [ ] `cd apps/api && pnpm exec prisma generate && pnpm exec prisma migrate deploy` — `Workspace`, `Conversation`, `ConversationParticipant`, `Message`, `MessageAttachment`, `Activity`, `Task` tables present.
- [ ] `.env` populated (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `WINDELS_ENCRYPTION_KEY`).

## 2. Startup & health
- [ ] API boots; `/healthz` → 200.
- [ ] `/workspace/dashboard` with a valid token → 200 with org/workspace + stats.

## 3. Conversations & messages
- [ ] `POST /conversations` → conversation + creator participant.
- [ ] `GET /conversations` paginates; pinned-first, lastMessageAt-desc.
- [ ] `POST /conversations/:id/messages` with a real AI provider → SSE `message.done`, conversation `lastMessageAt`/`summary` updated, `MESSAGE_SENT` activity created.
- [ ] Thread reply works; parent from a different conversation → 400.
- [ ] `GET /conversations/:id/messages` returns ascending order + pagination.

## 4. Workspace tasks
- [ ] `POST /workspace/tasks` → task + `TASK_CREATED` activity; `TASK_COMPLETED` on DONE.
- [ ] `PATCH /workspace/tasks/:id` → `completedAt` set when DONE; progress 100.
- [ ] Cross-org: org B cannot read/update org A tasks (403/404).

## 5. Attachments
- [ ] Valid upload → checksum + org-scoped storage key.
- [ ] Disallowed MIME / >25MB / empty → rejected.
- [ ] Claimed attachment appears on the message; cannot be claimed by another org/conversation.

## 6. Cross-tenant isolation
- [ ] Org B user cannot fetch or list org A conversations/messages/tasks (verifies orgScope).

## 7. Frontend / e2e
- [ ] `/app/workspace` renders the live dashboard (was a placeholder).
- [ ] `/app/chat` starts a conversation and streams a reply.
- [ ] `pnpm test:e2e --project=chromium` — chat/conversation specs pass.

## 8. Performance
- [ ] Message stream completes within budget; dashboard < 300 ms p95.
- [ ] No unbounded query (listMessages perPage capped, tasks paginated).

## 9. Security
- [ ] No cross-org data leak in any Session 2 endpoint.
- [ ] Message content not exposed to non-participants; soft-deleted conversations not listed.

## Sign-off
All boxes checked with recorded evidence → Session 2 becomes **PRODUCTION COMPLETE**. Until then, 🟡 VERIFIED (partial).
