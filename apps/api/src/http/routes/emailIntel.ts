import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { EmailIntelService } from "../../emailIntel/emailIntel.service.js";
// Request contracts live in @windels/shared so the API and the web client
// validate against one definition instead of hand-copied ones.
import {
  EiMailboxUpsertSchema,
  EiMessageCreateSchema,
  EiDraftSchema,
  EiSummarizeSchema,
  EiTriageSchema,
} from "@windels/shared/emailIntel";

const orgOf = (req: any) => req.user!.organizationId!;
const userOf = (req: any): string | null => req.user?.id ?? null;

const IdParam = z.object({ id: z.string().min(1).max(64) });

export function registerEmailIntelRoutes(router: Router) {
  router.use(authenticate);

  // ── Dashboard & intelligence ──────────────────────────────────────
  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const data = await EmailIntelService.rollup(orgOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/intelligence/draft", validate({ body: EiDraftSchema }), async (req, res, next) => {
    try {
      const data = await EmailIntelService.draftEmail(req.body);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/intelligence/summarize", validate({ body: EiSummarizeSchema }), async (req, res, next) => {
    try {
      const data = await EmailIntelService.summarizeThread(orgOf(req), req.body.threadId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/intelligence/triage", validate({ body: EiTriageSchema }), async (req, res, next) => {
    try {
      const data = await EmailIntelService.triageThread(orgOf(req), req.body.threadId);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Mailboxes ─────────────────────────────────────────────────────
  router.get("/mailboxes", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await EmailIntelService.listMailboxes(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/mailboxes", validate({ body: EiMailboxUpsertSchema }), async (req, res, next) => {
    try {
      const data = await EmailIntelService.createMailbox(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/mailboxes/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await EmailIntelService.getMailbox(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Mailbox not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/mailboxes/:id", validate({ params: IdParam, body: EiMailboxUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await EmailIntelService.updateMailbox(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Mailbox not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/mailboxes/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await EmailIntelService.deleteMailbox(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Mailbox not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/mailboxes/:id/test", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await EmailIntelService.testMailbox(orgOf(req), req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Threads ───────────────────────────────────────────────────────
  router.get("/threads", async (req, res, next) => {
    try {
      const mailboxId = typeof req.query.mailboxId === "string" ? req.query.mailboxId : undefined;
      const unreadOnly = req.query.unreadOnly === "true";
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const data = await EmailIntelService.listThreads(orgOf(req), { mailboxId, unreadOnly, q });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/threads/:threadId", validate({ params: z.object({ threadId: z.string().min(1).max(64) }) }), async (req, res, next) => {
    try {
      const data = await EmailIntelService.getThread(orgOf(req), req.params.threadId);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Thread not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Messages ──────────────────────────────────────────────────────
  router.get("/messages", async (req, res, next) => {
    try {
      const threadId = typeof req.query.threadId === "string" ? req.query.threadId : undefined;
      const mailboxId = typeof req.query.mailboxId === "string" ? req.query.mailboxId : undefined;
      const direction = typeof req.query.direction === "string" ? (req.query.direction as any) : undefined;
      const data = await EmailIntelService.listMessages(orgOf(req), { threadId, mailboxId, direction });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/messages", validate({ body: EiMessageCreateSchema }), async (req, res, next) => {
    try {
      const data = await EmailIntelService.createMessage(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch(
    "/messages/:id",
    validate({
      params: IdParam,
      body: z.object({
        isRead: z.boolean().optional(),
        labels: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
        contactId: z.string().trim().max(64).nullable().optional(),
        dealId: z.string().trim().max(64).nullable().optional(),
        companyId: z.string().trim().max(64).nullable().optional(),
      }),
    }),
    async (req, res, next) => {
      try {
        const data = await EmailIntelService.updateMessage(orgOf(req), req.params.id, req.body, userOf(req));
        if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Message not found" } });
        res.json({ ok: true, data, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  router.delete("/messages/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await EmailIntelService.deleteMessage(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Message not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/messages/:id/send", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await EmailIntelService.sendMessage(orgOf(req), req.params.id);
      res.status(data.sent ? 200 : 200).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
