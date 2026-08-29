import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { prisma } from "../../db/client.js";
import type { ApiEnvelope } from "@windels/shared/api";

export function registerProfileRoutes(router: Router) {
  const profile = Router();
  profile.use(authenticate);

  profile.get("/", async (req, res, next) => {
    try {
      const p = await prisma.userProfile.findUnique({ where: { userId: req.user!.id } });
      const env: ApiEnvelope<typeof p> = {
        ok: true,
        data: p,
        meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
      };
      res.json(env);
    } catch (e) {
      next(e);
    }
  });

  const updateSchema = {
    body: z.object({
      displayName: z.string().min(1).max(100).optional(),
      avatarUrl: z.string().url().nullable().optional(),
      locale: z.string().max(20).optional(),
      timezone: z.string().max(64).optional(),
      theme: z.enum(["dark", "light", "system"]).optional(),
      bio: z.string().max(2000).optional(),
    }),
  };
  profile.patch("/", validate(updateSchema), async (req, res, next) => {
    try {
      const p = await prisma.userProfile.upsert({
        where: { userId: req.user!.id },
        create: { userId: req.user!.id, ...req.body },
        update: req.body,
      });
      const env: ApiEnvelope<typeof p> = {
        ok: true,
        data: p,
        meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
      };
      res.json(env);
    } catch (e) {
      next(e);
    }
  });

  router.use("/profile", profile);
}
