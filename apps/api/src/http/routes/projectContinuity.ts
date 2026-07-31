import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { multipartSingle } from "../middleware/multipart.js";
import { ProjectIntakeService } from "../../projectContinuity/projectIntake.service.js";
import { z } from "zod";
import { validate } from "../middleware/validate.js";

const idParam = z.object({ id: z.string().min(1).max(100) });

export function registerProjectContinuityRoutes(router: Router) {
  router.use(authenticate);
  const oid = (req: any) => req.user!.organizationId!;

  // ── Quarantine controls (registered before /:id routes) ──────────
  router.get("/projects/quarantine", async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.quarantineList(oid(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/projects/quarantine/sweep", async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.quarantineSweep(oid(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/projects/quarantine/:id/release", validate({ params: idParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.quarantineRelease(oid(req), req.params.id, req.user!.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/projects/quarantine/:id/inspect", validate({ params: idParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.quarantineInspect(oid(req), req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.delete("/projects/quarantine/:id", validate({ params: idParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.quarantineDelete(oid(req), req.params.id, req.user!.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });

  // ── Project lifecycle ────────────────────────────────────────────
  router.get("/projects", async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.list(oid(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.get("/projects/:id", validate({ params: idParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.get(oid(req), req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/projects/intake", multipartSingle("archive"), async (req, res, next) => {
    try {
      const file = (req as any).file as { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined;
      if (!file) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "archive is required" } });
      const data = await ProjectIntakeService.intake(oid(req), req.user!.id, file);
      res.status(data.status === "accepted" ? 201 : 202).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.post("/projects/:id/extract", validate({ params: idParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.extract(oid(req), req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/projects/:id/inventory", validate({ params: idParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.inventory(oid(req), req.params.id, req.user!.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/projects/:id/verify", validate({ params: idParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.verify(oid(req), req.params.id, req.user!.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/projects/:id/sandbox-validate", validate({ params: idParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.sandboxValidate(oid(req), req.params.id, req.user!.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.get("/projects/:id/health", validate({ params: idParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.health(oid(req), req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.get("/projects/:id/architecture", validate({ params: idParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.architecture(oid(req), req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.delete("/projects/:id", validate({ params: idParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.delete(oid(req), req.params.id, req.user!.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });

  // ── Change control (S84.10) ──────────────────────────────────────
  router.post("/projects/:id/snapshot", validate({ params: idParam, body: z.object({ note: z.string().max(300).optional() }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await ProjectIntakeService.snapshot(oid(req), req.params.id, req.user!.id, req.body?.note), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.get("/projects/:id/snapshots", validate({ params: idParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.snapshots(oid(req), req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/projects/:id/diff", validate({ params: idParam, body: z.object({ from: z.string().min(4).max(64), to: z.string().min(4).max(64) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.diff(oid(req), req.params.id, req.body.from, req.body.to), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/projects/:id/rollback", validate({ params: idParam, body: z.object({ snapshotId: z.string().min(4).max(64) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.rollback(oid(req), req.params.id, req.body.snapshotId, req.user!.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.get("/projects/:id/changelog", validate({ params: idParam }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ProjectIntakeService.changelog(oid(req), req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
}
