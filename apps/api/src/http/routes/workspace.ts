import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { resolveUserContext, getDashboard, listTasks, createTask, updateTaskStatus, CreateTaskSchema } from "../../services/workspace.service.js";
import { PaginationQuery } from "@windels/shared/api";
import { TaskStatus } from "@prisma/client";
import type { ApiEnvelope } from "@windels/shared/api";

export function registerWorkspaceRoutes(router: Router) {
  const ws = Router();
  ws.use(authenticate);

  // Load the user's org/workspace context into req for all downstream handlers
  ws.use(async (req, _res, next) => {
    try {
      (req as any).ctx = await resolveUserContext(req.user!.id);
      next();
    } catch (e) {
      next(e);
    }
  });

  ws.get("/dashboard", async (req, res, next) => {
    try {
      const data = await getDashboard((req as any).ctx);
      const env: ApiEnvelope<typeof data> = {
        ok: true,
        data,
        meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
      };
      res.json(env);
    } catch (e) {
      next(e);
    }
  });

  ws.get(
    "/tasks",
    validate({ query: PaginationQuery.extend({ status: z.string().optional() }) }),
    async (req, res, next) => {
      try {
        const data = await listTasks((req as any).ctx, req.query as any);
        const env: ApiEnvelope<typeof data> = {
          ok: true,
          data,
          meta: {
            requestId: req.requestId,
            tookMs: Date.now() - req.startedAt,
            pagination: data.pagination,
          },
        };
        res.json(env);
      } catch (e) {
        next(e);
      }
    }
  );

  ws.post("/tasks", validate({ body: CreateTaskSchema }), async (req, res, next) => {
    try {
      const task = await createTask((req as any).ctx, req.user!.id, req.body);
      const env: ApiEnvelope<typeof task> = {
        ok: true,
        data: task,
        meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
      };
      res.status(201).json(env);
    } catch (e) {
      next(e);
    }
  });

  ws.patch(
    "/tasks/:id",
    validate({
      params: z.object({ id: z.string().cuid() }),
      body: z.object({
        status: z.nativeEnum(TaskStatus).optional(),
        progress: z.number().int().min(0).max(100).optional(),
      }),
    }),
    async (req, res, next) => {
      try {
        const { status, progress } = req.body;
        if (!status && progress === undefined) {
          res.status(400).json({
            ok: false,
            error: { code: "BAD_REQUEST", message: "Provide status or progress to update" },
            meta: { requestId: req.requestId },
          });
          return;
        }
        const task = await updateTaskStatus(
          (req as any).ctx,
          req.user!.id,
          req.params.id,
          (status as TaskStatus) ?? TaskStatus.IN_PROGRESS,
          progress
        );
        const env: ApiEnvelope<typeof task> = {
          ok: true,
          data: task,
          meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
        };
        res.json(env);
      } catch (e) {
        next(e);
      }
    }
  );

  router.use("/workspace", ws);
}
