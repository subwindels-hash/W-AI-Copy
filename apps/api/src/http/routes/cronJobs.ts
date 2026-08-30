/** Super Admin — platform-level cron jobs (create, schedule, run, log). */
import { Router } from "express";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  CronJobEnabledSchema,
  CronJobIdParamSchema,
  CronJobSchema,
  CronJobUpdateSchema,
} from "@windels/shared/superAdminCron";
import { CronJobsService } from "../../cronJobs/cronJobs.service.js";

export function registerCronJobRoutes(router: Router) {
  const admin = Router();
  admin.use(authenticate, requireSuperAdmin, rateLimit("admin", (req) => req.user?.id ?? req.ip ?? "unknown"));

  admin.get("/overview", async (req, res, next) => {
    try { res.json({ ok: true, data: await CronJobsService.overview(), meta: { requestId: req.requestId } }); }
    catch (error) { next(error); }
  });

  admin.get("/jobs", async (req, res, next) => {
    try { res.json({ ok: true, data: await CronJobsService.list(), meta: { requestId: req.requestId } }); }
    catch (error) { next(error); }
  });

  admin.get("/jobs/:id", validate({ params: CronJobIdParamSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CronJobsService.get(req.params.id), meta: { requestId: req.requestId } }); }
    catch (error) { next(error); }
  });

  admin.post("/jobs", validate({ body: CronJobSchema }), async (req, res, next) => {
    try {
      const job = await CronJobsService.create(req.body, req.user!.id);
      res.status(201).json({ ok: true, data: job, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  admin.patch("/jobs/:id", validate({ params: CronJobIdParamSchema, body: CronJobUpdateSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CronJobsService.update(req.params.id, req.body, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (error) { next(error); }
  });

  admin.delete("/jobs/:id", validate({ params: CronJobIdParamSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CronJobsService.remove(req.params.id, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (error) { next(error); }
  });

  admin.post("/jobs/:id/enabled", validate({ params: CronJobIdParamSchema, body: CronJobEnabledSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CronJobsService.setEnabled(req.params.id, Boolean(req.body.enabled), req.user!.id), meta: { requestId: req.requestId } }); }
    catch (error) { next(error); }
  });

  admin.post("/jobs/:id/run", validate({ params: CronJobIdParamSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CronJobsService.runNow(req.params.id, req.user!.id), meta: { requestId: req.requestId } }); }
    catch (error) { next(error); }
  });

  admin.get("/logs", async (req, res, next) => {
    try {
      const limit = Number(req.query.limit ?? 50);
      res.json({ ok: true, data: await CronJobsService.logs(limit), meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
}
