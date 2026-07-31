import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { multipartSingle } from "../middleware/multipart.js";
import { ProjectIntakeService } from "../../projectContinuity/projectIntake.service.js";
import { z } from "zod";
import { validate } from "../middleware/validate.js";

export function registerProjectContinuityRoutes(router: Router) {
  router.use(authenticate);
  router.get("/projects", async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.list(req.user!.organizationId!), meta: { requestId: req.requestId } }); } catch (error) { next(error); }
  });
  router.post("/projects/:id/extract", validate({ params: z.object({ id: z.string().min(1).max(100) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.extract(req.user!.organizationId!, req.params.id), meta: { requestId: req.requestId } }); } catch (error) { next(error); }
  });
  router.post("/projects/:id/inventory", validate({ params: z.object({ id: z.string().min(1).max(100) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.inventory(req.user!.organizationId!, req.params.id), meta: { requestId: req.requestId } }); } catch (error) { next(error); }
  });
  router.post("/projects/:id/verify", validate({ params: z.object({ id: z.string().min(1).max(100) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.verify(req.user!.organizationId!, req.params.id), meta: { requestId: req.requestId } }); } catch (error) { next(error); }
  });
  router.post("/projects/intake", multipartSingle("archive"), async (req, res, next) => {
    try {
      const file = (req as any).file as { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined;
      if (!file) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "archive is required" } });
      const data = await ProjectIntakeService.intake(req.user!.organizationId!, req.user!.id, file);
      res.status(data.status === "accepted" ? 201 : 202).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });
}
