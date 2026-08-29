import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { PaginationQuery } from "@windels/shared/api";
import { CreateKnowledgeSchema, addKnowledge, deleteKnowledge, listKnowledge } from "../../services/agentKnowledge.service.js";

export function registerAgentKnowledgeRoutes(router: Router) {
  router.use(authenticate);

  router.get("/:agentId/knowledge", validate({ params: z.object({ agentId: z.string().cuid() }), query: PaginationQuery.extend({ type: z.string().optional(), q: z.string().optional() }) }), async (req, res, next) => {
    try {
      const data = await listKnowledge(req.user!.id, req.params.agentId, req.query as any);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/:agentId/knowledge", validate({ params: z.object({ agentId: z.string().cuid() }), body: CreateKnowledgeSchema }), async (req, res, next) => {
    try {
      const data = await addKnowledge(req.user!.id, req.params.agentId, req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/:agentId/knowledge/:knowledgeId", validate({ params: z.object({ agentId: z.string().cuid(), knowledgeId: z.string().cuid() }) }), async (req, res, next) => {
    try {
      await deleteKnowledge(req.user!.id, req.params.agentId, req.params.knowledgeId);
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
