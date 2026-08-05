# SESSION 3 — RUNTIME VALIDATION CHECKLIST

**Applies to:** WINDELS AI OS, Session 3 (AI Chat)
**Status:** 🟡 NOT YET EXECUTED — must run in the target deployment environment.
Session 3 cannot be **PRODUCTION COMPLETE** until this passes.

> Sandbox unit tests are not a substitute for any row below.

## 1. Build & DB
- [ ] `pnpm build` succeeds; `prisma migrate deploy` (Message/Conversation tables present).
- [ ] `.env` populated; optional AI keys (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`/`OLLAMA_*`) available for real-provider checks.

## 2. Health & honest provider state
- [ ] API boots; `/healthz` → 200.
- [ ] `GET /ai/health` → `hasRealProvider` reflects the configured keys honestly.
- [ ] `GET /ai/providers` lists providers with health/latency.

## 3. Completion & models
- [ ] With a real key: `GET /ai/models` lists real models; `POST /ai/complete` returns content.
- [ ] Strict mode without a real key: `POST /ai/complete` → `AI_PROVIDER_CONFIGURATION_REQUIRED` (no canned echo).

## 4. Chat streaming
- [ ] Create conversation → participant; `POST /conversations/:id/messages` streams `message.created` → `message.delta` → `message.done`.
- [ ] Conversation `lastMessageAt`/`summary` updated; `MESSAGE_SENT` activity created.
- [ ] Thread reply works; parent from another conversation → 400.

## 5. Security / hardening
- [ ] Prompt-injection message → `AI_PROMPT_INJECTION` (score ≥ 80 blocked).
- [ ] Rate limit: repeated calls → `AI_RATE_LIMITED`.
- [ ] Cross-tenant: org B cannot read org A messages.

## 6. Embeddings
- [ ] `POST /ai/embed` returns embeddings (hash fallback or real provider); `RAG` consumers work.

## 7. Frontend / e2e
- [ ] `/app/chat` streams and renders a reply; `/ai/health` warning shows honestly when no provider.
- [ ] `pnpm test:e2e --project=chromium` — chat spec passes.

## 8. Performance
- [ ] Streaming completes within budget; token/cost telemetry (`/ai/usage`) records real rows.

## 9. Security
- [ ] No cross-org data leak; no real API keys leaked to the client.

## Sign-off
All boxes checked with evidence → Session 3 becomes **PRODUCTION COMPLETE**. Until then, 🟡 VERIFIED (partial).
