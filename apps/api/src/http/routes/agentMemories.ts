import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { PaginationQuery } from "@windels/shared/api";
import { CreateMemorySchema, addMemory, deleteMemory, listMemories } from "../../services/agentMemory.service.js";

export function registerAgentMemoryRoutes(router: Router) {
  router.use(authenticate);

  router.get("/:agentId/memories", validate({ params: z.object({ agentId: z.string().cuid() }), query: PaginationQuery.extend({ type: z.string().optional(), q: z.string().optional() }) }), async (req, res, next) => {
    try {
      const data = await listMemories(req.user!.id, req.params.agentId, req.query as any);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/:agentId/memories", validate({ params: z.object({ agentId: z.string().cuid() }), body: CreateMemorySchema }), async (req, res, next) => {
    try {
      const data = await addMemory(req.user!.id, req.params.agentId, req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/:agentId/memories/:memoryId", validate({ params: z.object({ agentId: z.string().cuid(), memoryId: z.string().cuid() }) }), async (req, res, next) => {
    try {
      await deleteMemory(req.user!.id, req.params.agentId, req.params.memoryId);
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
