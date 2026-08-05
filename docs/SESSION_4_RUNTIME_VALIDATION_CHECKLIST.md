# SESSION 4 — RUNTIME VALIDATION CHECKLIST

**Applies to:** WINDELS AI OS, Session 4 (AI Workforce: agents, memory, knowledge, skills)
**Status:** 🟡 NOT YET EXECUTED — must run in the target deployment environment.
Session 4 cannot be **PRODUCTION COMPLETE** until this passes.

> Sandbox unit tests are not a substitute for any row below.

## 1. Build & DB
- [ ] `pnpm build` succeeds; `prisma migrate deploy` (Agent/AgentMemory/AgentKnowledge/AgentSkill/AgentEvent tables).
- [ ] `.env` populated.

## 2. Startup & agents
- [ ] API boots; `/healthz` → 200.
- [ ] Create agent → org-scoped agent; list/get return it; status/event lifecycle works.

## 3. Memory
- [ ] `POST /agents/:id/memories` → memory persisted + `MEMORY_STORED` event + activity.
- [ ] List/filter by type + search; pagination correct.
- [ ] Recall top-K; `autoRemember` dedups identical content.
- [ ] Cross-tenant: org B cannot add/list org A agent memories.

## 4. Knowledge
- [ ] `POST /agents/:id/knowledge` → token count computed + `KNOWLEDGE_ADDED` event.
- [ ] Retrieve by term matches title/content; cross-tenant denied.

## 5. Skills
- [ ] `listSkillTemplates` returns built-ins; `addSkillFromTemplate` works.
- [ ] Execute an enabled skill; missing → 404, disabled → 403.
- [ ] Toggle enable/disable; `agentHasSkill` reflects state.

## 6. Cross-tenant isolation
- [ ] No org A agent data visible/writable from org B across memory/knowledge/skills.

## 7. Frontend / e2e
- [ ] `/app/workforce` renders agents + memory/knowledge/skills tabs with real data.
- [ ] `pnpm test:e2e --project=chromium` — agents specs pass.

## 8. Performance
- [ ] Memory/knowledge list calls < 300 ms p95; retrieval capped (k).

## 9. Security
- [ ] No cross-org data leak in any agent endpoint.

## Sign-off
All boxes checked with evidence → Session 4 becomes **PRODUCTION COMPLETE**. Until then, 🟡 VERIFIED (partial).
