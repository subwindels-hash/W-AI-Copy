import { Router } from "express";
import { authenticate, requireAdmin, requireSuperAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  getAdminStats,
  getAdminUser,
  listUsers,
  promoteUser,
  setUserSuspended,
} from "../../services/admin.service.js";
import {
  AdmRoleChangeSchema,
  AdmSuspensionSchema,
  AdmUserIdSchema,
  AdmUserListQuerySchema,
} from "@windels/shared/admin";

const scope = (req: any) => ({ actorId: req.user!.id, organizationId: req.user!.organizationId });

export function registerAdminRoutes(router: Router) {
  const admin = Router();
  admin.use(authenticate, requireAdmin);

  admin.get("/stats", async (req, res, next) => {
    try { res.json({ ok: true, data: await getAdminStats(scope(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  admin.get("/users", validate({ query: AdmUserListQuerySchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await listUsers(scope(req), req.query as any), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  admin.get("/users/:id", validate({ params: AdmUserIdSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await getAdminUser(scope(req), req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  admin.post("/users/:id/suspension", validate({ params: AdmUserIdSchema, body: AdmSuspensionSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await setUserSuspended(scope(req), req.params.id, req.body.suspended), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  admin.patch("/users/:id/role", requireSuperAdmin, validate({ params: AdmUserIdSchema, body: AdmRoleChangeSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await promoteUser(scope(req), req.params.id, req.body.role), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.use("/admin", admin);
}
