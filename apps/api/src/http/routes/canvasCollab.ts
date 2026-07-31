import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import {
  listCanvases, getCanvas, createCanvas, updateCanvas, deleteCanvas,
  addBlock, updateBlock, deleteBlock, addConnection, deleteConnection,
} from "../../services/canvas.service.js";
import { CanvasCollabService } from "../../collaboration/canvasCollab.service.js";

const CanvasIdParams = z.object({ id: z.string().cuid() });

/**
 * Session 22 — Canvas Collab router.
 *
 * S5 delivers the document API at `/canvases`; this router mounts the SAME
 * service under `/canvas` (the route prefix the S22 audit expects) and adds
 * the realtime collaboration layer: presence heartbeats, live cursors, and a
 * Redis pub/sub channel for peer events. Mounted in server.ts at BOTH
 * `/canvases` (extending S5's router with collab endpoints) and `/canvas`.
 */
export function registerCanvasCollabRoutes(router: Router) {
  router.use(authenticate);

  // ── CRUD (same real service as S5, exposed at the S22 prefix) ──
  router.get("/", validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1), perPage: z.coerce.number().int().min(1).max(100).default(20), q: z.string().optional(), workspaceId: z.string().optional() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await listCanvases(req.user!.id, req.query as any), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/", validate({ body: z.object({ title: z.string().min(1).max(120), description: z.string().max(500).optional(), access: z.enum(["PRIVATE", "WORKSPACE", "ORGANIZATION"]).default("WORKSPACE"), workspaceId: z.string().cuid().optional(), backgroundColor: z.string().optional(), isTemplate: z.boolean().optional() }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await createCanvas(req.user!.id, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.get("/:id", validate({ params: CanvasIdParams }), async (req, res, next) => {
    try { res.json({ ok: true, data: await getCanvas(req.user!.id, req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.patch("/:id", validate({ params: CanvasIdParams, body: z.object({ title: z.string().min(1).max(120).optional(), description: z.string().max(500).optional(), access: z.enum(["PRIVATE", "WORKSPACE", "ORGANIZATION"]).optional(), backgroundColor: z.string().optional(), viewportX: z.number().optional(), viewportY: z.number().optional(), viewportZoom: z.number().min(0.1).max(3).optional() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await updateCanvas(req.user!.id, req.params.id, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.delete("/:id", validate({ params: CanvasIdParams }), async (req, res, next) => {
    try { await deleteCanvas(req.user!.id, req.params.id); res.json({ ok: true, meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });

  // ── Realtime collaboration (presence + cursors) ─────────────────
  const collabBody = z.object({ displayName: z.string().min(1).max(120), avatarColor: z.string().max(16).optional() });
  router.post("/:id/presence", validate({ params: CanvasIdParams, body: collabBody }), async (req, res, next) => {
    try {
      const p = await CanvasCollabService.heartbeat(req.params.id, { userId: req.user!.id, displayName: req.body.displayName, avatarColor: req.body.avatarColor });
      res.json({ ok: true, data: p, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.get("/:id/presence", validate({ params: CanvasIdParams }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CanvasCollabService.presence(req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.put("/:id/cursor", validate({ params: CanvasIdParams, body: z.object({ displayName: z.string().min(1).max(120), x: z.number(), y: z.number() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CanvasCollabService.moveCursor(req.params.id, { userId: req.user!.id, displayName: req.body.displayName }, req.body.x, req.body.y), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.get("/:id/cursors", validate({ params: CanvasIdParams }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CanvasCollabService.cursors(req.params.id), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.delete("/:id/presence", validate({ params: CanvasIdParams }), async (req, res, next) => {
    try { await CanvasCollabService.leave(req.params.id, req.user!.id); res.json({ ok: true, meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
}
