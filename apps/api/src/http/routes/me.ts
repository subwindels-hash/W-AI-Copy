import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { prisma } from "../../db/client.js";
import type { ApiEnvelope } from "@windels/shared/api";

interface MeResponse {
  id: string;
  email: string;
  role: "user" | "admin" | "super_admin";
  displayName: string | null;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
  theme: string;
  organization: { id: string; name: string; slug: string } | null;
  workspace: { id: string; name: string; slug: string } | null;
}

export function registerMeRoutes(router: Router) {
  const me = Router();
  me.use(authenticate);

  me.get("/", async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        include: {
          profile: true,
          memberships: {
            take: 1,
            orderBy: { joinedAt: "asc" },
            include: { organization: true, workspace: true },
          },
        },
      });
      if (!user) return res.status(401).end();
      const m = user.memberships[0];
      const data: MeResponse = {
        id: user.id,
        email: user.email,
        role: user.role.toLowerCase() as MeResponse["role"],
        displayName: user.profile?.displayName ?? null,
        avatarUrl: user.profile?.avatarUrl ?? null,
        locale: user.profile?.locale ?? "en-US",
        timezone: user.profile?.timezone ?? "UTC",
        theme: user.profile?.theme ?? "dark",
        organization: m
          ? { id: m.organization.id, name: m.organization.name, slug: m.organization.slug }
          : null,
        workspace: m?.workspace
          ? { id: m.workspace.id, name: m.workspace.name, slug: m.workspace.slug }
          : null,
      };
      const env: ApiEnvelope<MeResponse> = {
        ok: true,
        data,
        meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
      };
      res.json(env);
    } catch (e) {
      next(e);
    }
  });

  router.use("/me", me);
}
