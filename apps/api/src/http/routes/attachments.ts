import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { multipartSingle } from "../middleware/multipart.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { deleteAttachment, getAttachmentBytes, listAttachments, uploadAttachment } from "../../services/attachment.service.js";
import type { ApiEnvelope } from "@windels/shared/api";

const AttachmentId = z.object({ id: z.string().cuid() });
const ListQuery = z.object({ q: z.string().trim().max(120).optional(), page: z.coerce.number().int().min(1).default(1), perPage: z.coerce.number().int().min(1).max(100).default(25) });

export function registerAttachmentRoutes(router: Router) {
  const r = Router();
  r.use(authenticate);

  r.post("/", multipartSingle("file"), async (req, res, next) => {
    try {
      const file = (req as any).file as { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined;
      if (!file) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "file required" } });
      const parsed = z.object({ conversationId: z.string().cuid().optional(), talkMessageId: z.string().cuid().optional() }).safeParse(req.body);
      if (!parsed.success) return res.status(422).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid attachment target" } });
      const data = await uploadAttachment(req.user!.id, file, parsed.data);
      const env: ApiEnvelope<typeof data> = { ok: true, data, meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt } };
      res.status(201).json(env);
    } catch (e) { next(e); }
  });

  r.get("/", validate({ query: ListQuery }), async (req, res, next) => {
    try {
      const data = await listAttachments(req.user!.id, req.query as any);
      res.json({ ok: true, data, meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt } });
    } catch (e) { next(e); }
  });

  r.get("/:id", validate({ params: AttachmentId }), async (req, res, next) => {
    try {
      const { attachment, buffer } = await getAttachmentBytes(req.user!.id, req.params.id);
      res.setHeader("Content-Type", attachment.mimeType);
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`);
      res.end(buffer);
    } catch (e) { next(e); }
  });

  r.delete("/:id", validate({ params: AttachmentId }), async (req, res, next) => {
    try {
      await deleteAttachment(req.user!.id, req.params.id);
      res.status(204).end();
    } catch (e) { next(e); }
  });

  router.use("/attachments", r);
}
