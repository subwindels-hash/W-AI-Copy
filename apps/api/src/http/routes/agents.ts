import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { PaginationQuery } from "@windels/shared/api";
import { CreateAgentSchema, UpdateAgentSchema, listAgents, getAgent, createAgent, updateAgent, deleteAgent, listAgentEvents } from "../../services/agent.service.js";
import { aiRegistry } from "../../services/ai/registry.js";
import { CreateSkillSchema, UpdateSkillSchema, createSkill, deleteSkill, getSkill, listAgentSkills, updateSkill } from "../../services/agentSkills.service.js";
import { getLifecycleHistory, getLifecycleState, TransitionSchema, transitionAgent } from "../../services/agentLifecycle.service.js";

const AgentId = z.object({ id: z.string().cuid() });
const AgentSkillId = z.object({ id: z.string().cuid(), skillId: z.string().cuid() });

export function registerAgentRoutes(router: Router) {
  router.use(authenticate);

  // Static routes must precede /:id.
  router.get("/meta/models", (_req, res) => res.json({ ok: true, data: aiRegistry.listModels() }));
  router.get("/", validate({ query: PaginationQuery.extend({ status: z.enum(["idle", "online", "working", "error", "paused", "offline"]).optional(), q: z.string().trim().max(120).optional() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await listAgents(req.user!.id, req.query as any, req.query as any), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/", validate({ body: CreateAgentSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await createAgent(req.user!.id, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });

  router.get("/:id", validate({ params: AgentId }), async (req, res, next) => {
    try { res.json({ ok: true, data: await getAgent(req.user!.id, req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.patch("/:id", validate({ params: AgentId, body: UpdateAgentSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await updateAgent(req.user!.id, req.params.id, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.delete("/:id", validate({ params: AgentId }), async (req, res, next) => {
    try { await deleteAgent(req.user!.id, req.params.id); res.status(204).end(); } catch (e) { next(e); }
  });
  router.get("/:id/events", validate({ params: AgentId, query: PaginationQuery }), async (req, res, next) => {
    try { res.json({ ok: true, data: await listAgentEvents(req.user!.id, req.params.id, req.query as any), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });

  router.get("/:id/lifecycle", validate({ params: AgentId }), async (req, res, next) => {
    try { await getAgent(req.user!.id, req.params.id); res.json({ ok: true, data: { current: await getLifecycleState(req.params.id), history: await getLifecycleHistory(req.params.id) }, meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/:id/lifecycle", validate({ params: AgentId, body: TransitionSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await transitionAgent(req.user!.id, req.params.id, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });

  router.get("/:id/skills", validate({ params: AgentId, query: PaginationQuery.extend({ enabled: z.coerce.boolean().optional() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await listAgentSkills(req.user!.id, req.params.id, req.query as any), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/:id/skills", validate({ params: AgentId, body: CreateSkillSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await createSkill(req.user!.id, req.params.id, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.get("/:id/skills/:skillId", validate({ params: AgentSkillId }), async (req, res, next) => {
    try { res.json({ ok: true, data: await getSkill(req.user!.id, req.params.id, req.params.skillId), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.patch("/:id/skills/:skillId", validate({ params: AgentSkillId, body: UpdateSkillSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await updateSkill(req.user!.id, req.params.id, req.params.skillId, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.delete("/:id/skills/:skillId", validate({ params: AgentSkillId }), async (req, res, next) => {
    try { await deleteSkill(req.user!.id, req.params.id, req.params.skillId); res.status(204).end(); } catch (e) { next(e); }
  });
}
