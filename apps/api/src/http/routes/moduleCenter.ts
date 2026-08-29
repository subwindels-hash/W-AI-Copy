import { Router } from "express";
import { z } from "zod";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { streamModulePackage } from "../middleware/moduleUpload.js";
import { AppError } from "../../utils/result.js";
import { ModuleCenterService, type ModuleActor } from "../../moduleCenter/moduleCenter.service.js";

const Id = z.object({ id: z.string().cuid() });
const Action = z.object({ idempotencyKey: z.string().min(12).max(180) });
function actor(req: any): ModuleActor { return { userId: req.user!.id, organizationId: req.user!.organizationId ?? null }; }
function meta(req: any) { return { requestId: req.requestId, tookMs: Date.now() - req.startedAt }; }

/** Super-Admin-only control plane for signed module packages and deployments. */
export function registerModuleCenterRoutes(parent: Router) {
  const router = Router();
  router.use(authenticate, requireSuperAdmin);

  router.get("/dashboard", async (req, res, next) => { try { res.json({ ok: true, data: await ModuleCenterService.dashboard(), meta: meta(req) }); } catch (error) { next(error); } });
  router.get("/modules", async (req, res, next) => { try { res.json({ ok: true, data: await ModuleCenterService.list(), meta: meta(req) }); } catch (error) { next(error); } });
  router.get("/modules/:id", validate({ params: Id }), async (req, res, next) => { try { res.json({ ok: true, data: await ModuleCenterService.get(req.params.id), meta: meta(req) }); } catch (error) { next(error); } });
  router.get("/uploads", validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }) }), async (req, res, next) => { try { res.json({ ok: true, data: await ModuleCenterService.uploads(Number(req.query.limit)), meta: meta(req) }); } catch (error) { next(error); } });
  router.get("/operations", validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(200) }) }), async (req, res, next) => { try { res.json({ ok: true, data: await ModuleCenterService.operations(Number(req.query.limit)), meta: meta(req) }); } catch (error) { next(error); } });

  router.post("/uploads", rateLimit("admin"), streamModulePackage("package"), async (req, res, next) => {
    try {
      if (!req.moduleUpload) throw AppError.validation("Module package file is required");
      res.status(201).json({ ok: true, data: await ModuleCenterService.ingest(actor(req), req.moduleUpload), meta: meta(req) });
    } catch (error) { next(error); }
  });

  router.post("/releases/:id/verify", rateLimit("admin"), validate({ params: Id, body: Action }), async (req, res, next) => { try { res.json({ ok: true, data: await ModuleCenterService.verify(actor(req), req.params.id, req.body.idempotencyKey), meta: meta(req) }); } catch (error) { next(error); } });
  router.post("/releases/:id/sandbox-test", rateLimit("admin"), validate({ params: Id, body: Action }), async (req, res, next) => { try { res.json({ ok: true, data: await ModuleCenterService.sandbox(actor(req), req.params.id, req.body.idempotencyKey), meta: meta(req) }); } catch (error) { next(error); } });
  router.post("/releases/:id/approve", rateLimit("admin"), validate({ params: Id, body: Action }), async (req, res, next) => { try { res.json({ ok: true, data: await ModuleCenterService.approve(actor(req), req.params.id, req.body.idempotencyKey), meta: meta(req) }); } catch (error) { next(error); } });
  router.post("/releases/:id/install", rateLimit("admin"), validate({ params: Id, body: Action }), async (req, res, next) => { try { res.json({ ok: true, data: await ModuleCenterService.install(actor(req), req.params.id, req.body.idempotencyKey), meta: meta(req) }); } catch (error) { next(error); } });

  for (const [path, action] of [["enable", "ENABLE"], ["disable", "DISABLE"], ["restart", "RESTART"], ["health-check", "HEALTH_CHECK"]] as const) {
    router.post(`/modules/:id/${path}`, rateLimit("admin"), validate({ params: Id, body: Action }), async (req, res, next) => { try { res.json({ ok: true, data: await ModuleCenterService.lifecycleAction(actor(req), req.params.id, action, req.body.idempotencyKey), meta: meta(req) }); } catch (error) { next(error); } });
  }
  router.post("/modules/:id/rollback", rateLimit("admin"), validate({ params: Id, body: Action }), async (req, res, next) => { try { res.json({ ok: true, data: await ModuleCenterService.rollback(actor(req), req.params.id, req.body.idempotencyKey), meta: meta(req) }); } catch (error) { next(error); } });
  router.post("/modules/:id/remove", rateLimit("admin"), validate({ params: Id, body: Action }), async (req, res, next) => { try { res.json({ ok: true, data: await ModuleCenterService.remove(actor(req), req.params.id, req.body.idempotencyKey), meta: meta(req) }); } catch (error) { next(error); } });

  parent.use("/super-admin/module-center", router);
}
