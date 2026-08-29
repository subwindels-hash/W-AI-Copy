/**
 * Contact & Support Center routes.
 *
 *   /contact           public contact form + AI assistant (rate-limited)
 *   /contact/my        authenticated user's own requests
 *   /contact/admin     staff contact center (requireAdmin)
 *
 * All handlers reuse the existing auth, validation, rate-limit and audit
 * architecture.
 */
import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  ContactAssignSchema,
  ContactChatMessageSchema,
  ContactChatStartSchema,
  ContactFormSchema,
  ContactListQuerySchema,
  ContactRespondSchema,
  ContactTransitionSchema,
} from "@windels/shared/contactCenter";
import { ContactService } from "../../contact/contact.service.js";
import { ContactAiService } from "../../contact/aiAssistant.js";

const Id = z.object({ id: z.string().cuid() });

function meta(req: any) { return { requestId: req.requestId ?? "", tookMs: Date.now() - (req.startedAt ?? Date.now()) }; }

/** Optional authentication: attaches req.user when a valid Bearer token is
 *  supplied, but never rejects anonymous visitors (the form is public). */
function optionalAuth(req: any, _res: any, next: any) {
  const header = req.headers?.authorization ?? "";
  if (!header.startsWith("Bearer ")) return next();
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: env.JWT_ISSUER }) as any;
    req.user = { id: payload.id, email: payload.email, role: payload.role, organizationId: payload.organizationId };
  } catch {
    /* invalid token — treat as anonymous */
  }
  next();
}

export function registerContactRoutes(router: Router) {
  const contact = Router();

  /* ── Public: contact form (rate-limited anti-spam) ──────────────────── */
  contact.post("/form", optionalAuth, rateLimit("contact", (req) => req.ip ?? "unknown"), validate({ body: ContactFormSchema }), async (req, res, next) => {
    try {
      // Authenticated user id is trusted over any body hint.
      const userId = req.user?.id ?? (req.body as any)?.userId ?? null;
      const data = await ContactService.submitContactRequest(req.body, {
        userId,
        organizationId: req.user?.organizationId ?? null,
      });
      res.status(201).json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Public: AI contact assistant ───────────────────────────────────── */
  contact.post("/assistant/start", rateLimit("contact", (req) => req.ip ?? "unknown"), validate({ body: ContactChatStartSchema }), async (req, res, next) => {
    try {
      const data = await ContactAiService.start(req.body.message, {
        name: (req.body as any)?.name,
        email: (req.body as any)?.email,
        organizationId: req.user?.organizationId ?? null,
      });
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  contact.post("/assistant/message", rateLimit("contact", (req) => req.ip ?? "unknown"), validate({ body: ContactChatMessageSchema }), async (req, res, next) => {
    try {
      const data = await ContactAiService.message(req.body.conversationId, req.body.message, req.user?.organizationId ?? null);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Authenticated: my requests ─────────────────────────────────────── */
  const my = Router();
  my.use(authenticate);
  my.get("/requests", async (req, res, next) => {
    try { res.json({ ok: true, data: await ContactService.listMyRequests(req.user!.id), meta: meta(req) }); } catch (e) { next(e); }
  });
  my.get("/requests/:id", validate({ params: Id }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ContactService.getMyRequest(req.user!.id, req.params.id), meta: meta(req) }); } catch (e) { next(e); }
  });
  my.get("/requests/:id/messages", validate({ params: Id }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ContactService.listMessages(req.params.id, req.user!.id), meta: meta(req) }); } catch (e) { next(e); }
  });
  contact.use("/my", my);

  /* ── Admin: staff contact center ────────────────────────────────────── */
  const admin = Router();
  admin.use(authenticate, requireAdmin);
  admin.get("/dashboard", rateLimit("contactAdmin", (req) => req.user?.id ?? "u"), async (req, res, next) => {
    try { res.json({ ok: true, data: await ContactService.adminDashboard(), meta: meta(req) }); } catch (e) { next(e); }
  });
  admin.get("/requests", validate({ query: ContactListQuerySchema }), async (req, res, next) => {
    try {
      const data = await ContactService.adminList(req.query as any);
      res.json({ ok: true, data, meta: { ...meta(req), pagination: { page: (req.query as any).page ?? 1, perPage: (req.query as any).perPage ?? 20, total: data.total, totalPages: Math.ceil(data.total / ((req.query as any).perPage ?? 20)) } } });
    } catch (e) { next(e); }
  });
  admin.get("/requests/:id", validate({ params: Id }), async (req, res, next) => {
    try {
      const [request, messages, history] = await Promise.all([
        ContactService.adminGet(req.params.id),
        ContactService.listMessages(req.params.id),
        ContactService.adminStatusHistory(req.params.id),
      ]);
      res.json({ ok: true, data: { request, messages, history }, meta: meta(req) });
    } catch (e) { next(e); }
  });
  admin.post("/requests/:id/respond", rateLimit("contactAdmin", (req) => req.user?.id ?? "u"), validate({ params: Id, body: ContactRespondSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await ContactService.adminRespond(req.user!.id, req.params.id, req.body), meta: meta(req) }); } catch (e) { next(e); }
  });
  admin.post("/requests/:id/assign", validate({ params: Id, body: ContactAssignSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ContactService.adminAssign(req.user!.id, req.params.id, req.body), meta: meta(req) }); } catch (e) { next(e); }
  });
  admin.post("/requests/:id/transition", validate({ params: Id, body: ContactTransitionSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ContactService.adminTransition(req.user!.id, req.params.id, req.body.to), meta: meta(req) }); } catch (e) { next(e); }
  });
  contact.use("/admin", admin);

  router.use("/contact", contact);
}
