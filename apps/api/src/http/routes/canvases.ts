import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { PaginationQuery } from "@windels/shared/api";
import {
  CreateCanvasSchema, UpdateCanvasSchema, CreateBlockSchema, UpdateBlockSchema, CreateConnectionSchema,
  listCanvases, getCanvas, createCanvas, updateCanvas, deleteCanvas,
  addBlock, updateBlock, deleteBlock, addConnection, deleteConnection,
  generateBlockContent,
} from "../../services/canvas.service.js";

const CanvasIdParams = z.object({ id: z.string().cuid() });
const BlockIdParams = CanvasIdParams.extend({ blockId: z.string().cuid() });
const ConnectionIdParams = CanvasIdParams.extend({ connId: z.string().cuid() });

export function registerCanvasRoutes(router: Router) {
  router.use(authenticate);

  router.get("/", validate({ query: PaginationQuery.extend({ q: z.string().optional(), workspaceId: z.string().optional() }) }), async (req, res, next) => {
    try {
      const data = await listCanvases(req.user!.id, req.query as any);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/", validate({ body: CreateCanvasSchema }), async (req, res, next) => {
    try {
      const c = await createCanvas(req.user!.id, req.body);
      res.status(201).json({ ok: true, data: c, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/:id", validate({ params: CanvasIdParams }), async (req, res, next) => {
    try {
      const data = await getCanvas(req.user!.id, req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/:id", validate({ params: CanvasIdParams, body: UpdateCanvasSchema }), async (req, res, next) => {
    try {
      const c = await updateCanvas(req.user!.id, req.params.id, req.body);
      res.json({ ok: true, data: c, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/:id", validate({ params: CanvasIdParams }), async (req, res, next) => {
    try {
      await deleteCanvas(req.user!.id, req.params.id);
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Blocks
  router.post("/:id/blocks", validate({ params: CanvasIdParams, body: CreateBlockSchema }), async (req, res, next) => {
    try {
      const b = await addBlock(req.user!.id, req.params.id, req.body);
      res.status(201).json({ ok: true, data: b, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/:id/blocks/:blockId", validate({ params: BlockIdParams, body: UpdateBlockSchema }), async (req, res, next) => {
    try {
      const b = await updateBlock(req.user!.id, req.params.id, req.params.blockId, req.body);
      res.json({ ok: true, data: b, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/:id/blocks/:blockId", validate({ params: BlockIdParams }), async (req, res, next) => {
    try {
      await deleteBlock(req.user!.id, req.params.id, req.params.blockId);
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Connections
  router.post("/:id/connections", validate({ params: CanvasIdParams, body: CreateConnectionSchema }), async (req, res, next) => {
    try {
      const c = await addConnection(req.user!.id, req.params.id, req.body);
      res.status(201).json({ ok: true, data: c, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/:id/connections/:connId", validate({ params: ConnectionIdParams }), async (req, res, next) => {
    try {
      await deleteConnection(req.user!.id, req.params.id, req.params.connId);
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // SSE AI generation for a block
  router.post("/:id/blocks/:blockId/generate", validate({ params: BlockIdParams, body: z.object({ prompt: z.string().min(1).max(4000), modelId: z.string().optional() }) }), async (req, res, next) => {
    try {
      const accepts = req.headers.accept ?? "";
      if (accepts.includes("text/event-stream")) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.write(`: connected ${Date.now()}\n\n`);
        const ac = new AbortController();
        res.on("close", () => { if (!res.writableFinished) ac.abort(); });
        req.on("aborted", () => ac.abort());
        await generateBlockContent(req.user!.id, req.params.id, req.params.blockId, req.body.prompt, req.body.modelId, (chunk) => {
          res.write(`data: ${chunk}\n\n`);
        }, ac.signal);
        if (!res.writableEnded) res.end();
        return;
      }
      // Non-streaming fallback
      let final = "";
      const ac = new AbortController();
      await generateBlockContent(req.user!.id, req.params.id, req.params.blockId, req.body.prompt, req.body.modelId, (chunk) => {
        try { const d = JSON.parse(chunk); if (d.delta) final += d.delta; else if (d.result) final = d.result; } catch {}
      }, ac.signal);
      res.json({ ok: true, data: { result: final }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
