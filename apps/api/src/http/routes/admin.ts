import { Router } from "express";
import { authenticate, requireAdmin, requireSuperAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  getAdminStats,
  getAdminUser,
  impersonateUser,
  listAdminActivity,
  listUsers,
  promoteUser,
  resetUserPassword,
  resetUserPin,
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
  admin.post("/users/:id/impersonate", validate({ params: AdmUserIdSchema }), async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await impersonateUser(scope(req), req.params.id, { ip: req.ip, ua: req.headers["user-agent"] }),
        meta: { requestId: req.requestId },
      });
    } catch (e) { next(e); }
  });
  admin.post("/users/:id/pin-reset", validate({ params: AdmUserIdSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await resetUserPin(scope(req), req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  admin.post("/users/:id/password-reset", validate({ params: AdmUserIdSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await resetUserPassword(scope(req), req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  admin.get("/activity", async (req, res, next) => {
    try {
      const page = Number(req.query.page ?? 1);
      const perPage = Number(req.query.perPage ?? 40);
      res.json({ ok: true, data: await listAdminActivity(scope(req), page, perPage), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.use("/admin", admin);
}
