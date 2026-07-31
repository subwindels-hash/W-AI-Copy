import { Router } from "express";
import { authenticate, requireAdmin, requireSuperAdmin } from "../middleware/auth.js";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { getAdminStats, listUsers, promoteUser, setUserSuspended } from "../../services/admin.service.js";

const UserId = z.object({ id: z.string().cuid() });
const ListQuery = z.object({ q: z.string().trim().max(120).optional(), page: z.coerce.number().int().min(1).default(1), perPage: z.coerce.number().int().min(1).max(100).default(25) });
const scope = (req: any) => ({ actorId: req.user!.id, organizationId: req.user!.organizationId });

export function registerAdminRoutes(router: Router) {
  const admin = Router();
  admin.use(authenticate, requireAdmin);

  admin.get("/stats", async (req, res, next) => {
    try { res.json({ ok: true, data: await getAdminStats(scope(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  admin.get("/users", validate({ query: ListQuery }), async (req, res, next) => {
    try { res.json({ ok: true, data: await listUsers(scope(req), req.query as any), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  admin.post("/users/:id/suspension", validate({ params: UserId, body: z.object({ suspended: z.boolean() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await setUserSuspended(scope(req), req.params.id, req.body.suspended), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  admin.patch("/users/:id/role", requireSuperAdmin, validate({ params: UserId, body: z.object({ role: z.enum(["user", "admin", "super_admin"]) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await promoteUser(scope(req), req.params.id, req.body.role), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.use("/admin", admin);
}
