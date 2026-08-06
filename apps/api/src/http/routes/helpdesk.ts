import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HelpdeskService } from "../../helpdesk/helpdesk.service.js";
// Request contracts live in @windels/shared so the API and the web client
// validate against one definition instead of hand-copied ones.
import {
  HdTicketUpsertSchema,
  HdCommentCreateSchema,
  HdTransitionSchema,
  HdAssignSchema,
} from "@windels/shared/helpdesk";

const orgOf = (req: any) => req.user!.organizationId!;
const userOf = (req: any): string | null => req.user?.id ?? null;

const IdParam = z.object({ id: z.string().min(1).max(64) });
const TicketParam = z.object({ ticketId: z.string().min(1).max(64) });

export function registerHelpdeskRoutes(router: Router) {
  router.use(authenticate);

  // ── Dashboard ─────────────────────────────────────────────────────
  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await HelpdeskService.rollup(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Tickets ───────────────────────────────────────────────────────
  router.get("/tickets", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? (req.query.status as any) : undefined;
      const priority = typeof req.query.priority === "string" ? (req.query.priority as any) : undefined;
      const assigneeId = typeof req.query.assigneeId === "string" ? req.query.assigneeId : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const data = await HelpdeskService.listTickets(orgOf(req), { status, priority, assigneeId, q });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/tickets", validate({ body: HdTicketUpsertSchema }), async (req, res, next) => {
    try {
      const data = await HelpdeskService.createTicket(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/tickets/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await HelpdeskService.getTicketDetail(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Ticket not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/tickets/:id", validate({ params: IdParam, body: HdTicketUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await HelpdeskService.updateTicket(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Ticket not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/tickets/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await HelpdeskService.deleteTicket(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Ticket not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/tickets/:id/assign", validate({ params: IdParam, body: HdAssignSchema }), async (req, res, next) => {
    try {
      const data = await HelpdeskService.assignTicket(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Ticket not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/tickets/:id/transition", validate({ params: IdParam, body: HdTransitionSchema }), async (req, res, next) => {
    try {
      const data = await HelpdeskService.transitionTicket(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Ticket not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Comments ──────────────────────────────────────────────────────
  router.get("/tickets/:ticketId/comments", validate({ params: TicketParam }), async (req, res, next) => {
    try {
      const data = await HelpdeskService.listComments(orgOf(req), { ticketId: req.params.ticketId });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/tickets/:ticketId/comments", validate({ params: TicketParam, body: HdCommentCreateSchema }), async (req, res, next) => {
    try {
      const data = await HelpdeskService.createComment(orgOf(req), req.params.ticketId, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Ticket not found" } });
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/comments/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await HelpdeskService.deleteComment(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Comment not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
